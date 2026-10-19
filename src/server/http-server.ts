import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import express from 'express';
import { randomUUID, timingSafeEqual } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { VERSION, PACKAGE_NAME as SERVER_NAME } from '../version.js';
import cors from 'cors';
import http from 'http';
import { BlockList, isIP } from 'net';
import { logger } from '../utils/logger.js';
import type { Request, Response, NextFunction } from 'express';

export interface HttpServerSecurityOptions {
  /** CORS `Access-Control-Allow-Origin` (`*` or a single origin, e.g. `http://localhost:3000`) */
  corsOrigin: string;
  /** When set, MCP routes require this token via Bearer, `X-MCP-Access-Token`, or `access_token` query (GET only). */
  accessToken?: string;
}

export interface McpSessionOptions {
  /**
   * Reap a streamable-HTTP session after this many ms with no requests. Guards
   * against clients that reconnect (re-`initialize`) without ever sending
   * `DELETE /mcp`, which would otherwise leak a transport + McpServer per
   * reconnect. Default: 5 minutes.
   */
  idleTimeoutMs?: number;
  /** How often, in ms, to sweep for idle sessions. Default: 60 seconds. */
  sweepIntervalMs?: number;
}

/** Default idle window before an abandoned streamable session is reaped. */
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 5 * 60_000;
/** Default interval between idle-session sweeps. */
const DEFAULT_SESSION_SWEEP_INTERVAL_MS = 60_000;

/** Constant-time string comparison to prevent timing attacks on token validation. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function createMcpAccessGate(accessToken: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!accessToken) {
      next();
      return;
    }
    if (req.method === 'OPTIONS') {
      next();
      return;
    }
    const bearer = req.headers.authorization;
    const headerToken = req.headers['x-mcp-access-token'];
    const headerTokenStr = Array.isArray(headerToken) ? headerToken[0] : headerToken;
    const q = req.query.access_token;
    const queryToken = typeof q === 'string' ? q : undefined;
    const ok =
      (typeof bearer === 'string' && safeEqual(bearer, `Bearer ${accessToken}`)) ||
      (typeof headerTokenStr === 'string' && safeEqual(headerTokenStr, accessToken)) ||
      (req.method === 'GET' &&
        typeof queryToken === 'string' &&
        safeEqual(queryToken, accessToken));
    if (ok) {
      next();
      return;
    }
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message:
          'Unauthorized: configure MCP_HTTP_ACCESS_TOKEN and send Authorization: Bearer, X-MCP-Access-Token, or access_token query (GET only)',
      },
      id:
        (req.body && typeof req.body === 'object' && 'id' in req.body
          ? (req.body as { id?: unknown }).id
          : null) ?? null,
    });
  };
}

function normalizeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return undefined;
  }
}

/** Loopback, private (RFC 1918 / ULA), link-local and CGNAT (e.g. Tailscale) ranges. */
const LOCAL_IP_RANGES = (() => {
  const list = new BlockList();
  list.addSubnet('127.0.0.0', 8, 'ipv4');
  list.addSubnet('10.0.0.0', 8, 'ipv4');
  list.addSubnet('172.16.0.0', 12, 'ipv4');
  list.addSubnet('192.168.0.0', 16, 'ipv4');
  list.addSubnet('169.254.0.0', 16, 'ipv4');
  list.addSubnet('100.64.0.0', 10, 'ipv4');
  list.addAddress('::1', 'ipv6');
  list.addSubnet('fc00::', 7, 'ipv6');
  list.addSubnet('fe80::', 10, 'ipv6');
  return list;
})();

/**
 * localhost, or a loopback / private-network IP literal (typed directly, which DNS rebinding
 * cannot produce). Public IP literals are refused: anyone can serve a page from one.
 */
function isLocalOrIpHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  const family = isIP(h);
  if (family === 0) return false;
  return LOCAL_IP_RANGES.check(h, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * Origin validation (MCP Streamable HTTP spec; blocks cross-site pages and DNS rebinding).
 * Skipped when an access token is configured, since a browser page cannot supply it.
 * Requests without an Origin header (non-browser clients) always pass. A browser Origin is
 * accepted when it matches a configured (non-`*`) CORS origin, or when its hostname is
 * localhost or a loopback/private-network IP literal; anything else gets 403.
 */
function createOriginGate(security: HttpServerSecurityOptions) {
  const allowedOrigin =
    security.corsOrigin !== '*' ? normalizeOrigin(security.corsOrigin) : undefined;
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (security.accessToken || typeof origin !== 'string') {
      next();
      return;
    }
    const normalized = normalizeOrigin(origin);
    let hostname: string | undefined;
    try {
      hostname = new URL(origin).hostname;
    } catch {
      hostname = undefined;
    }
    const ok =
      (allowedOrigin !== undefined && normalized === allowedOrigin) ||
      (hostname !== undefined && hostname !== '' && isLocalOrIpHostname(hostname));
    if (ok) {
      next();
      return;
    }
    logger.warn(`Rejected MCP request from disallowed Origin: ${origin}`, 'server');
    res.status(403).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message:
          'Forbidden: Origin not allowed. Set MCP_HTTP_ACCESS_TOKEN or HTTP_CORS_ORIGIN to allow this client',
      },
      id: null,
    });
  };
}

// HTTP Transport for MCP (Context7 style)
export function startHttpServer(
  mcpServer: McpServer | (() => McpServer),
  port: number = 8080,
  security: HttpServerSecurityOptions,
  sessionOptions: McpSessionOptions = {},
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const app = express();
    const mcpAccessGate = createMcpAccessGate(security.accessToken);
    const originGate = createOriginGate(security);

    if (security.accessToken) {
      logger.config(
        'HTTP MCP access token is enabled (Bearer, X-MCP-Access-Token, or access_token on GET)',
      );
    } else {
      logger.warn(
        'HTTP MCP server has no access token: anyone who can reach the port can call Grocy tools. Browser requests are limited to localhost/private-IP Origins (or HTTP_CORS_ORIGIN). Set MCP_HTTP_ACCESS_TOKEN when exposing the port.',
        'server',
      );
    }

    // CORS before body parsing so error responses (e.g. invalid JSON) stay readable by browsers
    app.use(
      cors({
        origin: security.corsOrigin,
        methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
        allowedHeaders: [
          'Origin',
          'X-Requested-With',
          'Content-Type',
          'Accept',
          'Mcp-Session-Id',
          'Mcp-Protocol-Version',
          'Authorization',
          'X-MCP-Access-Token',
        ],
        exposedHeaders: ['Mcp-Session-Id', 'Content-Type'],
        optionsSuccessStatus: 200,
      }),
    );

    // Enable JSON body parsing with increased limit
    app.use(
      express.json({
        limit: '10mb',
      }),
    );

    // Health check endpoint — always accessible for monitoring/load balancers,
    // but only exposes service details when no access token is configured or request is authenticated.
    app.get('/', (req, res) => {
      const minimal = { status: 'ok' as const };
      if (security.accessToken) {
        const bearer = req.headers.authorization;
        const headerToken = req.headers['x-mcp-access-token'];
        const headerTokenStr = Array.isArray(headerToken) ? headerToken[0] : headerToken;
        const authenticated =
          (typeof bearer === 'string' && safeEqual(bearer, `Bearer ${security.accessToken}`)) ||
          (typeof headerTokenStr === 'string' && safeEqual(headerTokenStr, security.accessToken));
        if (!authenticated) {
          res.json(minimal);
          return;
        }
      }
      res.json({
        ...minimal,
        service: SERVER_NAME,
        version: VERSION,
        message: 'MCP server is running',
        endpoints: {
          streamable: '/mcp',
          sse: '/mcp/sse',
          sseMessages: '/mcp/messages',
        },
      });
    });

    // Session management for transports
    const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};
    const streamableServers: Record<string, McpServer> = {};
    const streamableLastActivity: Record<string, number> = {};
    const sseTransports: Record<string, SSEServerTransport> = {};
    const sseServerInstances: Record<string, McpServer> = {};

    const idleTimeoutMs = sessionOptions.idleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
    const sweepIntervalMs = sessionOptions.sweepIntervalMs ?? DEFAULT_SESSION_SWEEP_INTERVAL_MS;

    // Close and forget a streamable session, freeing both its transport and the
    // per-session McpServer (52 tools + 3 resources). Idempotent and re-entry
    // safe: the map entries are removed first, so the transport's own `onclose`
    // (which calls back here) short-circuits on the next entry.
    const closeStreamableSession = (sessionId: string): void => {
      const transport = streamableTransports[sessionId];
      if (!transport) {
        return;
      }
      delete streamableTransports[sessionId];
      delete streamableLastActivity[sessionId];
      const serverInstance = streamableServers[sessionId];
      delete streamableServers[sessionId];
      try {
        void transport.close?.();
      } catch {
        /* already closed */
      }
      try {
        void serverInstance?.close?.();
      } catch {
        /* already closed */
      }
    };

    // Simplified request logging
    app.use((req, _res, next) => {
      logger.server(`${req.method} ${req.path}`);
      next();
    });

    // Helper function to get server instance (shared or new)
    const getServerInstance = () => {
      if (typeof mcpServer === 'function') {
        return mcpServer(); // Create new instance
      } else {
        return mcpServer; // Use shared instance
      }
    };

    // Streamable HTTP endpoint (Context7 modern)
    app.all('/mcp', originGate, mcpAccessGate, async (req, res) => {
      // Session created by this initialize request; freed if the SDK rejects the request.
      let pendingInitSessionId: string | undefined;
      try {
        const clientSessionId =
          (req.headers['mcp-session-id'] as string | undefined) ||
          (req.query.sessionId as string | undefined) ||
          (req.query['mcp-session-id'] as string | undefined);
        let transport: StreamableHTTPServerTransport | undefined = undefined;

        // Accept header check (can be done early)
        const accept = req.headers.accept || '';

        // The SDK transport requires a POST's Accept to list both application/json and
        // text/event-stream and returns 406 otherwise; log it here for diagnosis.
        if (
          req.method === 'POST' &&
          !(accept.includes('application/json') && accept.includes('text/event-stream'))
        ) {
          logger.warn(
            'Client must accept both application/json and text/event-stream; SDK will return 406',
            'server',
          );
        }

        const isInitializeRequest = req.method === 'POST' && req.body?.method === 'initialize';

        if (clientSessionId && !isInitializeRequest) {
          // Existing session: look up transport
          transport = streamableTransports[clientSessionId];
          if (!transport) {
            logger.warn(`Session ${clientSessionId} not found, returning 400`, 'server');
            res.status(400).json({
              jsonrpc: '2.0',
              error: {
                code: -32001,
                message: `Invalid or expired session ID: ${clientSessionId}. Please re-initialize.`,
              },
              id: req.body?.id || null,
            });
            return;
          }
          // Mark activity so the idle reaper keeps live sessions alive.
          streamableLastActivity[clientSessionId] = Date.now();
        } else if (isInitializeRequest) {
          // POST initialize: create new transport and session
          if (clientSessionId) {
            logger.info(
              `Initialize request included prior session ID ${clientSessionId} (non-graceful reconnect), starting fresh session`,
              'server',
            );
            // Clean up the stale transport + server to prevent memory leaks
            closeStreamableSession(clientSessionId);
          }
          const newGeneratedSessionId = randomUUID();
          pendingInitSessionId = newGeneratedSessionId;

          const newTransportInstance = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => newGeneratedSessionId,
            enableJsonResponse: true,
          });

          transport = newTransportInstance;
          streamableTransports[newGeneratedSessionId] = transport;
          streamableLastActivity[newGeneratedSessionId] = Date.now();

          const serverInstance = getServerInstance();
          streamableServers[newGeneratedSessionId] = serverInstance;
          await serverInstance.connect(transport as Transport);

          // McpServer.connect() installs its own transport.onclose; wrap it so we
          // also evict the session from our maps and close the server whenever the
          // transport goes away (explicit DELETE, client disconnect, or idle reap).
          const sdkOnClose = transport.onclose;
          transport.onclose = () => {
            try {
              sdkOnClose?.();
            } finally {
              closeStreamableSession(newGeneratedSessionId);
            }
          };
        } else {
          // Non-initialize request without a session ID (e.g. GET SSE before session established)
          // Return 405 so clients that probe for SSE support handle it gracefully
          res
            .status(405)
            .set('Allow', 'POST')
            .json({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message:
                  'Method not allowed: session not established. Send a POST initialize request first.',
              },
              id: req.body?.id || null,
            });
          return;
        }

        if (!transport) {
          logger.error(
            'Transport is undefined before handling request. This should not happen.',
            'server',
          );
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Internal server error: Transport not available' },
            id: req.body?.id || null,
          });
          return;
        }

        if (transport.sessionId) {
          res.setHeader('Mcp-Session-Id', transport.sessionId);
        }

        await transport.handleRequest(req, res, req.body);

        // The SDK rejects a bad initialize (e.g. 406 Accept, 400 invalid JSON-RPC) before
        // assigning a session ID, so no client can ever reach or DELETE it. Free it now
        // instead of leaving it for the idle reaper.
        if (pendingInitSessionId && !transport.sessionId) {
          closeStreamableSession(pendingInitSessionId);
        }
      } catch (error) {
        logger.error('Failed to handle streamable HTTP request', 'server', { error });
        if (pendingInitSessionId && !streamableTransports[pendingInitSessionId]?.sessionId) {
          closeStreamableSession(pendingInitSessionId);
        }

        // Send error response if headers not sent yet
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
            },
            id: (req.body as { id?: unknown } | undefined)?.id ?? null,
          });
        }
      }
    });

    // SSE endpoint
    app.get('/mcp/sse', originGate, mcpAccessGate, async (_req, res) => {
      try {
        // Set SSE headers before creating transport
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const transport = new SSEServerTransport('/mcp/messages', res);
        const sessionId = transport.sessionId;

        logger.info(`Created SSE session: ${sessionId}`, 'DEBUG');

        sseTransports[sessionId] = transport;

        // Handle connection cleanup
        const cleanup = () => {
          delete sseTransports[sessionId];
          const isolated = sseServerInstances[sessionId];
          delete sseServerInstances[sessionId];
          try {
            void isolated?.close?.();
          } catch {
            /* already closed */
          }
        };

        res.on('close', cleanup);
        res.on('error', (err) => {
          logger.error(`SSE connection error for session ${sessionId}`, 'server', { error: err });
          cleanup();
        });

        // Create isolated server instance for this SSE connection to prevent response cross-talk
        const isolatedServer = getServerInstance();
        sseServerInstances[sessionId] = isolatedServer;

        // Connect transport to isolated MCP server (non-blocking)
        isolatedServer.connect(transport).catch((error) => {
          logger.error(`Failed to connect SSE transport for session ${sessionId}`, 'server', {
            error,
          });
          cleanup();
          if (!res.headersSent) {
            res.status(500).end();
          }
        });

        // Send initial comment to keep connection alive
        res.write(': connected\n\n');
      } catch (error) {
        logger.error('Failed to handle SSE connection', 'server', { error });

        if (!res.headersSent) {
          res.status(500).send('Internal Server Error');
        } else {
          res.end();
        }
      }
    });

    // Message endpoint for SSE
    app.post('/mcp/messages', originGate, mcpAccessGate, async (req, res) => {
      const sessionId = req.query.sessionId as string;

      if (!sessionId) {
        logger.error('Missing sessionId parameter in SSE message', 'server');
        res.status(400).json({
          error: 'Missing sessionId parameter',
          status: 400,
        });
        return;
      }

      const transport = sseTransports[sessionId];
      if (transport) {
        logger.info(`Found active transport for session ${sessionId}`, 'DEBUG');
        try {
          await transport.handlePostMessage(req, res, req.body);
        } catch (error) {
          logger.error(`Failed to handle SSE message for session ${sessionId}`, 'server', {
            error,
          });
          res.status(500).json({
            error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
            status: 500,
          });
        }
      } else {
        res.status(404).json({
          error: `No active SSE connection found for session ID: ${sessionId}`,
          status: 404,
        });
      }
    });

    // Catch-all for undefined routes — return JSON instead of Express default HTML
    app.use((_req, res) => {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Not found' },
        id: null,
      });
    });

    // Body-parser and other middleware errors: return JSON-RPC errors instead of Express's
    // default HTML page (which includes stack traces outside production)
    app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      const e = err as { status?: number; statusCode?: number; type?: string };
      const status = e.status ?? e.statusCode ?? 500;
      const parseFailed = e.type === 'entity.parse.failed';
      logger.warn(`HTTP request error: ${e.type ?? 'unknown'}`, 'server', { status });
      res.status(status >= 400 && status < 600 ? status : 500).json({
        jsonrpc: '2.0',
        error: {
          code: parseFailed ? -32700 : -32000,
          message: parseFailed
            ? 'Parse error: invalid JSON'
            : e.type === 'entity.too.large'
              ? 'Payload too large'
              : 'Invalid request',
        },
        id: null,
      });
    });

    // Create HTTP server with explicit error handling
    const server = http.createServer(app);

    // Idle-session reaper: abandoned streamable sessions (clients that reconnect
    // without sending DELETE) are closed once they exceed the idle window, so
    // their transports + McpServers can be garbage collected instead of growing
    // without bound.
    const reaper = setInterval(() => {
      const now = Date.now();
      for (const sessionId of Object.keys(streamableTransports)) {
        const last = streamableLastActivity[sessionId] ?? 0;
        if (now - last > idleTimeoutMs) {
          logger.info(`Reaping idle MCP session ${sessionId} (idle ${now - last}ms)`, 'server');
          closeStreamableSession(sessionId);
        }
      }
    }, sweepIntervalMs);
    // Don't let the sweep timer keep the process (or test runner) alive.
    reaper.unref?.();
    server.on('close', () => clearInterval(reaper));

    // Expose the live session count for observability and tests.
    (server as http.Server & { getMcpSessionCount?: () => number }).getMcpSessionCount = () =>
      Object.keys(streamableTransports).length + Object.keys(sseTransports).length;

    server.on('error', (error) => {
      logger.error(`HTTP server error: ${error.message}`, 'server');
      reject(error);
    });

    // Start the server
    server.listen(port, () => {
      logger.server(`HTTP server listening on port ${port}`);
      logger.server(`Available endpoints:`);
      logger.server(`  - Health check: http://localhost:${port}/`);
      logger.server(`  - Streamable HTTP: http://localhost:${port}/mcp`);
      logger.server(`  - SSE: http://localhost:${port}/mcp/sse`);
      logger.server(`  - SSE Messages: http://localhost:${port}/mcp/messages`);
      resolve(server);
    });
  });
}

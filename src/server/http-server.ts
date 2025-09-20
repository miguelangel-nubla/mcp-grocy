import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { VERSION, PACKAGE_NAME as SERVER_NAME } from '../version.js';
import cors from 'cors';
import http from 'http';
import { logger } from '../utils/logger.js';

// HTTP Transport for MCP (Context7 style)
export function startHttpServer(mcpServer: Server | (() => Server), port: number = 8080): Promise<http.Server> {
  return new Promise((resolve, reject) => {
  const app = express();
  
  // Enable JSON body parsing with increased limit
  app.use(express.json({
    limit: '10mb'
  }));
  
  // Enable CORS for all routes
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Mcp-Session-Id', 'Authorization'],
    exposedHeaders: ['Mcp-Session-Id', 'Content-Type'],
    optionsSuccessStatus: 200
  }));

  // Simple health check endpoint
  app.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      service: SERVER_NAME,
      version: VERSION,
      message: 'MCP server is running',
      endpoints: {
        streamable: '/mcp',
        sse: '/mcp/sse',
        sseMessages: '/mcp/messages'
      }
    });
  });

  // Session management for transports
  const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};
  const sseTransports: Record<string, SSEServerTransport> = {};
  const sseServerInstances: Record<string, Server> = {};

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
  app.post('/mcp', async (req, res) => {
    try {
      const clientSessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined = undefined;

      // Accept header check (can be done early)
      const accept = req.headers.accept || '';
      if (!accept.includes('application/json') && !accept.includes('text/event-stream')) {
        logger.error('Client must accept application/json or text/event-stream', 'server');
        res.status(406).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Not Acceptable: Client must accept application/json or text/event-stream'
          },
          id: req.body?.id || null
        });
        return;
      }

      if (clientSessionId) {
        transport = streamableTransports[clientSessionId];
        if (!transport) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: `Invalid or expired session ID: ${clientSessionId}. Please re-initialize.` },
            id: req.body?.id || null
          });
          return;
        }
      } else {
        // No session ID provided by client, create new transport
        const newGeneratedSessionId = randomUUID();
        
        const newTransportInstance = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newGeneratedSessionId
        });
        
        transport = newTransportInstance;
        streamableTransports[newGeneratedSessionId] = transport;

        transport.onclose = () => {
          const closedSessionId = transport?.sessionId || newGeneratedSessionId;
          delete streamableTransports[closedSessionId];
        };

        const serverInstance = getServerInstance();
        await serverInstance.connect(transport as any); // Type assertion to work around SDK type issue
      }

      if (!transport) {
        logger.error('Transport is undefined before handling request. This should not happen.', 'server');
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Internal server error: Transport not available' }, id: req.body?.id || null });
        return;
      }

      if (transport.sessionId) {
        res.setHeader('Mcp-Session-Id', transport.sessionId);
      }
      
      await transport.handleRequest(req, res, req.body);

    } catch (error) {
      logger.error('Failed to handle streamable HTTP request', 'server', { error });
      
      // Send error response if headers not sent yet
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: `Internal server error: ${error instanceof Error ? error.message : String(error)}`
          },
          id: req.body?.id || null
        });
      }
    }
  });

  // SSE endpoint
  app.get('/mcp/sse', async (_req, res) => {
    try {
      // Set SSE headers before creating transport
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const transport = new SSEServerTransport('/mcp/messages', res);
      const sessionId = transport.sessionId;
      
      sseTransports[sessionId] = transport;
      
      // Handle connection cleanup
      const cleanup = () => {
        delete sseTransports[sessionId];
        delete sseServerInstances[sessionId];
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
        logger.error(`Failed to connect SSE transport for session ${sessionId}`, 'server', { error });
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
  app.post('/mcp/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId) {
      res.status(400).json({
        error: 'Missing sessionId parameter',
        status: 400
      });
      return;
    }
    
    const transport = sseTransports[sessionId];
    if (transport) {
      try {
        await transport.handlePostMessage(req, res, req.body);
      } catch (error) {
        logger.error(`Failed to handle SSE message for session ${sessionId}`, 'server', { error });
        res.status(500).json({
          error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
          status: 500
        });
      }
    } else {
      res.status(404).json({
        error: `No active SSE connection found for session ID: ${sessionId}`,
        status: 404
      });
    }
  });

    // Create HTTP server with explicit error handling
    const server = http.createServer(app);
    
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

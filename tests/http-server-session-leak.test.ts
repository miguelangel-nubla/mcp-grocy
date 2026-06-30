import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import http from 'node:http';
import { GrocyMcpServer } from '../src/server/mcp-server.js';
import { startHttpServer } from '../src/server/http-server.js';

/**
 * Regression test for the streamable-HTTP session leak.
 *
 * A misbehaving / reconnecting MCP client (observed in the wild: a client that
 * re-`initialize`s every ~60s without ever sending `DELETE /mcp` and without
 * reusing its `Mcp-Session-Id`) causes the server to create a fresh
 * `StreamableHTTPServerTransport` + `McpServer` (52 tools + 3 resources) per
 * reconnect. Without a cleanup path those instances accumulate in the session
 * map forever — ~1,470/day in production, growing to multiple GB of RAM.
 *
 * The fix adds an idle-session reaper that closes and forgets sessions whose
 * last activity is older than `idleTimeoutMs`. This test drives a reconnect
 * storm against short reaper timings and asserts the live session count returns
 * to zero.
 */

type HttpServer = http.Server;
type McpHttpServer = HttpServer & { getMcpSessionCount?: () => number };

const STREAMABLE_ACCEPT = 'application/json, text/event-stream';

function serverPort(s: HttpServer): number {
  const addr = s.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Expected TCP listen address');
  }
  return addr.port;
}

async function closeServer(s: HttpServer): Promise<void> {
  s.closeAllConnections?.();
  await new Promise<void>((resolve, reject) => {
    s.close((err) => (err ? reject(err) : resolve()));
  });
}

/** Emulate a client reconnect: POST initialize, never DELETE, never reuse the session id. */
async function initializeSession(port: number): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: { Accept: STREAMABLE_ACCEPT, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'leak-regression', version: '1.0.0' },
      },
    }),
  });
  expect(res.ok).toBe(true);
  const sessionId = res.headers.get('mcp-session-id');
  expect(sessionId).toBeTruthy();
  return sessionId!;
}

describe('streamable HTTP session leak', () => {
  let grocy: GrocyMcpServer;
  let httpServer: HttpServer | undefined;

  beforeEach(async () => {
    grocy = await GrocyMcpServer.create();
  });

  afterEach(async () => {
    if (httpServer) {
      await closeServer(httpServer);
      httpServer = undefined;
    }
  });

  it('reaps idle sessions so a reconnect storm does not accumulate McpServer instances', async () => {
    // TTL is comfortably longer than the time it takes to open all sessions, so
    // none are reaped mid-storm; the wait afterwards then exceeds TTL + a sweep.
    httpServer = await startHttpServer(
      () => grocy.createMcpServer(),
      0,
      { corsOrigin: '*' },
      {
        idleTimeoutMs: 800,
        sweepIntervalMs: 50,
      },
    );
    const port = serverPort(httpServer);

    const RECONNECTS = 6;
    for (let i = 0; i < RECONNECTS; i++) {
      await initializeSession(port);
    }

    const getCount = (httpServer as McpHttpServer).getMcpSessionCount;
    expect(typeof getCount).toBe('function');
    expect(getCount!()).toBeGreaterThanOrEqual(RECONNECTS);

    // Wait past the idle TTL plus a sweep cycle, then confirm the reaper freed them all.
    await new Promise((r) => setTimeout(r, 1500));

    expect(getCount!()).toBe(0);
  });

  it('keeps an actively-used session alive (does not reap on every sweep)', async () => {
    httpServer = await startHttpServer(
      () => grocy.createMcpServer(),
      0,
      { corsOrigin: '*' },
      {
        idleTimeoutMs: 300,
        sweepIntervalMs: 40,
      },
    );
    const port = serverPort(httpServer);

    const sessionId = await initializeSession(port);
    const getCount = (httpServer as McpHttpServer).getMcpSessionCount!;

    // Touch the session repeatedly within the idle window; it must survive the sweeps.
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          Accept: STREAMABLE_ACCEPT,
          'Content-Type': 'application/json',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
      });
      // The session must still be known to the server (not reaped) -> not a 400 "expired".
      expect(res.status).not.toBe(400);
    }

    expect(getCount()).toBe(1);
  });
});

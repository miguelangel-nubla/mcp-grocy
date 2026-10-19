import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import http from 'node:http';
import { GrocyMcpServer } from '../src/server/mcp-server.js';
import { startHttpServer } from '../src/server/http-server.js';

type HttpServer = http.Server;

/** Streamable HTTP transport rejects POST without both media types (SDK spec). */
const STREAMABLE_ACCEPT = 'application/json, text/event-stream';

function serverPort(s: HttpServer): number {
  const addr = s.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Expected TCP listen address');
  }
  return addr.port;
}

/** Avoids rare races where the first request runs before Express routes are fully accepting traffic. */
async function waitUntilHttpServerReady(port: number, maxMs = 3000): Promise<void> {
  const deadline = Date.now() + maxMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(
    `HTTP server on port ${port} did not become ready: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

async function closeServer(s: HttpServer): Promise<void> {
  s.closeAllConnections?.();
  await new Promise<void>((resolve, reject) => {
    s.close((err) => (err ? reject(err) : resolve()));
  });
}

/** Raw POST via node:http so browser-only headers (Origin) are sent verbatim. */
function rawPost(
  port: number,
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8'),
        }),
      );
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}

const INITIALIZE_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'vitest-http', version: '1.0.0' },
  },
});

function activeServerCount(): number {
  return (GrocyMcpServer as unknown as { activeServers: Set<unknown> }).activeServers.size;
}

describe('startHttpServer', () => {
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

  it('GET / returns health JSON with endpoint paths', async () => {
    httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
    const port = serverPort(httpServer);
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.ok).toBe(true);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.status).toBe('ok');
    expect(json.endpoints).toEqual({
      streamable: '/mcp',
      sse: '/mcp/sse',
      sseMessages: '/mcp/messages',
    });
  });

  it('OPTIONS /mcp returns CORS headers for preflight', async () => {
    httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, {
      corsOrigin: 'https://app.example.com',
    });
    const port = serverPort(httpServer);
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, mcp-session-id',
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('POST /mcp initialize returns JSON-RPC result and Mcp-Session-Id', async () => {
    httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
    const port = serverPort(httpServer);
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'vitest-http', version: '1.0.0' },
      },
    };
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        Accept: STREAMABLE_ACCEPT,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    expect(res.ok).toBe(true);
    const session = res.headers.get('mcp-session-id');
    expect(session).toBeTruthy();
    const payload = (await res.json()) as {
      result?: { protocolVersion?: string };
      error?: unknown;
    };
    expect(payload.error).toBeUndefined();
    expect(payload.result?.protocolVersion).toBe('2024-11-05');
  });

  it('POST /mcp with unknown Mcp-Session-Id returns 400', async () => {
    httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
    const port = serverPort(httpServer);
    const body = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    };
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        Accept: STREAMABLE_ACCEPT,
        'Content-Type': 'application/json',
        'Mcp-Session-Id': '00000000-0000-4000-8000-000000000000',
      },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { error?: { message?: string } };
    expect(String(err.error?.message)).toContain('Invalid or expired session ID');
  });

  it('GET /mcp/sse returns event-stream and endpoint event with sessionId', async () => {
    httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
    const port = serverPort(httpServer);
    await waitUntilHttpServerReady(port);

    const { statusCode, headers, text } = await new Promise<{
      statusCode: number;
      headers: http.IncomingHttpHeaders;
      text: string;
    }>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${port}/mcp/sse`,
        { headers: { Accept: 'text/event-stream' } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () =>
            resolve({
              statusCode: res.statusCode ?? 0,
              headers: res.headers,
              text: Buffer.concat(chunks).toString('utf8'),
            }),
          );
          res.on('error', reject);
          setTimeout(() => {
            req.destroy();
            resolve({
              statusCode: res.statusCode ?? 0,
              headers: res.headers,
              text: Buffer.concat(chunks).toString('utf8'),
            });
          }, 1500);
        },
      );
      req.on('error', reject);
    });

    expect(statusCode).toBe(200);
    expect(String(headers['content-type'])).toContain('text/event-stream');
    expect(text).toContain(': connected');
    expect(text).toContain('event: endpoint');
    expect(text).toMatch(/sessionId=[a-f0-9-]{36}/i);
    const m = text.match(/sessionId=([a-f0-9-]{36})/i);
    expect(m).toBeTruthy();
  });

  it('POST /mcp/messages without sessionId returns 400', async () => {
    httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
    const port = serverPort(httpServer);
    const res = await fetch(`http://127.0.0.1:${port}/mcp/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /mcp/messages with unknown sessionId returns 404', async () => {
    httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
    const port = serverPort(httpServer);
    const res = await fetch(
      `http://127.0.0.1:${port}/mcp/messages?sessionId=00000000-0000-4000-8000-000000000000`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('SSE session accepts JSON-RPC via /mcp/messages after stream opens', async () => {
    httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
    const port = serverPort(httpServer);

    const sseBuf = await new Promise<string>((resolve, reject) => {
      let buf = '';
      let posted = false;
      const req = http.get(
        `http://127.0.0.1:${port}/mcp/sse`,
        { headers: { Accept: 'text/event-stream' } },
        (res) => {
          res.on('data', (c: Buffer) => {
            buf += c.toString('utf8');
            const match = buf.match(/sessionId=([a-f0-9-]{36})/i);
            if (match && !posted) {
              posted = true;
              const sessionId = match[1]!;
              const initBody = {
                jsonrpc: '2.0',
                id: 10,
                method: 'initialize',
                params: {
                  protocolVersion: '2024-11-05',
                  capabilities: {},
                  clientInfo: { name: 'vitest-sse', version: '1.0.0' },
                },
              };
              void fetch(
                `http://127.0.0.1:${port}/mcp/messages?sessionId=${encodeURIComponent(sessionId)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(initBody),
                },
              )
                .then(async (postRes) => {
                  expect(postRes.status).toBe(202);
                  expect(await postRes.text()).toBe('Accepted');
                })
                .catch(reject);
            }
          });
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      setTimeout(() => {
        req.destroy();
        resolve(buf);
      }, 2500);
    });

    expect(sseBuf).toMatch(/sessionId=[a-f0-9-]{36}/i);
    expect(sseBuf).toMatch(/"id"\s*:\s*10/);
    expect(sseBuf).toContain('"protocolVersion"');
    expect(sseBuf).toContain('"result"');
  });

  describe('Origin gate (no access token)', () => {
    const post = (port: number, headers: Record<string, string>) =>
      rawPost(
        port,
        '/mcp',
        { Accept: STREAMABLE_ACCEPT, 'Content-Type': 'application/json', ...headers },
        INITIALIZE_BODY,
      );

    it('rejects a cross-site browser Origin with 403 JSON-RPC error', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
      const res = await post(serverPort(httpServer), { Origin: 'http://evil.example' });
      expect(res.status).toBe(403);
      const json = JSON.parse(res.text) as { jsonrpc: string; error: { code: number } };
      expect(json.jsonrpc).toBe('2.0');
      expect(json.error.code).toBe(-32000);
    });

    it('rejects a DNS-rebinding style Origin even when the Host matches', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
      const port = serverPort(httpServer);
      const res = await post(port, {
        Origin: `http://rebind.example:${port}`,
        Host: `rebind.example:${port}`,
      });
      expect(res.status).toBe(403);
    });

    it('rejects an opaque "null" Origin', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
      const res = await post(serverPort(httpServer), { Origin: 'null' });
      expect(res.status).toBe(403);
    });

    it('allows requests without an Origin header (non-browser clients)', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
      const res = await post(serverPort(httpServer), {});
      expect(res.status).toBe(200);
      expect(res.headers['mcp-session-id']).toBeTruthy();
    });

    it.each([
      'http://localhost:3000',
      'http://127.0.0.1:8080',
      'http://192.168.1.20',
      'http://[::1]:5173',
      'http://10.0.0.5:8123',
      'http://100.101.102.103',
      'http://[fd00::1]',
    ])('allows localhost / private-network IP Origin %s', async (origin) => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
      const res = await post(serverPort(httpServer), { Origin: origin });
      expect(res.status).toBe(200);
    });

    it.each(['http://203.0.113.7', 'https://8.8.8.8:8443', 'http://[2001:db8::1]'])(
      'rejects a public IP-literal Origin %s (anyone can serve a page from one)',
      async (origin) => {
        httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
        const res = await post(serverPort(httpServer), { Origin: origin });
        expect(res.status).toBe(403);
      },
    );

    it('allows the configured CORS origin and rejects others', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, {
        corsOrigin: 'https://app.example.com',
      });
      const port = serverPort(httpServer);
      expect((await post(port, { Origin: 'https://app.example.com' })).status).toBe(200);
      expect((await post(port, { Origin: 'https://other.example.com' })).status).toBe(403);
    });

    it('also gates /mcp/messages', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
      const res = await rawPost(
        serverPort(httpServer),
        '/mcp/messages?sessionId=00000000-0000-4000-8000-000000000000',
        { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      );
      expect(res.status).toBe(403);
    });

    it('is skipped when an access token is configured (token gate applies instead)', async () => {
      const secret = 'origin-gate-token';
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, {
        corsOrigin: '*',
        accessToken: secret,
      });
      const port = serverPort(httpServer);
      const ok = await post(port, {
        Origin: 'http://evil.example',
        Authorization: `Bearer ${secret}`,
      });
      expect(ok.status).toBe(200);
      const noToken = await post(port, { Origin: 'http://evil.example' });
      expect(noToken.status).toBe(401);
    });
  });

  describe('request body errors', () => {
    it('returns a JSON-RPC -32700 parse error (not HTML) for malformed JSON', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
      const res = await rawPost(
        serverPort(httpServer),
        '/mcp',
        { Accept: STREAMABLE_ACCEPT, 'Content-Type': 'application/json' },
        '{"jsonrpc":"2.0",',
      );
      expect(res.status).toBe(400);
      expect(String(res.headers['content-type'])).toContain('application/json');
      expect(res.headers['access-control-allow-origin']).toBe('*');
      const json = JSON.parse(res.text) as { error: { code: number }; id: unknown };
      expect(json.error.code).toBe(-32700);
      expect(json.id).toBeNull();
      expect(res.text).not.toContain('body-parser');
    });
  });

  describe('session cleanup', () => {
    it('frees the session and McpServer when the SDK rejects an initialize (406 Accept)', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
      const getCount = (httpServer as HttpServer & { getMcpSessionCount: () => number })
        .getMcpSessionCount;
      const before = activeServerCount();
      const res = await rawPost(
        serverPort(httpServer),
        '/mcp',
        { Accept: 'application/json', 'Content-Type': 'application/json' },
        INITIALIZE_BODY,
      );
      expect(res.status).toBe(406);
      expect(res.headers['mcp-session-id']).toBeUndefined();
      expect(getCount()).toBe(0);
      await new Promise((r) => setTimeout(r, 20));
      expect(activeServerCount()).toBe(before);
    });

    it('removes per-session McpServers from the shutdown set after DELETE', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, { corsOrigin: '*' });
      const port = serverPort(httpServer);
      const before = activeServerCount();
      const init = await rawPost(
        port,
        '/mcp',
        { Accept: STREAMABLE_ACCEPT, 'Content-Type': 'application/json' },
        INITIALIZE_BODY,
      );
      const sessionId = init.headers['mcp-session-id'] as string;
      expect(sessionId).toBeTruthy();
      expect(activeServerCount()).toBe(before + 1);

      const del = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'DELETE',
        headers: { Accept: STREAMABLE_ACCEPT, 'Mcp-Session-Id': sessionId },
      });
      expect(del.status).toBeLessThan(300);
      await new Promise((r) => setTimeout(r, 20));
      expect(activeServerCount()).toBe(before);
    });

    it('removes reaped idle sessions from the shutdown set', async () => {
      httpServer = await startHttpServer(
        () => grocy.createMcpServer(),
        0,
        { corsOrigin: '*' },
        { idleTimeoutMs: 100, sweepIntervalMs: 30 },
      );
      const before = activeServerCount();
      await rawPost(
        serverPort(httpServer),
        '/mcp',
        { Accept: STREAMABLE_ACCEPT, 'Content-Type': 'application/json' },
        INITIALIZE_BODY,
      );
      expect(activeServerCount()).toBe(before + 1);
      await new Promise((r) => setTimeout(r, 300));
      expect(activeServerCount()).toBe(before);
    });
  });

  describe('access token gate', () => {
    const secret = 'test-ci-token-xyz';

    it('rejects /mcp without credentials when token is configured', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, {
        corsOrigin: '*',
        accessToken: secret,
      });
      const port = serverPort(httpServer);
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
            clientInfo: { name: 't', version: '1' },
          },
        }),
      });
      expect(res.status).toBe(401);
    });

    it('allows /mcp with Authorization Bearer token', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, {
        corsOrigin: '*',
        accessToken: secret,
      });
      const port = serverPort(httpServer);
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          Accept: STREAMABLE_ACCEPT,
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 't', version: '1' },
          },
        }),
      });
      expect(res.ok).toBe(true);
      expect(res.headers.get('mcp-session-id')).toBeTruthy();
    });

    it('allows GET /mcp/sse with access_token query', async () => {
      httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, {
        corsOrigin: '*',
        accessToken: secret,
      });
      const port = serverPort(httpServer);
      const res = await fetch(
        `http://127.0.0.1:${port}/mcp/sse?access_token=${encodeURIComponent(secret)}`,
        { headers: { Accept: 'text/event-stream' } },
      );
      expect(res.ok).toBe(true);
    });
  });
});

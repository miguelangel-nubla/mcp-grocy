import { describe, it, expect, afterEach, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { CryptoKey, JWK } from 'jose';
import { GrocyMcpServer } from '../src/server/mcp-server.js';
import { startHttpServer } from '../src/server/http-server.js';
import { fetchAuthorizationServerMetadata, prepareHttpOAuth } from '../src/server/oauth.js';

const STREAMABLE_ACCEPT = 'application/json, text/event-stream';
const RESOURCE = 'https://grocy-mcp.example.com/mcp';

const INITIALIZE_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'vitest-oauth', version: '1.0.0' },
  },
});

function serverPort(s: http.Server): number {
  const addr = s.address();
  if (!addr || typeof addr === 'string') throw new Error('Expected TCP listen address');
  return addr.port;
}

async function closeServer(s: http.Server): Promise<void> {
  s.closeAllConnections?.();
  await new Promise<void>((resolve, reject) => s.close((err) => (err ? reject(err) : resolve())));
}

/** A minimal OIDC provider: discovery document and JWKS, like Pocket ID serves them. */
async function startFakeIssuer(
  jwk: JWK,
  override: (issuer: string) => Record<string, unknown> = () => ({}),
): Promise<{ server: http.Server; issuer: string }> {
  let issuer = '';
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/.well-known/openid-configuration') {
      res.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/api/oidc/token`,
          jwks_uri: `${issuer}/.well-known/jwks.json`,
          response_types_supported: ['code'],
          code_challenge_methods_supported: ['S256'],
          ...override(issuer),
        }),
      );
    } else if (req.url === '/.well-known/jwks.json') {
      res.end(JSON.stringify({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256', use: 'sig' }] }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  issuer = `http://127.0.0.1:${serverPort(server)}`;
  return { server, issuer };
}

describe('HTTP OAuth (resource server)', () => {
  let privateKey: CryptoKey;
  let issuerServer: http.Server;
  let issuer: string;
  let grocy: GrocyMcpServer;
  let httpServer: http.Server | undefined;

  const sign = (claims: Record<string, unknown> = {}, opts: { key?: CryptoKey } = {}) => {
    const { iss = issuer, aud = [RESOURCE, issuer], exp = '5m', ...rest } = claims;
    return new SignJWT({ client_id: 'chatgpt', scope: 'openid mcp', ...rest })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(iss as string)
      .setAudience(aud as string | string[])
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime(exp as string | number)
      .sign(opts.key ?? privateKey);
  };

  const start = async (extra: { accessToken?: string; required_scopes?: string[] } = {}) => {
    const oauth = await prepareHttpOAuth({
      issuer,
      resource_url: RESOURCE,
      required_scopes: extra.required_scopes ?? [],
    });
    httpServer = await startHttpServer(() => grocy.createMcpServer(), 0, {
      corsOrigin: '*',
      oauth,
      ...(extra.accessToken !== undefined && { accessToken: extra.accessToken }),
    });
    return `http://127.0.0.1:${serverPort(httpServer)}`;
  };

  const initialize = (base: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { Accept: STREAMABLE_ACCEPT, 'Content-Type': 'application/json', ...headers },
      body: INITIALIZE_BODY,
    });

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    ({ server: issuerServer, issuer } = await startFakeIssuer(await exportJWK(pair.publicKey)));
  });

  afterAll(async () => {
    await closeServer(issuerServer);
  });

  beforeEach(async () => {
    grocy = await GrocyMcpServer.create();
  });

  afterEach(async () => {
    if (httpServer) {
      await closeServer(httpServer);
      httpServer = undefined;
    }
  });

  it('serves RFC 9728 protected-resource metadata at the path-suffixed URL', async () => {
    const base = await start({ required_scopes: ['mcp'] });
    const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      resource: RESOURCE,
      authorization_servers: [issuer],
      scopes_supported: ['mcp'],
    });
  });

  it('mirrors the issuer metadata at /.well-known/oauth-authorization-server', async () => {
    const base = await start();
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
    });
  });

  it('answers a request without a token with 401 and a resource_metadata challenge', async () => {
    const base = await start();
    const res = await initialize(base);
    expect(res.status).toBe(401);
    const challenge = res.headers.get('www-authenticate') ?? '';
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain(
      'resource_metadata="https://grocy-mcp.example.com/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it('accepts a valid token for this resource', async () => {
    const base = await start();
    const res = await initialize(base, { Authorization: `Bearer ${await sign()}` });
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeTruthy();
  });

  it.each([
    ['another audience', { aud: 'https://other.example.com/mcp' }],
    ['another issuer', { iss: 'https://evil.example.com' }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 120 }],
  ])('rejects %s with 401', async (_label, claims) => {
    const base = await start();
    const res = await initialize(base, { Authorization: `Bearer ${await sign(claims)}` });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('rejects a token signed with a different key', async () => {
    const base = await start();
    const other = await generateKeyPair('RS256');
    const res = await initialize(base, {
      Authorization: `Bearer ${await sign({}, { key: other.privateKey })}`,
    });
    expect(res.status).toBe(401);
  });

  it('rejects a token missing a required scope with 403', async () => {
    const base = await start({ required_scopes: ['grocy:write'] });
    const res = await initialize(base, { Authorization: `Bearer ${await sign()}` });
    expect(res.status).toBe(403);
    expect(res.headers.get('www-authenticate')).toContain('error="insufficient_scope"');
  });

  it('still accepts the static access token when both are configured', async () => {
    const base = await start({ accessToken: 'static-secret' });
    expect((await initialize(base, { 'X-MCP-Access-Token': 'static-secret' })).status).toBe(200);
    expect((await initialize(base, { Authorization: 'Bearer static-secret' })).status).toBe(200);
    expect((await initialize(base, { Authorization: `Bearer ${await sign()}` })).status).toBe(200);
    expect((await initialize(base, { Authorization: 'Bearer wrong' })).status).toBe(401);
  });

  it('shows health details only to an authenticated caller', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/`)).json()).toEqual({ status: 'ok' });
    const authed = await fetch(`${base}/`, {
      headers: { Authorization: `Bearer ${await sign()}` },
    });
    expect(await authed.json()).toHaveProperty('service');
  });

  it('refuses issuer metadata that names a different issuer', async () => {
    const pair = await generateKeyPair('RS256');
    const rogue = await startFakeIssuer(await exportJWK(pair.publicKey), () => ({
      issuer: 'https://someone-else.example.com',
    }));
    try {
      await expect(fetchAuthorizationServerMetadata(rogue.issuer)).rejects.toThrow(
        /issuer mismatch/,
      );
    } finally {
      await closeServer(rogue.server);
    }
  });
});

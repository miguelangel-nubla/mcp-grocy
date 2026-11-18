/**
 * OAuth 2.1 resource-server support for the HTTP transport (MCP authorization spec).
 *
 * This server never issues tokens: an external OIDC provider (Pocket ID, Keycloak, ...) does,
 * and this module only checks them. Tokens are JWTs verified locally against the issuer's JWKS,
 * so no introspection call and no client secret are needed here. The SDK supplies the rest:
 * `requireBearerAuth` (401 + `WWW-Authenticate: Bearer resource_metadata=...`) and
 * `mcpAuthMetadataRouter` (RFC 9728 protected-resource metadata), wired in `http-server.ts`.
 */

import { createRemoteJWKSet, decodeJwt, errors as joseErrors, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import { InvalidTokenError, ServerError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { OAuthMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { logger } from '../utils/logger.js';

export interface OAuthConfig {
  /** Issuer URL of the OIDC provider, exactly as it appears in the tokens' `iss` claim. */
  issuer: string;
  /** Public URL of this MCP endpoint as clients have it configured, path included (RFC 8707 resource). */
  resource_url: string;
  /** Expected `aud` claim; defaults to `resource_url`, which is what RFC 8707 providers put there. */
  audience?: string | undefined;
  /** Scopes every token must carry. */
  required_scopes: string[];
  /** When non-empty, only tokens whose `sub` is listed are accepted. */
  allowed_subjects?: string[] | undefined;
}

/** What `startHttpServer` needs to gate MCP routes with OAuth. */
export interface HttpOAuthOptions {
  verifier: OAuthTokenVerifier;
  /** Authorization server metadata, mirrored at `/.well-known/oauth-authorization-server`. */
  oauthMetadata: OAuthMetadata;
  resourceUrl: URL;
  requiredScopes: string[];
}

/** Startup retries while the issuer is unreachable (e.g. starting in the same compose stack). */
export interface DiscoveryRetryOptions {
  attempts?: number;
  initialDelayMs?: number;
}

const DEFAULT_DISCOVERY_ATTEMPTS = 6;
const DEFAULT_DISCOVERY_INITIAL_DELAY_MS = 1_000;

/** A discovery failure that retrying cannot fix (the issuer answered, but with the wrong document). */
class DiscoveryConfigError extends Error {}

// Asymmetric algorithms only: a public JWKS has no business holding an HMAC key, and pinning the
// list keeps a token from choosing how it gets verified.
const ALLOWED_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
  'Ed25519',
];

/** Tolerated clock skew between this server and the issuer, in seconds. */
const CLOCK_TOLERANCE_SECONDS = 30;

const METADATA_FETCH_TIMEOUT_MS = 10_000;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Discovery URLs for an issuer: OIDC appends the well-known suffix, RFC 8414 inserts it before
 * the issuer's path. They coincide for an issuer without a path.
 */
function discoveryUrls(issuer: string): string[] {
  const u = new URL(issuer);
  const path = stripTrailingSlash(u.pathname);
  const urls = [
    `${stripTrailingSlash(issuer)}/.well-known/openid-configuration`,
    `${u.origin}/.well-known/oauth-authorization-server${path}`,
  ];
  if (path) urls.push(`${u.origin}/.well-known/openid-configuration${path}`);
  return urls;
}

/**
 * Fetch and validate the issuer's metadata. Refuses a document naming a different issuer
 * (RFC 8414 section 3.3): it would point clients and the JWKS lookup somewhere else.
 */
export async function fetchAuthorizationServerMetadata(
  issuer: string,
): Promise<OAuthMetadata & { jwks_uri: string }> {
  const failures: string[] = [];
  for (const url of discoveryUrls(issuer)) {
    let body: unknown;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(METADATA_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        failures.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      body = await res.json();
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const parsed = OAuthMetadataSchema.safeParse(body);
    if (!parsed.success) {
      failures.push(`${url}: not valid authorization server metadata`);
      continue;
    }
    const metadata = parsed.data;
    if (stripTrailingSlash(metadata.issuer) !== stripTrailingSlash(issuer)) {
      throw new DiscoveryConfigError(
        `OAuth issuer mismatch: ${url} describes issuer ${metadata.issuer}, expected ${issuer}`,
      );
    }
    const jwksUri = (metadata as { jwks_uri?: unknown }).jwks_uri;
    if (typeof jwksUri !== 'string' || jwksUri === '') {
      throw new DiscoveryConfigError(`OAuth issuer metadata at ${url} has no jwks_uri`);
    }
    return { ...metadata, jwks_uri: jwksUri };
  }
  throw new Error(`Could not load OAuth metadata for issuer ${issuer}: ${failures.join('; ')}`);
}

/** `fetchAuthorizationServerMetadata`, retried with exponential backoff while the issuer is unreachable. */
export async function fetchAuthorizationServerMetadataWithRetry(
  issuer: string,
  retry: DiscoveryRetryOptions = {},
): Promise<OAuthMetadata & { jwks_uri: string }> {
  const attempts = Math.max(1, retry.attempts ?? DEFAULT_DISCOVERY_ATTEMPTS);
  let delay = retry.initialDelayMs ?? DEFAULT_DISCOVERY_INITIAL_DELAY_MS;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchAuthorizationServerMetadata(issuer);
    } catch (error) {
      if (error instanceof DiscoveryConfigError || attempt >= attempts) throw error;
      logger.warn(
        `OAuth issuer discovery failed (attempt ${attempt}/${attempts}), retrying in ${delay} ms`,
        'server',
        { error },
      );
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

function tokenScopes(payload: JWTPayload): string[] {
  // RFC 9068 `scope` is space-delimited; some providers emit an `scp` array instead.
  const raw = payload.scope ?? payload.scp;
  if (typeof raw === 'string') return raw.split(' ').filter(Boolean);
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
  return [];
}

/** Log what a rejected token claimed, so an iss/aud mismatch is visible. Untrusted: logging only. */
function logRejectedToken(reason: string, token: string, expected: { iss: string; aud: string }) {
  let claimed: Record<string, unknown>;
  try {
    const p = decodeJwt(token);
    claimed = { iss: p.iss, aud: p.aud, sub: p.sub, exp: p.exp, scope: p.scope ?? p.scp };
  } catch {
    claimed = { note: 'not a readable JWT' };
  }
  logger.warn(`Rejected OAuth access token: ${reason}`, 'server', { claimed, expected });
}

/** Verifies JWT access tokens offline against the issuer's JWKS. */
export function createJwtVerifier(options: {
  issuer: string;
  audience: string;
  jwksUri: string;
  resourceUrl: URL;
  allowedSubjects?: string[] | undefined;
}): OAuthTokenVerifier {
  // Keys are cached and refetched only when an unknown `kid` shows up, so key rotation needs
  // no restart.
  const jwks = createRemoteJWKSet(new URL(options.jwksUri));
  const expected = { iss: options.issuer, aud: options.audience };
  const allowedSubjects =
    options.allowedSubjects && options.allowedSubjects.length > 0
      ? new Set(options.allowedSubjects)
      : undefined;

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, jwks, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms: ALLOWED_ALGORITHMS,
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
          requiredClaims: ['exp', 'sub'],
        }));
      } catch (error) {
        // An unreachable or broken JWKS is our problem, not the token's: answer 500, not 401,
        // so clients don't loop through re-authorization. jose reports a non-200 or unparsable
        // JWKS response as a plain JOSEError (ERR_JOSE_GENERIC); every token problem has its
        // own subclass.
        if (
          error instanceof joseErrors.JWKSTimeout ||
          error instanceof joseErrors.JWKSInvalid ||
          !(error instanceof joseErrors.JOSEError) ||
          error.code === joseErrors.JOSEError.code
        ) {
          logger.error('OAuth token verification failed: JWKS unavailable', 'server', { error });
          throw new ServerError('Token verification unavailable');
        }
        logRejectedToken(error.message, token, expected);
        throw new InvalidTokenError('Invalid or expired access token');
      }

      if (allowedSubjects && !allowedSubjects.has(payload.sub ?? '')) {
        logRejectedToken('subject not in allowed_subjects', token, expected);
        throw new InvalidTokenError('Token subject is not allowed');
      }

      const clientId = payload.client_id ?? payload.azp;
      return {
        token,
        clientId: typeof clientId === 'string' ? clientId : (payload.sub ?? ''),
        scopes: tokenScopes(payload),
        // requireBearerAuth rejects `expiresAt < now` with no skew allowance; shift it by the
        // same tolerance jose applied so both checks agree.
        ...(payload.exp !== undefined && { expiresAt: payload.exp + CLOCK_TOLERANCE_SECONDS }),
        resource: options.resourceUrl,
        extra: { sub: payload.sub },
      };
    },
  };
}

/** Load the issuer's metadata and build everything the HTTP server needs. */
export async function prepareHttpOAuth(
  config: OAuthConfig,
  retry?: DiscoveryRetryOptions,
): Promise<HttpOAuthOptions> {
  const resourceUrl = new URL(config.resource_url);
  const metadata = await fetchAuthorizationServerMetadataWithRetry(config.issuer, retry);
  const verifier = createJwtVerifier({
    issuer: metadata.issuer,
    // The configured string as written: `new URL().href` adds a `/` to a path-less URL, and
    // `aud` is compared exactly against what the client sent as `resource`.
    audience: config.audience ?? config.resource_url,
    jwksUri: metadata.jwks_uri,
    resourceUrl,
    allowedSubjects: config.allowed_subjects,
  });
  return {
    verifier,
    oauthMetadata: metadata,
    resourceUrl,
    requiredScopes: config.required_scopes,
  };
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigManager, FILE_ENV_VARS, resolveFileEnv } from '../src/config/index.js';

describe('<NAME>_FILE secret variables', () => {
  let dir: string;
  const secretFile = (name: string, content: string): string => {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-grocy-file-env-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('covers the secret-bearing variables', () => {
    expect([...FILE_ENV_VARS]).toEqual(['GROCY_API_KEY', 'MCP_HTTP_ACCESS_TOKEN']);
  });

  it('reads the value from the file when only <NAME>_FILE is set', () => {
    const env = resolveFileEnv({ GROCY_API_KEY_FILE: secretFile('key', 'dummy-file-key') });
    expect(env.GROCY_API_KEY).toBe('dummy-file-key');
  });

  it('keeps the plain variable when only <NAME> is set', () => {
    const env = resolveFileEnv({ MCP_HTTP_ACCESS_TOKEN: 'dummy-env-token' });
    expect(env.MCP_HTTP_ACCESS_TOKEN).toBe('dummy-env-token');
  });

  it('prefers the file when both are set', () => {
    const env = resolveFileEnv({
      MCP_HTTP_ACCESS_TOKEN: 'dummy-env-token',
      MCP_HTTP_ACCESS_TOKEN_FILE: secretFile('token', 'dummy-file-token'),
    });
    expect(env.MCP_HTTP_ACCESS_TOKEN).toBe('dummy-file-token');
  });

  it('strips one trailing \\n or \\r\\n, nothing more', () => {
    const env = resolveFileEnv({
      GROCY_API_KEY_FILE: secretFile('key', 'dummy-key\n'),
      MCP_HTTP_ACCESS_TOKEN_FILE: secretFile('token', 'dummy-token\r\n'),
    });
    expect(env.GROCY_API_KEY).toBe('dummy-key');
    expect(env.MCP_HTTP_ACCESS_TOKEN).toBe('dummy-token');
    expect(
      resolveFileEnv({ GROCY_API_KEY_FILE: secretFile('k2', 'dummy\n\n') }).GROCY_API_KEY,
    ).toBe('dummy\n');
  });

  it('ignores an empty <NAME>_FILE', () => {
    const env = resolveFileEnv({ GROCY_API_KEY: 'dummy-env-key', GROCY_API_KEY_FILE: '' });
    expect(env.GROCY_API_KEY).toBe('dummy-env-key');
  });

  it('fails naming the variable and path when the file is missing', () => {
    const path = join(dir, 'missing');
    expect(() => resolveFileEnv({ GROCY_API_KEY_FILE: path })).toThrow(
      `GROCY_API_KEY_FILE: cannot read ${path} (ENOENT)`,
    );
  });

  it('fails when the file is empty, without echoing any value', () => {
    const path = secretFile('empty', '\n');
    expect(() =>
      resolveFileEnv({
        MCP_HTTP_ACCESS_TOKEN: 'dummy-env-token',
        MCP_HTTP_ACCESS_TOKEN_FILE: path,
      }),
    ).toThrow(new Error(`MCP_HTTP_ACCESS_TOKEN_FILE: ${path} is empty`));
  });

  describe('through ConfigManager', () => {
    const originalEnv = process.env;
    const newConfig = (): ConfigManager =>
      new (ConfigManager as any)(join(dir, 'no-such-config.yaml'));

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.GROCY_API_KEY;
      delete process.env.MCP_HTTP_ACCESS_TOKEN;
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('uses file values for the API key and HTTP access token', () => {
      process.env.GROCY_API_KEY = 'dummy-env-key';
      process.env.GROCY_API_KEY_FILE = secretFile('key', 'dummy-file-key\n');
      process.env.MCP_HTTP_ACCESS_TOKEN_FILE = secretFile('token', 'dummy-file-token\n');

      const config = newConfig();
      expect(config.grocy.api_key).toBe('dummy-file-key');
      expect(config.server.http_access_token).toBe('dummy-file-token');
      expect(config.getCustomHeaders()['GROCY-API-KEY']).toBe('dummy-file-key');
    });

    it('exits at startup when a secret file cannot be read', () => {
      process.env.GROCY_API_KEY_FILE = join(dir, 'missing');
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
      }) as never);

      expect(newConfig).toThrow('process.exit');
      expect(exit).toHaveBeenCalledWith(1);
    });
  });
});

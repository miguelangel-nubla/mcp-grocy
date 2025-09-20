import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs before importing ConfigManager
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}));

import { ConfigManager } from '../src/config/index.js';

describe('ConfigManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear environment
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  it('should create ConfigManager instance for testing', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => {
      const config = (() => {
        const ConfigManagerClass = ConfigManager as any;
        return new ConfigManagerClass();
      })();
      const configData = config.getConfig();
      expect(configData).toBeDefined();
      expect(configData.yaml).toBeDefined();
      expect(configData.env).toBeDefined();
    }).not.toThrow();
  });

  it('should parse API key from environment variables', async () => {
    process.env.GROCY_API_KEY = 'test-api-key-12345';
    process.env.GROCY_BASE_URL = 'http://localhost:9283';
    
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const config = (() => {
        const ConfigManagerClass = ConfigManager as any;
        return new ConfigManagerClass();
      })();
    const configData = config.getConfig();
    
    expect(configData.env.GROCY_API_KEY).toBe('test-api-key-12345');
    expect(configData.env.GROCY_BASE_URL).toBe('http://localhost:9283');
  });

  it('should handle missing API key gracefully', async () => {
    delete process.env.GROCY_API_KEY;
    
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => {
      const config = (() => {
        const ConfigManagerClass = ConfigManager as any;
        return new ConfigManagerClass();
      })();
      const configData = config.getConfig();
      expect(configData.env.GROCY_API_KEY).toBeUndefined();
    }).not.toThrow();
  });

  it('should parse tool configuration correctly', async () => {
    const { existsSync, readFileSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(`
server:
  enable_http_server: true
  http_server_port: 8080

grocy:
  base_url: "http://localhost:9283"
  api_key: "test-key"

tools:
  inventory_stock_get_all:
    enabled: true
  inventory_products_get:
    enabled: false
    ack_token: "TEST_TOKEN"
`);

    const config = (() => {
        const ConfigManagerClass = ConfigManager as any;
        return new ConfigManagerClass();
      })();
    const { enabledTools, toolSubConfigs } = config.parseToolConfiguration();
    
    expect(enabledTools.has('inventory_stock_get_all')).toBe(true);
    expect(enabledTools.has('inventory_products_get')).toBe(false);
  });
});
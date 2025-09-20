import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../src/config/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('ConfigManager Environment Variable Overrides', () => {
  const originalEnv = process.env;
  let tempConfigPath: string;

  beforeEach(async () => {
    // Clear environment
    process.env = { ...originalEnv };
    
    // Create a temporary YAML config file for testing
    tempConfigPath = join('/tmp', `test-config-${Date.now()}.yaml`);
    const testYamlConfig = `
server:
  enable_http_server: false
  http_server_port: 8080

grocy:
  base_url: "http://localhost:9283"
  enable_ssl_verify: true
  response_size_limit: 10000

tools:
  test_tool:
    enabled: true
    ack_token: "TEST_TOKEN"
`;
    await fs.writeFile(tempConfigPath, testYamlConfig);
  });

  afterEach(async () => {
    // Restore environment
    process.env = originalEnv;
    
    // Clean up temp file
    try {
      await fs.unlink(tempConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('GROCY_BASE_URL override', () => {
    it('should use environment variable when provided', () => {
      process.env.GROCY_BASE_URL = 'https://my-grocy.example.com';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.grocy.base_url).toBe('https://my-grocy.example.com');
    });

    it('should fall back to YAML config when env var not set', () => {
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.grocy.base_url).toBe('http://localhost:9283');
    });
  });

  describe('GROCY_APIKEY_VALUE override', () => {
    it('should set api_key in YAML when env var provided', () => {
      process.env.GROCY_APIKEY_VALUE = 'test-api-key-12345';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.grocy.api_key).toBe('test-api-key-12345');
    });

    it('should leave api_key undefined when env var not set', () => {
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.grocy.api_key).toBeUndefined();
    });

    it('should include API key in custom headers when set', () => {
      process.env.GROCY_APIKEY_VALUE = 'header-test-key';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const headers = config.getCustomHeaders();
      
      expect(headers['GROCY-API-KEY']).toBe('header-test-key');
    });
  });

  describe('GROCY_ENABLE_SSL_VERIFY override', () => {
    it('should override to false when env var is "false"', () => {
      process.env.GROCY_ENABLE_SSL_VERIFY = 'false';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.grocy.enable_ssl_verify).toBe(false);
    });

    it('should override to true when env var is "true"', () => {
      process.env.GROCY_ENABLE_SSL_VERIFY = 'true';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.grocy.enable_ssl_verify).toBe(true);
    });

    it('should fall back to YAML config when env var not set', () => {
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.grocy.enable_ssl_verify).toBe(true); // from YAML
    });
  });

  describe('REST_RESPONSE_SIZE_LIMIT override', () => {
    it('should override response size limit when env var provided', () => {
      process.env.REST_RESPONSE_SIZE_LIMIT = '25000';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.grocy.response_size_limit).toBe(25000);
    });

    it('should fall back to YAML config when env var not set', () => {
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.grocy.response_size_limit).toBe(10000); // from YAML
    });
  });

  describe('ENABLE_HTTP_SERVER override', () => {
    it('should override to true when env var is "true"', () => {
      process.env.ENABLE_HTTP_SERVER = 'true';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.server.enable_http_server).toBe(true);
    });

    it('should override to false when env var is "false"', () => {
      process.env.ENABLE_HTTP_SERVER = 'false';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.server.enable_http_server).toBe(false);
    });

    it('should fall back to YAML config when env var not set', () => {
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.server.enable_http_server).toBe(false); // from YAML
    });
  });

  describe('HTTP_SERVER_PORT override', () => {
    it('should override HTTP server port when env var provided', () => {
      process.env.HTTP_SERVER_PORT = '9090';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.server.http_server_port).toBe(9090);
    });

    it('should fall back to YAML config when env var not set', () => {
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      expect(yaml.server.http_server_port).toBe(8080); // from YAML
    });
  });

  describe('Multiple environment variable overrides', () => {
    it('should apply all environment variable overrides correctly', () => {
      process.env.GROCY_BASE_URL = 'https://multi-test.example.com';
      process.env.GROCY_APIKEY_VALUE = 'multi-test-key';
      process.env.GROCY_ENABLE_SSL_VERIFY = 'false';
      process.env.REST_RESPONSE_SIZE_LIMIT = '50000';
      process.env.ENABLE_HTTP_SERVER = 'true';
      process.env.HTTP_SERVER_PORT = '7070';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      // All overrides should be applied
      expect(yaml.grocy.base_url).toBe('https://multi-test.example.com');
      expect(yaml.grocy.api_key).toBe('multi-test-key');
      expect(yaml.grocy.enable_ssl_verify).toBe(false);
      expect(yaml.grocy.response_size_limit).toBe(50000);
      expect(yaml.server.enable_http_server).toBe(true);
      expect(yaml.server.http_server_port).toBe(7070);
    });

    it('should preserve YAML config for unset environment variables', () => {
      // Only set some environment variables
      process.env.GROCY_BASE_URL = 'https://partial-override.example.com';
      process.env.HTTP_SERVER_PORT = '6060';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { yaml } = config.getConfig();
      
      // Overridden values
      expect(yaml.grocy.base_url).toBe('https://partial-override.example.com');
      expect(yaml.server.http_server_port).toBe(6060);
      
      // YAML defaults preserved
      expect(yaml.grocy.api_key).toBeUndefined();
      expect(yaml.grocy.enable_ssl_verify).toBe(true);
      expect(yaml.grocy.response_size_limit).toBe(10000);
      expect(yaml.server.enable_http_server).toBe(false);
    });
  });

  describe('API URL generation', () => {
    it('should generate correct API URL with environment override', () => {
      process.env.GROCY_BASE_URL = 'https://api-test.example.com';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const apiUrl = config.getApiUrl();
      
      expect(apiUrl).toBe('https://api-test.example.com/api');
    });

    it('should handle base URL with trailing slash', () => {
      process.env.GROCY_BASE_URL = 'https://trailing-slash.example.com/';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const apiUrl = config.getApiUrl();
      
      expect(apiUrl).toBe('https://trailing-slash.example.com/api');
    });
  });

  describe('Tool configuration preservation', () => {
    it('should preserve tool configuration when applying environment overrides', () => {
      process.env.GROCY_BASE_URL = 'https://tools-test.example.com';
      
      const config = ConfigManager.createForTesting(tempConfigPath);
      const { enabledTools, toolSubConfigs } = config.parseToolConfiguration();
      const { yaml } = config.getConfig();
      
      // Tool configuration should be preserved
      expect(enabledTools.has('test_tool')).toBe(true);
      
      // ack_token is stored in the YAML config, not in sub-configs
      expect(yaml.tools.test_tool?.ack_token).toBe('TEST_TOKEN');
      expect(yaml.tools.test_tool?.enabled).toBe(true);
      
      // Since our test tool only has enabled and ack_token (both standard fields),
      // it won't have a sub-config entry because sub-configs only contain non-standard fields
      expect(toolSubConfigs.has('test_tool')).toBe(false);
    });
  });

  describe('Invalid environment values', () => {
    it('should handle invalid URL gracefully', () => {
      process.env.GROCY_BASE_URL = 'not-a-valid-url';
      
      expect(() => {
        ConfigManager.createForTesting(tempConfigPath);
      }).toThrow(); // Should throw due to Zod validation
    });

    it('should handle invalid port numbers gracefully', () => {
      process.env.HTTP_SERVER_PORT = 'not-a-number';
      
      expect(() => {
        ConfigManager.createForTesting(tempConfigPath);
      }).toThrow(); // Should throw due to Zod validation
    });

    it('should handle invalid response size limit gracefully', () => {
      process.env.REST_RESPONSE_SIZE_LIMIT = 'not-a-number';
      
      expect(() => {
        ConfigManager.createForTesting(tempConfigPath);
      }).toThrow(); // Should throw due to Zod validation
    });
  });
});
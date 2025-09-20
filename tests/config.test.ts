import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../src/config/environment.js';

describe('ConfigManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    // Reset singleton for next test
    (ConfigManager as any).resetInstanceForTesting();
  });

  it('should create ConfigManager instance without errors', () => {
    process.env = {};
    
    expect(() => {
      const config = ConfigManager.getInstance();
      const env = config.get();
      // The environment config should be minimal now (only GROCY_APIKEY_VALUE and RELEASE_VERSION)
      expect(env).toBeDefined();
      expect(env.GROCY_APIKEY_VALUE).toBeUndefined();
      expect(env.RELEASE_VERSION).toBeUndefined();
    }).not.toThrow();
  });

  it('should parse API key from environment variables', () => {
    process.env.GROCY_APIKEY_VALUE = 'test-api-key-12345';
    process.env.RELEASE_VERSION = '1.0.0';
    
    expect(() => {
      const config = ConfigManager.getInstance();
      const env = config.get();
      expect(env.GROCY_APIKEY_VALUE).toBe('test-api-key-12345');
      expect(env.RELEASE_VERSION).toBe('1.0.0');
      expect(config.hasApiKeyAuth()).toBe(true);
    }).not.toThrow();
  });

  it('should handle missing API key gracefully', () => {
    process.env = {};
    
    expect(() => {
      const config = ConfigManager.getInstance();
      expect(config.hasApiKeyAuth()).toBe(false);
    }).not.toThrow();
  });

  it('should handle invalid environment variables gracefully', () => {
    // Since ConfigManager now only handles GROCY_APIKEY_VALUE and RELEASE_VERSION (both optional strings),
    // there's no validation that would cause it to throw. This test ensures it handles any env gracefully.
    process.env.GROCY_APIKEY_VALUE = 'valid-key';
    process.env.SOME_OTHER_VAR = 'ignored';
    
    expect(() => {
      const config = ConfigManager.getInstance();
      const env = config.get();
      expect(env.GROCY_APIKEY_VALUE).toBe('valid-key');
    }).not.toThrow();
  });

  describe('YAML Configuration with ack_token', () => {
    it('should parse ack_token from YAML configuration', async () => {
      const yamlConfig = `
tools:
  purchase_product:
    enabled: true
    ack_token: "STOCK_PURCHASED_OK"
  get_products:
    enabled: true
    ack_token: ""
  consume_product:
    enabled: false
`;
      
      // Create a temporary config file
      const fs = await import('fs/promises');
      const tempConfigPath = '/tmp/test-mcp-grocy.yaml';
      await fs.writeFile(tempConfigPath, yamlConfig);
      
      try {
        const { YamlConfigManager } = await import('../src/config/yaml-config.js');
        const yamlConfigManager = YamlConfigManager.createForTesting(tempConfigPath);
        
        const purchaseConfig = yamlConfigManager.getToolSubConfigs('purchase_product');
        const getProductsConfig = yamlConfigManager.getToolSubConfigs('get_products');
        const consumeConfig = yamlConfigManager.getToolSubConfigs('consume_product');
        
        expect(purchaseConfig.get('enabled')).toBe(true);
        expect(purchaseConfig.get('ack_token')).toBe('STOCK_PURCHASED_OK');
        
        expect(getProductsConfig.get('enabled')).toBe(true);
        expect(getProductsConfig.get('ack_token')).toBe('');
        
        expect(consumeConfig.get('enabled')).toBe(false);
        expect(consumeConfig.has('ack_token')).toBe(false);
      } finally {
        // Clean up
        await fs.unlink(tempConfigPath).catch(() => {});
      }
    });

    it('should handle missing ack_token gracefully', async () => {
      const yamlConfig = `
tools:
  get_products:
    enabled: true
`;
      
      const fs = await import('fs/promises');
      const tempConfigPath = '/tmp/test-mcp-grocy-no-ack.yaml';
      await fs.writeFile(tempConfigPath, yamlConfig);
      
      try {
        const { YamlConfigManager } = await import('../src/config/yaml-config.js');
        const yamlConfigManager = YamlConfigManager.createForTesting(tempConfigPath);
        
        const config = yamlConfigManager.getToolSubConfigs('get_products');
        
        expect(config.get('enabled')).toBe(true);
        expect(config.has('ack_token')).toBe(false);
      } finally {
        await fs.unlink(tempConfigPath).catch(() => {});
      }
    });

    it('should validate ack_token as string type', async () => {
      const yamlConfig = `
tools:
  purchase_product:
    enabled: true
    ack_token: 12345
`;
      
      const fs = await import('fs/promises');
      const tempConfigPath = '/tmp/test-mcp-grocy-invalid-ack.yaml';
      await fs.writeFile(tempConfigPath, yamlConfig);
      
      try {
        const { YamlConfigManager } = await import('../src/config/yaml-config.js');
        
        expect(() => {
          YamlConfigManager.createForTesting(tempConfigPath);
        }).toThrow();
      } finally {
        await fs.unlink(tempConfigPath).catch(() => {});
      }
    });
  });
});
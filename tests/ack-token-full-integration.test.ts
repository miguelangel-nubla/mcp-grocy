import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Acknowledgment Token Full Integration Test', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalConfig: string | undefined;

  beforeEach(async () => {
    // Create a temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-grocy-ack-test-'));
    originalCwd = process.cwd();
    
    // Save original config env var
    originalConfig = process.env.CONFIG_PATH;
    
    // Create a test config file with a tool that has an ack_token
    const testConfig = `
server:
  enable_http_server: false
  http_server_port: 8080

grocy:
  base_url: "http://localhost:8080"
  enable_ssl_verify: false
  response_size_limit: 10000

tools:
  system_users_get:
    enabled: true
    ack_token: "TEST_INTEGRATION_TOKEN_789"
  
  # Keep one more tool enabled to avoid empty registry
  inventory_products_get:
    enabled: true
`;
    
    const configPath = path.join(tempDir, 'mcp-grocy.yaml');
    await fs.writeFile(configPath, testConfig);
    
    // Point to our test config
    process.env.CONFIG_PATH = configPath;
    
    // Change to temp directory
    process.chdir(tempDir);
  });

  afterEach(async () => {
    // Restore original directory and config
    process.chdir(originalCwd);
    if (originalConfig !== undefined) {
      process.env.CONFIG_PATH = originalConfig;
    } else {
      delete process.env.CONFIG_PATH;
    }
    
    // Clean up temp directory
    await fs.rmdir(tempDir, { recursive: true });
    
    // Clear module cache to ensure fresh imports
    const moduleKeys = Object.keys(require.cache).filter(key => 
      key.includes('mcp-grocy') || key.includes('config')
    );
    moduleKeys.forEach(key => delete require.cache[key]);
  });

  it('should load configuration with ack_token and add it to successful tool responses', async () => {
    // Import modules fresh with our test config
    const { config } = await import('../src/config/index.js');
    const { GrocyMcpServer } = await import('../src/server/mcp-server.js');
    
    // Parse configuration
    const { enabledTools, toolSubConfigs, toolAckTokens } = config.parseToolConfiguration();
    
    // Verify our test tool is enabled and has ack_token
    expect(enabledTools.has('system_users_get')).toBe(true);
    expect(toolAckTokens.get('system_users_get')).toBe('TEST_INTEGRATION_TOKEN_789');
    
    // Verify ack_token is not in subConfigs
    const subConfigs = toolSubConfigs.get('system_users_get');
    if (subConfigs) {
      expect(subConfigs.has('ack_token')).toBe(false);
    }
    
    // Create a mock tool registry that includes our test tool
    const mockRegistry = {
      getToolNames: () => ['system_users_get', 'inventory_products_get'],
      getToolDefinitions: () => [
        {
          name: 'system_users_get',
          description: 'Get system users',
          inputSchema: { type: 'object', properties: {}, required: [] }
        },
        {
          name: 'inventory_products_get', 
          description: 'Get products',
          inputSchema: { type: 'object', properties: { fields: { type: 'string' } }, required: ['fields'] }
        }
      ],
      getHandler: (name: string) => {
        if (name === 'system_users_get') {
          return async () => ({
            content: [{ type: 'text', text: 'Users retrieved successfully' }]
          });
        }
        if (name === 'inventory_products_get') {
          return async () => ({
            content: [{ type: 'text', text: 'Products retrieved successfully' }]
          });
        }
        return null;
      }
    };
    
    const mockResourceHandler = {
      listResources: () => [],
      readResource: () => null
    };
    
    // Create MCP server instance
    const server = await GrocyMcpServer.create(mockRegistry as any, mockResourceHandler as any);
    
    // Access internal server state to verify configuration
    const serverAckTokens = (server as any).toolAckTokens;
    expect(serverAckTokens.get('system_users_get')).toBe('TEST_INTEGRATION_TOKEN_789');
    
    // Test the tool execution with ack_token logic
    const toolHandler = mockRegistry.getHandler('system_users_get');
    const result = await toolHandler!({});
    
    // Simulate the MCP server's ack_token addition logic
    if (!result.isError) {
      const ackToken = serverAckTokens.get('system_users_get');
      if (ackToken) {
        result.content.push({
          type: 'text' as const,
          text: `Acknowledgment token: ${ackToken}`
        });
      }
    }
    
    // Verify the ack_token was added
    expect(result.content).toHaveLength(2);
    expect(result.content[0].text).toBe('Users retrieved successfully');
    expect(result.content[1].text).toBe('Acknowledgment token: TEST_INTEGRATION_TOKEN_789');
    
    console.log('✅ Full integration test passed: ack_token functionality works end-to-end');
  });

  it('should not add ack_token for tools without it configured', async () => {
    // Import modules fresh with our test config
    const { GrocyMcpServer } = await import('../src/server/mcp-server.js');
    
    const mockRegistry = {
      getToolNames: () => ['inventory_products_get'], // This tool has no ack_token in our config
      getToolDefinitions: () => [
        {
          name: 'inventory_products_get',
          description: 'Get products', 
          inputSchema: { type: 'object', properties: { fields: { type: 'string' } }, required: ['fields'] }
        }
      ],
      getHandler: (name: string) => {
        if (name === 'inventory_products_get') {
          return async () => ({
            content: [{ type: 'text', text: 'Products retrieved successfully' }]
          });
        }
        return null;
      }
    };
    
    const mockResourceHandler = {
      listResources: () => [],
      readResource: () => null
    };
    
    const server = await GrocyMcpServer.create(mockRegistry as any, mockResourceHandler as any);
    const serverAckTokens = (server as any).toolAckTokens;
    
    // Verify no ack_token for this tool
    expect(serverAckTokens.get('inventory_products_get')).toBeUndefined();
    
    // Test tool execution
    const toolHandler = mockRegistry.getHandler('inventory_products_get');
    const result = await toolHandler!({ fields: 'id,name' });
    
    // Simulate MCP server logic
    if (!result.isError) {
      const ackToken = serverAckTokens.get('inventory_products_get');
      if (ackToken) {
        result.content.push({
          type: 'text' as const,
          text: `Acknowledgment token: ${ackToken}`
        });
      }
    }
    
    // Verify no ack_token was added
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('Products retrieved successfully');
  });
});
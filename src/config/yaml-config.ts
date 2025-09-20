import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Define common sub-configuration options that are validated globally
const CommonSubConfigSchema = z.object({
  enabled: z.boolean().default(false),
  ack_token: z.string().optional(),
});

// Define the schema for tool configuration with global validation of common options
// and pass-through of tool-specific options for individual tool validation
const ToolConfigSchema = CommonSubConfigSchema.catchall(z.unknown());

// Define the main configuration schema
const ConfigSchema = z.object({
  server: z.object({
    enable_http_server: z.boolean().default(false),
    http_server_port: z.number().min(1).max(65535).default(8080),
  }).default({}),
  
  grocy: z.object({
    base_url: z.string().url().default('http://localhost:9283'),
    enable_ssl_verify: z.boolean().default(true),
    response_size_limit: z.number().positive().default(10000),
  }).default({}),
  
  tools: z.record(z.string(), ToolConfigSchema).default({}),
});

export type ToolConfig = z.infer<typeof ToolConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export class YamlConfigManager {
  private static instance: YamlConfigManager;
  private config!: Config;
  private configPath: string;

  private constructor(configPath?: string) {
    if (configPath) {
      this.configPath = configPath;
    } else {
      // Look for config files in the following order:
      // 1. Current working directory (for development)
      // 2. Project root (relative to the compiled main.js)
      const projectRoot = resolve(__dirname, '../..');
      const possiblePaths = [
        resolve(process.cwd(), 'mcp-grocy.yaml'),
        resolve(process.cwd(), 'mcp-grocy.yml'),
        resolve(projectRoot, 'mcp-grocy.yaml'),
        resolve(projectRoot, 'mcp-grocy.yml'),
      ];

      this.configPath = possiblePaths.find(path => existsSync(path)) ?? possiblePaths[0]!;
    }
    this.loadConfig();
  }

  public static getInstance(): YamlConfigManager {
    if (!YamlConfigManager.instance) {
      YamlConfigManager.instance = new YamlConfigManager();
    }
    return YamlConfigManager.instance;
  }

  /**
   * Create a new instance for testing with a custom config path
   * Note: This bypasses the singleton pattern for testing purposes
   */
  public static createForTesting(configPath: string): YamlConfigManager {
    return new YamlConfigManager(configPath);
  }

  private loadConfig(): void {
    try {
      let configData: any = {};
      
      if (existsSync(this.configPath)) {
        const yamlContent = readFileSync(this.configPath, 'utf8');
        configData = YAML.parse(yamlContent) || {};
        logger.config(`Loaded configuration from: ${this.configPath}`);
      } else {
        logger.config(`No configuration file found at ${this.configPath}, using defaults`);
        logger.config(`Create a mcp-grocy.yaml file based on mcp-grocy.yaml.example for custom configuration`);
      }

      // Parse and validate the configuration
      this.config = ConfigSchema.parse(configData);
      this.logConfiguration();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid configuration', 'config');
        error.errors.forEach(err => {
          logger.error(`  - ${err.path.join('.')}: ${err.message}`, 'config');
        });
        process.exit(1);
      } else if (error instanceof Error) {
        logger.error(`Failed to load configuration: ${error.message}`, 'config');
        process.exit(1);
      }
      throw error;
    }
  }

  private logConfiguration(): void {
    logger.config(`Grocy Base URL: ${this.config.grocy.base_url}`);
    logger.config(`SSL Verification: ${this.config.grocy.enable_ssl_verify ? 'enabled' : 'disabled'}`);
    logger.config(`HTTP Server: ${this.config.server.enable_http_server ? `enabled on port ${this.config.server.http_server_port}` : 'disabled'}`);
    logger.config(`Response Size Limit: ${this.config.grocy.response_size_limit} bytes`);

    const enabledTools = this.getEnabledTools();
    const toolsWithAckTokens = this.getToolsWithAckTokens();
    
    if (enabledTools.size > 0) {
      logger.config(`Enabled tools (${enabledTools.size}): ${Array.from(enabledTools).sort().join(', ')}`);
    } else {
      logger.config('No tools enabled');
    }

    if (toolsWithAckTokens.length > 0) {
      logger.config(`Tools with acknowledgment tokens (${toolsWithAckTokens.length}): ${toolsWithAckTokens.sort().join(', ')}`);
    }
  }

  public getConfig(): Config {
    return this.config;
  }

  public getGrocyBaseUrl(): string {
    return this.config.grocy.base_url.replace(/\/+$/, '');
  }

  public getApiUrl(): string {
    return `${this.getGrocyBaseUrl()}/api`;
  }

  public hasApiKeyAuth(): boolean {
    return !!process.env.GROCY_APIKEY_VALUE;
  }

  public getEnabledTools(): Set<string> {
    const enabledTools = new Set<string>();
    
    for (const [toolName, toolConfig] of Object.entries(this.config.tools)) {
      if (toolConfig.enabled) {
        enabledTools.add(toolName);
      }
    }
    
    return enabledTools;
  }

  public getToolConfig(toolName: string): ToolConfig | undefined {
    return this.config.tools[toolName];
  }

  public getToolsWithAckTokens(): string[] {
    return Object.entries(this.config.tools)
      .filter(([_, config]) => config.enabled && config.ack_token)
      .map(([toolName, _]) => toolName);
  }

  public getSubConfigValue(toolName: string, key: string): any {
    const toolConfig = this.config.tools[toolName];
    if (!toolConfig) return undefined;
    
    return (toolConfig as any)[key];
  }

  public getAckToken(toolName: string): string | undefined {
    const toolConfig = this.config.tools[toolName];
    return (toolConfig as any)?.ack_token;
  }

  /**
   * Get tool sub-configurations as a Map for use with tool handlers
   */
  public getToolSubConfigs(toolName: string): Map<string, any> {
    const toolConfig = this.config.tools[toolName];
    const subConfigs = new Map<string, any>();
    
    if (toolConfig) {
      // Convert tool config to Map format expected by handlers
      for (const [key, value] of Object.entries(toolConfig)) {
        subConfigs.set(key, value);
      }
    }
    
    return subConfigs;
  }

  // Custom headers from environment variables
  public getCustomHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const headerPrefix = /^header_/i;
    
    for (const [key, value] of Object.entries(process.env)) {
      if (headerPrefix.test(key) && value !== undefined) {
        const headerName = key.replace(headerPrefix, '');
        headers[headerName] = value;
      }
    }
    
    return headers;
  }

  // Convert to expected format for tool handlers
  public parseToolConfiguration(): { 
    enabledTools: Set<string>, 
    toolSubConfigs: Map<string, Map<string, any>>
  } {
    const enabledTools = this.getEnabledTools();
    const toolSubConfigs = new Map<string, Map<string, any>>();
    const commonKeys = new Set(['enabled', 'ack_token']);

    for (const [toolName, toolConfig] of Object.entries(this.config.tools)) {
      const subConfigs = new Map<string, any>();
      
      // Add globally validated common options
      if (toolConfig.ack_token) {
        subConfigs.set('ack_token', toolConfig.ack_token);
      }
      
      // Add tool-specific options (not validated globally)
      for (const [key, value] of Object.entries(toolConfig)) {
        if (!commonKeys.has(key)) {
          subConfigs.set(key, value);
        }
      }

      if (subConfigs.size > 0) {
        toolSubConfigs.set(toolName, subConfigs);
      }
    }

    return { enabledTools, toolSubConfigs };
  }
}

export const yamlConfig = YamlConfigManager.getInstance();
export default yamlConfig;
/**
 * Unified configuration system
 * Combines environment variables and YAML configuration
 */

import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Environment schema
const EnvironmentSchema = z.object({
  // Grocy Configuration
  GROCY_BASE_URL: z.string().url().optional(),
  GROCY_APIKEY_VALUE: z.string().optional(),
  GROCY_ENABLE_SSL_VERIFY: z.enum(['true', 'false']).optional(),
  
  // Server Configuration  
  REST_RESPONSE_SIZE_LIMIT: z.string().regex(/^\d+$/).optional(),
  ENABLE_HTTP_SERVER: z.enum(['true', 'false']).optional(),
  HTTP_SERVER_PORT: z.string().regex(/^\d+$/).optional(),
  
  // Logging Configuration
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).optional(),
  LOG_CATEGORIES: z.string().optional(),
  
  // Build Configuration
  RELEASE_VERSION: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
});

// YAML configuration schema
const YamlConfigSchema = z.object({
  server: z.object({
    enable_http_server: z.boolean().default(false),
    http_server_port: z.number().min(1).max(65535).default(8080),
  }).default({}),
  
  grocy: z.object({
    base_url: z.string().url().default('http://localhost:9283'),
    api_key: z.string().optional(),
    enable_ssl_verify: z.boolean().default(true),
    response_size_limit: z.number().positive().default(10000),
  }).default({}),
  
  tools: z.record(z.string(), z.object({
    enabled: z.boolean().default(false),
    ack_token: z.string().optional(),
  }).catchall(z.unknown())).default({}),
});

export type Environment = z.infer<typeof EnvironmentSchema>;
export type YamlConfig = z.infer<typeof YamlConfigSchema>;

export interface Config {
  env: Environment;
  yaml: YamlConfig;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;

  private constructor(configPath?: string) {
    this.config = this.loadConfig(configPath);
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public static createForTesting(configPath?: string): ConfigManager {
    return new ConfigManager(configPath);
  }

  private loadConfig(configPath?: string): Config {
    // Load environment variables
    const env = this.loadEnvironment();
    
    // Load YAML configuration
    const yaml = this.loadYamlConfig(configPath);
    
    // Apply environment variable overrides
    this.applyEnvironmentOverrides(yaml, env);
    
    return { env, yaml };
  }

  private loadEnvironment(): Environment {
    try {
      return EnvironmentSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid environment variables', 'CONFIG');
        error.errors.forEach(err => {
          logger.error(`${err.path.join('.')}: ${err.message}`, 'CONFIG');
        });
        process.exit(1);
      }
      throw error;
    }
  }

  private loadYamlConfig(configPath?: string): YamlConfig {
    const yamlPath = this.findConfigFile(configPath);
    
    try {
      let configData: any = {};
      
      if (existsSync(yamlPath)) {
        const yamlContent = readFileSync(yamlPath, 'utf8');
        configData = YAML.parse(yamlContent) || {};
        logger.config(`Loaded YAML config from: ${yamlPath}`);
      } else {
        logger.config('No YAML config found, using defaults');
      }

      return YamlConfigSchema.parse(configData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid YAML configuration', 'CONFIG');
        error.errors.forEach(err => {
          logger.error(`${err.path.join('.')}: ${err.message}`, 'CONFIG');
        });
        process.exit(1);
      }
      throw error;
    }
  }

  private findConfigFile(configPath?: string): string {
    if (configPath) return configPath;
    
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

    return possiblePaths.find(path => existsSync(path)) ?? possiblePaths[0]!;
  }

  // Public getters
  public getConfig(): Config {
    return this.config;
  }

  public getApiUrl(): string {
    const baseUrl = this.config.yaml.grocy.base_url;
    return baseUrl.endsWith('/') ? `${baseUrl}api` : `${baseUrl}/api`;
  }

  public getCustomHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.yaml.grocy.api_key) {
      headers['GROCY-API-KEY'] = this.config.yaml.grocy.api_key;
    }
    return headers;
  }

  /**
   * Apply environment variable overrides to YAML configuration
   */
  private applyEnvironmentOverrides(yaml: YamlConfig, env: Environment): void {
    // Grocy configuration overrides
    if (env.GROCY_BASE_URL) {
      yaml.grocy.base_url = env.GROCY_BASE_URL;
    }
    
    if (env.GROCY_APIKEY_VALUE) {
      yaml.grocy.api_key = env.GROCY_APIKEY_VALUE;
    }
    
    if (env.GROCY_ENABLE_SSL_VERIFY !== undefined) {
      yaml.grocy.enable_ssl_verify = env.GROCY_ENABLE_SSL_VERIFY === 'true';
    }
    
    if (env.REST_RESPONSE_SIZE_LIMIT !== undefined) {
      yaml.grocy.response_size_limit = parseInt(env.REST_RESPONSE_SIZE_LIMIT, 10);
    }
    
    // Server configuration overrides
    if (env.ENABLE_HTTP_SERVER !== undefined) {
      yaml.server.enable_http_server = env.ENABLE_HTTP_SERVER === 'true';
    }
    
    if (env.HTTP_SERVER_PORT !== undefined) {
      yaml.server.http_server_port = parseInt(env.HTTP_SERVER_PORT, 10);
    }
  }

  public parseToolConfiguration(): { 
    enabledTools: Set<string>, 
    toolSubConfigs: Map<string, Map<string, any>>
  } {
    const enabledTools = new Set<string>();
    const toolSubConfigs = new Map<string, Map<string, any>>();

    for (const [toolName, toolConfig] of Object.entries(this.config.yaml.tools)) {
      if (toolConfig.enabled) {
        enabledTools.add(toolName);
        
        // Extract sub-configs (everything except standard fields)
        const subConfigs = new Map<string, any>();
        for (const [key, value] of Object.entries(toolConfig)) {
          if (!['enabled', 'ack_token'].includes(key)) {
            subConfigs.set(key, value);
          }
        }
        
        if (subConfigs.size > 0) {
          toolSubConfigs.set(toolName, subConfigs);
        }
      }
    }

    return { enabledTools, toolSubConfigs };
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();
export default config;

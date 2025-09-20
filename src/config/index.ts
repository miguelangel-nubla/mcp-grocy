/**
 * Unified configuration system
 * Combines environment variables and YAML configuration
 */

import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import YAML from 'yaml';
import { logger } from '../utils/logger.js';

// Environment schema
const EnvironmentSchema = z.object({
  GROCY_APIKEY_VALUE: z.string().optional(),
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
    
    const possiblePaths = [
      resolve(process.cwd(), 'mcp-grocy.yaml'),
      resolve(process.cwd(), 'mcp-grocy.yml'),
    ];

    return possiblePaths.find(path => existsSync(path)) ?? possiblePaths[0]!;
  }

  // Public getters
  public getConfig(): Config {
    return this.config;
  }

  public getGrocyBaseUrl(): string {
    return this.config.yaml.grocy.base_url;
  }

  public getApiUrl(): string {
    const baseUrl = this.getGrocyBaseUrl();
    return baseUrl.endsWith('/') ? `${baseUrl}api` : `${baseUrl}/api`;
  }

  public hasApiKey(): boolean {
    return !!this.config.env.GROCY_APIKEY_VALUE;
  }

  public getApiKey(): string | undefined {
    return this.config.env.GROCY_APIKEY_VALUE;
  }

  public getCustomHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.env.GROCY_APIKEY_VALUE) {
      headers['GROCY-API-KEY'] = this.config.env.GROCY_APIKEY_VALUE;
    }
    return headers;
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

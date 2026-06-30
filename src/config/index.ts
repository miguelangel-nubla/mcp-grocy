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

/** Default cap for Grocy HTTP response bodies (axios maxContentLength), in bytes */
export const DEFAULT_MAX_RESPONSE_BYTES = 52_428_800; // 50 MiB

// Environment schema
const EnvironmentSchema = z.object({
  // Grocy Configuration
  GROCY_BASE_URL: z.string().url().optional(),
  GROCY_API_KEY: z.string().optional(),
  GROCY_ENABLE_SSL_VERIFY: z.enum(['true', 'false']).optional(),
  GROCY_MAX_RESPONSE_BYTES: z.string().regex(/^\d+$/).optional(),

  // Server Configuration
  REST_RESPONSE_SIZE_LIMIT: z.string().regex(/^\d+$/).optional(),
  ENABLE_HTTP_SERVER: z.enum(['true', 'false']).optional(),
  HTTP_SERVER_PORT: z.string().regex(/^\d+$/).optional(),
  HTTP_CORS_ORIGIN: z.string().optional(),
  MCP_HTTP_ACCESS_TOKEN: z.string().optional(),
  MCP_SESSION_IDLE_TIMEOUT_MS: z.string().regex(/^\d+$/).optional(),
  MCP_SESSION_SWEEP_INTERVAL_MS: z.string().regex(/^\d+$/).optional(),

  // Logging Configuration
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).optional(),
  LOG_CATEGORIES: z.string().optional(),

  // Build Configuration
  RELEASE_VERSION: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
});

// YAML configuration schema
const YamlConfigSchema = z
  .object({
    server: z
      .object({
        enable_http_server: z.boolean().default(false),
        http_server_port: z.number().min(1).max(65535).default(8080),
        /** CORS `Access-Control-Allow-Origin` for HTTP MCP endpoints (`*` or a single origin URL) */
        http_cors_origin: z.string().min(1).default('*'),
        /** When set, MCP HTTP/SSE routes require `Authorization: Bearer <token>`, `X-MCP-Access-Token`, or `access_token` query (GET only). */
        http_access_token: z.string().optional(),
        /** Reap an idle streamable-HTTP MCP session after this many ms with no requests. Bounds memory when clients reconnect without sending `DELETE /mcp`. */
        session_idle_timeout_ms: z.number().int().positive().default(300_000),
        /** How often, in ms, to sweep for idle MCP sessions to reap. */
        session_sweep_interval_ms: z.number().int().positive().default(60_000),
      })
      .strict()
      .default({
        enable_http_server: false,
        http_server_port: 8080,
        http_cors_origin: '*',
        session_idle_timeout_ms: 300_000,
        session_sweep_interval_ms: 60_000,
      }),

    grocy: z
      .object({
        base_url: z.string().url().default('http://localhost:9283'),
        api_key: z.string().optional(),
        enable_ssl_verify: z.boolean().default(true),
        response_size_limit: z.number().positive().default(10000),
        /** Max Grocy API response body size in bytes (all tools); larger responses fail fast */
        max_response_bytes: z.number().positive().default(DEFAULT_MAX_RESPONSE_BYTES),
      })
      .strict()
      .default({
        base_url: 'http://localhost:9283',
        enable_ssl_verify: true,
        response_size_limit: 10000,
        max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
      }),

    tools: z
      .record(
        z.string(),
        z
          .object({
            enabled: z.boolean().default(false),
            ack_token: z.string().optional(),
          })
          .catchall(z.unknown()),
      )
      .default({}),
  })
  .strict();

export type Environment = z.infer<typeof EnvironmentSchema>;
export type YamlConfig = z.infer<typeof YamlConfigSchema>;

export interface Config {
  env: Environment;
  yaml: YamlConfig;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;

  // Unified config properties - final resolved values
  public readonly grocy: {
    base_url: string;
    api_key?: string;
    enable_ssl_verify: boolean;
    response_size_limit: number;
    max_response_bytes: number;
  };

  public readonly server: {
    enable_http_server: boolean;
    http_server_port: number;
    http_cors_origin: string;
    http_access_token?: string;
    session_idle_timeout_ms: number;
    session_sweep_interval_ms: number;
  };

  public readonly tools: Record<string, any>;

  private constructor(configPath?: string) {
    this.config = this.loadConfig(configPath);

    // Expose final resolved values
    this.grocy = {
      base_url: this.config.yaml.grocy.base_url,
      ...(this.config.yaml.grocy.api_key !== undefined && {
        api_key: this.config.yaml.grocy.api_key,
      }),
      enable_ssl_verify: this.config.yaml.grocy.enable_ssl_verify,
      response_size_limit: this.config.yaml.grocy.response_size_limit,
      max_response_bytes: this.config.yaml.grocy.max_response_bytes,
    };

    this.server = {
      enable_http_server: this.config.yaml.server.enable_http_server,
      http_server_port: this.config.yaml.server.http_server_port,
      http_cors_origin: this.config.yaml.server.http_cors_origin,
      session_idle_timeout_ms: this.config.yaml.server.session_idle_timeout_ms,
      session_sweep_interval_ms: this.config.yaml.server.session_sweep_interval_ms,
      ...(this.config.yaml.server.http_access_token !== undefined &&
        this.config.yaml.server.http_access_token !== '' && {
          http_access_token: this.config.yaml.server.http_access_token,
        }),
    };

    this.tools = this.config.yaml.tools;
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
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
        for (const issue of error.issues) {
          const path = issue.path?.length ? issue.path.join('.') : '(root)';
          logger.error(`${path}: ${issue.message}`, 'CONFIG');
        }
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
        for (const issue of error.issues) {
          const path = issue.path?.length ? issue.path.join('.') : '(root)';
          logger.error(`${path}: ${issue.message}`, 'CONFIG');
        }
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

    return possiblePaths.find((path) => existsSync(path)) ?? possiblePaths[0]!;
  }

  // Public getters
  public getConfig(): Config {
    return this.config;
  }

  public getApiUrl(): string {
    return this.grocy.base_url.endsWith('/')
      ? `${this.grocy.base_url}api`
      : `${this.grocy.base_url}/api`;
  }

  public getCustomHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.grocy.api_key) {
      headers['GROCY-API-KEY'] = this.grocy.api_key;
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

    if (env.GROCY_API_KEY) {
      yaml.grocy.api_key = env.GROCY_API_KEY;
    }

    if (env.GROCY_ENABLE_SSL_VERIFY !== undefined) {
      yaml.grocy.enable_ssl_verify = env.GROCY_ENABLE_SSL_VERIFY === 'true';
    }

    if (env.REST_RESPONSE_SIZE_LIMIT !== undefined) {
      yaml.grocy.response_size_limit = parseInt(env.REST_RESPONSE_SIZE_LIMIT, 10);
    }

    if (env.GROCY_MAX_RESPONSE_BYTES !== undefined) {
      yaml.grocy.max_response_bytes = parseInt(env.GROCY_MAX_RESPONSE_BYTES, 10);
    }

    // Server configuration overrides
    if (env.ENABLE_HTTP_SERVER !== undefined) {
      yaml.server.enable_http_server = env.ENABLE_HTTP_SERVER === 'true';
    }

    if (env.HTTP_SERVER_PORT !== undefined) {
      yaml.server.http_server_port = parseInt(env.HTTP_SERVER_PORT, 10);
    }

    if (env.HTTP_CORS_ORIGIN !== undefined && env.HTTP_CORS_ORIGIN.length > 0) {
      yaml.server.http_cors_origin = env.HTTP_CORS_ORIGIN;
    }

    if (env.MCP_HTTP_ACCESS_TOKEN !== undefined) {
      yaml.server.http_access_token =
        env.MCP_HTTP_ACCESS_TOKEN.length > 0 ? env.MCP_HTTP_ACCESS_TOKEN : undefined;
    }

    if (env.MCP_SESSION_IDLE_TIMEOUT_MS !== undefined) {
      yaml.server.session_idle_timeout_ms = parseInt(env.MCP_SESSION_IDLE_TIMEOUT_MS, 10);
    }

    if (env.MCP_SESSION_SWEEP_INTERVAL_MS !== undefined) {
      yaml.server.session_sweep_interval_ms = parseInt(env.MCP_SESSION_SWEEP_INTERVAL_MS, 10);
    }
  }

  public parseToolConfiguration(): {
    enabledTools: Set<string>;
    toolSubConfigs: Map<string, Map<string, any>>;
    toolAckTokens: Map<string, string>;
  } {
    const enabledTools = new Set<string>();
    const toolSubConfigs = new Map<string, Map<string, any>>();
    const toolAckTokens = new Map<string, string>();

    for (const [toolName, toolConfig] of Object.entries(this.config.yaml.tools)) {
      if (toolConfig.enabled) {
        enabledTools.add(toolName);

        // Store ack_token separately if configured
        if (toolConfig.ack_token && typeof toolConfig.ack_token === 'string') {
          toolAckTokens.set(toolName, toolConfig.ack_token);
        }

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

    return { enabledTools, toolSubConfigs, toolAckTokens };
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();
export default config;

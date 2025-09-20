import { z } from 'zod';
import { yamlConfig } from './yaml-config.js';
import { logger } from '../utils/logger.js';

// Environment variable schema with validation and defaults
const EnvironmentSchema = z.object({
  // Grocy Configuration - API key must still come from env for security
  GROCY_APIKEY_VALUE: z.string().optional(),

  // Build Configuration
  RELEASE_VERSION: z.string().optional(),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export class ConfigManager {
  private static instance: ConfigManager;
  private envConfig: Environment;

  private constructor() {
    try {
      this.envConfig = EnvironmentSchema.parse(process.env);
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

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Reset the singleton instance for testing purposes
   * Note: This should only be used in tests
   */
  public static resetInstanceForTesting(): void {
    ConfigManager.instance = undefined as any;
  }

  public get(): Environment {
    return this.envConfig;
  }

  public getGrocyBaseUrl(): string {
    return yamlConfig.getGrocyBaseUrl();
  }

  public getApiUrl(): string {
    return yamlConfig.getApiUrl();
  }

  public hasApiKeyAuth(): boolean {
    return !!this.envConfig.GROCY_APIKEY_VALUE;
  }

  public getCustomHeaders(): Record<string, string> {
    return yamlConfig.getCustomHeaders();
  }

  public parseToolConfiguration(): { 
    enabledTools: Set<string>, 
    toolSubConfigs: Map<string, Map<string, any>>
  } {
    return yamlConfig.parseToolConfiguration();
  }
}

export const config = ConfigManager.getInstance();
export default config;
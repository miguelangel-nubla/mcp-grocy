#!/usr/bin/env node

/**
 * Simplified main entry point
 * Demonstrates the refactored architecture
 */

// Load environment variables
import 'dotenv/config';

import { GrocyMcpServer } from './server/mcp-server.js';
import { config } from './config/index.js';
import { VERSION, PACKAGE_NAME as SERVER_NAME } from './version.js';
import { logger } from './utils/logger.js';
import { ErrorHandler } from './utils/errors.js';

// Startup banner
logger.info(`Starting ${SERVER_NAME} v${VERSION}`, 'SERVER');

async function main(): Promise<void> {
  return ErrorHandler.handleAsync(async () => {
    // Validate configuration
    const cfg = config.getConfig();
    
    // Check API key
    if (!cfg.yaml.grocy.api_key) {
      logger.warn('No API key configured. Some operations may fail.', 'CONFIG');
    }
    
    // Log configuration summary
    logger.config(`Grocy URL: ${cfg.yaml.grocy.base_url}`);
    logger.config(`SSL Verify: ${cfg.yaml.grocy.enable_ssl_verify}`);
    logger.config(`HTTP Server: ${cfg.yaml.server.enable_http_server}`);
    
    // Create and start server
    const server = await GrocyMcpServer.create();
    await server.start();
    
    logger.info('Server started successfully', 'SERVER');
  }, 'server startup');
}

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', 'PROCESS', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', 'PROCESS', { reason, promise });
  process.exit(1);
});

// Start the application
main().catch((error) => {
  logger.error('Failed to start server', 'SERVER', { error });
  process.exit(1);
});

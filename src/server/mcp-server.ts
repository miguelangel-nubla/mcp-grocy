/**
 * Simplified MCP Server implementation
 * Reduced complexity and improved performance
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { VERSION, PACKAGE_NAME as SERVER_NAME } from '../version.js';
import { createToolRegistry } from '../tools/index.js';
import { config } from '../config/index.js';
import { startHttpServer } from './http-server.js';
import { ResourceHandler } from './resources.js';
import { logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/errors.js';

interface ToolRegistry {
  getDefinitions(): any[];
  getHandler(name: string): any;
  getToolNames(): string[];
}

export class GrocyMcpServer {
  private server: Server;
  private enabledTools = new Set<string>();
  private toolSubConfigs = new Map<string, Map<string, any>>();
  private resourceHandler: ResourceHandler;
  private toolRegistry: ToolRegistry;

  private constructor(
    server: Server,
    toolRegistry: ToolRegistry,
    resourceHandler: ResourceHandler
  ) {
    this.server = server;
    this.toolRegistry = toolRegistry;
    this.resourceHandler = resourceHandler;
    this.parseToolConfiguration();
    this.setupHandlers();
    this.setupErrorHandling();
  }

  static async create(): Promise<GrocyMcpServer> {
    // Initialize components
    const [toolRegistry, resourceHandler] = await Promise.all([
      createToolRegistry(),
      Promise.resolve(new ResourceHandler())
    ]);

    // Create server
    const server = new Server(
      {
        name: SERVER_NAME,
        version: VERSION,
        serverUrl: "https://github.com/miguelangel-nubla/mcp-grocy",
        documentationUrl: "https://github.com/miguelangel-nubla/mcp-grocy/blob/main/README.md"
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );

    return new GrocyMcpServer(server, toolRegistry, resourceHandler);
  }

  private parseToolConfiguration(): void {
    const { enabledTools, toolSubConfigs } = config.parseToolConfiguration();
    this.toolSubConfigs = toolSubConfigs;
    
    // Validate tool names
    const validToolNames = new Set(this.toolRegistry.getToolNames());
    
    if (enabledTools.size > 0) {
      const invalidTools = Array.from(enabledTools).filter(tool => !validToolNames.has(tool));
      if (invalidTools.length > 0) {
        const validNames = Array.from(validToolNames).sort().join(', ');
        logger.error(`Invalid tools: ${invalidTools.join(', ')}. Valid: ${validNames}`, 'CONFIG');
        process.exit(1);
      }
      this.enabledTools = enabledTools;
      logger.config(`Enabled tools: ${Array.from(enabledTools).join(', ')}`);
    } else {
      logger.warn('No tools enabled', 'CONFIG');
    }
  }

  private setupHandlers(): void {
    // Initialize handler
    this.server.setRequestHandler(
      z.object({ method: z.literal('initialize'), params: z.any().optional() }),
      async (request) => {
        logger.debug('Initialize request', 'MCP');
        return {
          protocolVersion: request.params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: SERVER_NAME, version: VERSION }
        };
      }
    );

    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools = this.toolRegistry.getDefinitions();
      const filteredTools = allTools.filter(tool => this.enabledTools.has(tool.name));
      
      logger.config(`Available tools: ${filteredTools.map(t => t.name).join(', ')}`);
      return { tools: filteredTools };
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: args } = request.params;
      
      // Check if tool is enabled
      if (!this.enabledTools.has(toolName)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Tool '${toolName}' is not enabled. Enable it in your configuration.`
        );
      }

      // Get handler
      const handler = this.toolRegistry.getHandler(toolName);
      if (!handler) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
      }

      try {
        const subConfigs = this.toolSubConfigs.get(toolName);
        const result = await handler(args, subConfigs);
        return result as CallToolResult;
      } catch (error: any) {
        ErrorHandler.logError(error, `tool: ${toolName}`);
        throw ErrorHandler.toMcpError(error, `Tool execution failed: ${toolName}`);
      }
    });

    // Resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return this.resourceHandler.listResources();
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return this.resourceHandler.readResource(request.params.uri);
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error('MCP protocol error', 'MCP', { error });
    };
    
    process.on('SIGINT', async () => {
      logger.info('Shutting down server...', 'SERVER');
      await this.server.close();
      process.exit(0);
    });
  }

  public async start(): Promise<void> {
    // Start STDIO transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server running on stdio', 'SERVER');

    // Start HTTP/SSE if enabled
    const { yaml } = config.getConfig();
    if (yaml.server.enable_http_server) {
      try {
        logger.config(`Starting HTTP server on port ${yaml.server.http_server_port}`);
        const serverFactory = () => this.server;
        await startHttpServer(serverFactory, yaml.server.http_server_port);
      } catch (error) {
        logger.error('Failed to start HTTP server', 'SERVER', { error });
        logger.error('HTTP server is explicitly enabled but cannot start - exiting', 'SERVER');
        process.exit(1);
      }
    }
  }

  // Expose server for HTTP transport
  public get serverInstance(): Server {
    return this.server;
  }
}

export default GrocyMcpServer;

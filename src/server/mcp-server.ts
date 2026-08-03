/**
 * Grocy MCP server — McpServer API (registerTool / registerResource).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  McpError,
  type ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js';
import { VERSION, PACKAGE_NAME, SERVER_NAME as RESOURCE_URI_SCHEME } from '../version.js';
import { createToolRegistry } from '../tools/index.js';
import type { ToolRegistry } from '../tools/types.js';
import { config } from '../config/index.js';
import { startHttpServer } from './http-server.js';
import { ResourceHandler, STATIC_MCP_RESOURCE_ENTRIES } from './resources.js';
import { toolDefinitionInputZod } from './tool-input-zod.js';
import { logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/errors.js';

/** Janix mcp-validator (2025-03-26) checks `tools.asyncSupported`; merge keeps this when SDK adds `listChanged`. */
const GROCY_SERVER_CAPABILITIES = {
  tools: {
    asyncSupported: true,
  },
  resources: {},
  prompts: {},
} as ServerCapabilities;

const SERVER_INFO = {
  name: PACKAGE_NAME,
  version: VERSION,
  websiteUrl: 'https://github.com/miguelangel-nubla/mcp-grocy',
  description:
    'MCP server for Grocy. Documentation: https://github.com/miguelangel-nubla/mcp-grocy/blob/main/README.md',
};

export class GrocyMcpServer {
  private static sigintHandlerRegistered = false;
  private static activeServers = new Set<McpServer>();

  private mcp: McpServer;
  private enabledTools = new Set<string>();
  private toolSubConfigs = new Map<string, Map<string, any>>();
  private toolAckTokens = new Map<string, string>();
  private resourceHandler: ResourceHandler;
  private toolRegistry: ToolRegistry;

  private constructor(
    mcp: McpServer,
    toolRegistry: ToolRegistry,
    resourceHandler: ResourceHandler,
  ) {
    this.mcp = mcp;
    this.toolRegistry = toolRegistry;
    this.resourceHandler = resourceHandler;
    this.parseToolConfiguration();
    this.registerToolsAndResources(this.mcp);
    this.setupErrorHandling(this.mcp);
  }

  static async create(): Promise<GrocyMcpServer> {
    const toolRegistry = await createToolRegistry();
    const resourceHandler = new ResourceHandler();

    const mcp = new McpServer(SERVER_INFO, {
      capabilities: GROCY_SERVER_CAPABILITIES,
    });
    GrocyMcpServer.activeServers.add(mcp);

    return new GrocyMcpServer(mcp, toolRegistry, resourceHandler);
  }

  private parseToolConfiguration(): void {
    const { enabledTools, toolSubConfigs, toolAckTokens } = config.parseToolConfiguration();
    this.toolSubConfigs = toolSubConfigs;
    this.toolAckTokens = toolAckTokens;

    const validToolNames = new Set(this.toolRegistry.getToolNames());

    if (enabledTools.size > 0) {
      const invalidTools = Array.from(enabledTools).filter((tool) => !validToolNames.has(tool));
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

  private registerToolsAndResources(mcp: McpServer): void {
    for (const def of this.toolRegistry.getDefinitions()) {
      const inputSchema = toolDefinitionInputZod(def);
      const registered = mcp.registerTool(
        def.name,
        {
          ...(def.title?.trim() ? { title: def.title.trim() } : {}),
          description: def.description,
          inputSchema,
          outputSchema: z.object({ data: z.unknown() }),
          ...(def.annotations ? { annotations: def.annotations } : {}),
          ...(def.meta && Object.keys(def.meta).length > 0 ? { _meta: def.meta } : {}),
        },
        async (args) => this.invokeTool(def.name, args as Record<string, unknown>),
      );
      if (!this.enabledTools.has(def.name)) {
        registered.disable();
      }
    }

    for (const entry of STATIC_MCP_RESOURCE_ENTRIES) {
      const uri = `${RESOURCE_URI_SCHEME}://${entry.slug}`;
      mcp.registerResource(
        entry.name,
        uri,
        { description: entry.description, mimeType: entry.mimeType },
        async (resourceUrl) => this.resourceHandler.readResource(resourceUrl.toString()),
      );
    }

    logger.config(
      `Registered ${this.toolRegistry.getDefinitions().length} tool(s) (${this.enabledTools.size} enabled) and ${STATIC_MCP_RESOURCE_ENTRIES.length} resource(s) via McpServer`,
    );

    this.installStrictToolsCallHandling(mcp);
  }

  /**
   * MCP SDK maps most tool errors to CallToolResult with isError, but compliance harnesses expect
   * JSON-RPC errors for unknown/disabled tool names.
   *
   * WARNING: accesses SDK internals (_requestHandlers, _registeredTools).
   * Tested against @modelcontextprotocol/sdk ^1.28.0 — verify after upgrades.
   */
  private installStrictToolsCallHandling(mcp: McpServer): void {
    const server = mcp.server as unknown as {
      _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<unknown>>;
    };
    const previous = server._requestHandlers?.get('tools/call');
    if (!previous) {
      logger.warn(
        'Could not install strict tools/call handling — SDK internals may have changed',
        'MCP',
      );
      return;
    }

    const toolsMap = (mcp as unknown as { _registeredTools: Record<string, { enabled: boolean }> })
      ._registeredTools;
    if (!toolsMap) {
      logger.warn(
        'Could not install strict tools/call handling — _registeredTools not found',
        'MCP',
      );
      return;
    }

    mcp.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const name = request.params.name;
      const registered = toolsMap[name];
      if (!registered) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool '${name}' not found`);
      }
      if (!registered.enabled) {
        throw new McpError(ErrorCode.InvalidParams, `Tool '${name}' is disabled`);
      }
      return previous(request, extra) as Promise<CallToolResult>;
    });
  }

  private async invokeTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const handler = this.toolRegistry.getHandler(toolName);
    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }

    try {
      const subConfigs = this.toolSubConfigs.get(toolName);
      const result = await handler(args, subConfigs);

      if (!result.isError) {
        if (
          config.server.serialize_structured_to_content &&
          result.structuredContent?.data !== undefined &&
          result.structuredContent?.data !== null
        ) {
          const dataJson = JSON.stringify(result.structuredContent.data, null, 2);
          if (result.content.length > 0 && result.content[0].type === 'text') {
            const currentText = result.content[0].text;
            if (!currentText.includes(dataJson)) {
              result.content[0].text =
                currentText && currentText !== 'Operation completed successfully'
                  ? `${currentText}\n${dataJson}`
                  : dataJson;
            }
          }
        }

        const ackToken = this.toolAckTokens.get(toolName);
        if (ackToken) {
          result.content.unshift({
            type: 'text' as const,
            text: `Acknowledgment token: ${ackToken}`,
          });
        }
      }

      return result as CallToolResult;
    } catch (error: unknown) {
      ErrorHandler.logError(error, `tool: ${toolName}`);
      throw ErrorHandler.toMcpError(error, `${toolName} failed`);
    }
  }

  private setupErrorHandling(mcp: McpServer): void {
    mcp.server.onerror = (error) => {
      logger.error('MCP protocol error', 'MCP', { error });
    };

    if (GrocyMcpServer.sigintHandlerRegistered) {
      return;
    }
    GrocyMcpServer.sigintHandlerRegistered = true;
    process.on('SIGINT', async () => {
      logger.info('Shutting down server...', 'SERVER');
      await Promise.all(
        Array.from(GrocyMcpServer.activeServers).map((s) => s.close().catch(() => {})),
      );
      process.exit(0);
    });
  }

  public createMcpServer(): McpServer {
    const mcp = new McpServer(SERVER_INFO, {
      capabilities: GROCY_SERVER_CAPABILITIES,
    });
    GrocyMcpServer.activeServers.add(mcp);
    this.registerToolsAndResources(mcp);
    this.setupErrorHandling(mcp);
    return mcp;
  }

  public async start(): Promise<void> {
    const httpTransportOnly =
      process.env.MCP_HTTP_TRANSPORT_ONLY === 'true' || process.env.MCP_HTTP_TRANSPORT_ONLY === '1';

    if (httpTransportOnly && !config.server.enable_http_server) {
      logger.error(
        'MCP_HTTP_TRANSPORT_ONLY is set but HTTP server is disabled; enable server.enable_http_server or ENABLE_HTTP_SERVER',
        'SERVER',
      );
      process.exit(1);
    }

    if (!httpTransportOnly) {
      const transport = new StdioServerTransport();
      await this.mcp.connect(transport);
      logger.info('MCP server running on stdio', 'SERVER');
    } else {
      logger.info('MCP_HTTP_TRANSPORT_ONLY: stdio transport skipped', 'SERVER');
    }

    if (config.server.enable_http_server) {
      try {
        logger.config(`Starting HTTP server on port ${config.server.http_server_port}`);
        const serverFactory = () => this.createMcpServer();
        await startHttpServer(
          serverFactory,
          config.server.http_server_port,
          {
            corsOrigin: config.server.http_cors_origin,
            ...(config.server.http_access_token !== undefined && {
              accessToken: config.server.http_access_token,
            }),
          },
          {
            idleTimeoutMs: config.server.session_idle_timeout_ms,
            sweepIntervalMs: config.server.session_sweep_interval_ms,
          },
        );
      } catch (error) {
        logger.error('Failed to start HTTP server', 'SERVER', { error });
        logger.error('HTTP server is explicitly enabled but cannot start - exiting', 'SERVER');
        process.exit(1);
      }
    }
  }

  public get serverInstance(): McpServer {
    return this.mcp;
  }
}

export default GrocyMcpServer;

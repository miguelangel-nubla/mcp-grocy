import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  /** Optional MCP tool `title` for display; if omitted, clients use `name` (no duplicate auto-title). */
  title?: string;
  /** MCP tool annotations (read/destructive hints, etc.). */
  annotations?: ToolAnnotations;
  /** Optional MCP tool `_meta` (only sent when non-empty; no auto-derived fields). */
  meta?: Record<string, unknown>;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolHandler {
  (args: any, subConfigs?: Map<string, any>): Promise<ToolResult>;
}

export type SubConfigValidator = (subConfigs: Map<string, any>) => void;

export interface ToolModule {
  definitions: ToolDefinition[];
  handlers: Record<string, ToolHandler>;
  validators?: Record<string, SubConfigValidator>;
}

/** Aggregated registry produced by {@link createToolRegistry} */
export interface ToolRegistry {
  getDefinitions(): ToolDefinition[];
  getHandler(name: string): ToolHandler | undefined;
  getValidator(name: string): SubConfigValidator | undefined;
  getToolNames(): string[];
}

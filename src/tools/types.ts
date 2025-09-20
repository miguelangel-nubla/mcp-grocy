export interface ToolDefinition {
  name: string;
  description: string;
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
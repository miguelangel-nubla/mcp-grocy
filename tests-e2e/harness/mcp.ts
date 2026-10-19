/**
 * Runs the built server (build/main.js) over stdio, as an MCP client would, against the
 * e2e Grocy. Every tool is enabled (dev tools too) without ack tokens.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { E2E_API_KEY } from './grocy-container.js';

const ROOT = resolve(__dirname, '../..');

export interface ToolCall {
  isError: boolean;
  text: string;
  /** structuredContent.data when the tool returned structured data */
  data: any;
  raw: any;
}

/** Overrides for tool sub-options, e.g. { recipes_cooking_complete: { print_labels: true } }. */
export type ToolOptions = Record<string, Record<string, unknown>>;

const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  recipes_cooking_complete: {
    allow_no_meal_plan: true,
    allow_meal_plan_entry_already_done: false,
    // the sandbox has no label printer
    print_labels: false,
  },
};

function e2eConfigYaml(grocyUrl: string, toolOptions: ToolOptions): string {
  const example = readFileSync(join(ROOT, 'mcp-grocy.yaml.example'), 'utf8');
  const toolsSection = example.slice(example.indexOf('\ntools:') + 1);
  const toolNames = [...toolsSection.matchAll(/^ {2}([a-z0-9_]+):\s*$/gm)].map((m) => m[1]!);
  const options = { ...DEFAULT_TOOL_OPTIONS, ...toolOptions };

  const lines = [
    'server:',
    '  enable_http_server: false',
    'grocy:',
    `  base_url: ${grocyUrl}`,
    '  enable_ssl_verify: false',
    '  response_size_limit: 1000000',
    'tools:',
  ];
  for (const name of toolNames) {
    lines.push(`  ${name}:`, '    enabled: true');
    for (const [key, value] of Object.entries(options[name] ?? {})) {
      lines.push(`    ${key}: ${JSON.stringify(value)}`);
    }
  }
  return lines.join('\n') + '\n';
}

export class McpSession {
  private constructor(
    private readonly client: Client,
    readonly toolNames: string[],
  ) {}

  /** `session.apiKey` overrides the Grocy API key the server is started with (e.g. a wrong one). */
  static async start(
    grocyUrl: string,
    toolOptions: ToolOptions = {},
    session: { apiKey?: string } = {},
  ): Promise<McpSession> {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-grocy-e2e-'));
    writeFileSync(join(dir, 'mcp-grocy.yaml'), e2eConfigYaml(grocyUrl, toolOptions));

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(ROOT, 'build', 'main.js')],
      cwd: dir,
      env: {
        PATH: process.env.PATH ?? '',
        GROCY_BASE_URL: grocyUrl,
        GROCY_API_KEY: session.apiKey ?? E2E_API_KEY,
        GROCY_ENABLE_DEV_TOOLS: 'true',
        LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'ERROR',
        NODE_ENV: 'test',
      },
      stderr: process.env.E2E_LOG_LEVEL ? 'inherit' : 'ignore',
    });
    const client = new Client({ name: 'mcp-grocy-e2e', version: '0.0.0' });
    await client.connect(transport);
    const { tools } = await client.listTools();
    return new McpSession(
      client,
      tools.map((t) => t.name),
    );
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolCall> {
    const raw: any = await this.client.callTool({ name, arguments: args });
    const text = (raw.content ?? [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
    return { isError: raw.isError === true, text, data: raw.structuredContent?.data, raw };
  }

  /** call() that fails the test when the tool reports an error. */
  async ok(name: string, args: Record<string, unknown> = {}): Promise<ToolCall> {
    const result = await this.call(name, args);
    if (result.isError) throw new Error(`${name} failed: ${result.text}`);
    return result;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

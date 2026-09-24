import { describe, it, expect, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { toolDefinitionInputZod } from '../src/server/tool-input-zod.js';
import type { ToolDefinition } from '../src/tools/types.js';
import { createLinkedTransports } from './mcp-linked-transport.js';

const definition: ToolDefinition = {
  name: 'sample_tool',
  description: 'Sample tool with every property type the definitions use',
  inputSchema: {
    type: 'object',
    properties: {
      productId: { type: 'number', description: 'Product ID' },
      amount: { type: 'number', description: 'Amount' },
      spoiled: { type: 'boolean', description: 'Spoiled?' },
      ids: { type: 'array', items: { type: 'number' } },
      flags: { type: 'array', items: { type: 'boolean' } },
      note: { type: 'string' },
      kind: { type: 'string', enum: ['a', 'b'] },
    },
    required: ['productId', 'amount'],
  },
};

describe('toolDefinitionInputZod', () => {
  const schema = toolDefinitionInputZod(definition);

  it('accepts numbers and booleans encoded as strings (clients that stringify arguments)', () => {
    const result = schema.parse({
      productId: '12',
      amount: ' 2 ',
      spoiled: 'False',
      ids: ['1', 2, '3.5', '1e3'],
      flags: ['true', false],
      kind: 'a',
    });

    expect(result).toEqual({
      productId: 12,
      amount: 2,
      spoiled: false,
      ids: [1, 2, 3.5, 1000],
      flags: [true, false],
      kind: 'a',
    });
  });

  it('still accepts native numbers and booleans', () => {
    expect(schema.parse({ productId: 12, amount: 0, spoiled: true })).toEqual({
      productId: 12,
      amount: 0,
      spoiled: true,
    });
  });

  it('still rejects values that are not clean numeric or boolean literals', () => {
    const cases: Array<Record<string, unknown>> = [
      { productId: 'abc', amount: 1 },
      { productId: '', amount: 1 },
      { productId: 'Infinity', amount: 1 },
      { productId: '0x10', amount: 1 },
      { productId: '+5', amount: 1 },
      { productId: '.5', amount: 1 },
      { productId: true, amount: 1 },
      { productId: null, amount: 1 },
      { productId: 1, amount: 1, spoiled: 'yes' },
      { productId: 1, amount: 1, spoiled: 1 },
      { productId: 1, amount: 1, ids: ['1', 'x'] },
    ];
    for (const input of cases) {
      expect(schema.safeParse(input).success, JSON.stringify(input)).toBe(false);
    }
  });

  it('keeps required properties required and strips unknown keys', () => {
    expect(schema.safeParse({ amount: 1 }).success).toBe(false);
    expect(schema.parse({ productId: 1, amount: 1, extra: 'x' })).toEqual({
      productId: 1,
      amount: 1,
    });
  });

  it('advertises the original property types in the JSON Schema sent to clients', () => {
    const json = toJsonSchemaCompat(schema) as {
      properties: Record<string, any>;
      required?: string[];
    };

    expect(json.properties.productId.type).toBe('number');
    expect(json.properties.amount.type).toBe('number');
    expect(json.properties.spoiled.type).toBe('boolean');
    expect(json.properties.ids).toMatchObject({ type: 'array', items: { type: 'number' } });
    expect(json.properties.flags).toMatchObject({ type: 'array', items: { type: 'boolean' } });
    expect(json.properties.kind).toMatchObject({ type: 'string', enum: ['a', 'b'] });
    expect(json.required).toEqual(['productId', 'amount']);
  });
});

describe('toolDefinitionInputZod through McpServer tools/call', () => {
  let client: Client | undefined;
  let server: McpServer | undefined;

  afterEach(async () => {
    await client?.close();
    await server?.close();
  });

  it('coerces string-encoded arguments before the tool callback runs', async () => {
    const received: unknown[] = [];
    server = new McpServer({ name: 'test', version: '0.0.0' });
    server.registerTool(
      definition.name,
      { description: definition.description, inputSchema: toolDefinitionInputZod(definition) },
      async (args) => {
        received.push(args);
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    );

    const [clientTransport, serverTransport] = createLinkedTransports();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    expect((tools[0]?.inputSchema as any).properties.productId.type).toBe('number');

    const result = await client.callTool({
      name: definition.name,
      arguments: { productId: '12', amount: '2', spoiled: 'true' },
    });

    expect(result.isError).toBeFalsy();
    expect(received).toEqual([{ productId: 12, amount: 2, spoiled: true }]);

    const rejected = await client.callTool({
      name: definition.name,
      arguments: { productId: 'twelve', amount: 2 },
    });
    expect(rejected.isError).toBe(true);
    expect(JSON.stringify(rejected.content)).toMatch(/expected number/);
    expect(received).toHaveLength(1);
  });
});

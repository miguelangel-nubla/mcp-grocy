/**
 * Builds Zod input schemas from tool definitions (JSON Schema subset used by this repo)
 * so McpServer.registerTool can validate and advertise tools.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../tools/types.js';

type JsonProp = {
  type?: string;
  description?: string;
  enum?: unknown[];
  items?: JsonProp;
  properties?: Record<string, JsonProp>;
  required?: string[];
  additionalProperties?: boolean | JsonProp;
};

function isStringTupleEnum(values: unknown[]): values is [string, ...string[]] {
  return values.length > 0 && values.every((v) => typeof v === 'string');
}

/**
 * Some MCP clients serialize every tool argument as a string ("12", "true"). Accept those
 * encodings for number/boolean properties: z.preprocess converts them before validation, and the
 * JSON Schema advertised by tools/list still shows the wrapped type because Zod 4's toJSONSchema
 * (io: 'input', which the SDK uses) resolves a preprocess pipe to its output schema — pinned by
 * tests/tool-input-zod.test.ts. Only JSON number syntax and "true"/"false" are converted;
 * anything else is passed through unchanged so the usual type error is still raised.
 */
const JSON_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

function numericStringToNumber(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!JSON_NUMBER.test(trimmed)) return value;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
}

function booleanStringToBoolean(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return value;
}

const lenientNumber = (): z.ZodTypeAny => z.preprocess(numericStringToNumber, z.number());
const lenientBoolean = (): z.ZodTypeAny => z.preprocess(booleanStringToBoolean, z.boolean());

function propertyToZod(prop: JsonProp, required: boolean): z.ZodTypeAny {
  const t = prop.type;
  let inner: z.ZodTypeAny;

  switch (t) {
    case 'string': {
      if (Array.isArray(prop.enum) && isStringTupleEnum(prop.enum)) {
        inner = z.enum(prop.enum);
      } else {
        inner = z.string();
      }
      break;
    }
    case 'number':
    case 'integer':
      inner = lenientNumber();
      break;
    case 'boolean':
      inner = lenientBoolean();
      break;
    case 'array': {
      const items = prop.items;
      if (items?.type === 'string' && Array.isArray(items.enum) && isStringTupleEnum(items.enum)) {
        inner = z.array(z.enum(items.enum));
      } else if (items?.type === 'string') {
        inner = z.array(z.string());
      } else if (items?.type === 'number' || items?.type === 'integer') {
        inner = z.array(lenientNumber());
      } else if (items?.type === 'boolean') {
        inner = z.array(lenientBoolean());
      } else {
        inner = z.array(z.unknown());
      }
      break;
    }
    case 'object': {
      if (prop.properties && typeof prop.properties === 'object') {
        inner = objectPropsToZod(prop.properties, prop.required);
      } else if (
        prop.additionalProperties &&
        typeof prop.additionalProperties === 'object' &&
        prop.additionalProperties.type === 'string'
      ) {
        inner = z.record(z.string(), z.string());
      } else {
        inner = z.record(z.string(), z.unknown());
      }
      break;
    }
    default:
      inner = z.unknown();
  }

  // Keep the per-property description in the advertised JSON Schema (LLM clients read it).
  const described = prop.description ? inner.describe(prop.description) : inner;
  return required ? described : described.optional();
}

function objectPropsToZod(
  properties: Record<string, JsonProp>,
  requiredList: string[] | undefined,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const required = new Set(requiredList ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, raw] of Object.entries(properties)) {
    shape[key] = propertyToZod(raw, required.has(key));
  }
  return z.object(shape);
}

/** Converts a tool definition's JSON Schema object input into a Zod schema for MCP. */
export function toolDefinitionInputZod(def: ToolDefinition): z.ZodTypeAny {
  const schema = def.inputSchema as JsonProp;
  if (schema?.type !== 'object') {
    return z.record(z.string(), z.unknown());
  }
  const props = schema.properties;
  if (!props || typeof props !== 'object' || Object.keys(props).length === 0) {
    return z.object({});
  }
  return objectPropsToZod(props, schema.required);
}

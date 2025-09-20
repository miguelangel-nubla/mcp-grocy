import { describe, it, expect, beforeAll } from 'vitest';
import { createToolRegistry } from '../src/tools/index.js';

describe('ToolRegistry', () => {
  let registry: any;

  beforeAll(async () => {
    registry = await createToolRegistry();
  });

  it('should register all tool definitions', () => {
    const definitions = registry.getDefinitions();
    
    expect(definitions).toBeDefined();
    expect(definitions.length).toBeGreaterThan(30); // We should have 30+ tools
    
    // Check for some key namespaced tools
    const toolNames = definitions.map(def => def.name);
    expect(toolNames).toContain('inventory_products_get');
    expect(toolNames).toContain('inventory_stock_get_all');
    expect(toolNames).toContain('recipes_management_get');
    expect(toolNames).toContain('inventory_transactions_purchase');
    expect(toolNames).toContain('inventory_transactions_consume');
  });

  it('should have handlers for all defined tools', () => {
    const definitions = registry.getDefinitions();
    
    for (const definition of definitions) {
      const handler = registry.getHandler(definition.name);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    }
  });

  it('should return undefined for non-existent handlers', () => {
    expect(registry.getHandler('non_existent_tool')).toBeUndefined();
  });

  it('should return correct tool names', () => {
    const toolNames = registry.getToolNames();
    const definitions = registry.getDefinitions();
    
    expect(toolNames.length).toBe(definitions.length);
    expect(toolNames).toEqual(definitions.map(def => def.name));
  });
});

describe('Tool Definitions Structure', () => {
  let registry: any;
  let definitions: any[];

  beforeAll(async () => {
    registry = await createToolRegistry();
    definitions = registry.getDefinitions();
  });

  it('should have valid structure for all tool definitions', () => {
    for (const definition of definitions) {
      expect(definition).toHaveProperty('name');
      expect(definition).toHaveProperty('description');
      expect(definition).toHaveProperty('inputSchema');
      
      expect(typeof definition.name).toBe('string');
      expect(typeof definition.description).toBe('string');
      expect(definition.inputSchema.type).toBe('object');
      expect(definition.inputSchema).toHaveProperty('properties');
      expect(definition.inputSchema).toHaveProperty('required');
      expect(Array.isArray(definition.inputSchema.required)).toBe(true);
    }
  });

  it('should have unique tool names', () => {
    const toolNames = definitions.map(def => def.name);
    const uniqueNames = [...new Set(toolNames)];
    
    expect(toolNames.length).toBe(uniqueNames.length);
  });
});
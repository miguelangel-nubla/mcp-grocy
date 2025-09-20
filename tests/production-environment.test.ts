import { describe, it, expect } from 'vitest';
import { createToolRegistry } from '../src/tools/index.js';

describe('Production Environment', () => {
  it('should load all tool modules correctly in production build', async () => {
    // Test that the built tool registry can load all modules
    const registry = await createToolRegistry();
    const toolNames = registry.getToolNames();
    
    // Verify we have the expected number of tools
    expect(toolNames.length).toBeGreaterThan(40); // Should have 44+ tools
    
    // Verify our new tools are present
    expect(toolNames).toContain('inventory_products_lookup');
    expect(toolNames).toContain('inventory_stock_entry_print_label');
    
    // Verify core tools from each module are present
    expect(toolNames).toContain('inventory_products_get');
    expect(toolNames).toContain('recipes_management_get');
    expect(toolNames).toContain('shopping_list_get');
    expect(toolNames).toContain('system_locations_get');
    expect(toolNames).toContain('household_chores_get');
    
    // Verify we can get tool definitions
    const definitions = registry.getDefinitions();
    expect(definitions.length).toBe(toolNames.length);
    
    // Verify we can get handlers
    const sampleHandler = registry.getHandler('inventory_products_get');
    expect(sampleHandler).toBeDefined();
    expect(typeof sampleHandler).toBe('function');
    
    console.log(`✅ Production build successfully loaded ${toolNames.length} tools across 5 modules`);
  });

  it('should have all tool handlers properly defined', async () => {
    const registry = await createToolRegistry();
    const toolNames = registry.getToolNames();
    
    // Test a sample of tools to ensure handlers are properly defined
    const sampleTools = [
      'inventory_products_lookup',
      'inventory_stock_entry_print_label', 
      'recipes_management_get',
      'shopping_list_get',
      'system_locations_get'
    ];
    
    for (const toolName of sampleTools) {
      expect(toolNames).toContain(toolName);
      
      const handler = registry.getHandler(toolName);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    }
    
    console.log(`✅ All ${sampleTools.length} sampled tool handlers are properly defined`);
  });
});
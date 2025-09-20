import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createToolRegistry } from '../src/tools/index.js';
import { config } from '../src/config/index.js';
import { ModuleLoader } from '../src/tools/module-loader.js';
import { TestModuleLoader } from './test-helpers.js';

describe('Server Tool Integration', () => {
  beforeEach(() => {
    // Reset any module caches
    TestModuleLoader.clearCache();
  });

  it('should have all configured tools available in tool registry', async () => {
    // Get the tool registry that the server would use
    const toolRegistry = await createToolRegistry();
    const availableTools = new Set(toolRegistry.getToolNames());
    
    // Get the tools that are configured as enabled
    const { enabledTools } = config.parseToolConfiguration();
    
    // Check that all enabled tools are available in the registry
    const missingTools = Array.from(enabledTools).filter(tool => !availableTools.has(tool));
    
    if (missingTools.length > 0) {
      console.log('Missing tools:', missingTools);
      console.log('Available tools:', Array.from(availableTools).sort());
      console.log('Enabled tools:', Array.from(enabledTools).sort());
    }
    
    expect(missingTools).toEqual([]);
  });

  it('should load recipe tools in production build', async () => {
    const toolRegistry = await createToolRegistry();
    const availableTools = new Set(toolRegistry.getToolNames());
    
    // Check for specific recipe tools that should be available
    const expectedRecipeTools = [
      'recipes_management_get',
      'recipes_management_get_by_id',
      'recipes_fulfillment_get',
      'recipes_cooking_complete',
      'recipes_mealplan_get',
      'recipes_mealplan_get_sections',
      'recipes_mealplan_add_recipe'
    ];
    
    const missingRecipeTools = expectedRecipeTools.filter(tool => !availableTools.has(tool));
    
    expect(missingRecipeTools).toEqual([]);
  });

  it('should have handlers for all available tools', async () => {
    const toolRegistry = await createToolRegistry();
    const toolNames = toolRegistry.getToolNames();
    
    for (const toolName of toolNames) {
      const handler = toolRegistry.getHandler(toolName);
      expect(handler).toBeDefined(`Handler missing for tool: ${toolName}`);
      expect(typeof handler).toBe('function');
    }
  });

  it('should match tool configuration validation logic', async () => {
    // This test reproduces the exact validation logic from the server
    const toolRegistry = await createToolRegistry();
    const { enabledTools } = config.parseToolConfiguration();
    
    // Validate tool names exactly like the server does
    const validToolNames = new Set(toolRegistry.getToolNames());
    
    if (enabledTools.size > 0) {
      const invalidTools = Array.from(enabledTools).filter(tool => !validToolNames.has(tool));
      
      if (invalidTools.length > 0) {
        const validNames = Array.from(validToolNames).sort().join(', ');
        console.log(`Invalid tools: ${invalidTools.join(', ')}. Valid: ${validNames}`);
      }
      
      // This should pass if the server would start successfully
      expect(invalidTools).toEqual([]);
    }
  });
});
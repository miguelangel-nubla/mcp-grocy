import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModuleLoader } from '../src/tools/module-loader.js';
import { TestModuleLoader } from './test-helpers.js';

describe('ModuleLoader', () => {
  beforeEach(() => {
    TestModuleLoader.clearCache();
  });

  afterEach(() => {
    TestModuleLoader.clearCache();
  });

  it('should load all available tool modules', async () => {
    const { toolModules } = await ModuleLoader.loadAllModules();
    
    expect(toolModules).toBeDefined();
    expect(Array.isArray(toolModules)).toBe(true);
    expect(toolModules.length).toBeGreaterThan(0);
  });

  it('should load recipe tools successfully', async () => {
    const { toolModules } = await ModuleLoader.loadAllModules();
    
    // Find the recipe module
    const recipeModule = toolModules.find(module => 
      module.definitions.some(def => def.name.startsWith('recipes_'))
    );
    
    expect(recipeModule).toBeDefined();
    expect(recipeModule?.definitions).toBeDefined();
    expect(recipeModule?.handlers).toBeDefined();
    
    // Check for specific recipe tools
    const recipeTools = recipeModule?.definitions.filter(def => 
      def.name.startsWith('recipes_')
    ) || [];
    
    expect(recipeTools.length).toBeGreaterThan(0);
    
    // Verify specific recipe tools exist
    const expectedRecipeTools = [
      'recipes_management_get',
      'recipes_management_get_by_id', 
      'recipes_fulfillment_get',
      'recipes_cooking_cooked_something',
      'recipes_mealplan_get',
      'recipes_mealplan_get_sections',
      'recipes_mealplan_add_recipe'
    ];
    
    for (const toolName of expectedRecipeTools) {
      const tool = recipeTools.find(def => def.name === toolName);
      expect(tool).toBeDefined(`Recipe tool ${toolName} should be defined`);
      
      // Verify handler exists
      expect(recipeModule?.handlers[toolName]).toBeDefined(`Handler for ${toolName} should exist`);
    }
  });

  it('should load all expected tool modules', async () => {
    const { toolModules } = await ModuleLoader.loadAllModules();
    
    const moduleNames = new Set();
    toolModules.forEach(module => {
      module.definitions.forEach(def => {
        const prefix = def.name.split('_')[0];
        moduleNames.add(prefix);
      });
    });
    
    // Should have these module prefixes
    const expectedModules = ['recipes', 'inventory', 'shopping', 'household', 'system'];
    for (const expectedModule of expectedModules) {
      expect(moduleNames.has(expectedModule)).toBe(true, 
        `Should have ${expectedModule} module. Found modules: ${Array.from(moduleNames)}`);
    }
  });

  it('should provide valid tool registry', async () => {
    const { createToolRegistry } = await import('../src/tools/index.js');
    const registry = await createToolRegistry();
    
    expect(registry.getDefinitions).toBeDefined();
    expect(registry.getHandler).toBeDefined();
    expect(registry.getToolNames).toBeDefined();
    
    const definitions = registry.getDefinitions();
    const toolNames = registry.getToolNames();
    
    expect(Array.isArray(definitions)).toBe(true);
    expect(Array.isArray(toolNames)).toBe(true);
    expect(definitions.length).toBeGreaterThan(0);
    expect(toolNames.length).toBeGreaterThan(0);
    
    // Test that handlers exist for all tool names
    for (const toolName of toolNames) {
      const handler = registry.getHandler(toolName);
      expect(handler).toBeDefined(`Handler for ${toolName} should exist`);
    }
  });

  it('should handle module loading errors gracefully', async () => {
    // This test verifies that the loader doesn't crash when modules have issues
    const { toolModules } = await ModuleLoader.loadAllModules();
    
    // Should still return an array even if some modules fail
    expect(Array.isArray(toolModules)).toBe(true);
    
    const stats = ModuleLoader.getCacheStats();
    expect(stats.total).toBeGreaterThanOrEqual(stats.loaded);
  });
});
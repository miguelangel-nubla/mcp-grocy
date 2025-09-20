import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleLoader } from '../src/tools/module-loader.js';

describe('Production Module Loading', () => {
  beforeEach(() => {
    ModuleLoader.clearCache();
  });

  it('should load recipe module from built JavaScript files', async () => {
    // Force the module loader to use .js files (production mode)
    const originalEnv = process.env.NODE_ENV;
    const originalVitest = process.env.VITEST;
    
    try {
      // Simulate production environment
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';
      
      const { toolModules } = await ModuleLoader.loadAllModules();
      
      console.log('Loaded modules:', toolModules.length);
      console.log('Module definitions:', toolModules.map(m => m.definitions.map(d => d.name)));
      
      // Find the recipe module
      const recipeModule = toolModules.find(module => 
        module.definitions.some(def => def.name.startsWith('recipes_'))
      );
      
      expect(recipeModule).toBeDefined();
      
      // Check for specific recipe tools
      const recipeToolNames = recipeModule?.definitions.map(def => def.name) || [];
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
        expect(recipeToolNames).toContain(toolName);
        expect(recipeModule?.handlers[toolName]).toBeDefined();
      }
      
    } finally {
      // Restore environment
      if (originalEnv !== undefined) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (originalVitest !== undefined) {
        process.env.VITEST = originalVitest;
      }
    }
  });

  it('should load specific recipe module export correctly', async () => {
    // Test loading the specific module export directly
    try {
      const recipeIndex = await import('../build/tools/recipes/index.js');
      console.log('Recipe index exports:', Object.keys(recipeIndex));
      
      // Check if recipeModule is exported
      expect(recipeIndex.recipeModule).toBeDefined();
      expect(recipeIndex.recipeModule.definitions).toBeDefined();
      expect(recipeIndex.recipeModule.handlers).toBeDefined();
      
      // Check that it looks like a valid ToolModule
      expect(Array.isArray(recipeIndex.recipeModule.definitions)).toBe(true);
      expect(typeof recipeIndex.recipeModule.handlers).toBe('object');
      expect(recipeIndex.recipeModule.definitions.length).toBeGreaterThan(0);
      
    } catch (error) {
      console.error('Failed to load recipe module:', error);
      throw error;
    }
  });
});
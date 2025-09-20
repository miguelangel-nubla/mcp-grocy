/**
 * Module-based test runner
 * Automatically discovers and runs tests from tool modules
 */

import { describe, it, beforeAll, expect } from 'vitest';
import { ModuleLoader } from '../src/tools/module-loader.js';

describe('Dynamic Module Tests', () => {
  let toolModules: any[];

  beforeAll(async () => {
    const { toolModules: modules } = await ModuleLoader.loadAllModules();
    toolModules = modules;
  });

  it('should discover module tests', async () => {
    console.log(`Found ${toolModules.length} tool modules`);
    
    // Basic test that modules were loaded
    expect(toolModules.length).toBeGreaterThan(0);
    
    // Test that each module has the expected structure
    toolModules.forEach(module => {
      expect(module).toHaveProperty('definitions');
      expect(module).toHaveProperty('handlers');
      expect(Array.isArray(module.definitions)).toBe(true);
      expect(typeof module.handlers).toBe('object');
    });
  });
});
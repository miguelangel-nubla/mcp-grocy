/**
 * Simplified dynamic module loader
 * Improved performance with better caching and lazy loading
 */

import { readdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { ToolModule } from './types.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CachedModule {
  toolModule?: ToolModule;
  loaded: boolean;
  error?: string;
}

/**
 * Simplified module loader with performance optimizations
 */
export class ModuleLoader {
  private static moduleCache = new Map<string, CachedModule>();
  private static discoveredFolders: string[] | null = null;

  /**
   * Discover tool folders (cached)
   */
  private static discoverFolders(): string[] {
    if (this.discoveredFolders !== null) {
      return this.discoveredFolders;
    }

    try {
      const toolsDir = __dirname;
      this.discoveredFolders = readdirSync(toolsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .filter(dirent => !dirent.name.startsWith('.') && dirent.name !== 'node_modules')
        .map(dirent => dirent.name);
      
      logger.module(`Discovered ${this.discoveredFolders.length} tool folders`);
    } catch (error) {
      logger.error('Failed to discover tool folders', 'MODULE', { error });
      this.discoveredFolders = [];
    }

    return this.discoveredFolders;
  }

  /**
   * Load all tool modules with lazy loading
   */
  static async loadAllModules(): Promise<{ toolModules: ToolModule[] }> {
    const folders = this.discoverFolders();
    const toolModules: ToolModule[] = [];

    // Load modules in parallel for better performance
    const loadPromises = folders.map(folder => this.loadModule(folder));
    const results = await Promise.allSettled(loadPromises);

    results.forEach((result, index) => {
      const folder = folders[index]!;
      
      if (result.status === 'fulfilled' && result.value?.toolModule) {
        toolModules.push(result.value.toolModule);
        logger.module(`Loaded module: ${folder}`);
      } else if (result.status === 'rejected') {
        logger.debug(`Failed to load module ${folder}`, 'MODULE', {
          error: result.reason
        });
      }
    });
    logger.tools(`Loaded ${toolModules.length} tool modules`);
    return { toolModules };
  }

  /**
   * Load a specific module with caching
   */
  private static async loadModule(folderName: string): Promise<CachedModule | null> {
    // Check cache first
    const cached = this.moduleCache.get(folderName);
    if (cached) {
      return cached.loaded ? cached : null;
    }

    const moduleInfo: CachedModule = { loaded: false };
    
    try {
      // Use .js extension for production builds
      const extension = '.js';
      const indexPath = `./${folderName}/index${extension}`;
      
      const moduleIndex = await import(indexPath);
      
      // Find tool module export
      for (const [, exportValue] of Object.entries(moduleIndex)) {
        if (this.isToolModule(exportValue)) {
          moduleInfo.toolModule = exportValue as ToolModule;
          moduleInfo.loaded = true;
          break;
        }
      }

      if (!moduleInfo.loaded) {
        logger.debug(`No tool module found in ${folderName}`, 'MODULE');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      moduleInfo.error = errorMessage;
      logger.debug(`Failed to load module ${folderName}: ${errorMessage}`, 'MODULE');
    }

    this.moduleCache.set(folderName, moduleInfo);
    return moduleInfo.loaded ? moduleInfo : null;
  }

  /**
   * Check if an export looks like a ToolModule
   */
  private static isToolModule(obj: any): boolean {
    return obj && 
           typeof obj === 'object' && 
           Array.isArray(obj.definitions) && 
           typeof obj.handlers === 'object' &&
           obj.definitions.length > 0;
  }

  /**
   * Get module from cache
   */
  static getCachedModule(moduleName: string): ToolModule | undefined {
    const cached = this.moduleCache.get(moduleName);
    return cached?.toolModule;
  }


  /**
   * Get cache statistics
   */
  static getCacheStats(): { total: number; loaded: number; errors: number } {
    let loaded = 0;
    let errors = 0;
    
    for (const module of this.moduleCache.values()) {
      if (module.loaded) loaded++;
      if (module.error) errors++;
    }
    
    return {
      total: this.moduleCache.size,
      loaded,
      errors
    };
  }
}

// Factory function
export async function createToolRegistry(): Promise<{ getDefinitions(): any[]; getHandler(name: string): any; getValidator(name: string): any; getToolNames(): string[] }> {
  const { toolModules } = await ModuleLoader.loadAllModules();
  
  const definitions: any[] = [];
  const handlers: Record<string, any> = {};
  const validators: Record<string, any> = {};
  
  for (const module of toolModules) {
    definitions.push(...module.definitions);
    Object.assign(handlers, module.handlers);
    if (module.validators) {
      Object.assign(validators, module.validators);
    }
  }
  
  return {
    getDefinitions: () => definitions,
    getHandler: (name: string) => handlers[name],
    getValidator: (name: string) => validators[name],
    getToolNames: () => definitions.map(def => def.name)
  };
}

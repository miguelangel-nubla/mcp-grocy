/**
 * Common validation helpers for all tools
 */

export type SubConfigValidator = (subConfigs: Map<string, any>) => void;

/**
 * Auto-discover and load validator functions for tools
 */
export class ValidatorRegistry {
  private static validatorCache = new Map<string, SubConfigValidator>();

  /**
   * Get validator for a tool by automatically discovering and loading it
   * Convention: tools/[module]/validations.ts should export validate[ToolName]SubConfigs
   */
  static async getValidator(toolName: string): Promise<SubConfigValidator | undefined> {
    if (this.validatorCache.has(toolName)) {
      return this.validatorCache.get(toolName);
    }

    try {
      // Convert tool_name to ToolName (camelCase with first letter uppercase)
      const validatorFunctionName = this.getValidatorFunctionName(toolName);
      
      // Try to dynamically import the validator from the appropriate module
      const modulePath = this.getModulePath(toolName);
      const validationsModule = await import(modulePath);
      
      const validator = validationsModule[validatorFunctionName];
      if (validator && typeof validator === 'function') {
        this.validatorCache.set(toolName, validator);
        return validator;
      }
    } catch (error) {
      // Validator doesn't exist or failed to load - that's fine, not all tools need validators
    }

    return undefined;
  }

  /**
   * Convert tool_name to expected validator function name
   * Example: complete -> validateCompleteSubConfigs
   */
  private static getValidatorFunctionName(toolName: string): string {
    const camelCase = toolName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const pascalCase = camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
    return `validate${pascalCase}SubConfigs`;
  }

  /**
   * Determine which module a tool belongs to based on its name
   */
  private static getModulePath(toolName: string): string {
    // Map tool names to their modules
    const moduleMap: Record<string, string> = {
      // Recipe tools
      'get_recipes': './recipes/validations.js',
      'get_recipe_by_id': './recipes/validations.js',
      'create_recipe': './recipes/validations.js',
      'get_recipe_fulfillment': './recipes/validations.js',
      'get_recipes_fulfillment': './recipes/validations.js',
      'consume_recipe': './recipes/validations.js',
      'add_recipe_products_to_shopping_list': './recipes/validations.js',
      'add_missing_products_to_shopping_list': './recipes/validations.js',
      'complete': './recipes/validations.js',

      // Stock tools
      'get_all_stock': './stock/validations.js',
      'get_stock_volatile': './stock/validations.js',
      'get_stock_by_location': './stock/validations.js',
      'inventory_product': './stock/validations.js',
      'purchase_product': './stock/validations.js',
      'consume_product': './stock/validations.js',
      'transfer_product': './stock/validations.js',
      'open_product': './stock/validations.js',
      'lookup_product': './stock/validations.js',
      'print_stock_entry_label': './stock/validations.js',

      // Add more modules as needed...
    };

    return moduleMap[toolName] || `./unknown/validations.js`;
  }
}

/**
 * Common validation utility functions
 */
export class ValidationHelpers {
  static validateBoolean(value: any, fieldName: string): void {
    if (value !== undefined && typeof value !== 'boolean') {
      throw new Error(`${fieldName} must be a boolean`);
    }
  }

  static validateString(value: any, fieldName: string): void {
    if (value !== undefined && typeof value !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }
  }

  static validateNumber(value: any, fieldName: string, options?: { min?: number; max?: number }): void {
    if (value !== undefined) {
      if (typeof value !== 'number') {
        throw new Error(`${fieldName} must be a number`);
      }
      if (options?.min !== undefined && value < options.min) {
        throw new Error(`${fieldName} must be at least ${options.min}`);
      }
      if (options?.max !== undefined && value > options.max) {
        throw new Error(`${fieldName} must be at most ${options.max}`);
      }
    }
  }

  static validateKnownOptions(subConfigs: Map<string, any>, knownOptions: Set<string>, toolName: string): void {
    for (const [key] of subConfigs) {
      if (!knownOptions.has(key)) {
        const validOptions = Array.from(knownOptions).filter(k => k !== 'ack_token').join(', ');
        throw new Error(`Unknown sub-configuration option '${key}' for ${toolName} tool. Valid options are: ${validOptions}`);
      }
    }
  }
}
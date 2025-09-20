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
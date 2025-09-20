/**
 * Simplified base tool handler
 */

import { ToolResult } from './types.js';
import apiClient from '../api/client.js';
import { ErrorHandler, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export abstract class BaseToolHandler {
  /**
   * Create a standardized success result
   */
  protected createSuccess(data: any, message?: string): ToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: message || 'Operation completed successfully'
        },
        {
          type: 'text' as const,
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  /**
   * Create a standardized error result
   */
  protected createError(message: string, details?: any): ToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${message}`
        },
        ...(details ? [{
          type: 'text' as const,
          text: JSON.stringify(details, null, 2)
        }] : [])
      ],
      isError: true
    };
  }

  /**
   * Validate required parameters
   */
  protected validateRequired(params: Record<string, any>, required: string[]): void {
    const missing = required.filter(field => {
      const value = params[field];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      throw new ValidationError(
        `Missing required parameters: ${missing.join(', ')}`,
        'parameter validation'
      );
    }
  }

  /**
   * Safely make API calls with error handling
   */
  protected async apiCall<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
    data?: any,
    options?: { queryParams?: Record<string, string> }
  ): Promise<T> {
    return ErrorHandler.handleAsync(async () => {
      const response = await apiClient.request<T>(endpoint, {
        method,
        body: data,
        queryParams: options?.queryParams || {}
      });
      
      return response.data;
    }, `API ${method} ${endpoint}`);
  }

  /**
   * Handle tool execution with standardized error handling
   */
  protected async executeToolHandler(
    handler: () => Promise<ToolResult>
  ): Promise<ToolResult> {
    try {
      return await handler();
    } catch (error) {
      ErrorHandler.logError(error, 'tool execution');
      
      if (error instanceof ValidationError) {
        return this.createError(error.message);
      }
      
      const message = error instanceof Error ? error.message : 'Internal error';
      return this.createError(`Tool execution failed: ${message}`);
    }
  }

  /**
   * Safe JSON formatting
   */
  protected safeStringify(data: any): string {
    try {
      return JSON.stringify(data, null, 2);
    } catch (error) {
      logger.warn('Failed to stringify data', 'TOOLS', { error });
      return '[Unable to format data]';
    }
  }

  /**
   * Filter object fields based on allowlist
   */
  protected filterFields<T extends Record<string, any>>(
    objects: T[],
    fields: string[]
  ): Partial<T>[] {
    return objects.map(obj => {
      const filtered: Partial<T> = {};
      fields.forEach(field => {
        if (field in obj) {
          filtered[field as keyof T] = obj[field];
        }
      });
      return filtered;
    });
  }

  /**
   * Parse and validate array parameter
   */
  protected parseArrayParam(value: any, paramName: string): string[] {
    if (!value) {
      throw new ValidationError(`${paramName} is required`);
    }
    
    if (!Array.isArray(value)) {
      throw new ValidationError(`${paramName} must be an array`);
    }
    
    if (value.length === 0) {
      throw new ValidationError(`${paramName} cannot be empty`);
    }
    
    return value.map(v => String(v));
  }

  /**
   * Parse and validate numeric parameter
   */
  protected parseNumberParam(value: any, paramName: string, required = true): number | undefined {
    if (value === undefined || value === null) {
      if (required) {
        throw new ValidationError(`${paramName} is required`);
      }
      return undefined;
    }
    
    const num = Number(value);
    if (isNaN(num)) {
      throw new ValidationError(`${paramName} must be a valid number`);
    }
    
    return num;
  }
}

/**
 * Simplified error handling system
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';

export type ErrorCategory = 'API' | 'VALIDATION' | 'CONFIG' | 'NETWORK' | 'INTERNAL' | 'AUTH';

/**
 * Simplified application error
 */
export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly statusCode?: number | undefined;
  public readonly operation?: string | undefined;
  public readonly details?: any;
  public readonly timestamp = new Date();

  constructor(
    message: string,
    category: ErrorCategory,
    statusCode?: number,
    operation?: string,
    details?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.category = category;
    this.statusCode = statusCode;
    this.operation = operation;
    this.details = details;
    
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toMcpError(): McpError {
    const errorCode = this.getErrorCode();
    return new McpError(errorCode, this.message);
  }

  private getErrorCode(): ErrorCode {
    switch (this.category) {
      case 'VALIDATION': return ErrorCode.InvalidParams;
      case 'AUTH': return ErrorCode.InvalidRequest;
      case 'API':
        if (this.statusCode === 404) return ErrorCode.InvalidRequest;
        if (this.statusCode === 401 || this.statusCode === 403) return ErrorCode.InvalidRequest;
        return ErrorCode.InternalError;
      default: return ErrorCode.InternalError;
    }
  }
}

/**
 * API-specific error
 */
export class ApiError extends AppError {
  constructor(message: string, statusCode?: number, operation?: string, details?: any) {
    super(message, 'API', statusCode, operation, details);
    this.name = 'ApiError';
  }

  static fromAxiosError(error: any, operation?: string): ApiError {
    if (error.response) {
      return new ApiError(
        error.response.data?.message || `HTTP ${error.response.status}`,
        error.response.status,
        operation,
        { url: error.config?.url, method: error.config?.method }
      );
    }
    
    if (error.request) {
      return new ApiError(
        'Network error - unable to reach server',
        undefined,
        operation,
        { url: error.config?.url }
      );
    }
    
    return new ApiError(error.message || 'Request error', undefined, operation);
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message: string, operation?: string, details?: any) {
    super(message, 'VALIDATION', undefined, operation, details);
    this.name = 'ValidationError';
  }
}

/**
 * Configuration error
 */
export class ConfigError extends AppError {
  constructor(message: string, operation?: string, details?: any) {
    super(message, 'CONFIG', undefined, operation, details);
    this.name = 'ConfigError';
  }
}

/**
 * Centralized error handler
 */
export class ErrorHandler {
  /**
   * Handle async operations with error wrapping
   */
  static async handleAsync<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logError(error, context);
      throw this.wrapError(error, context);
    }
  }

  /**
   * Log error with context
   */
  static logError(error: any, context?: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullContext = context ? `${context}: ${errorMessage}` : errorMessage;
    
    if (error instanceof AppError) {
      logger.warn(fullContext, 'ERROR', {
        category: error.category,
        statusCode: error.statusCode,
        operation: error.operation,
        details: error.details
      });
    } else {
      logger.error(fullContext, 'ERROR', { error });
    }
  }

  /**
   * Wrap unknown errors in AppError
   */
  static wrapError(error: any, context?: string): AppError {
    if (error instanceof AppError) {
      return error;
    }
    
    if (error instanceof McpError) {
      return new AppError(error.message, 'INTERNAL', undefined, context);
    }
    
    const message = error instanceof Error ? error.message : String(error);
    return new AppError(message, 'INTERNAL', undefined, context);
  }

  /**
   * Convert error to MCP error
   */
  static toMcpError(error: any, fallbackMessage = 'Internal error'): McpError {
    if (error instanceof McpError) {
      return error;
    }
    
    if (error instanceof AppError) {
      return error.toMcpError();
    }
    
    const message = error instanceof Error ? error.message : fallbackMessage;
    return new McpError(ErrorCode.InternalError, message);
  }
}

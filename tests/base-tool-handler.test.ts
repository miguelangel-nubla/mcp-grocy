import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseToolHandler } from '../src/tools/base.js';
import { ApiError } from '../src/api/client.js';

// Mock API client
vi.mock('../src/api/client.js', () => ({
  default: {
    request: vi.fn()
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, status?: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }
}));

import apiClient from '../src/api/client.js';
const mockApiClient = vi.mocked(apiClient);

class TestToolHandler extends BaseToolHandler {
  public testSafeStringify(data: any) {
    return this.safeStringify(data);
  }

  public testCreateSuccess(data: any, message?: string) {
    return this.createSuccess(data, message);
  }

  public testCreateError(error: string, context?: any) {
    return this.createError(error, context);
  }

  public testCreateErrorFromException(error: Error, context?: any) {
    return this.createError(error.message, context);
  }

  public testApiCall(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET', body?: any, options?: any) {
    return this.apiCall(endpoint, method, body, options);
  }

  public testValidateRequired(params: any, required: string[]) {
    return this.validateRequired(params, required);
  }

  public testExecuteToolHandler(handler: () => Promise<any>, operation: string) {
    return this.executeToolHandler(handler, operation);
  }
}

describe('BaseToolHandler', () => {
  let handler: TestToolHandler;

  beforeEach(() => {
    handler = new TestToolHandler();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('safeStringify', () => {
    it('should stringify normal objects', () => {
      const data = { test: 'value', number: 42 };
      const result = handler.testSafeStringify(data);
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it('should handle circular references gracefully', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      // Should not throw, should return error fallback
      const result = handler.testSafeStringify(circular);
      expect(result).toBe('[Unable to format data]');
    });

    it('should handle undefined and null', () => {
      expect(handler.testSafeStringify(null)).toBe('null');
      expect(handler.testSafeStringify(undefined)).toBeUndefined();
    });
  });

  describe('createSuccess', () => {
    it('should create success result with correct format', () => {
      const data = { success: true, data: 'test' };
      const result = handler.testCreateSuccess(data);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Operation completed successfully'
          },
          {
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }
        ]
      });
    });

    it('should handle complex data structures', () => {
      const data = {
        array: [1, 2, 3],
        nested: { deep: { value: 'test' } },
        boolean: true
      };
      const result = handler.testCreateSuccess(data);
      
      expect(result.content[0].type).toBe('text');
      expect(result.content[1].type).toBe('text');
      expect(JSON.parse(result.content[1].text)).toEqual(data);
    });

    it('should include custom message when provided', () => {
      const data = { test: 'value' };
      const message = 'Custom success message';
      const result = handler.testCreateSuccess(data, message);
      
      expect(result.content[0].text).toBe(message);
      expect(JSON.parse(result.content[1].text)).toEqual(data);
    });
  });

  describe('createError', () => {
    it('should create error result from string', () => {
      const errorMessage = 'Something went wrong';
      const result = handler.testCreateError(errorMessage);
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'Error: Something went wrong'
        }],
        isError: true
      });
    });

    it('should create error result from Error object', () => {
      const error = new Error('Test error');
      const result = handler.testCreateErrorFromException(error);
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'Error: Test error'
        }],
        isError: true
      });
    });

    it('should include context when provided', () => {
      const context = { endpoint: '/test', params: { id: 123 } };
      const result = handler.testCreateError('Error occurred', context);
      
      expect(result.content[0].text).toBe('Error: Error occurred');
      expect(result.content[1].text).toBe(JSON.stringify(context, null, 2));
    });
  });

  describe('apiCall', () => {
    it('should make successful API call', async () => {
      const responseData = { result: 'success' };
      mockApiClient.request.mockResolvedValue({
        data: responseData,
        status: 200,
        headers: {}
      });

      const result = await handler.testApiCall('/test');

      expect(mockApiClient.request).toHaveBeenCalledWith('/test', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });

      expect(result).toEqual(responseData);
    });

    it('should handle POST requests with body', async () => {
      const requestBody = { name: 'test', value: 42 };
      const responseData = { created: true };
      
      mockApiClient.request.mockResolvedValue({
        data: responseData,
        status: 201,
        headers: {}
      });

      const result = await handler.testApiCall('/test', 'POST', requestBody, {
        headers: { 'Custom-Header': 'value' },
        queryParams: { param: 'value' }
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/test', {
        method: 'POST',
        body: requestBody,
        queryParams: { param: 'value' }
      });

      expect(result).toEqual(responseData);
    });

    it('should throw ApiError on API failures', async () => {
      const apiError = new ApiError('API request failed', 404);
      mockApiClient.request.mockRejectedValue(apiError);

      await expect(handler.testApiCall('/test')).rejects.toThrow('API request failed');
    });

    it('should throw generic errors', async () => {
      const genericError = new Error('Network error');
      mockApiClient.request.mockRejectedValue(genericError);

      await expect(handler.testApiCall('/test')).rejects.toThrow('Network error');
    });
  });

  describe('validateRequired', () => {
    it('should pass when all required params are present', () => {
      const params = { id: 123, name: 'test', value: true };
      expect(() => handler.testValidateRequired(params, ['id', 'name'])).not.toThrow();
    });

    it('should throw when required params are missing', () => {
      const params = { name: 'test' };
      expect(() => handler.testValidateRequired(params, ['id', 'name'])).toThrow('Missing required parameters: id');
    });

    it('should throw when required params are null or undefined', () => {
      const params = { id: null, name: undefined, value: 'test' };
      expect(() => handler.testValidateRequired(params, ['id'])).toThrow('Missing required parameters: id');
      expect(() => handler.testValidateRequired(params, ['name'])).toThrow('Missing required parameters: name');
    });
  });

  describe('executeToolHandler', () => {
    it('should execute handler and return success result', async () => {
      const mockData = { success: true };
      const mockHandler = vi.fn().mockResolvedValue(handler.testCreateSuccess(mockData));
      
      const result = await handler.testExecuteToolHandler(mockHandler, 'test operation');
      
      expect(mockHandler).toHaveBeenCalled();
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Operation completed successfully'
          },
          {
            type: 'text',
            text: JSON.stringify(mockData, null, 2)
          }
        ]
      });
    });

    it('should handle errors and return error result', async () => {
      const mockError = new Error('Test error');
      const mockHandler = vi.fn().mockRejectedValue(mockError);
      
      const result = await handler.testExecuteToolHandler(mockHandler, 'test operation');
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'Error: test operation failed: Test error'
        }],
        isError: true
      });
    });
  });

  // Note: Acknowledgment token functionality has been simplified in the new architecture
  // and is now handled at the configuration level rather than in individual handlers
});
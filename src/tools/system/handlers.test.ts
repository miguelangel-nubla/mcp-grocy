import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock API client
vi.mock('../../api/client.js', () => ({
  default: {
    request: vi.fn(),
    get: vi.fn()
  },
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  }
}));

// Mock config - create a real ConfigManager instance with test data
vi.mock('../../config/index.js', async () => {
  const actual = await vi.importActual('../../config/index.js');
  
  // Create a ConfigManager instance for testing with mock data  
  const ConfigManagerClass = actual.ConfigManager as any;
  const testConfig = new ConfigManagerClass();
  
  // Override the properties with test data - need to properly set the readonly properties
  Object.defineProperty(testConfig, 'grocy', {
    value: {
      base_url: 'http://localhost:9283',
      api_key: 'test-api-key',
      enable_ssl_verify: true,
      response_size_limit: 10000
    },
    writable: false,
    configurable: true
  });
  
  Object.defineProperty(testConfig, 'server', {
    value: {
      enable_http_server: false,
      http_server_port: 8080
    },
    writable: false,
    configurable: true
  });
  
  Object.defineProperty(testConfig, 'tools', {
    value: {},
    writable: false,
    configurable: true
  });
  
  return {
    ...actual,
    config: testConfig
  };
});

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    config: vi.fn()
  }
}));

import { SystemToolHandlers } from './handlers.js';
import apiClient from '../../api/client.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const mockApiClient = vi.mocked(apiClient);
const mockConfig = vi.mocked(config);
const mockLogger = vi.mocked(logger);

describe('SystemToolHandlers', () => {
  let handlers: SystemToolHandlers;

  beforeEach(() => {
    handlers = new SystemToolHandlers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getLocations', () => {
    it('should get all locations', async () => {
      const mockLocations = [
        { id: 1, name: 'Kitchen', description: 'Main kitchen area' },
        { id: 2, name: 'Pantry', description: 'Storage pantry' }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockLocations,
        status: 200,
        headers: {}
      });

      const result = await handlers.getLocations();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/locations', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getLocations();

      expect(result.isError).toBe(true);
    });
  });

  describe('getQuantityUnits', () => {
    it('should get all quantity units', async () => {
      const mockUnits = [
        { id: 1, name: 'kg', name_plural: 'kg' },
        { id: 2, name: 'liter', name_plural: 'liters' }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockUnits,
        status: 200,
        headers: {}
      });

      const result = await handlers.getQuantityUnits();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/quantity_units', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getQuantityUnits();

      expect(result.isError).toBe(true);
    });
  });

  describe('getUsers', () => {
    it('should get all users', async () => {
      const mockUsers = [
        { id: 1, username: 'admin', display_name: 'Administrator' },
        { id: 2, username: 'user1', display_name: 'User One' }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockUsers,
        status: 200,
        headers: {}
      });

      const result = await handlers.getUsers();

      expect(mockApiClient.request).toHaveBeenCalledWith('/users', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getUsers();

      expect(result.isError).toBe(true);
    });
  });

  describe('callGrocyApi', () => {
    it('should call Grocy API with GET request', async () => {
      const mockResponse = { data: 'test response' };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.callGrocyApi({
        endpoint: 'test/endpoint'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/test/endpoint', {
        method: 'GET',
        body: null
      });
      expect(result.isError).toBeUndefined();
    });

    it('should call Grocy API with POST request and body', async () => {
      const mockResponse = { data: 'created' };
      const requestBody = { name: 'test item' };
      
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.callGrocyApi({
        endpoint: 'objects/products',
        method: 'POST',
        body: requestBody
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/products', {
        method: 'POST',
        body: requestBody
      });
      expect(result.isError).toBeUndefined();
    });

    it('should clean endpoint by removing leading /api/', async () => {
      const mockResponse = { data: 'test' };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.callGrocyApi({
        endpoint: '/api/objects/products'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/products', {
        method: 'GET',
        body: null
      });
      expect(result.isError).toBeUndefined();
    });

    it('should clean endpoint by removing leading slash', async () => {
      const mockResponse = { data: 'test' };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.callGrocyApi({
        endpoint: '/objects/products'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/products', {
        method: 'GET',
        body: null
      });
      expect(result.isError).toBeUndefined();
    });

    it('should require endpoint parameter', async () => {
      try {
        await handlers.callGrocyApi({});
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Missing required parameter: endpoint');
      }
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.callGrocyApi({
        endpoint: 'test/endpoint'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to call Grocy API endpoint');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('testRequest', () => {
    beforeEach(() => {
      // Reset mocks
      vi.clearAllMocks();
    });

    it('should perform successful test request', async () => {
      const mockResponse = { data: 'test response' };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await handlers.testRequest({
        method: 'GET',
        endpoint: 'objects/products'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/products', {
        method: 'GET',
        body: undefined,
        headers: { 'GROCY-API-KEY': 'test-api-key' }
      });
      expect(result.isError).toBeUndefined();
      
      const responseData = JSON.parse(result.content[1].text);
      expect(responseData).toMatchObject({
        request: {
          url: 'http://localhost:9283/objects/products',
          method: 'GET',
          authMethod: 'apikey'
        },
        response: {
          statusCode: 200,
          body: mockResponse
        },
        validation: {
          isError: false,
          messages: ['Request completed successfully']
        }
      });
      
      // Check timing is reasonable (should be a number followed by 'ms')
      expect(responseData.response.timing).toMatch(/^\d+ms$/);
    });

    it('should require method and endpoint parameters', async () => {
      try {
        await handlers.testRequest({});
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('method and endpoint are required');
      }
    });

    it('should handle request failures', async () => {
      mockApiClient.request.mockRejectedValue(new Error('Network error'));

      const result = await handlers.testRequest({
        method: 'GET',
        endpoint: 'objects/products'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Test request failed: Network error');
    });
  });
});
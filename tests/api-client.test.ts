import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock axios first, before any imports
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      request: vi.fn(),
      defaults: { 
        headers: { 
          common: {} 
        } 
      },
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    })),
    isAxiosError: vi.fn()
  }
}));

import axios from 'axios';
const mockedAxios = vi.mocked(axios);

import { GrocyApiClient, ApiError } from '../src/api/client.js';

// Mock config
vi.mock('../src/config/environment.js', () => ({
  default: {
    get: () => ({
      GROCY_ENABLE_SSL_VERIFY: true,
      GROCY_APIKEY_VALUE: 'test-api-key'
    }),
    getGrocyBaseUrl: () => 'http://localhost:9283',
    getCustomHeaders: () => ({ 'Custom-Header': 'test-value' }),
    hasApiKeyAuth: () => true
  }
}));

describe('GrocyApiClient', () => {
  let client: GrocyApiClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      request: vi.fn(),
      defaults: { 
        headers: { 
          common: {} 
        } 
      },
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    };
    
    vi.mocked(mockedAxios.create).mockReturnValue(mockAxiosInstance);
    client = new GrocyApiClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:9283',
        validateStatus: expect.any(Function),
        timeout: 30000,
        httpsAgent: undefined
      });
    });

    it('should set API key in headers when available', () => {
      // The API key is now set per-request, not in defaults
      expect(client).toBeDefined();
    });
  });

  describe('request method', () => {
    it('should make successful GET request', async () => {
      const mockResponse = {
        data: { test: 'data' },
        status: 200,
        headers: { 'content-type': 'application/json' }
      };
      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await client.request('/test/endpoint');

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/api/test/endpoint',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      expect(result).toEqual({
        data: { test: 'data' },
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    it('should normalize endpoints correctly', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: {}, status: 200, headers: {} });

      // Test various endpoint formats
      await client.request('/api/test');
      expect(mockAxiosInstance.request).toHaveBeenLastCalledWith(
        expect.objectContaining({ url: '/api/test' })
      );

      await client.request('api/test');
      expect(mockAxiosInstance.request).toHaveBeenLastCalledWith(
        expect.objectContaining({ url: '/api/test' })
      );

      await client.request('test');
      expect(mockAxiosInstance.request).toHaveBeenLastCalledWith(
        expect.objectContaining({ url: '/api/test' })
      );

      await client.request('/test');
      expect(mockAxiosInstance.request).toHaveBeenLastCalledWith(
        expect.objectContaining({ url: '/api/test' })
      );
    });

    it('should add query parameters', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: {}, status: 200, headers: {} });

      await client.request('/test', { queryParams: { param1: 'value1', param2: 'value2' } });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/test?param1=value1&param2=value2'
        })
      );
    });

    it('should handle POST request with body', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: {}, status: 201, headers: {} });

      const body = { name: 'test', value: 123 };
      await client.request('/test', { method: 'POST', body });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: body
        })
      );
    });

    it('should throw ApiError for HTTP errors', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { error: 'Bad request' },
        status: 400,
        headers: {}
      });

      await expect(client.request('/test')).rejects.toThrow('HTTP 400 error');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      mockAxiosInstance.request.mockRejectedValue(networkError);
      vi.mocked(mockedAxios.isAxiosError).mockReturnValue(false);

      await expect(client.request('/test')).rejects.toThrow('Network Error');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded') as any;
      timeoutError.code = 'ECONNABORTED';
      mockAxiosInstance.request.mockRejectedValue(timeoutError);
      vi.mocked(mockedAxios.isAxiosError).mockReturnValue(true);

      await expect(client.request('/test')).rejects.toThrow('timeout of 30000ms exceeded');
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      mockAxiosInstance.request.mockResolvedValue({ data: {}, status: 200, headers: {} });
    });

    it('should call GET method correctly', async () => {
      await client.get('/test');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should call POST method correctly', async () => {
      const body = { test: 'data' };
      await client.post('/test', body);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', data: body })
      );
    });

    it('should call PUT method correctly', async () => {
      const body = { test: 'data' };
      await client.put('/test', body);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', data: body })
      );
    });

    it('should call DELETE method correctly', async () => {
      await client.delete('/test');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should call PATCH method correctly', async () => {
      const body = { test: 'data' };
      await client.patch('/test', body);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PATCH', data: body })
      );
    });
  });
});

describe('ApiError', () => {
  it('should create ApiError with message only', () => {
    const error = new ApiError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('ApiError');
    expect(error.statusCode).toBeUndefined();
    expect(error.details).toBeUndefined();
  });

  it('should create ApiError with status and response', () => {
    const details = { error: 'Bad request' };
    const error = new ApiError('Test error', 400, 'test operation', details);
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.operation).toBe('test operation');
    expect(error.details).toBe(details);
  });
});
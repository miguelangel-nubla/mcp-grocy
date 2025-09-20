/**
 * Simplified API client for Grocy
 */

import axios, { AxiosInstance, AxiosRequestConfig, Method } from 'axios';
import https from 'https';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { ApiError, ErrorHandler } from '../utils/errors.js';

export interface ApiRequestOptions {
  method?: Method;
  body?: any;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  timeout?: number;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, any>;
}

export class GrocyApiClient {
  private axiosInstance: AxiosInstance;
  private readonly API_KEY_HEADER = 'GROCY-API-KEY';

  constructor() {
    this.axiosInstance = this.createAxiosInstance();
    this.setupInterceptors();
  }

  private createAxiosInstance(): AxiosInstance {
    const { yaml } = config.getConfig();
    
    const instance = axios.create({
      baseURL: yaml.grocy.base_url,
      validateStatus: () => true, // Handle all status codes manually
      timeout: 30000,
      httpsAgent: yaml.grocy.enable_ssl_verify ? undefined : new https.Agent({
        rejectUnauthorized: false
      })
    });

    // Set default authentication
    if (yaml.grocy.api_key) {
      instance.defaults.headers.common[this.API_KEY_HEADER] = yaml.grocy.api_key;
    }

    return instance;
  }

  private setupInterceptors(): void {
    // Request logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.api(`${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Request error', 'API', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response logging
    this.axiosInstance.interceptors.response.use(
      (response) => {
        if (response.status >= 400) {
          logger.warn(`HTTP ${response.status}`, 'API', {
            url: response.config?.url,
            status: response.status
          });
        }
        return response;
      },
      (error) => {
        logger.error('Response error', 'API', { error: error.message });
        return Promise.reject(error);
      }
    );
  }

  private normalizeEndpoint(endpoint: string): string {
    if (endpoint.startsWith('/api/')) return endpoint;
    if (endpoint.startsWith('api/')) return `/${endpoint}`;
    if (endpoint.startsWith('/')) return `/api${endpoint}`;
    return `/api/${endpoint}`;
  }

  private buildQueryString(params: Record<string, string>): string {
    return Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  public async request<T = any>(
    endpoint: string, 
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      body = null,
      headers = {},
      queryParams = {},
      timeout
    } = options;

    return ErrorHandler.handleAsync(async () => {
      let url = this.normalizeEndpoint(endpoint);
      
      if (Object.keys(queryParams).length > 0) {
        url += `?${this.buildQueryString(queryParams)}`;
      }

      const requestConfig: AxiosRequestConfig = {
        method,
        url,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...config.getCustomHeaders(),
          ...headers
        },
        ...(timeout && { timeout })
      };

      if (['POST', 'PUT', 'PATCH'].includes(method) && body !== null) {
        requestConfig.data = body;
      }

      const response = await this.axiosInstance.request(requestConfig);
      
      if (response.status >= 400) {
        throw new ApiError(
          response.data?.message || `HTTP ${response.status} error`,
          response.status,
          `${method} ${url}`,
          { responseData: response.data }
        );
      }
      
      return {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, any>
      };
    }, `API ${method} ${endpoint}`);
  }

  // Convenience methods
  public async get<T = any>(
    endpoint: string, 
    options: Omit<ApiRequestOptions, 'method'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public async post<T = any>(
    endpoint: string, 
    body?: any, 
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  public async put<T = any>(
    endpoint: string, 
    body?: any, 
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  public async delete<T = any>(
    endpoint: string, 
    options: Omit<ApiRequestOptions, 'method'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  public async patch<T = any>(
    endpoint: string, 
    body?: any, 
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }
}

// Export singleton instance
export const apiClient = new GrocyApiClient();
export default apiClient;

// Re-export ApiError for convenience
export { ApiError };

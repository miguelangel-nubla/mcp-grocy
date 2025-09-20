import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import apiClient from '../../api/client.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

export class SystemToolHandlers extends BaseToolHandler {
  // ==================== CORE SYSTEM UTILITIES ====================

  public getLocations: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/objects/locations');
      return this.createSuccess(data);
    }, 'get locations');
  };

  public getQuantityUnits: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/objects/quantity_units');
      return this.createSuccess(data);
    }, 'get quantity units');
  };

  public getUsers: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/users');
      return this.createSuccess(data);
    }, 'get users');
  };

  // ==================== DEVELOPER UTILITIES ====================

  public callGrocyApi: ToolHandler = async (args: any): Promise<ToolResult> => {
    const { endpoint, method = 'GET', body = null } = args;
    
    if (!endpoint) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: endpoint');
    }

    // Remove leading /api/ if present
    const cleanEndpoint = endpoint.replace(/^\/?(?:api\/)?/, '');
    
    try {
      const response = await apiClient.request(`/${cleanEndpoint}`, {
        method,
        body
      });
      
      return this.createSuccess(response.data);
    } catch (error: any) {
      logger.error(`Error calling Grocy API endpoint ${endpoint}`, 'api', { error });
      return this.createError(`Failed to call Grocy API endpoint ${endpoint}: ${error.message}`);
    }
  };

  public testRequest: ToolHandler = async (args: any): Promise<ToolResult> => {
    const { method, endpoint, body, headers = {} } = args;
    
    if (!method || !endpoint) {
      throw new McpError(ErrorCode.InvalidParams, 'method and endpoint are required');
    }

    const normalizedEndpoint = `/${endpoint.replace(/^\/+|\/+$/g, '')}`;
    
    try {
      const startTime = Date.now();
      const response = await apiClient.request(normalizedEndpoint, {
        method,
        body,
        headers
      });
      const endTime = Date.now();
      
      const { yaml } = config.getConfig();
      const responseObj = {
        request: {
          url: `${yaml.grocy.base_url}${normalizedEndpoint}`,
          method,
          headers: { ...config.getCustomHeaders(), ...headers },
          body,
          authMethod: yaml.grocy.api_key ? 'apikey' : 'none'
        },
        response: {
          statusCode: response.status,
          timing: `${endTime - startTime}ms`,
          headers: response.headers,
          body: response.data
        },
        validation: {
          isError: response.status >= 400,
          messages: response.status >= 400 ? 
            [`Request failed with status ${response.status}`] : 
            ['Request completed successfully']
        }
      };

      return this.createSuccess(responseObj);
    } catch (error: any) {
      const { yaml } = config.getConfig();
      return this.createError(`Test request failed: ${error.message}`, {
        request: {
          url: `${yaml.grocy.base_url}${normalizedEndpoint}`,
          method,
          headers: { ...config.getCustomHeaders(), ...headers },
          body
        }
      });
    }
  };
}
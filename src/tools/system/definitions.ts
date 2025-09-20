import { config } from '../../config/index.js';

export const systemToolDefinitions = [
  // ==================== CORE SYSTEM UTILITIES ====================
  {
    name: 'system_locations_get',
    description: '[SYSTEM/LOCATIONS] Get all storage locations from your Grocy instance. Use this to find location IDs and names when working with other tools that require locationId parameters.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'system_units_get',
    description: '[SYSTEM/UNITS] Get all quantity units from your Grocy instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'system_users_get',
    description: '[SYSTEM/USERS] Get all users from your Grocy instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },

  // ==================== DEVELOPER UTILITIES ====================
  {
    name: 'system_dev_call_api',
    description: '[SYSTEM/DEV] Call a specific Grocy API endpoint with custom parameters.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        endpoint: {
          type: 'string',
          description: 'Grocy API endpoint to call (e.g., "objects/products"). Do not include /api/ prefix.'
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method to use',
          default: 'GET'
        },
        body: {
          type: 'object',
          description: 'Optional request body for POST/PUT requests'
        }
      },
      required: ['endpoint']
    }
  },
  {
    name: 'system_dev_test_request',
    description: `[SYSTEM/DEV] Test a REST API endpoint and get detailed response information. Base URL: ${config.getGrocyBaseUrl()} | SSL Verification enabled | Authentication: ${config.hasApiKey() ? 'API Key using header: GROCY-API-KEY' : 'No authentication configured'}`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method to use'
        },
        endpoint: {
          type: 'string',
          description: 'Endpoint path (e.g. "/users"). Do not include full URLs - only the path.'
        },
        body: {
          type: 'object',
          description: 'Optional request body for POST/PUT requests'
        },
        headers: {
          type: 'object',
          description: 'Optional request headers for one-time use.',
          additionalProperties: {
            type: 'string'
          }
        }
      },
      required: ['method', 'endpoint']
    }
  }
];
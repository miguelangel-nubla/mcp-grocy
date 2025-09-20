import { ToolModule } from '../types.js';
import { systemToolDefinitions } from './definitions.js';
import { SystemToolHandlers } from './handlers.js';

const handlers = new SystemToolHandlers();

export const systemModule: ToolModule = {
  definitions: systemToolDefinitions,
  handlers: {
    // Core System Utilities
    system_locations_get: handlers.getLocations,
    system_units_get: handlers.getQuantityUnits,
    system_users_get: handlers.getUsers,
    
    // Developer Utilities
    system_dev_call_api: handlers.callGrocyApi,
    system_dev_test_request: handlers.testRequest
  }
};

export * from './definitions.js';
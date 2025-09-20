import { ToolModule } from '../types.js';
import { householdToolDefinitions } from './definitions.js';
import { HouseholdToolHandlers } from './handlers.js';

const handlers = new HouseholdToolHandlers();

export const householdModule: ToolModule = {
  definitions: householdToolDefinitions,
  handlers: {
    // Chore Management
    household_chores_get: handlers.getChores,
    household_chores_execute: handlers.trackChoreExecution,
    
    // Task Management
    household_tasks_get: handlers.getTasks,
    household_tasks_complete: handlers.completeTask,
    
    // Battery Management
    household_batteries_get: handlers.getBatteries,
    household_batteries_charge: handlers.chargeBattery,
    
    // Equipment Management
    household_equipment_get: handlers.getEquipment,
    
    // Action Utilities
    household_actions_undo: handlers.undoAction
  }
};

export * from './definitions.js';
import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';

export class HouseholdToolHandlers extends BaseToolHandler {
  // ==================== CHORE MANAGEMENT ====================

  public getChores: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/objects/chores');
      return this.createSuccess(data);
    });
  };

  public trackChoreExecution: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { choreId, executedBy, trackedTime, skipped } = args || {};
      this.validateRequired({ choreId }, ['choreId']);
      // Chores also accept a date only (Grocy checks IsIsoDate as well as IsIsoDateTime).
      const trackedTimeValue = this.parseGrocyDateTimeParam(trackedTime, 'trackedTime', {
        allowDateOnly: true,
      });

      // Omit tracked_time when not given so Grocy uses its own server-local current time.
      const body = {
        ...(trackedTimeValue ? { tracked_time: trackedTimeValue } : {}),
        ...(executedBy ? { done_by: executedBy } : {}),
        ...(skipped ? { skipped: true } : {}),
      };

      const result = await this.apiCall(`/chores/${choreId}/execute`, 'POST', body);
      return this.createSuccess(result, 'Chore execution tracked successfully');
    });
  };

  // ==================== TASK MANAGEMENT ====================

  public getTasks: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/objects/tasks');
      return this.createSuccess(data);
    });
  };

  public completeTask: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { taskId, doneTime } = args || {};
      this.validateRequired({ taskId }, ['taskId']);
      const doneTimeValue = this.parseGrocyDateTimeParam(doneTime, 'doneTime');

      const result = await this.apiCall(
        `/tasks/${taskId}/complete`,
        'POST',
        doneTimeValue ? { done_time: doneTimeValue } : {},
      );
      return this.createSuccess(result, 'Task completed successfully');
    });
  };

  // ==================== BATTERY MANAGEMENT ====================

  public getBatteries: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/objects/batteries');
      return this.createSuccess(data);
    });
  };

  public chargeBattery: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { batteryId, trackedTime } = args || {};
      this.validateRequired({ batteryId }, ['batteryId']);
      const trackedTimeValue = this.parseGrocyDateTimeParam(trackedTime, 'trackedTime');

      // Omit tracked_time when not given so Grocy uses its own server-local current time.
      const body = {
        ...(trackedTimeValue ? { tracked_time: trackedTimeValue } : {}),
      };

      const result = await this.apiCall(`/batteries/${batteryId}/charge`, 'POST', body);
      return this.createSuccess(result, 'Battery charged successfully');
    });
  };

  // ==================== EQUIPMENT MANAGEMENT ====================

  public getEquipment: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/objects/equipment');
      return this.createSuccess(data);
    });
  };

  // ==================== LABEL PRINTING ====================

  public printBatteryLabel: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { batteryId } = args || {};
      this.validateRequired({ batteryId }, ['batteryId']);

      const result = await this.apiCall(`/batteries/${batteryId}/printlabel`);
      return this.createSuccess(result, 'Battery label printed successfully');
    });
  };

  public printChoreLabel: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { choreId } = args || {};
      this.validateRequired({ choreId }, ['choreId']);

      const result = await this.apiCall(`/chores/${choreId}/printlabel`);
      return this.createSuccess(result, 'Chore label printed successfully');
    });
  };

  // ==================== ACTION UTILITIES ====================

  public undoAction: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { entityType, id } = args;
      this.validateRequired({ entityType, id }, ['entityType', 'id']);

      let endpoint;
      switch (entityType.toLowerCase()) {
        case 'chore':
        case 'chores':
          endpoint = `/chores/executions/${id}/undo`;
          break;
        case 'battery':
        case 'batteries':
          endpoint = `/batteries/charge-cycles/${id}/undo`;
          break;
        case 'task':
        case 'tasks':
          endpoint = `/tasks/${id}/undo`;
          break;
        default:
          return this.createError(`Unsupported entity type: ${entityType}`);
      }

      const result = await this.apiCall(endpoint, 'POST');
      return this.createSuccess(result, `${entityType} action undone successfully`);
    });
  };
}

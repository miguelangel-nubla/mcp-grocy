import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HouseholdToolHandlers } from './handlers.js';

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

import apiClient from '../../api/client.js';
const mockApiClient = vi.mocked(apiClient);

describe('HouseholdToolHandlers', () => {
  let handlers: HouseholdToolHandlers;

  beforeEach(() => {
    handlers = new HouseholdToolHandlers();
    vi.clearAllMocks();
    // Mock Date to have consistent timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00Z'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('getChores', () => {
    it('should get all chores', async () => {
      const mockChores = [
        { id: 1, name: 'Clean kitchen', due_date: '2024-01-16' },
        { id: 2, name: 'Take out trash', due_date: '2024-01-15' }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockChores,
        status: 200,
        headers: {}
      });

      const result = await handlers.getChores();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/chores', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getChores();

      expect(result.isError).toBe(true);
    });
  });

  describe('trackChoreExecution', () => {
    it('should track chore execution with all parameters', async () => {
      const mockResponse = { id: 1, chore_id: 1 };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.trackChoreExecution({
        choreId: 1,
        executedBy: 'John',
        trackedTime: '2024-01-15 10:00:00',
        note: 'Completed thoroughly'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/chores/1/execute', {
        method: 'POST',
        body: {
          tracked_time: '2024-01-15 10:00:00',
          done_by: 'John',
          note: 'Completed thoroughly'
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Chore execution tracked successfully');
    });

    it('should track chore execution with defaults', async () => {
      const mockResponse = { id: 1, chore_id: 1 };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.trackChoreExecution({
        choreId: 1
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/chores/1/execute', {
        method: 'POST',
        body: {
          tracked_time: '2024-01-15 10:30:00'
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should require choreId parameter', async () => {
      const result = await handlers.trackChoreExecution({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: choreId');
    });

    it('should handle missing args', async () => {
      const result = await handlers.trackChoreExecution();
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: choreId');
    });
  });

  describe('getTasks', () => {
    it('should get all tasks', async () => {
      const mockTasks = [
        { id: 1, name: 'Buy groceries', completed: false },
        { id: 2, name: 'Call dentist', completed: true }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockTasks,
        status: 200,
        headers: {}
      });

      const result = await handlers.getTasks();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/tasks', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getTasks();

      expect(result.isError).toBe(true);
    });
  });

  describe('completeTask', () => {
    it('should complete task with note', async () => {
      const mockResponse = { id: 1, completed: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.completeTask({
        taskId: 1,
        note: 'Task completed successfully'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/tasks/1/complete', {
        method: 'POST',
        body: {
          note: 'Task completed successfully'
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Task completed successfully');
    });

    it('should complete task without note', async () => {
      const mockResponse = { id: 1, completed: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.completeTask({
        taskId: 1
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/tasks/1/complete', {
        method: 'POST',
        body: {},
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should require taskId parameter', async () => {
      const result = await handlers.completeTask({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: taskId');
    });

    it('should handle missing args', async () => {
      const result = await handlers.completeTask();
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: taskId');
    });
  });

  describe('getBatteries', () => {
    it('should get all batteries', async () => {
      const mockBatteries = [
        { id: 1, name: 'Kitchen scale', charge_level: 50 },
        { id: 2, name: 'Remote control', charge_level: 25 }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockBatteries,
        status: 200,
        headers: {}
      });

      const result = await handlers.getBatteries();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/batteries', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getBatteries();

      expect(result.isError).toBe(true);
    });
  });

  describe('chargeBattery', () => {
    it('should charge battery with all parameters', async () => {
      const mockResponse = { id: 1, battery_id: 1 };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.chargeBattery({
        batteryId: 1,
        trackedTime: '2024-01-15 09:00:00',
        note: 'Full charge cycle'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/batteries/1/charge', {
        method: 'POST',
        body: {
          tracked_time: '2024-01-15 09:00:00',
          note: 'Full charge cycle'
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Battery charged successfully');
    });

    it('should charge battery with defaults', async () => {
      const mockResponse = { id: 1, battery_id: 1 };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.chargeBattery({
        batteryId: 1
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/batteries/1/charge', {
        method: 'POST',
        body: {
          tracked_time: '2024-01-15 10:30:00'
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should require batteryId parameter', async () => {
      const result = await handlers.chargeBattery({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: batteryId');
    });

    it('should handle missing args', async () => {
      const result = await handlers.chargeBattery();
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: batteryId');
    });
  });

  describe('getEquipment', () => {
    it('should get all equipment', async () => {
      const mockEquipment = [
        { id: 1, name: 'Washing machine', status: 'working' },
        { id: 2, name: 'Dishwasher', status: 'maintenance' }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockEquipment,
        status: 200,
        headers: {}
      });

      const result = await handlers.getEquipment();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/equipment', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getEquipment();

      expect(result.isError).toBe(true);
    });
  });

  describe('undoAction', () => {
    it('should undo chore action', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.undoAction({
        entityType: 'chore',
        id: 1
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/chores/executions/1/undo', {
        method: 'POST',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('chore action undone successfully');
    });

    it('should undo battery action', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.undoAction({
        entityType: 'battery',
        id: 2
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/batteries/charge-cycles/2/undo', {
        method: 'POST',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('battery action undone successfully');
    });

    it('should undo task action', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.undoAction({
        entityType: 'task',
        id: 3
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/tasks/3/undo', {
        method: 'POST',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('task action undone successfully');
    });

    it('should handle plural entity types', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.undoAction({
        entityType: 'chores',
        id: 1
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/chores/executions/1/undo', {
        method: 'POST',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should reject unsupported entity types', async () => {
      const result = await handlers.undoAction({
        entityType: 'unsupported',
        id: 1
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unsupported entity type: unsupported');
    });

    it('should require entityType and id parameters', async () => {
      const result = await handlers.undoAction({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: entityType, id');
    });

    it('should require id parameter when entityType is provided', async () => {
      const result = await handlers.undoAction({ entityType: 'chore' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: id');
    });

    it('should handle missing args', async () => {
      const result = await handlers.undoAction();
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Cannot destructure property');
    });
  });
});
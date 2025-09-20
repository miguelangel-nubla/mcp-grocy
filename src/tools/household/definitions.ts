export const householdToolDefinitions = [
  // ==================== CHORE MANAGEMENT ====================
  {
    name: 'household_chores_get',
    description: '[HOUSEHOLD/CHORES] Get all chores from your Grocy instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'household_chores_execute',
    description: '[HOUSEHOLD/CHORES] Track the execution of a chore in your Grocy instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        choreId: {
          type: 'number',
          description: 'ID of the chore to track execution for. Use household_chores_get tool to find the correct chore ID.'
        },
        executedBy: {
          type: 'number',
          description: 'ID of the user who executed the chore (optional). Use system_users_get tool to find user IDs.'
        },
        trackedTime: {
          type: 'string',
          description: 'Time when the chore was executed in YYYY-MM-DD HH:mm:ss format (optional, defaults to current time)'
        },
        note: {
          type: 'string',
          description: 'Optional note for the chore execution'
        }
      },
      required: ['choreId']
    }
  },

  // ==================== TASK MANAGEMENT ====================
  {
    name: 'household_tasks_get',
    description: '[HOUSEHOLD/TASKS] Get all tasks from your Grocy instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'household_tasks_complete',
    description: '[HOUSEHOLD/TASKS] Mark a task as completed in your Grocy instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'number',
          description: 'ID of the task to complete. Use household_tasks_get tool to find the correct task ID.'
        },
        note: {
          type: 'string',
          description: 'Optional note for the task completion'
        }
      },
      required: ['taskId']
    }
  },

  // ==================== BATTERY MANAGEMENT ====================
  {
    name: 'household_batteries_get',
    description: '[HOUSEHOLD/BATTERIES] Get all batteries from your Grocy instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'household_batteries_charge',
    description: '[HOUSEHOLD/BATTERIES] Track battery charging in your Grocy instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        batteryId: {
          type: 'number',
          description: 'ID of the battery to charge. Use household_batteries_get tool to find the correct battery ID.'
        },
        trackedTime: {
          type: 'string',
          description: 'Time when the battery was charged in YYYY-MM-DD HH:mm:ss format (optional, defaults to current time)'
        },
        note: {
          type: 'string',
          description: 'Optional note for the battery charge'
        }
      },
      required: ['batteryId']
    }
  },

  // ==================== EQUIPMENT MANAGEMENT ====================
  {
    name: 'household_equipment_get',
    description: '[HOUSEHOLD/EQUIPMENT] Get all equipment from your Grocy instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },

  // ==================== ACTION UTILITIES ====================
  {
    name: 'household_actions_undo',
    description: '[HOUSEHOLD/ACTIONS] Undo a previously executed action (chore execution, task completion, or battery charge).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        entityType: {
          type: 'string',
          enum: ['chore', 'chores', 'task', 'tasks', 'battery', 'batteries'],
          description: 'Type of entity to undo action for'
        },
        id: {
          type: 'number',
          description: 'ID of the specific execution/completion/charge to undo'
        }
      },
      required: ['entityType', 'id']
    }
  }
];
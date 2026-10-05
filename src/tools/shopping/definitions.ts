import { config } from '../../config/index.js';
import { ToolDefinition } from '../types.js';

export const SHOPPING_LIST_ADD_ITEM_TOOL = 'shopping_list_add_item';

export function createShoppingListAddItemDefinition(allowNoteOnly: boolean = true): ToolDefinition {
  return {
    name: SHOPPING_LIST_ADD_ITEM_TOOL,
    description: allowNoteOnly
      ? '[SHOPPING/LIST] Add an item to a shopping list. Use inventory_products_get first to find the product ID you want to add. If multiple similar products exist or you are unsure, you can omit the product ID and just provide the item name in the note.'
      : '[SHOPPING/LIST] Add an item to a shopping list. Use inventory_products_get first to find the product ID you want to add. All shopping list rows must have a valid product.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description: allowNoteOnly
            ? 'Optional. ID of the product to add. If a great match is found, use it. Otherwise, omit this and just specify the requested item in the note.'
            : 'ID of the product to add.',
        },
        amount: {
          type: 'number',
          description:
            "Amount to add to shopping list in the product's stock unit (e.g., 2 pieces, 1.5 kg, 750 ml). Ensure you know the product's unit before specifying amount. Default: 0 (meaning: buy whatever you find reasonable).",
          default: 0,
        },
        shoppingListId: {
          type: 'number',
          description:
            'ID of the shopping list to add to (default: 1). Most users have only one shopping list with ID 1.',
          default: 1,
        },
        note: {
          type: 'string',
          description: allowNoteOnly
            ? 'Note or name of the item. Required if productId is omitted.'
            : 'Optional. Note for the item.',
        },
      },
      required: allowNoteOnly ? [] : ['productId'],
    },
  };
}

export function getShoppingToolDefinitions(overrideAllowNoteOnly?: boolean): ToolDefinition[] {
  let allowNoteOnly = overrideAllowNoteOnly;
  if (allowNoteOnly === undefined) {
    try {
      const { toolSubConfigs } = config.parseToolConfiguration();
      const subConfigs = toolSubConfigs?.get(SHOPPING_LIST_ADD_ITEM_TOOL);
      allowNoteOnly = subConfigs?.get('allow_note_only') ?? true;
    } catch {
      allowNoteOnly = true;
    }
  }

  return [
    {
      name: 'shopping_lists_get',
      description: '[SHOPPING/BOOK] Get all shopping lists, including their ID, name, and notes.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'shopping_list_get',
      description:
        '[SHOPPING/LIST] Get a shopping list, including its metadata (like notes) and its array of product items.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          shoppingListId: {
            type: 'number',
            description:
              'ID of the shopping list to get (default: 1). Most users have only one shopping list with ID 1.',
            default: 1,
          },
        },
        required: ['shoppingListId'],
      },
    },
    {
      name: 'shopping_list_update',
      description: '[SHOPPING/BOOK] Update a shopping list. You can update its name or notes.',
      inputSchema: {
        type: 'object',
        properties: {
          shoppingListId: {
            type: 'number',
            description:
              'ID of the shopping list to update. Most users have only one shopping list with ID 1.',
          },
          name: {
            type: 'string',
            description: 'Optional. New name for the shopping list.',
          },
          notes: {
            type: 'string',
            description: 'Optional. Notes or description for the shopping list.',
          },
        },
        required: ['shoppingListId'],
      },
    },
    createShoppingListAddItemDefinition(allowNoteOnly),
    {
      name: 'shopping_list_remove_item',
      description:
        '[SHOPPING/LIST] Remove an item from a shopping list. Use shopping_list_get first to find the shopping list item ID.',
      inputSchema: {
        type: 'object',
        properties: {
          shoppingListItemId: {
            type: 'number',
            description:
              'ID of the shopping list item to remove. Use shopping_list_get tool to find the correct shopping list item ID by looking at the "id" field in the results.',
          },
        },
        required: ['shoppingListItemId'],
      },
    },
    {
      name: 'shopping_list_update_item',
      description:
        '[SHOPPING/LIST] Update an item in a shopping list (e.g., to edit the note or amount). Use shopping_list_get first to find the shopping list item ID.',
      inputSchema: {
        type: 'object',
        properties: {
          shoppingListItemId: {
            type: 'number',
            description:
              'ID of the shopping list item to update. Use shopping_list_get tool to find the correct shopping list item ID by looking at the "id" field in the results.',
          },
          productId: {
            type: 'number',
            description: 'Optional. Product ID if you want to change it.',
          },
          amount: {
            type: 'number',
            description: 'Optional. Amount to update to.',
          },
          shoppingListId: {
            type: 'number',
            description: 'Optional. Shopping list ID if you want to move it.',
          },
          note: {
            type: 'string',
            description:
              'Optional. Note for the shopping list item. Use this to add or edit notes.',
          },
        },
        required: ['shoppingListItemId'],
      },
    },
    {
      name: 'shopping_list_print_thermal',
      description:
        '[SHOPPING/PRINTING] Print the shopping list with a thermal printer. This creates a physical shopping list for store visits.',
      inputSchema: {
        type: 'object',
        properties: {
          shoppingListId: {
            type: 'number',
            description:
              'ID of the shopping list to print (default: 1). Most users have only one shopping list with ID 1.',
            default: 1,
          },
        },
        required: [],
      },
    },
    {
      name: 'shopping_locations_get',
      description:
        '[SHOPPING/LOCATIONS] Get **retail store / shop** locations where you buy groceries (Grocy shopping locations). NOT pantry or home storage—use system_locations_get for storage location IDs (locationId). Use shopping_locations_get for storeId when adding shopping-list items or store-specific workflows.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}

export const shoppingToolDefinitions: ToolDefinition[] = getShoppingToolDefinitions();

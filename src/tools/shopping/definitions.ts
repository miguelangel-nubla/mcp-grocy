export const shoppingToolDefinitions = [
  {
    name: 'shopping_list_get',
    description: '[SHOPPING/LIST] Get your current shopping list items.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'shopping_list_add_item',
    description: '[SHOPPING/LIST] Add an item to your shopping list. Use inventory_products_get first to find the product ID you want to add.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        productId: {
          type: 'number',
          description: 'ID of the product to add. Use inventory_products_get tool to find the correct product ID by searching for the product name in the results.'
        },
        amount: {
          type: 'number',
          description: 'Amount to add to shopping list in the product\'s stock unit (e.g., 2 pieces, 1.5 kg, 750 ml). Ensure you know the product\'s unit before specifying amount. Default: 1',
          default: 1
        },
        shoppingListId: {
          type: 'number',
          description: 'ID of the shopping list to add to (default: 1). Most users have only one shopping list with ID 1.',
          default: 1
        },
        note: {
          type: 'string',
          description: 'Optional note for the shopping list item'
        }
      },
      required: ['productId']
    }
  },
  {
    name: 'shopping_list_remove_item',
    description: '[SHOPPING/LIST] Remove an item from your shopping list. Use shopping_list_get first to find the shopping list item ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        shoppingListItemId: {
          type: 'number',
          description: 'ID of the shopping list item to remove. Use shopping_list_get tool to find the correct shopping list item ID by looking at the "id" field in the results.'
        }
      },
      required: ['shoppingListItemId']
    }
  },
  {
    name: 'shopping_locations_get',
    description: '[SHOPPING/LOCATIONS] Get all shopping locations (stores) from your Grocy instance. Use this to find store IDs and names when working with tools that require storeId parameters.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'shopping_list_print_thermal',
    description: '[SHOPPING/PRINTING] Print the shopping list with a thermal printer. This creates a physical shopping list for store visits.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  }
];
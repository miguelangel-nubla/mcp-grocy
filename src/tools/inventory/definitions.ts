import { ToolDefinition } from '../types.js';

export const inventoryToolDefinitions: ToolDefinition[] = [
  // Product Management Tools
  {
    name: 'inventory_products_get',
    description: '[INVENTORY/PRODUCTS] Get specific fields for all products from your Grocy instance. You must specify which fields to retrieve.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['id', 'name', 'description', 'product_group_id', 'active', 'location_id', 'shopping_location_id', 'qu_id_purchase', 'qu_id_stock', 'qu_factor_purchase_to_stock', 'min_stock_amount', 'default_best_before_days', 'default_best_before_days_after_open', 'default_best_before_days_after_freezing', 'default_best_before_days_after_thawing', 'picture_file_name', 'allow_label_per_unit', 'energy_per_stock_unit', 'calories_per_stock_unit', 'default_stock_label_type', 'should_not_be_frozen', 'treat_opened_as_out_of_stock', 'no_own_stock', 'cumulate_min_stock_amount_of_sub_products', 'parent_product_id', 'calories_per_unit_factor', 'quick_consume_amount', 'hide_on_stock_overview']
          },
          description: 'Array of field names to retrieve. For basic lookup use ["id", "name"]. For detailed info include ["id", "name", "description", "active"]. Available fields: id, name, description, product_group_id, active, location_id, shopping_location_id, qu_id_purchase, qu_id_stock, qu_factor_purchase_to_stock, min_stock_amount, default_best_before_days, default_best_before_days_after_open, default_best_before_days_after_freezing, default_best_before_days_after_thawing, picture_file_name, allow_label_per_unit, energy_per_stock_unit, calories_per_stock_unit, default_stock_label_type, should_not_be_frozen, treat_opened_as_out_of_stock, no_own_stock, cumulate_min_stock_amount_of_sub_products, parent_product_id, calories_per_unit_factor, quick_consume_amount, hide_on_stock_overview'
        }
      },
      required: ['fields']
    }
  },
  {
    name: 'inventory_products_get_groups',
    description: '[INVENTORY/PRODUCTS] Get all product groups from your Grocy instance.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'inventory_products_get_price_history',
    description: '[INVENTORY/PRODUCTS] Get the price history of a product from your Grocy instance.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description: 'ID of the product to get price history for. Use get_products tool to find the correct product ID by name.'
        }
      },
      required: ['productId']
    }
  },

  // Stock Management Tools
  {
    name: 'inventory_stock_get_all',
    description: '[INVENTORY/STOCK] Get all stock entries from every location in your Grocy instance. This returns the complete stock database with detailed information including stock entry IDs.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'inventory_stock_get_by_product',
    description: '[INVENTORY/STOCK] Get stock entries for a specific product in your Grocy instance with filtered essential information.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description: 'ID of the product to get stock entries for. Use get_products tool to find the correct product ID by name.'
        }
      },
      required: ['productId']
    }
  },
  {
    name: 'inventory_stock_get_volatile',
    description: '[INVENTORY/STOCK] Get volatile stock information (due products, overdue products, expired products, missing products).',
    inputSchema: {
      type: 'object',
      properties: {
        includeDetails: {
          type: 'boolean',
          description: 'Whether to include additional details about each stock item'
        }
      },
      required: []
    }
  },
  {
    name: 'inventory_stock_get_by_location',
    description: '[INVENTORY/STOCK] Get stock entries from a specific location in your Grocy instance.',
    inputSchema: {
      type: 'object',
      properties: {
        locationId: {
          type: 'number',
          description: 'ID of the location to get stock for.'
        }
      },
      required: ['locationId']
    }
  },

  // Stock Transaction Tools
  {
    name: 'inventory_transactions_purchase',
    description: '[INVENTORY/TRANSACTIONS] Add a product to stock (purchase/add inventory). Use inventory_products_get to find the product ID and system_locations_get to find location IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description: 'ID of the product to purchase. Use get_products tool to find the correct product ID by name.'
        },
        amount: {
          type: 'number',
          description: 'Amount to purchase in the product\'s stock unit (e.g., 2 pieces, 1.5 kg, 750 ml). Ensure you know the product\'s unit before specifying amount.'
        },
        bestBeforeDate: {
          type: 'string',
          description: 'Best before date in YYYY-MM-DD format. If not provided, will use product\'s default best before days.'
        },
        price: {
          type: 'number',
          description: 'Price per stock unit (optional)'
        },
        locationId: {
          type: 'number',
          description: 'Location ID where the product should be stored. Use get_locations tool to find the correct location ID. If not provided, uses product\'s default location.'
        },
        note: {
          type: 'string',
          description: 'Optional note for the stock entry'
        }
      },
      required: ['productId', 'amount']
    }
  },
  {
    name: 'inventory_transactions_consume',
    description: '[INVENTORY/TRANSACTIONS] Remove a product from stock (consume/use inventory). Use inventory_products_get to find the product ID.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description: 'ID of the product to consume. Use get_products tool to find the correct product ID by name.'
        },
        amount: {
          type: 'number',
          description: 'Amount to consume in the product\'s stock unit (e.g., 2 pieces, 1.5 kg, 750 ml). Ensure you know the product\'s unit before specifying amount.'
        },
        spoiled: {
          type: 'boolean',
          description: 'Whether the product was spoiled/wasted (default: false)',
          default: false
        },
        locationId: {
          type: 'number',
          description: 'Location ID to consume from (optional). Use get_locations tool to find the correct location ID.'
        },
        note: {
          type: 'string',
          description: 'Optional note for the consumption'
        }
      },
      required: ['productId', 'amount']
    }
  },
  {
    name: 'inventory_transactions_transfer',
    description: '[INVENTORY/TRANSACTIONS] Transfer a product between locations. Use inventory_products_get to find the product ID and system_locations_get to find location IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description: 'ID of the product to transfer. Use get_products tool to find the correct product ID by name.'
        },
        amount: {
          type: 'number',
          description: 'Amount to transfer in the product\'s stock unit (e.g., 2 pieces, 1.5 kg, 750 ml). Ensure you know the product\'s unit before specifying amount.'
        },
        fromLocationId: {
          type: 'number',
          description: 'Source location ID. Use get_locations tool to find the correct location ID.'
        },
        toLocationId: {
          type: 'number',
          description: 'Destination location ID. Use get_locations tool to find the correct location ID.'
        },
        note: {
          type: 'string',
          description: 'Optional note for the transfer'
        }
      },
      required: ['productId', 'amount', 'fromLocationId', 'toLocationId']
    }
  },
  {
    name: 'inventory_transactions_adjust',
    description: '[INVENTORY/TRANSACTIONS] Track a product inventory (set current stock amount). Use inventory_products_get to find the product ID and system_locations_get to find location IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description: 'ID of the product to inventory. Use get_products tool to find the correct product ID by name.'
        },
        newAmount: {
          type: 'number',
          description: 'The new/correct total amount of stock for this product in the product\'s stock unit.'
        },
        bestBeforeDate: {
          type: 'string',
          description: 'Best before date in YYYY-MM-DD format for the inventory correction.'
        },
        locationId: {
          type: 'number',
          description: 'Location ID for the inventory (optional). Use get_locations tool to find the correct location ID.'
        },
        note: {
          type: 'string',
          description: 'Optional note for the inventory correction'
        }
      },
      required: ['productId', 'newAmount']
    }
  },
  {
    name: 'inventory_transactions_open',
    description: '[INVENTORY/TRANSACTIONS] Mark a product as opened/started. Use inventory_products_get to find the product ID.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description: 'ID of the product to open. Use get_products tool to find the correct product ID by name.'
        },
        amount: {
          type: 'number',
          description: 'Amount to mark as opened in the product\'s stock unit (e.g., 1 piece, 0.5 kg). Default: 1',
          default: 1
        },
        note: {
          type: 'string',
          description: 'Optional note for opening the product'
        }
      },
      required: ['productId']
    }
  },
  {
    name: 'inventory_products_lookup',
    description: '[INVENTORY/PRODUCTS] Search for products by name using fuzzy matching. Returns up to 5 best matches with stock information and location details.',
    inputSchema: {
      type: 'object',
      properties: {
        productName: {
          type: 'string',
          description: 'Product name to search for. Uses fuzzy matching to find similar products.'
        }
      },
      required: ['productName']
    }
  },
  {
    name: 'inventory_products_print_label',
    description: '[INVENTORY/PRODUCTS] Print a Grocycode label for a product. Use inventory_products_get to find valid productId values.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description: 'ID of the product to print label for. Use inventory_products_get tool to find the correct product ID.'
        }
      },
      required: ['productId']
    }
  },
  {
    name: 'inventory_stock_entry_print_label',
    description: '[INVENTORY/STOCK] Print a label for a specific stock entry. Use inventory_stock_get_by_product to find valid stockId values.',
    inputSchema: {
      type: 'object',
      properties: {
        stockId: {
          type: 'number',
          description: 'ID of the stock entry to print label for. Use get_stock_by_product tool to find specific stockId values.'
        },
        productId: {
          type: 'number',
          description: 'ID of the product that the stock entry belongs to. This is required for validation.'
        }
      },
      required: ['stockId', 'productId']
    }
  },

  // ==================== GRANULAR STOCK ENTRY OPERATIONS ====================
  {
    name: 'inventory_stock_entry_consume',
    description: '[INVENTORY/STOCK] Consume from a specific stock entry. Use inventory_stock_get_by_product to find specific stockId values.',
    inputSchema: {
      type: 'object',
      properties: {
        stockId: {
          type: 'number',
          description: 'ID of the specific stock entry to consume from.'
        },
        productId: {
          type: 'number',
          description: 'ID of the product being consumed. This is required for verification - if you know the stockId, you must know the productId.'
        },
        amount: {
          type: 'number',
          description: 'Amount to consume in the product\'s stock unit (e.g., 1 piece, 0.5 kg, 250 ml). Ensure you know the product\'s stock unit before specifying amount.'
        },
        spoiled: {
          type: 'boolean',
          description: 'Whether the product is spoiled (default: false)',
          default: false
        },
        note: {
          type: 'string',
          description: 'Optional note'
        }
      },
      required: ['stockId', 'productId', 'amount']
    }
  },
  {
    name: 'inventory_stock_entry_transfer',
    description: '[INVENTORY/STOCK] Transfer a specific stock entry to another location. Use inventory_stock_get_by_product to find specific stockId values.',
    inputSchema: {
      type: 'object',
      properties: {
        stockId: {
          type: 'number',
          description: 'ID of the specific stock entry to transfer.'
        },
        productId: {
          type: 'number',
          description: 'ID of the product being transferred. This is required for verification - if you know the stockId, you must know the productId.'
        },
        amount: {
          type: 'number',
          description: 'Amount to transfer in the product\'s stock unit (e.g., 1 piece, 0.5 kg, 250 ml). Ensure you know the product\'s stock unit before specifying amount.'
        },
        locationIdTo: {
          type: 'number', 
          description: 'ID of the destination location.'
        },
        note: {
          type: 'string',
          description: 'Optional note for this transfer'
        }
      },
      required: ['stockId', 'productId', 'amount', 'locationIdTo']
    }
  },
  {
    name: 'inventory_stock_entry_open',
    description: '[INVENTORY/STOCK] Mark a specific stock entry as opened. Use inventory_stock_get_by_product to find specific stockId values.',
    inputSchema: {
      type: 'object',
      properties: {
        stockId: {
          type: 'number',
          description: 'ID of the specific stock entry to mark as opened.'
        },
        productId: {
          type: 'number',
          description: 'ID of the product being opened. This is required for verification - if you know the stockId, you must know the productId.'
        },
        amount: {
          type: 'number',
          description: 'Amount to mark as opened in the product\'s stock unit (e.g., 1 piece, 0.5 kg, 200 ml). Ensure you know the product\'s stock unit before specifying amount.'
        },
        note: {
          type: 'string',
          description: 'Optional note'
        }
      },
      required: ['stockId', 'productId', 'amount']
    }
  }
];
import { ToolDefinition } from '../types.js';

export const inventoryToolDefinitions: ToolDefinition[] = [
  // Product Management Tools
  {
    name: 'inventory_products_get',
    description:
      '[INVENTORY/PRODUCTS] Get specific fields for all products from your Grocy instance. You must specify which fields to retrieve.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'id',
              'name',
              'description',
              'product_group_id',
              'active',
              'location_id',
              'shopping_location_id',
              'default_consume_location_id',
              'qu_id_purchase',
              'qu_id_stock',
              'qu_id_consume',
              'qu_id_price',
              'min_stock_amount',
              'due_type',
              'default_best_before_days',
              'default_best_before_days_after_open',
              'default_best_before_days_after_freezing',
              'default_best_before_days_after_thawing',
              'picture_file_name',
              'calories',
              'default_stock_label_type',
              'should_not_be_frozen',
              'treat_opened_as_out_of_stock',
              'move_on_open',
              'disable_open',
              'no_own_stock',
              'cumulate_min_stock_amount_of_sub_products',
              'parent_product_id',
              'quick_consume_amount',
              'hide_on_stock_overview',
            ],
          },
          description:
            'Array of field names to retrieve. For basic lookup use ["id", "name"]. For detailed info include ["id", "name", "description", "active"]. Available fields: id, name, description, product_group_id, active, location_id, shopping_location_id, default_consume_location_id, qu_id_purchase, qu_id_stock, qu_id_consume, qu_id_price, min_stock_amount, due_type, default_best_before_days, default_best_before_days_after_open, default_best_before_days_after_freezing, default_best_before_days_after_thawing, picture_file_name, calories, default_stock_label_type, should_not_be_frozen, treat_opened_as_out_of_stock, move_on_open, disable_open, no_own_stock, cumulate_min_stock_amount_of_sub_products, parent_product_id, quick_consume_amount, hide_on_stock_overview. calories is per stock unit; due_type 1 = best before, 2 = expiration.',
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'inventory_products_get_groups',
    description:
      '[INVENTORY/PRODUCTS] **Categories only:** list product groups (taxonomy), not individual products. For product rows with fields use inventory_products_get.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'inventory_products_get_price_history',
    description:
      '[INVENTORY/PRODUCTS] Get the price history of a product from your Grocy instance.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description:
            'ID of the product to get price history for. Use inventory_products_lookup to find the product ID by name (or inventory_products_get with fields if listing products).',
        },
      },
      required: ['productId'],
    },
  },

  // Stock Management Tools
  {
    name: 'inventory_stock_get_all',
    description:
      '[INVENTORY/STOCK] **Full stock overview**—current stock summary, one aggregated row per product (amount, opened amount, next due date). No stockIds: use inventory_stock_get_by_product for stock entry rows/stockIds. Prefer inventory_stock_get_by_product when the user names one product; prefer inventory_stock_get_by_location when they name one storage place.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'inventory_stock_get_by_product',
    description:
      '[INVENTORY/STOCK] Stock rows for **one product** across locations (needs productId). Use when the user asks how much of a product is on hand or needs stockId for that product—not for everything in a cupboard (use inventory_stock_get_by_location).',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description:
            'ID of the product to get stock entries for. Use inventory_products_lookup to find the product ID by name (or inventory_products_get with fields if listing products).',
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'inventory_stock_get_volatile',
    description:
      '[INVENTORY/STOCK] Get volatile stock information (due products, overdue products, expired products, missing products).',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        dueSoonDays: {
          type: 'number',
          description:
            'Window in days for "due soon" products (Grocy query parameter due_soon_days). Positive integer; defaults to 5 when omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: 'inventory_stock_get_by_location',
    description:
      '[INVENTORY/STOCK] Everything stocked in **one storage location** (needs locationId from system_locations_get). Returns stock entry rows (id, product_id, amount, dates, open, note); product names via inventory_products_get. Use when the user asks what is in the freezer/pantry—not for one named product across sites (use inventory_stock_get_by_product).',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        locationId: {
          type: 'number',
          description: 'ID of the location to get stock for.',
        },
      },
      required: ['locationId'],
    },
  },

  // Stock Transaction Tools
  {
    name: 'inventory_transactions_purchase',
    description:
      '[INVENTORY/TRANSACTIONS] **Product-level purchase:** add quantity by productId (creates/merges stock). No stockId. Use inventory_products_get and system_locations_get for IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description:
            'ID of the product to purchase. Use inventory_products_lookup to find the product ID by name (or inventory_products_get with fields if listing products).',
        },
        amount: {
          type: 'number',
          description:
            "Amount to purchase in the product's stock unit (e.g., 2 pieces, 1.5 kg, 750 ml). Ensure you know the product's unit before specifying amount.",
        },
        bestBeforeDate: {
          type: 'string',
          description:
            "Best before date in YYYY-MM-DD format. If not provided, will use product's default best before days.",
        },
        price: {
          type: 'number',
          description: 'Price per stock unit (optional)',
        },
        locationId: {
          type: 'number',
          description:
            "Location ID where the product should be stored. Use system_locations_get to find the location ID. If not provided, uses product's default location.",
        },
        note: {
          type: 'string',
          description: 'Optional note for the stock entry',
        },
      },
      required: ['productId', 'amount'],
    },
  },
  {
    name: 'inventory_transactions_consume',
    description:
      '[INVENTORY/TRANSACTIONS] **Product-level consume:** reduce stock by productId+amount (Grocy picks lots). If the user refers to a specific package/stock row, use inventory_stock_entry_consume (stockId). Use inventory_products_get for productId.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description:
            'ID of the product to consume. Use inventory_products_lookup to find the product ID by name (or inventory_products_get with fields if listing products).',
        },
        amount: {
          type: 'number',
          description:
            "Amount to consume in the product's stock unit (e.g., 2 pieces, 1.5 kg, 750 ml). Ensure you know the product's unit before specifying amount.",
        },
        spoiled: {
          type: 'boolean',
          description: 'Whether the product was spoiled/wasted (default: false)',
          default: false,
        },
        locationId: {
          type: 'number',
          description:
            'Location ID to consume from (optional). Use system_locations_get to find the location ID.',
        },
      },
      required: ['productId', 'amount'],
    },
  },
  {
    name: 'inventory_transactions_transfer',
    description:
      '[INVENTORY/TRANSACTIONS] **Product-level transfer:** move amount of a product between locations without choosing a stock row. For one specific lot, use inventory_stock_entry_transfer (stockId). Use inventory_products_get and system_locations_get.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description:
            'ID of the product to transfer. Use inventory_products_lookup to find the product ID by name (or inventory_products_get with fields if listing products).',
        },
        amount: {
          type: 'number',
          description:
            "Amount to transfer in the product's stock unit (e.g., 2 pieces, 1.5 kg, 750 ml). Ensure you know the product's unit before specifying amount.",
        },
        fromLocationId: {
          type: 'number',
          description: 'Source location ID. Use system_locations_get to find the location ID.',
        },
        toLocationId: {
          type: 'number',
          description: 'Destination location ID. Use system_locations_get to find the location ID.',
        },
      },
      required: ['productId', 'amount', 'fromLocationId', 'toLocationId'],
    },
  },
  {
    name: 'inventory_transactions_adjust',
    description:
      '[INVENTORY/TRANSACTIONS] Track a product inventory (set current stock amount). Use inventory_products_get to find the product ID and system_locations_get to find location IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description:
            'ID of the product to inventory. Use inventory_products_lookup to find the product ID by name (or inventory_products_get with fields if listing products).',
        },
        newAmount: {
          type: 'number',
          description:
            "The new/correct total amount of stock for this product in the product's stock unit.",
        },
        bestBeforeDate: {
          type: 'string',
          description: 'Best before date in YYYY-MM-DD format for the inventory correction.',
        },
        locationId: {
          type: 'number',
          description:
            'Location ID for the inventory (optional). Use system_locations_get to find the location ID.',
        },
        note: {
          type: 'string',
          description: 'Optional note for the inventory correction',
        },
      },
      required: ['productId', 'newAmount'],
    },
  },
  {
    name: 'inventory_transactions_open',
    description:
      '[INVENTORY/TRANSACTIONS] **Product-level open:** mark opened/started without a stock row. For one specific package use inventory_stock_entry_open (stockId). Use inventory_products_get for productId.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description:
            'ID of the product to open. Use inventory_products_lookup to find the product ID by name (or inventory_products_get with fields if listing products).',
        },
        amount: {
          type: 'number',
          description:
            "Amount to mark as opened in the product's stock unit (e.g., 1 piece, 0.5 kg). Default: 1",
          default: 1,
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'inventory_products_lookup',
    description:
      '[INVENTORY/PRODUCTS] Search for products by name using fuzzy matching. Returns up to 5 best matches with stock information and location details.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        productName: {
          type: 'string',
          description: 'Product name to search for. Uses fuzzy matching to find similar products.',
        },
      },
      required: ['productName'],
    },
  },
  {
    name: 'inventory_products_print_label',
    description:
      '[INVENTORY/PRODUCTS] Print a Grocycode label for a product. Use inventory_products_get to find valid productId values.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description:
            'ID of the product to print label for. Use inventory_products_get tool to find the correct product ID.',
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'inventory_stock_entry_print_label',
    description:
      '[INVENTORY/STOCK] Print a label for a specific stock entry. Use inventory_stock_get_by_product to find valid stockId values.',
    inputSchema: {
      type: 'object',
      properties: {
        stockId: {
          type: 'number',
          description:
            'ID of the stock entry to print label for. Use inventory_stock_get_by_product to find stockId values.',
        },
        productId: {
          type: 'number',
          description:
            'ID of the product that the stock entry belongs to. This is required for validation.',
        },
      },
      required: ['stockId', 'productId'],
    },
  },

  // ==================== GRANULAR STOCK ENTRY OPERATIONS ====================
  {
    name: 'inventory_stock_entry_consume',
    description:
      '[INVENTORY/STOCK] **Specific stock row (stockId):** consume from one lot. If the user only names a product/amount without a particular package, use inventory_transactions_consume instead. Find stockId via inventory_stock_get_by_product.',
    inputSchema: {
      type: 'object',
      properties: {
        stockId: {
          type: 'number',
          description: 'ID of the specific stock entry to consume from.',
        },
        productId: {
          type: 'number',
          description:
            'ID of the product being consumed. This is required for verification - if you know the stockId, you must know the productId.',
        },
        amount: {
          type: 'number',
          description:
            "Amount to consume in the product's stock unit (e.g., 1 piece, 0.5 kg, 250 ml). Ensure you know the product's stock unit before specifying amount.",
        },
        spoiled: {
          type: 'boolean',
          description: 'Whether the product is spoiled (default: false)',
          default: false,
        },
      },
      required: ['stockId', 'productId', 'amount'],
    },
  },
  {
    name: 'inventory_stock_entry_transfer',
    description:
      '[INVENTORY/STOCK] **Specific stock row (stockId):** move one lot to another location. For moving an amount of a product without picking a row, use inventory_transactions_transfer. Find stockId via inventory_stock_get_by_product.',
    inputSchema: {
      type: 'object',
      properties: {
        stockId: {
          type: 'number',
          description: 'ID of the specific stock entry to transfer.',
        },
        productId: {
          type: 'number',
          description:
            'ID of the product being transferred. This is required for verification - if you know the stockId, you must know the productId.',
        },
        amount: {
          type: 'number',
          description:
            "Amount to transfer in the product's stock unit (e.g., 1 piece, 0.5 kg, 250 ml). Ensure you know the product's stock unit before specifying amount.",
        },
        locationIdTo: {
          type: 'number',
          description: 'ID of the destination location.',
        },
      },
      required: ['stockId', 'productId', 'amount', 'locationIdTo'],
    },
  },
  {
    name: 'inventory_stock_entry_open',
    description:
      '[INVENTORY/STOCK] **Specific stock row (stockId):** mark one opened package. For product-level open without a row, use inventory_transactions_open. Find stockId via inventory_stock_get_by_product.',
    inputSchema: {
      type: 'object',
      properties: {
        stockId: {
          type: 'number',
          description: 'ID of the specific stock entry to mark as opened.',
        },
        productId: {
          type: 'number',
          description:
            'ID of the product being opened. This is required for verification - if you know the stockId, you must know the productId.',
        },
        amount: {
          type: 'number',
          description:
            "Amount to mark as opened in the product's stock unit (e.g., 1 piece, 0.5 kg, 200 ml). Ensure you know the product's stock unit before specifying amount.",
        },
      },
      required: ['stockId', 'productId', 'amount'],
    },
  },
];

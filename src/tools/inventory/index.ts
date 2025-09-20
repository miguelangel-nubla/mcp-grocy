import { ToolModule } from '../types.js';
import { inventoryToolDefinitions } from './definitions.js';
import { InventoryToolHandlers } from './handlers.js';

const handlers = new InventoryToolHandlers();

export const inventoryModule: ToolModule = {
  definitions: inventoryToolDefinitions,
  handlers: {
    // Product Management
    inventory_products_get: handlers.getProducts,
    inventory_products_get_groups: handlers.getProductGroups,
    inventory_products_get_price_history: handlers.getPriceHistory,
    
    // Stock Queries
    inventory_stock_get_all: handlers.getAllStock,
    inventory_stock_get_by_product: handlers.getStockByProduct,
    inventory_stock_get_volatile: handlers.getStockVolatile,
    inventory_stock_get_by_location: handlers.getStockByLocation,
    
    // Stock Transactions
    inventory_transactions_purchase: handlers.purchaseProduct,
    inventory_transactions_consume: handlers.consumeProduct,
    inventory_transactions_transfer: handlers.transferProduct,
    inventory_transactions_adjust: handlers.inventoryProduct,
    inventory_transactions_open: handlers.openProduct,
    
    // Product Lookup and Label Printing
    inventory_products_lookup: handlers.lookupProduct,
    inventory_stock_print_label: handlers.printStockEntryLabel
  }
};

export * from './definitions.js';
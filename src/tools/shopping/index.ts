import { ToolModule } from '../types.js';
import { shoppingToolDefinitions } from './definitions.js';
import { ShoppingToolHandlers } from './handlers.js';

const handlers = new ShoppingToolHandlers();

export const shoppingModule: ToolModule = {
  definitions: shoppingToolDefinitions,
  handlers: {
    shopping_lists_get: handlers.getShoppingLists,
    shopping_list_get: handlers.getShoppingList,
    shopping_list_update: handlers.updateShoppingList,
    shopping_list_add_item: handlers.addShoppingListItem,
    shopping_list_remove_item: handlers.removeShoppingListItem,
    shopping_list_update_item: handlers.updateShoppingListItem,
    shopping_list_print_thermal: handlers.printShoppingListThermal,
    shopping_locations_get: handlers.getShoppingLocations,
  },
};

export * from './definitions.js';

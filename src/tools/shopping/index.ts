import { ToolModule } from '../types.js';
import { getShoppingToolDefinitions } from './definitions.js';
import { ShoppingToolHandlers } from './handlers.js';
import { validateShoppingListAddItemSubConfigs } from './validations.js';

const handlers = new ShoppingToolHandlers();

export const shoppingModule: ToolModule = {
  get definitions() {
    return getShoppingToolDefinitions();
  },
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
  validators: {
    shopping_list_add_item: validateShoppingListAddItemSubConfigs,
  },
};

export * from './definitions.js';
export * from './validations.js';

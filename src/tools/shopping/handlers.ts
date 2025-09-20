import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';

export class ShoppingToolHandlers extends BaseToolHandler {
  public getShoppingList: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const result = await this.apiCall('/objects/shopping_list');
      return this.createSuccess(result, 'Shopping list retrieved successfully');
    });
  };

  public addShoppingListItem: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId, amount = 1, shoppingListId = 1, note = '' } = args || {};
      this.validateRequired({ productId }, ['productId']);
      
      const body = {
        product_id: productId,
        amount,
        shopping_list_id: shoppingListId,
        note
      };
      
      const result = await this.apiCall('/objects/shopping_list', 'POST', body);
      return this.createSuccess(result, 'Shopping list item added successfully');
    });
  };

  public removeShoppingListItem: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { shoppingListItemId } = args || {};
      this.validateRequired({ shoppingListItemId }, ['shoppingListItemId']);
      
      const result = await this.apiCall(`/objects/shopping_list/${shoppingListItemId}`, 'DELETE');
      return this.createSuccess(result, 'Shopping list item removed successfully');
    });
  };

  public getShoppingLocations: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const result = await this.apiCall('/objects/shopping_locations');
      return this.createSuccess(result, 'Shopping locations retrieved successfully');
    });
  };
}
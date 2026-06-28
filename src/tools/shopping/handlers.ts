import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';

export class ShoppingToolHandlers extends BaseToolHandler {
  public getShoppingLists: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const result = await this.apiCall('/objects/shopping_lists');
      return this.createSuccess(result, 'Shopping lists retrieved successfully');
    });
  };

  public getShoppingList: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { shoppingListId } = args || {};
      const queryParams: Record<string, string> = {};
      if (shoppingListId !== undefined) {
        queryParams['query[]'] = `shopping_list_id=${shoppingListId}`;
      }
      const result = await this.apiCall('/objects/shopping_list', 'GET', undefined, {
        queryParams,
      });
      return this.createSuccess(result, 'Shopping list retrieved successfully');
    });
  };

  public updateShoppingList: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { shoppingListId, name, description } = args || {};
      this.validateRequired({ shoppingListId }, ['shoppingListId']);

      const existingList = await this.apiCall(`/objects/shopping_lists/${shoppingListId}`);
      if (!existingList) {
        throw new Error(`Shopping list ${shoppingListId} not found`);
      }

      const body = {
        ...existingList,
      };

      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;

      const result = await this.apiCall(`/objects/shopping_lists/${shoppingListId}`, 'PUT', body);
      return this.createSuccess(result, 'Shopping list updated successfully');
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
        note,
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

  public updateShoppingListItem: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { shoppingListItemId, productId, amount, shoppingListId, note } = args || {};
      this.validateRequired({ shoppingListItemId }, ['shoppingListItemId']);

      const existingItem = await this.apiCall(`/objects/shopping_list/${shoppingListItemId}`);
      if (!existingItem) {
        throw new Error(`Shopping list item ${shoppingListItemId} not found`);
      }

      const body = {
        ...existingItem,
      };

      if (productId !== undefined) body.product_id = productId;
      if (amount !== undefined) body.amount = amount;
      if (shoppingListId !== undefined) body.shopping_list_id = shoppingListId;
      if (note !== undefined) body.note = note;

      const result = await this.apiCall(
        `/objects/shopping_list/${shoppingListItemId}`,
        'PUT',
        body,
      );
      return this.createSuccess(result, 'Shopping list item updated successfully');
    });
  };

  public printShoppingListThermal: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { shoppingListId } = args || {};
      const endpoint =
        shoppingListId !== undefined
          ? `/print/shoppinglist/thermal?list_id=${shoppingListId}`
          : '/print/shoppinglist/thermal';
      const result = await this.apiCall(endpoint);
      return this.createSuccess(result, 'Shopping list sent to thermal printer successfully');
    });
  };

  public getShoppingLocations: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const result = await this.apiCall('/objects/shopping_locations');
      return this.createSuccess(result, 'Shopping locations retrieved successfully');
    });
  };
}

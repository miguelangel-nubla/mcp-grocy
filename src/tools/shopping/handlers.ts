import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';

export class ShoppingToolHandlers extends BaseToolHandler {
  private async getResolvedShoppingMetadata(): Promise<{
    productsById: Map<number, any>;
    quantityUnitsById: Map<number, any>;
    shoppingListsById: Map<number, any>;
  }> {
    const [productsResponse, quantityUnitsResponse, shoppingListsResponse] = await Promise.all([
      this.apiCall('/objects/products'),
      this.apiCall('/objects/quantity_units'),
      this.apiCall('/objects/shopping_lists'),
    ]);

    const products = Array.isArray(productsResponse) ? productsResponse : [];
    const quantityUnits = Array.isArray(quantityUnitsResponse) ? quantityUnitsResponse : [];
    const shoppingLists = Array.isArray(shoppingListsResponse) ? shoppingListsResponse : [];

    return {
      productsById: new Map(
        products
          .filter((product: any) => product && product.id !== undefined && product.id !== null)
          .map((product: any) => [Number(product.id), product]),
      ),
      quantityUnitsById: new Map(
        quantityUnits
          .filter((unit: any) => unit && unit.id !== undefined && unit.id !== null)
          .map((unit: any) => [Number(unit.id), unit]),
      ),
      shoppingListsById: new Map(
        shoppingLists
          .filter((list: any) => list && list.id !== undefined && list.id !== null)
          .map((list: any) => [Number(list.id), list]),
      ),
    };
  }

  private enrichShoppingListItem(
    item: any,
    productsById: Map<number, any>,
    quantityUnitsById: Map<number, any>,
    shoppingListsById: Map<number, any>,
  ) {
    const productId =
      item?.product_id !== undefined && item?.product_id !== null ? Number(item.product_id) : null;
    const product = productId !== null ? productsById.get(productId) : undefined;
    const quId =
      item?.qu_id !== undefined && item?.qu_id !== null
        ? Number(item.qu_id)
        : product?.qu_id_stock !== undefined && product?.qu_id_stock !== null
          ? Number(product.qu_id_stock)
          : null;
    const quantityUnit = quId !== null ? quantityUnitsById.get(quId) : undefined;

    const shoppingListIdStr = item?.shopping_list_id;
    const shoppingListIdNum =
      shoppingListIdStr !== undefined && shoppingListIdStr !== null
        ? Number(shoppingListIdStr)
        : null;
    const shoppingList =
      shoppingListIdNum !== null ? shoppingListsById.get(shoppingListIdNum) : undefined;

    const {
      product_id: _product_id,
      shopping_list_id: _shopping_list_id,
      qu_id: _qu_id,
      ...restItem
    } = item || {};

    return {
      ...restItem,
      product: product
        ? {
            id: product.id,
            name: product.name,
            description: product.description ?? null,
            quIdStock: product.qu_id_stock ?? null,
          }
        : null,
      quantityUnit: quantityUnit
        ? {
            id: quantityUnit.id,
            name: quantityUnit.name,
          }
        : null,
      shoppingList: shoppingList
        ? {
            id: shoppingList.id,
            name: shoppingList.name,
          }
        : null,
    };
  }

  private async enrichShoppingListResponse(data: any): Promise<any> {
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return data;
      }

      const { productsById, quantityUnitsById, shoppingListsById } =
        await this.getResolvedShoppingMetadata();
      return data.map((item) =>
        this.enrichShoppingListItem(item, productsById, quantityUnitsById, shoppingListsById),
      );
    }

    if (data && typeof data === 'object') {
      const hasShoppingFields = 'product_id' in data || 'qu_id' in data;
      if (!hasShoppingFields) {
        return data;
      }

      const { productsById, quantityUnitsById, shoppingListsById } =
        await this.getResolvedShoppingMetadata();
      return this.enrichShoppingListItem(data, productsById, quantityUnitsById, shoppingListsById);
    }

    return data;
  }

  private normalizeShoppingList(item: any): any {
    if (!item || typeof item !== 'object') {
      return item;
    }

    const { description, ...rest } = item;

    return {
      ...rest,
      manual_items: description ?? null,
    };
  }

  private normalizeShoppingListsResponse(data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.normalizeShoppingList(item));
    }

    return this.normalizeShoppingList(data);
  }

  public getShoppingLists: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const result = await this.apiCall('/objects/shopping_lists');
      return this.createSuccess(
        this.normalizeShoppingListsResponse(result),
        'Shopping lists retrieved successfully',
      );
    });
  };

  public getShoppingList: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { shoppingListId } = args || {};
      this.validateRequired({ shoppingListId }, ['shoppingListId']);

      const queryParams: Record<string, string> = {
        'query[]': `shopping_list_id=${shoppingListId}`,
      };
      const result = await this.apiCall('/objects/shopping_list', 'GET', undefined, {
        queryParams,
      });
      const enriched = await this.enrichShoppingListResponse(result);

      const meta = await this.apiCall(`/objects/shopping_lists/${shoppingListId}`);
      const listMetadata = this.normalizeShoppingList(meta);

      return this.createSuccess(
        {
          list: listMetadata,
          items: enriched,
        },
        'Shopping list retrieved successfully',
      );
    });
  };

  public updateShoppingList: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { shoppingListId, name, manual_items, append_manual_items } = args || {};
      this.validateRequired({ shoppingListId }, ['shoppingListId']);

      const existingList = await this.apiCall(`/objects/shopping_lists/${shoppingListId}`);
      if (!existingList) {
        throw new Error(`Shopping list ${shoppingListId} not found`);
      }

      const body = {
        ...existingList,
      };

      if (name !== undefined) body.name = name;
      if (manual_items !== undefined) {
        body.description = manual_items;
      }

      if (append_manual_items !== undefined) {
        const currentItems = body.description || '';
        body.description = currentItems
          ? `${currentItems}\n${append_manual_items}`
          : append_manual_items;
      }

      const result = await this.apiCall(`/objects/shopping_lists/${shoppingListId}`, 'PUT', body);
      return this.createSuccess(
        this.normalizeShoppingListsResponse(result),
        'Shopping list updated successfully',
      );
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
      const enriched = await this.enrichShoppingListResponse(result);
      return this.createSuccess(enriched, 'Shopping list item added successfully');
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
      const enriched = await this.enrichShoppingListResponse(result);
      return this.createSuccess(enriched, 'Shopping list item updated successfully');
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

import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';
import { ValidationError } from '../../utils/errors.js';

export class ShoppingToolHandlers extends BaseToolHandler {
  private async getResolvedShoppingMetadata(): Promise<{
    productsById: Map<number, any>;
    quantityUnitsById: Map<number, any>;
  }> {
    const [productsResponse, quantityUnitsResponse] = await Promise.all([
      this.apiCall('/objects/products'),
      this.apiCall('/objects/quantity_units'),
    ]);

    const products = Array.isArray(productsResponse) ? productsResponse : [];
    const quantityUnits = Array.isArray(quantityUnitsResponse) ? quantityUnitsResponse : [];

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
    };
  }

  private enrichShoppingListItem(
    item: any,
    productsById: Map<number, any>,
    quantityUnitsById: Map<number, any>,
  ) {
    const productId =
      item?.product_id !== undefined && item?.product_id !== null ? Number(item.product_id) : null;
    const product = productId !== null ? productsById.get(productId) : undefined;

    const productQuIdStock =
      product?.qu_id_stock !== undefined && product?.qu_id_stock !== null
        ? Number(product.qu_id_stock)
        : null;
    const productQuantityUnitStock =
      productQuIdStock !== null ? quantityUnitsById.get(productQuIdStock) : undefined;

    const quId =
      item?.qu_id !== undefined && item?.qu_id !== null ? Number(item.qu_id) : productQuIdStock;
    const quantityUnit = quId !== null ? quantityUnitsById.get(quId) : undefined;

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
            quantityUnitStock: productQuantityUnitStock
              ? {
                  id: productQuantityUnitStock.id,
                  name: productQuantityUnitStock.name,
                }
              : null,
          }
        : null,
      quantityUnit: quantityUnit
        ? {
            id: quantityUnit.id,
            name: quantityUnit.name,
          }
        : null,
    };
  }

  private async enrichShoppingListResponse(data: any): Promise<any> {
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return data;
      }

      const { productsById, quantityUnitsById } = await this.getResolvedShoppingMetadata();
      return data.map((item) => this.enrichShoppingListItem(item, productsById, quantityUnitsById));
    }

    if (data && typeof data === 'object') {
      const hasShoppingFields = 'product_id' in data || 'qu_id' in data;
      if (!hasShoppingFields) {
        return data;
      }

      const { productsById, quantityUnitsById } = await this.getResolvedShoppingMetadata();
      return this.enrichShoppingListItem(data, productsById, quantityUnitsById);
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
      notes: description ?? null,
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
      const { shoppingListId, name, notes } = args || {};
      this.validateRequired({ shoppingListId }, ['shoppingListId']);

      const existingList = await this.apiCall(`/objects/shopping_lists/${shoppingListId}`);
      if (!existingList) {
        throw new Error(`Shopping list ${shoppingListId} not found`);
      }

      const body = {
        ...existingList,
      };

      if (name !== undefined) body.name = name;
      if (notes !== undefined) {
        body.description = notes;
      }

      const result = await this.apiCall(`/objects/shopping_lists/${shoppingListId}`, 'PUT', body);
      return this.createSuccess(
        this.normalizeShoppingListsResponse(result),
        'Shopping list updated successfully',
      );
    });
  };

  public addShoppingListItem: ToolHandler = async (
    args: any,
    subConfigs?: Map<string, any>,
  ): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId, amount = 0, shoppingListId = 1, note = '' } = args || {};

      let effectiveSubConfigs = subConfigs;
      if (!effectiveSubConfigs) {
        try {
          const { config } = await import('../../config/index.js');
          const { toolSubConfigs } = config.parseToolConfiguration();
          effectiveSubConfigs = toolSubConfigs?.get('shopping_list_add_item');
        } catch {
          // Ignore error if config cannot be parsed
        }
      }

      const allowNoteOnly = effectiveSubConfigs?.get('allow_note_only') ?? true;

      const numProductId =
        productId !== undefined && productId !== null ? Number(productId) : undefined;

      if (!allowNoteOnly) {
        if (
          numProductId === undefined ||
          Number.isNaN(numProductId) ||
          !Number.isInteger(numProductId) ||
          numProductId <= 0
        ) {
          throw new ValidationError(
            'productId is required and must be a positive integer ID of an existing product when allow_note_only is false. Standalone notes or note-only shopping list rows are disabled. If the requested item does not exist in Grocy, inform the user that it must be added to inventory first.',
            'shopping_list_add_item',
          );
        }
      } else if (numProductId !== undefined) {
        if (Number.isNaN(numProductId) || !Number.isInteger(numProductId) || numProductId <= 0) {
          throw new ValidationError(
            'productId must be a valid positive integer',
            'shopping_list_add_item',
          );
        }
      }

      if (numProductId === undefined && !note) {
        throw new Error('Either productId or note must be provided');
      }

      if (numProductId !== undefined) {
        try {
          const product = await this.apiCall(`/objects/products/${numProductId}`);
          if (!product || !product.id) {
            throw new ValidationError(
              `Product ${numProductId} does not exist in Grocy. All shopping list rows must correspond to an existing product. If the item is not in Grocy inventory, inform the user that it must be created as a product first.`,
              'shopping_list_add_item',
            );
          }
        } catch (err: any) {
          if (err instanceof ValidationError) throw err;
          throw new ValidationError(
            `Product ${numProductId} does not exist in Grocy. All shopping list rows must correspond to an existing product. If the item is not in Grocy inventory, inform the user that it must be created as a product first.`,
            'shopping_list_add_item',
          );
        }
      }

      const body: any = {
        amount,
        shopping_list_id: shoppingListId,
        note,
      };

      if (numProductId !== undefined) {
        body.product_id = numProductId;
      }

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

      // Grocy's PUT is a partial update; send only the changed columns (the GET adds a
      // `userfields` key that is not a column and would fail the update)
      const body: Record<string, unknown> = {};

      if (productId !== undefined) {
        const numProductId = productId === null ? NaN : Number(productId);
        if (Number.isNaN(numProductId) || !Number.isInteger(numProductId) || numProductId <= 0) {
          throw new ValidationError(
            'productId must be a valid positive integer ID of an existing product',
            'shopping_list_update_item',
          );
        }
        let product: any;
        try {
          product = await this.apiCall(`/objects/products/${numProductId}`);
        } catch {
          product = undefined;
        }
        if (!product || !product.id) {
          throw new ValidationError(
            `Product ${numProductId} does not exist in Grocy. All shopping list rows must correspond to an existing product. If the item is not in Grocy inventory, inform the user that it must be created as a product first.`,
            'shopping_list_update_item',
          );
        }
        if (Number(existingItem.product_id) !== numProductId) {
          // amount is stored in the stock unit; the old product's display unit may not apply
          body.qu_id = product.qu_id_stock;
        }
        body.product_id = numProductId;
      }
      if (amount !== undefined) body.amount = amount;
      if (shoppingListId !== undefined) body.shopping_list_id = shoppingListId;
      if (note !== undefined) body.note = note;

      await this.apiCall(`/objects/shopping_list/${shoppingListItemId}`, 'PUT', body);
      // The PUT answers 204 with no body; read the row back to return it
      const updated = await this.apiCall(`/objects/shopping_list/${shoppingListItemId}`);
      const enriched = await this.enrichShoppingListResponse(updated);
      return this.createSuccess(enriched, 'Shopping list item updated successfully');
    });
  };

  public printShoppingListThermal: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { shoppingListId } = args || {};
      // Grocy reads the list id from the `list` query parameter (default 1).
      const queryParams: Record<string, string> =
        shoppingListId !== undefined ? { list: String(shoppingListId) } : {};
      const result = await this.apiCall('/print/shoppinglist/thermal', 'GET', undefined, {
        queryParams,
      });
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

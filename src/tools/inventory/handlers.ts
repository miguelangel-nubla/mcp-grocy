import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';
import Fuse from 'fuse.js';

export class InventoryToolHandlers extends BaseToolHandler {
  // ==================== PRODUCT MANAGEMENT ====================
  
  public getProducts: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { fields } = args || {};
      
      // Validate required parameters
      this.validateRequired({ fields }, ['fields']);
      const fieldList = this.parseArrayParam(fields, 'fields');

      // Fetch products
      const products = await this.apiCall('/objects/products');

      if (!Array.isArray(products)) {
        return this.createSuccess([]);
      }

      // Filter to only include requested fields
      const filteredProducts = this.filterFields(products, fieldList);
      return this.createSuccess(filteredProducts);
    });
  };

  public getProductGroups: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/objects/product_groups');
      return this.createSuccess(data);
    });
  };

  public getPriceHistory: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId } = args || {};
      this.validateRequired({ productId }, ['productId']);
      
      const data = await this.apiCall(`/stock/products/${productId}/price-history`);
      return this.createSuccess(data);
    });
  };

  // ==================== STOCK QUERIES ====================

  public getAllStock: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/stock');
      return this.createSuccess(data);
    });
  };

  public getStockByProduct: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId } = args || {};
      this.validateRequired({ productId }, ['productId']);

      const stockEntries = await this.apiCall(`/stock/products/${productId}/entries`);

      // Define essential fields for stock entries
      const entryFields = [
        'id', 'amount', 'best_before_date', 'purchased_date', 
        'stock_id', 'note', 'location_id'
      ];
      
      // Filter entries to only include essential fields
      const filteredEntries = Array.isArray(stockEntries) 
        ? this.filterFields(stockEntries, entryFields)
        : [];

      return this.createSuccess(filteredEntries);
    });
  };

  public getStockVolatile: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const queryParams = args?.includeDetails ? { include_details: 'true' } : {};
      const data = await this.apiCall('/stock/volatile', 'GET', undefined, { queryParams });
      return this.createSuccess(data);
    });
  };

  public getStockByLocation: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { locationId } = args || {};
      this.validateRequired({ locationId }, ['locationId']);
      
      const data = await this.apiCall(`stock`, 'GET', undefined, {
        queryParams: { 'query[]': `location_id=${locationId}` }
      });
      return this.createSuccess(data);
    });
  };

  // ==================== STOCK TRANSACTIONS ====================

  public purchaseProduct: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId, amount, bestBeforeDate, price, locationId, note } = args || {};
      this.validateRequired({ productId, amount }, ['productId', 'amount']);

      const body: any = { amount };
      if (bestBeforeDate) body.best_before_date = bestBeforeDate;
      if (price !== undefined) body.price = price;
      if (locationId) body.location_id = locationId;
      if (note) body.note = note;

      const result = await this.apiCall(`/stock/products/${productId}/add`, 'POST', body);
      return this.createSuccess(result, 'Product purchased successfully');
    });
  };

  public consumeProduct: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId, amount, spoiled = false, locationId, note } = args || {};
      this.validateRequired({ productId, amount }, ['productId', 'amount']);

      const body: any = { 
        amount,
        transaction_type: spoiled ? 'inventory-correction' : 'consume'
      };
      if (locationId) body.location_id = locationId;
      if (note) body.note = note;
      if (spoiled) body.spoiled = true;

      const result = await this.apiCall(`/stock/products/${productId}/consume`, 'POST', body);
      return this.createSuccess(result, 'Product consumed successfully');
    });
  };

  public transferProduct: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId, amount, fromLocationId, toLocationId, note } = args || {};
      this.validateRequired(
        { productId, amount, fromLocationId, toLocationId }, 
        ['productId', 'amount', 'fromLocationId', 'toLocationId']
      );

      const body: any = {
        amount,
        location_id_from: fromLocationId,
        location_id_to: toLocationId
      };
      if (note) body.note = note;

      const result = await this.apiCall(`/stock/products/${productId}/transfer`, 'POST', body);
      return this.createSuccess(result, 'Product transferred successfully');
    });
  };

  public inventoryProduct: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId, newAmount, bestBeforeDate, locationId, note } = args || {};
      this.validateRequired({ productId, newAmount }, ['productId', 'newAmount']);

      const body: any = { new_amount: newAmount };
      if (bestBeforeDate) body.best_before_date = bestBeforeDate;
      if (locationId) body.location_id = locationId;
      if (note) body.note = note;

      const result = await this.apiCall(`/stock/products/${productId}/inventory`, 'POST', body);
      return this.createSuccess(result, 'Product inventory updated successfully');
    });
  };

  public openProduct: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId, amount = 1, note } = args || {};
      this.validateRequired({ productId }, ['productId']);

      const body: any = { amount };
      if (note) body.note = note;

      const result = await this.apiCall(`/stock/products/${productId}/open`, 'POST', body);
      return this.createSuccess(result, 'Product opened successfully');
    });
  };

  public lookupProduct: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productName } = args || {};
      this.validateRequired({ productName }, ['productName']);

      const [productsResponse, locationsResponse, quantityUnitsResponse] = await Promise.all([
        this.apiCall('/objects/products'),
        this.apiCall('/objects/locations'),
        this.apiCall('/objects/quantity_units')
      ]);

      const products = Array.isArray(productsResponse) ? productsResponse : [];
      const locations = Array.isArray(locationsResponse) ? locationsResponse : [];
      const quantityUnits = Array.isArray(quantityUnitsResponse) ? quantityUnitsResponse : [];

      const fuseOptions = {
        keys: [
          { name: 'name', weight: 1.0 },
          { name: 'description', weight: 0.3 }
        ],
        threshold: 0.6,
        distance: 100,
        minMatchCharLength: 1,
        ignoreLocation: true,
        includeScore: true,
        includeMatches: true,
        useExtendedSearch: false,
        isCaseSensitive: false,
        shouldSort: true,
        findAllMatches: false
      };

      const fuse = new Fuse(products, fuseOptions);
      const fuseResults = fuse.search(productName);

      let productMatches = fuseResults.map((result: any) => ({
        ...result.item,
        matchScore: Math.round((1 - result.score) * 100),
        fuseScore: result.score,
        matches: result.matches
      }));

      if (productMatches.length === 0) {
        const permissiveFuse = new Fuse(products, {
          ...fuseOptions,
          threshold: 0.8,
          distance: 200
        });
        const permissiveResults = permissiveFuse.search(productName);
        productMatches = permissiveResults.map((result: any) => ({
          ...result.item,
          matchScore: Math.round((1 - result.score) * 100),
          fuseScore: result.score,
          matches: result.matches,
          isPermissiveMatch: true
        }));
      }

      productMatches = productMatches.slice(0, 5);

      if (productMatches.length === 0) {
        return this.createError(`No products found matching "${productName}"`, {
          suggestion: 'Try a different product name or check the spelling',
          availableProducts: products.slice(0, 10).map((p: any) => p.name)
        });
      }

      const enrichedMatches = await Promise.all(productMatches.map(async (product: any) => {
        let productEntries: any[] = [];
        try {
          productEntries = await this.apiCall(`/stock/products/${product.id}/entries`);
          productEntries = Array.isArray(productEntries) ? productEntries : [];
        } catch {
          productEntries = [];
        }

        const stockEntries = productEntries.map((stockItem: any) => {
          return {
            amount: stockItem.amount,
            bestBeforeDate: stockItem.best_before_date,
            stockId: stockItem.id,
            locationId: parseInt(stockItem.location_id)
          };
        });

        stockEntries.sort((a: any, b: any) => {
          if (!a.bestBeforeDate && !b.bestBeforeDate) return 0;
          if (!a.bestBeforeDate) return 1;
          if (!b.bestBeforeDate) return -1;
          return new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime();
        });

        const unit = quantityUnits.find((u: any) => u.id == product.qu_id_stock);
        const unitInfo = unit 
          ? { id: unit.id, name: unit.name }
          : { id: null, name: 'pieces' };

        const hasMultipleLocations = stockEntries.length > 1 && 
          new Set(stockEntries.map((entry: any) => entry.locationId)).size > 1;

        const locationInstructions = hasMultipleLocations 
          ? 'IMPORTANT: This product has stock in multiple locations. Make sure the user requested a specific location or confirm the locationId before performing any operations.'
          : undefined;

        return {
          productId: product.id,
          productName: product.name,
          stockEntries: stockEntries,
          totalStockAmount: productEntries.reduce((sum: number, s: any) => sum + parseFloat(s.amount || 0), 0),
          unit: unitInfo,
          locationInstructions
        };
      }));

      return this.createSuccess({
        message: `Found ${enrichedMatches.length} product matches for "${productName}" (ordered from most likely to least likely match)`,
        productMatches: enrichedMatches,
        allAvailableLocations: locations.map((l: any) => ({ id: l.id, name: l.name })),
        instructions: 'Review the matches above. Use the exact productId and locationId from this data for any product operations (consume_product, purchase_product, inventory_product, transfer_product, etc.).'
      });
    });
  };

  public printProductLabel: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId } = args || {};
      this.validateRequired({ productId }, ['productId']);

      const result = await this.apiCall(`/stock/products/${productId}/printlabel`);
      return this.createSuccess(result, 'Product label printed successfully');
    });
  };

  public printStockEntryLabel: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { stockId, productId } = args || {};
      this.validateRequired({ stockId, productId }, ['stockId', 'productId']);

      const stockEntryResponse = await this.apiCall(`/stock/entry/${stockId}`);
      if (!stockEntryResponse || !stockEntryResponse.product_id) {
        throw new Error(`Could not resolve product ID from stock entry ${stockId}`);
      }

      if (stockEntryResponse.product_id !== productId) {
        throw new Error(`Product ID mismatch: stock entry ${stockId} belongs to product ${stockEntryResponse.product_id}, but ${productId} was provided`);
      }

      const result = await this.apiCall(`/stock/entry/${stockId}/printlabel`);
      return this.createSuccess(result, 'Stock entry label printed successfully');
    });
  };

  // ==================== GRANULAR STOCK ENTRY OPERATIONS ====================

  public async splitStockEntry(
    originalEntry: any,
    stockAmounts: number[],
    getUnitForm: (amount: number) => string
  ): Promise<{ stockId: any; amount: number; type: string; unit: string }[]> {
    const splitEntries: { stockId: any; amount: number; type: string; unit: string }[] = [];

    if (stockAmounts.length === 1) {
      const amount = stockAmounts[0];
      if (typeof amount !== 'number' || amount <= 0) {
        throw new Error(`Invalid amount: ${amount}`);
      }
      const note = `${originalEntry.note || ''} - ${originalEntry.id} - 1`;
      await this.apiCall(`/stock/entry/${originalEntry.id}`, 'PUT', {
        amount: amount,
        open: false,
        note: note,
        best_before_date: originalEntry.best_before_date,
        purchased_date: originalEntry.purchased_date,
        location_id: originalEntry.location_id
      });
      splitEntries.push({
        stockId: originalEntry.id,
        amount: amount,
        type: 'updated',
        unit: getUnitForm(amount)
      });
    } else {
      for (let i = 0; i < stockAmounts.length; i++) {
        const amount = stockAmounts[i];
        if (typeof amount !== 'number' || amount <= 0) {
          throw new Error(`Invalid amount at index ${i}: ${amount}`);
        }
        const note = `${originalEntry.note || ''} - ${originalEntry.id} - ${i + 1}`;

        if (i === 0) {
          await this.apiCall(`/stock/entry/${originalEntry.id}`, 'PUT', {
            amount: amount,
            open: false,
            note: note,
            best_before_date: originalEntry.best_before_date,
            purchased_date: originalEntry.purchased_date,
            location_id: originalEntry.location_id
          });
          splitEntries.push({
            stockId: originalEntry.id,
            amount,
            type: 'updated',
            unit: getUnitForm(amount)
          });
        } else {
          const createResponse = await this.apiCall(`/stock/products/${originalEntry.product_id}/add`, 'POST', {
            amount,
            best_before_date: originalEntry.best_before_date,
            purchased_date: originalEntry.purchased_date,
            transaction_type: 'purchase',
            location_id: originalEntry.location_id,
            note: note
          });

          const stockId = createResponse[0].stock_id || createResponse[0].id;
          const stockResponse = await this.apiCall('/objects/stock');
          const stockEntries = Array.isArray(stockResponse) ? stockResponse : [];

          const actualStockEntry = stockEntries.find((entry: any) =>
            entry.product_id === originalEntry.product_id &&
            entry.stock_id === stockId
          );

          if (!actualStockEntry) {
            throw new Error(`Could not find created stock entry with product_id ${originalEntry.product_id} and stock_id ${stockId}`);
          }

          splitEntries.push({
            stockId: actualStockEntry.id,
            amount,
            type: 'created',
            unit: getUnitForm(amount)
          });
        }
      }
    }

    return splitEntries;
  }

  public consumeStockEntry: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { stockId, productId, amount, spoiled = false, note } = args || {};
      this.validateRequired({ stockId, productId, amount }, ['stockId', 'productId', 'amount']);

      const stockEntryResponse = await this.apiCall(`/stock/entry/${stockId}`);
      if (!stockEntryResponse || !stockEntryResponse.product_id) {
        throw new Error(`Could not resolve product ID from stock entry ${stockId}`);
      }

      if (stockEntryResponse.product_id !== productId) {
        throw new Error(`Product ID mismatch: stock entry ${stockId} belongs to product ${stockEntryResponse.product_id}, but ${productId} was provided`);
      }

      const body: any = {
        amount,
        spoiled,
        stock_entry_id: stockEntryResponse.stock_id,
        location_id: stockEntryResponse.location_id
      };

      if (note) body.note = note;

      const result = await this.apiCall(`/stock/products/${stockEntryResponse.product_id}/consume`, 'POST', body);
      return this.createSuccess(result, 'Stock entry consumed successfully');
    });
  };

  public transferStockEntry: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { stockId, productId, amount, locationIdTo, note } = args || {};
      this.validateRequired({ stockId, productId, amount, locationIdTo }, ['stockId', 'productId', 'amount', 'locationIdTo']);

      const stockEntryResponse = await this.apiCall(`/stock/entry/${stockId}`);
      if (!stockEntryResponse || !stockEntryResponse.product_id) {
        throw new Error(`Could not resolve product ID from stock entry ${stockId}`);
      }

      if (stockEntryResponse.product_id !== productId) {
        throw new Error(`Product ID mismatch: stock entry ${stockId} belongs to product ${stockEntryResponse.product_id}, but ${productId} was provided`);
      }

      const body: any = {
        amount,
        location_id_from: stockEntryResponse.location_id,
        location_id_to: locationIdTo,
        transaction_type: 'transfer',
        stock_entry_id: stockEntryResponse.stock_id
      };

      if (note) body.note = note;

      const result = await this.apiCall(`/stock/products/${stockEntryResponse.product_id}/transfer`, 'POST', body);
      return this.createSuccess(result, 'Stock entry transferred successfully');
    });
  };

  public openStockEntry: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { stockId, productId, amount, note } = args || {};
      this.validateRequired({ stockId, productId, amount }, ['stockId', 'productId', 'amount']);

      const stockEntryResponse = await this.apiCall(`/stock/entry/${stockId}`);
      if (!stockEntryResponse || !stockEntryResponse.product_id) {
        throw new Error(`Could not resolve product ID from stock entry ${stockId}`);
      }

      if (stockEntryResponse.product_id !== productId) {
        throw new Error(`Product ID mismatch: stock entry ${stockId} belongs to product ${stockEntryResponse.product_id}, but ${productId} was provided`);
      }

      const body: any = {
        amount,
        stock_entry_id: stockEntryResponse.stock_id,
        location_id: stockEntryResponse.location_id
      };
      if (note) body.note = note;

      const result = await this.apiCall(`/stock/products/${stockEntryResponse.product_id}/open`, 'POST', body);
      return this.createSuccess(result, 'Stock entry opened successfully');
    });
  };
}
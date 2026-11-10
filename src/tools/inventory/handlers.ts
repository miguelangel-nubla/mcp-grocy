import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';
import { ValidationError } from '../../utils/errors.js';
import { config } from '../../config/index.js';
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
        'id',
        'amount',
        'best_before_date',
        'purchased_date',
        'stock_id',
        'note',
        'location_id',
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
      const { dueSoonDays } = args || {};
      const queryParams: Record<string, string> = {};
      if (dueSoonDays !== undefined && dueSoonDays !== null) {
        // Grocy ignores 0/empty due_soon_days (falls back to 5), so reject them here
        if (typeof dueSoonDays !== 'number' || !Number.isInteger(dueSoonDays) || dueSoonDays < 1) {
          throw new ValidationError('dueSoonDays must be a positive integer', 'getStockVolatile');
        }
        queryParams.due_soon_days = String(dueSoonDays);
      }
      const data = await this.apiCall('/stock/volatile', 'GET', undefined, { queryParams });
      return this.createSuccess(data);
    });
  };

  public getStockByLocation: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { locationId } = args || {};
      this.validateRequired({ locationId }, ['locationId']);

      // GET /stock returns one aggregated row per product (no location_id), so use the
      // dedicated location entries endpoint and enrich with product names
      const [stockEntries, productsResponse] = await Promise.all([
        this.apiCall(`/stock/locations/${locationId}/entries`),
        this.apiCall('/objects/products').catch(() => []),
      ]);

      const productsById = new Map<number, string>(
        (Array.isArray(productsResponse) ? productsResponse : [])
          .filter((p: any) => p && p.id !== undefined && p.id !== null && p.name)
          .map((p: any) => [Number(p.id), String(p.name)]),
      );

      const entryFields = [
        'id',
        'product_id',
        'amount',
        'best_before_date',
        'purchased_date',
        'stock_id',
        'open',
        'note',
      ];

      const filteredEntries = Array.isArray(stockEntries)
        ? this.filterFields(stockEntries, entryFields).map((entry: any) => {
            const productName = productsById.get(Number(entry.product_id));
            return {
              ...entry,
              ...(productName !== undefined ? { product_name: productName } : {}),
              note:
                typeof entry.note === 'string' && entry.note.startsWith('receipt:')
                  ? null
                  : entry.note,
            };
          })
        : [];

      return this.createSuccess(filteredEntries);
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
      const { productId, amount, spoiled = false, locationId } = args || {};
      this.validateRequired({ productId, amount }, ['productId', 'amount']);

      const body: any = { amount, transaction_type: 'consume' };
      if (locationId) body.location_id = locationId;
      if (spoiled) body.spoiled = true;

      const result = await this.apiCall(`/stock/products/${productId}/consume`, 'POST', body);
      return this.createSuccess(this.summarizeConsume(result), 'Product consumed successfully');
    });
  };

  public transferProduct: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productId, amount, fromLocationId, toLocationId } = args || {};
      this.validateRequired({ productId, amount, fromLocationId, toLocationId }, [
        'productId',
        'amount',
        'fromLocationId',
        'toLocationId',
      ]);

      const body: any = {
        amount,
        location_id_from: fromLocationId,
        location_id_to: toLocationId,
      };

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
      const { productId, amount = 1 } = args || {};
      this.validateRequired({ productId }, ['productId']);

      const body: any = { amount };

      const result = await this.apiCall(`/stock/products/${productId}/open`, 'POST', body);
      return this.createSuccess(result, 'Product opened successfully');
    });
  };

  /**
   * Grocy answers a consume with the full stock_log rows it wrote (one per lot, ~20 columns each,
   * including receipt notes and prices). Reduce them to what an agent needs to confirm or undo.
   */
  private summarizeConsume(result: any): any {
    if (!Array.isArray(result)) return result;
    const consumed = result.reduce((sum: number, row: any) => sum - parseFloat(row.amount || 0), 0);
    return {
      productId: result[0]?.product_id,
      consumedAmount: Math.round(consumed * 10000) / 10000,
      spoiled: result.some((row: any) => row.spoiled == 1),
      transactionIds: [...new Set(result.map((row: any) => row.transaction_id))],
      lots: result.map((row: any) => ({
        amount: -parseFloat(row.amount),
        bestBeforeDate: row.best_before_date,
        locationId: row.location_id,
      })),
    };
  }

  public lookupProduct: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { productName } = args || {};
      this.validateRequired({ productName }, ['productName']);

      const [productsResponse, locationsResponse, quantityUnitsResponse] = await Promise.all([
        this.apiCall('/objects/products'),
        this.apiCall('/objects/locations'),
        this.apiCall('/objects/quantity_units'),
      ]);

      const products = Array.isArray(productsResponse) ? productsResponse : [];
      const locations = Array.isArray(locationsResponse) ? locationsResponse : [];
      const quantityUnits = Array.isArray(quantityUnitsResponse) ? quantityUnitsResponse : [];

      const fuseOptions = {
        keys: [
          { name: 'name', weight: 1.0 },
          { name: 'description', weight: 0.3 },
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
        findAllMatches: false,
      };

      const fuse = new Fuse(products, fuseOptions);
      const fuseResults = fuse.search(productName);

      let productMatches = fuseResults.map((result: any) => ({
        ...result.item,
        matchScore: Math.round((1 - result.score) * 100),
        fuseScore: result.score,
        matches: result.matches,
      }));

      if (productMatches.length === 0) {
        const permissiveFuse = new Fuse(products, {
          ...fuseOptions,
          threshold: 0.8,
          distance: 200,
        });
        const permissiveResults = permissiveFuse.search(productName);
        productMatches = permissiveResults.map((result: any) => ({
          ...result.item,
          matchScore: Math.round((1 - result.score) * 100),
          fuseScore: result.score,
          matches: result.matches,
          isPermissiveMatch: true,
        }));
      }

      // Fuse ignores location, so "pera" scores as well inside "Emperador" as in "Peras".
      // Rank exact names, then word-start matches, then substrings, then close phonetic/typo
      // word matches (e.g. STT "mambo" -> "- Mango") ahead of weak fuzzy hits.
      const normalize = (text: string) =>
        String(text ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();

      const levenshtein = (a: string, b: string): number => {
        if (a === b) return 0;
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
        const curr = new Array<number>(b.length + 1).fill(0);
        for (let i = 1; i <= a.length; i++) {
          curr[0] = i;
          for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
          }
          for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
        }
        return prev[b.length]!;
      };

      const query = normalize(productName);
      const queryWords = query ? query.split(' ') : [];

      const minWordEditRatio = (normalizedName: string): number => {
        if (!query || !normalizedName) return 1;
        const fullDist = levenshtein(query, normalizedName);
        const fullFirstCharPenalty = query[0] !== normalizedName[0] ? 0.5 : 0;
        let bestRatio =
          (fullDist + fullFirstCharPenalty) / Math.max(query.length, normalizedName.length, 1);
        const nameWords = normalizedName.split(' ');
        for (const qWord of queryWords) {
          if (qWord.length < 3) continue;
          for (const nWord of nameWords) {
            if (!nWord) continue;
            const dist = levenshtein(qWord, nWord);
            const firstCharPenalty = qWord[0] !== nWord[0] ? 0.5 : 0;
            const ratio = (dist + firstCharPenalty) / Math.max(qWord.length, nWord.length, 1);
            if (ratio < bestRatio) bestRatio = ratio;
          }
        }
        return bestRatio;
      };

      const matchTier = (name: string) => {
        const normalizedName = normalize(name);
        if (!query) return 4;
        if (normalizedName === query) return 0;
        if (` ${normalizedName}`.includes(` ${query}`)) return 1;
        if (normalizedName.includes(query)) return 2;
        if (minWordEditRatio(normalizedName) <= 0.34) return 3;
        return 4;
      };

      // Also include close edit-distance candidates that Fuse's bitap might have missed or
      // scored poorly due to leading punctuation (e.g. "- Mango" for "mambo")
      if (query.length >= 3) {
        const matchedIds = new Set(productMatches.map((m: any) => m.id));
        for (const product of products) {
          if (matchedIds.has(product.id)) continue;
          const ratio = minWordEditRatio(normalize(product.name));
          if (ratio <= 0.34) {
            productMatches.push({
              ...product,
              matchScore: Math.round((1 - ratio) * 100),
              fuseScore: ratio,
              matches: [],
            });
          }
        }
      }

      productMatches = productMatches
        .map((match: any) => {
          const normalizedName = normalize(match.name);
          return {
            match,
            tier: matchTier(match.name),
            editRatio: minWordEditRatio(normalizedName),
            wordCount: normalizedName ? normalizedName.split(' ').length : 99,
          };
        })
        .sort(
          (a: any, b: any) =>
            a.tier - b.tier ||
            a.editRatio - b.editRatio ||
            a.wordCount - b.wordCount ||
            a.match.fuseScore - b.match.fuseScore,
        )
        .map(({ match }: any) => match)
        .slice(0, 5);

      if (productMatches.length === 0) {
        return this.createError(`No products found matching "${productName}"`, {
          suggestion: 'Try a different product name or check the spelling',
          availableProducts: products.slice(0, 10).map((p: any) => p.name),
        });
      }

      const enrichedMatches = await Promise.all(
        productMatches.map(async (product: any) => {
          let productEntries: any[];
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
              locationId: parseInt(stockItem.location_id),
            };
          });

          stockEntries.sort((a: any, b: any) => {
            if (!a.bestBeforeDate && !b.bestBeforeDate) return 0;
            if (!a.bestBeforeDate) return 1;
            if (!b.bestBeforeDate) return -1;
            return new Date(a.bestBeforeDate).getTime() - new Date(b.bestBeforeDate).getTime();
          });

          const unit = quantityUnits.find((u: any) => u.id == product.qu_id_stock);
          const unitInfo = unit ? { id: unit.id, name: unit.name } : { id: null, name: 'pieces' };

          const hasMultipleLocations =
            stockEntries.length > 1 &&
            new Set(stockEntries.map((entry: any) => entry.locationId)).size > 1;

          const locationInstructions = hasMultipleLocations
            ? 'IMPORTANT: This product has stock in multiple locations. Make sure the user requested a specific location or confirm the locationId before performing any operations.'
            : undefined;

          const defaultLocationId =
            product.location_id !== undefined && product.location_id !== null
              ? Number(product.location_id)
              : null;

          return {
            productId: product.id,
            productName: product.name,
            defaultLocationId,
            stockEntries: stockEntries,
            totalStockAmount: productEntries.reduce(
              (sum: number, s: any) => sum + parseFloat(s.amount || 0),
              0,
            ),
            unit: unitInfo,
            locationInstructions,
          };
        }),
      );

      const referencedLocationIds = new Set<number>();
      for (const product of productMatches) {
        if (product.location_id !== undefined && product.location_id !== null) {
          referencedLocationIds.add(Number(product.location_id));
        }
        if (
          product.default_consume_location_id !== undefined &&
          product.default_consume_location_id !== null
        ) {
          referencedLocationIds.add(Number(product.default_consume_location_id));
        }
      }
      for (const match of enrichedMatches) {
        for (const entry of match.stockEntries) {
          if (Number.isFinite(entry.locationId)) {
            referencedLocationIds.add(entry.locationId);
          }
        }
      }

      const relevantLocations =
        referencedLocationIds.size > 0
          ? locations.filter((l: any) => referencedLocationIds.has(Number(l.id)))
          : locations;

      let enabledTools = new Set<string>();
      try {
        enabledTools = config.parseToolConfiguration().enabledTools;
      } catch {
        // Fallback when configuration is unavailable
      }

      const candidateOpTools = [
        'inventory_transactions_consume',
        'inventory_stock_entry_consume',
        'inventory_stock_entry_transfer',
        'inventory_stock_entry_open',
        'inventory_transactions_purchase',
        'inventory_transactions_adjust',
        'inventory_transactions_transfer',
        'inventory_transactions_open',
      ];
      const availableOpTools =
        enabledTools.size > 0
          ? candidateOpTools.filter((t) => enabledTools.has(t))
          : [
              'inventory_transactions_consume',
              'inventory_stock_entry_consume',
              'inventory_stock_entry_transfer',
              'inventory_transactions_purchase',
              'inventory_transactions_adjust',
            ];

      const opListSuffix = availableOpTools.length > 0 ? ` (${availableOpTools.join(', ')})` : '';
      const locationLookupHint =
        enabledTools.size === 0 || enabledTools.has('system_locations_get')
          ? ' For other storage locations not in referencedLocations, call system_locations_get.'
          : '';

      return this.createSuccess({
        message: `Found ${enrichedMatches.length} product matches for "${productName}" (ordered from most likely to least likely match)`,
        productMatches: enrichedMatches,
        referencedLocations: relevantLocations.map((l: any) => ({ id: l.id, name: l.name })),
        instructions: `Review the matches above. Use the exact productId, stockId, and locationId from this data for any product operations${opListSuffix}.${locationLookupHint}`,
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
        throw new ValidationError(
          `Could not resolve product ID from stock entry ${stockId}`,
          'printStockEntryLabel',
        );
      }

      if (stockEntryResponse.product_id !== productId) {
        throw new ValidationError(
          `Product ID mismatch: stock entry ${stockId} belongs to product ${stockEntryResponse.product_id}, but ${productId} was provided`,
          'printStockEntryLabel',
        );
      }

      const result = await this.apiCall(`/stock/entry/${stockId}/printlabel`);
      return this.createSuccess(result, 'Stock entry label printed successfully');
    });
  };

  // ==================== GRANULAR STOCK ENTRY OPERATIONS ====================

  public async splitStockEntry(
    originalEntry: any,
    stockAmounts: number[],
    getUnitForm: (amount: number) => string,
  ): Promise<{ stockId: any; amount: number; type: string; unit: string }[]> {
    const splitEntries: { stockId: any; amount: number; type: string; unit: string }[] = [];

    // Validate every amount and their total before any write, so a bad input never leaves
    // the lot half-split
    stockAmounts.forEach((amount, i) => {
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError(
          stockAmounts.length === 1
            ? `Invalid amount: ${amount}`
            : `Invalid amount at index ${i}: ${amount}`,
          'splitStockEntry',
        );
      }
    });
    const total = stockAmounts.reduce((sum, a) => sum + a, 0);
    const originalAmount = Number(originalEntry.amount);
    if (
      originalEntry.amount !== undefined &&
      originalEntry.amount !== null &&
      Number.isFinite(originalAmount) &&
      Math.abs(total - originalAmount) > 1e-6
    ) {
      throw new ValidationError(
        `stockAmounts add up to ${total} but stock entry ${originalEntry.id} holds ${originalAmount}; they must match`,
        'splitStockEntry',
      );
    }

    // Grocy's PUT /stock/entry/{id} nulls price and shopping_location_id when omitted and
    // sets open from the body, so carry the lot's own values over
    const lotFields = {
      ...(originalEntry.price !== undefined && originalEntry.price !== null
        ? { price: originalEntry.price }
        : {}),
      ...(originalEntry.shopping_location_id !== undefined &&
      originalEntry.shopping_location_id !== null
        ? { shopping_location_id: originalEntry.shopping_location_id }
        : {}),
    };
    const editBody = (amount: number, note: string) => ({
      amount,
      open: originalEntry.open == 1,
      note,
      best_before_date: originalEntry.best_before_date,
      purchased_date: originalEntry.purchased_date,
      location_id: originalEntry.location_id,
      ...lotFields,
    });

    if (stockAmounts.length === 1) {
      const amount = stockAmounts[0]!;
      const note = `${originalEntry.note || ''} - ${originalEntry.id} - 1`;
      await this.apiCall(`/stock/entry/${originalEntry.id}`, 'PUT', editBody(amount, note));
      splitEntries.push({
        stockId: originalEntry.id,
        amount: amount,
        type: 'updated',
        unit: getUnitForm(amount),
      });
    } else {
      for (let i = 0; i < stockAmounts.length; i++) {
        const amount = stockAmounts[i]!;
        const note = `${originalEntry.note || ''} - ${originalEntry.id} - ${i + 1}`;

        if (i === 0) {
          await this.apiCall(`/stock/entry/${originalEntry.id}`, 'PUT', editBody(amount, note));
          splitEntries.push({
            stockId: originalEntry.id,
            amount,
            type: 'updated',
            unit: getUnitForm(amount),
          });
        } else {
          const createResponse = await this.apiCall(
            `/stock/products/${originalEntry.product_id}/add`,
            'POST',
            {
              amount,
              best_before_date: originalEntry.best_before_date,
              purchased_date: originalEntry.purchased_date,
              // Not a real purchase: keep it out of price history and spending
              transaction_type: 'self-production',
              location_id: originalEntry.location_id,
              note: note,
              ...lotFields,
            },
          );

          const stockId = createResponse[0].stock_id || createResponse[0].id;
          const stockResponse = await this.apiCall('/objects/stock');
          const stockEntries = Array.isArray(stockResponse) ? stockResponse : [];

          const actualStockEntry = stockEntries.find(
            (entry: any) =>
              entry.product_id === originalEntry.product_id && entry.stock_id === stockId,
          );

          if (!actualStockEntry) {
            throw new ValidationError(
              `Could not find created stock entry with product_id ${originalEntry.product_id} and stock_id ${stockId}`,
              'splitStockEntry',
            );
          }

          splitEntries.push({
            stockId: actualStockEntry.id,
            amount,
            type: 'created',
            unit: getUnitForm(amount),
          });
        }
      }
    }

    return splitEntries;
  }

  public consumeStockEntry: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { stockId, productId, amount, spoiled = false } = args || {};
      this.validateRequired({ stockId, productId, amount }, ['stockId', 'productId', 'amount']);

      const stockEntryResponse = await this.apiCall(`/stock/entry/${stockId}`);
      if (!stockEntryResponse || !stockEntryResponse.product_id) {
        throw new ValidationError(
          `Could not resolve product ID from stock entry ${stockId}`,
          'consumeStockEntry',
        );
      }

      if (stockEntryResponse.product_id !== productId) {
        throw new ValidationError(
          `Product ID mismatch: stock entry ${stockId} belongs to product ${stockEntryResponse.product_id}, but ${productId} was provided`,
          'consumeStockEntry',
        );
      }

      const body: any = {
        amount,
        spoiled,
        stock_entry_id: stockEntryResponse.stock_id,
        location_id: stockEntryResponse.location_id,
      };

      const result = await this.apiCall(
        `/stock/products/${stockEntryResponse.product_id}/consume`,
        'POST',
        body,
      );
      return this.createSuccess(this.summarizeConsume(result), 'Stock entry consumed successfully');
    });
  };

  public transferStockEntry: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { stockId, productId, amount, locationIdTo } = args || {};
      this.validateRequired({ stockId, productId, amount, locationIdTo }, [
        'stockId',
        'productId',
        'amount',
        'locationIdTo',
      ]);

      const stockEntryResponse = await this.apiCall(`/stock/entry/${stockId}`);
      if (!stockEntryResponse || !stockEntryResponse.product_id) {
        throw new ValidationError(
          `Could not resolve product ID from stock entry ${stockId}`,
          'transferStockEntry',
        );
      }

      if (stockEntryResponse.product_id !== productId) {
        throw new ValidationError(
          `Product ID mismatch: stock entry ${stockId} belongs to product ${stockEntryResponse.product_id}, but ${productId} was provided`,
          'transferStockEntry',
        );
      }

      const body: any = {
        amount,
        location_id_from: stockEntryResponse.location_id,
        location_id_to: locationIdTo,
        transaction_type: 'transfer',
        stock_entry_id: stockEntryResponse.stock_id,
      };

      const result = await this.apiCall(
        `/stock/products/${stockEntryResponse.product_id}/transfer`,
        'POST',
        body,
      );
      return this.createSuccess(result, 'Stock entry transferred successfully');
    });
  };

  public openStockEntry: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { stockId, productId, amount } = args || {};
      this.validateRequired({ stockId, productId, amount }, ['stockId', 'productId', 'amount']);

      const stockEntryResponse = await this.apiCall(`/stock/entry/${stockId}`);
      if (!stockEntryResponse || !stockEntryResponse.product_id) {
        throw new ValidationError(
          `Could not resolve product ID from stock entry ${stockId}`,
          'openStockEntry',
        );
      }

      if (stockEntryResponse.product_id !== productId) {
        throw new ValidationError(
          `Product ID mismatch: stock entry ${stockId} belongs to product ${stockEntryResponse.product_id}, but ${productId} was provided`,
          'openStockEntry',
        );
      }

      const body: any = {
        amount,
        stock_entry_id: stockEntryResponse.stock_id,
        location_id: stockEntryResponse.location_id,
      };

      const result = await this.apiCall(
        `/stock/products/${stockEntryResponse.product_id}/open`,
        'POST',
        body,
      );
      return this.createSuccess(result, 'Stock entry opened successfully');
    });
  };
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InventoryToolHandlers } from './handlers.js';
import { inventoryToolDefinitions } from './definitions.js';

// Mock API client
vi.mock('../../api/client.js', () => ({
  default: {
    request: vi.fn(),
    get: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import apiClient from '../../api/client.js';
const mockApiClient = vi.mocked(apiClient);

describe('InventoryToolHandlers', () => {
  let handlers: InventoryToolHandlers;

  beforeEach(() => {
    handlers = new InventoryToolHandlers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllStock', () => {
    it('should call API with correct endpoint', async () => {
      const mockResponse = {
        data: [{ product_id: 1, amount: 10 }],
        status: 200,
        headers: {},
      };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const result = await handlers.getAllStock({});

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content).toHaveLength(1);
      expect(result.structuredContent?.data).toEqual(mockResponse.data);
    });
  });

  describe('getStockVolatile', () => {
    it('should call API without details by default', async () => {
      const mockResponse = { data: { expired: [], due: [] }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.getStockVolatile({});

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/volatile', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
    });

    it('should map dueSoonDays to due_soon_days', async () => {
      const mockResponse = { data: { expired: [], due: [] }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.getStockVolatile({ dueSoonDays: 14 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/volatile', {
        method: 'GET',
        body: undefined,
        queryParams: { due_soon_days: '14' },
      });
    });

    it('should reject non-positive or non-integer dueSoonDays without calling the API', async () => {
      for (const dueSoonDays of [0, -3, 2.5]) {
        const result = await handlers.getStockVolatile({ dueSoonDays });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('dueSoonDays must be a positive integer');
      }
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });
  });

  describe('getStockByLocation', () => {
    it('should call the location entries endpoint and return essential fields', async () => {
      mockApiClient.request.mockResolvedValue({
        data: [
          {
            id: 7,
            product_id: 42,
            location_id: 3,
            amount: 2,
            best_before_date: '2026-11-01',
            purchased_date: '2026-10-01',
            stock_id: 'abc',
            open: 0,
            note: null,
            price: 1.5,
            row_created_timestamp: '2026-10-01 10:00:00',
          },
        ],
        status: 200,
        headers: {},
      });

      const result = await handlers.getStockByLocation({ locationId: 3 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/locations/3/entries', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent?.data).toEqual([
        {
          id: 7,
          product_id: 42,
          amount: 2,
          best_before_date: '2026-11-01',
          purchased_date: '2026-10-01',
          stock_id: 'abc',
          open: 0,
          note: null,
        },
      ]);
    });

    it('should require locationId', async () => {
      const result = await handlers.getStockByLocation({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: locationId');
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });
  });

  describe('inventoryProduct', () => {
    it('should require productId and newAmount', async () => {
      const result1 = await handlers.inventoryProduct({});
      expect(result1.isError).toBe(true);
      expect(result1.content[0].text).toContain(
        'Missing required parameters: productId, newAmount',
      );

      const result2 = await handlers.inventoryProduct({ productId: 1 });
      expect(result2.isError).toBe(true);
      expect(result2.content[0].text).toContain('Missing required parameters: newAmount');

      const result3 = await handlers.inventoryProduct({ newAmount: 10 });
      expect(result3.isError).toBe(true);
      expect(result3.content[0].text).toContain('Missing required parameters: productId');
    });

    it('should make inventory request with required params', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const args = {
        productId: 1,
        newAmount: 15,
        locationId: 2,
        note: 'Inventory check',
      };

      await handlers.inventoryProduct(args);

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/inventory', {
        method: 'POST',
        body: expect.objectContaining({
          new_amount: 15,
          location_id: 2,
          note: 'Inventory check',
        }),
        queryParams: {},
      });
    });

    it('should use custom best before date when provided', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.inventoryProduct({
        productId: 1,
        newAmount: 10,
        bestBeforeDate: '2024-12-31',
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/inventory', {
        method: 'POST',
        body: expect.objectContaining({
          best_before_date: '2024-12-31',
        }),
        queryParams: {},
      });
    });
  });

  describe('purchaseProduct', () => {
    it('should require productId and amount', async () => {
      const result = await handlers.purchaseProduct({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: productId, amount');
    });

    it('should make purchase request with default params', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.purchaseProduct({ productId: 1, amount: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/add', {
        method: 'POST',
        body: expect.objectContaining({
          amount: 1,
        }),
        queryParams: {},
      });
    });

    it('should include optional parameters when provided', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const args = {
        productId: 1,
        amount: 3,
        price: 15.99,
        locationId: 3,
        note: 'Bulk purchase',
      };

      await handlers.purchaseProduct(args);

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/add', {
        method: 'POST',
        body: expect.objectContaining({
          amount: 3,
          price: 15.99,
          location_id: 3,
          note: 'Bulk purchase',
        }),
        queryParams: {},
      });
    });
  });

  describe('consumeProduct', () => {
    it('should require productId and amount', async () => {
      const result = await handlers.consumeProduct({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: productId, amount');
    });

    it('should make consume request with defaults', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.consumeProduct({ productId: 1, amount: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/consume', {
        method: 'POST',
        body: expect.objectContaining({
          amount: 1,
          transaction_type: 'consume',
        }),
        queryParams: {},
      });
    });

    it('should summarize the stock_log rows Grocy returns', async () => {
      const row = (amount: number, bbd: string) => ({
        id: 1,
        product_id: 61,
        amount,
        best_before_date: bbd,
        spoiled: 0,
        transaction_id: 'tx1',
        location_id: 2,
        price: 2.49,
        note: 'receipt:10|...',
      });
      mockApiClient.request.mockResolvedValue({
        data: [row(-0.3, '2026-10-21'), row(-2.7, '2026-10-24')],
        status: 200,
        headers: {},
      });

      const result = await handlers.consumeProduct({ productId: 61, amount: 3 });

      expect(result.structuredContent).toEqual({
        data: {
          productId: 61,
          consumedAmount: 3,
          spoiled: false,
          transactionIds: ['tx1'],
          lots: [
            { amount: 0.3, bestBeforeDate: '2026-10-21', locationId: 2 },
            { amount: 2.7, bestBeforeDate: '2026-10-24', locationId: 2 },
          ],
        },
      });
    });

    it('should handle spoiled products', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.consumeProduct({
        productId: 1,
        spoiled: true,
        amount: 2,
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/consume', {
        method: 'POST',
        body: expect.objectContaining({
          amount: 2,
          spoiled: true,
          transaction_type: 'consume',
        }),
        queryParams: {},
      });
    });
  });

  describe('transferProduct', () => {
    it('should require all location parameters', async () => {
      const result1 = await handlers.transferProduct({});
      expect(result1.isError).toBe(true);
      expect(result1.content[0].text).toContain('Missing required parameters');

      const result2 = await handlers.transferProduct({ productId: 1 });
      expect(result2.isError).toBe(true);
      expect(result2.content[0].text).toContain('Missing required parameters');

      const result3 = await handlers.transferProduct({
        productId: 1,
        fromLocationId: 1,
      });
      expect(result3.isError).toBe(true);
      expect(result3.content[0].text).toContain('Missing required parameters');
    });

    it('should make transfer request', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const args = {
        productId: 1,
        toLocationId: 3,
        fromLocationId: 2,
        amount: 5,
      };

      await handlers.transferProduct(args);

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/transfer', {
        method: 'POST',
        body: expect.objectContaining({
          amount: 5,
          location_id_from: 2,
          location_id_to: 3,
        }),
        queryParams: {},
      });
    });
  });

  describe('openProduct', () => {
    it('should require productId', async () => {
      const result = await handlers.openProduct({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: productId');
    });

    it('should make open request with defaults', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.openProduct({ productId: 5 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/5/open', {
        method: 'POST',
        body: expect.objectContaining({
          amount: 1,
        }),
        queryParams: {},
      });
    });

    it('should send only the amount (Grocy stores no note on open)', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.openProduct({ productId: 5, amount: 2, note: 'Opening for family dinner' });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/5/open', {
        method: 'POST',
        body: { amount: 2 },
        queryParams: {},
      });
    });
  });

  describe('getProducts', () => {
    it('should require fields parameter', async () => {
      const result = await handlers.getProducts({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: fields');
    });

    it('should filter products to requested fields', async () => {
      const mockResponse = {
        data: [
          { id: 1, name: 'Product 1', description: 'Desc 1', location_id: 1 },
          { id: 2, name: 'Product 2', description: 'Desc 2', location_id: 2 },
        ],
        status: 200,
        headers: {},
      };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const result = await handlers.getProducts({ fields: ['id', 'name'] });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/products', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('getStockByProduct', () => {
    it('should require productId', async () => {
      const result = await handlers.getStockByProduct({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: productId');
    });

    it('should fetch stock entries for product', async () => {
      const mockResponse = {
        data: [{ id: 1, amount: 5, best_before_date: '2024-12-31', stock_id: 123 }],
        status: 200,
        headers: {},
      };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.getStockByProduct({ productId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/entries', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
    });
  });

  describe('lookupProduct', () => {
    it('should require productName parameter', async () => {
      const result = await handlers.lookupProduct({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: productName');
    });

    it('should search products with fuzzy matching', async () => {
      const mockProducts = [
        { id: 1, name: 'Apple Juice', description: 'Fresh apple juice', qu_id_stock: 1 },
        { id: 2, name: 'Orange Juice', description: 'Fresh orange juice', qu_id_stock: 1 },
      ];
      const mockLocations = [{ id: 1, name: 'Fridge' }];
      const mockUnits = [{ id: 1, name: 'liters' }];
      const mockStockEntries = [
        { id: 1, amount: 2, best_before_date: '2024-12-31', location_id: '1' },
      ];

      mockApiClient.request
        .mockResolvedValueOnce({ data: mockProducts, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockLocations, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockUnits, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockStockEntries, status: 200, headers: {} });

      const result = await handlers.lookupProduct({ productName: 'apple' });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/products', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeFalsy();
    });

    it('should rank word-start matches above substring matches', async () => {
      const mockProducts = [
        { id: 640, name: 'Emperador', qu_id_stock: 1 },
        { id: 509, name: '*Ensalada campera', qu_id_stock: 1 },
        { id: 61, name: '- Peras', qu_id_stock: 1 },
      ];
      mockApiClient.request.mockImplementation(async (endpoint: string) => {
        if (endpoint === '/objects/products')
          return { data: mockProducts, status: 200, headers: {} };
        if (endpoint === '/objects/locations')
          return { data: [{ id: 2, name: 'Nevera' }], status: 200, headers: {} };
        if (endpoint === '/objects/quantity_units') return { data: [], status: 200, headers: {} };
        if (endpoint === '/stock/products/61/entries')
          return {
            data: [{ id: 3368, amount: 0.3, best_before_date: '2026-10-21', location_id: '2' }],
            status: 200,
            headers: {},
          };
        return { data: [], status: 200, headers: {} };
      });

      const result = await handlers.lookupProduct({ productName: 'pera' });
      const data = (result.structuredContent as any).data;

      expect(data.productMatches[0].productId).toBe(61);
      expect(data.allAvailableLocations).toEqual([{ id: 2, name: 'Nevera' }]);
    });

    it('should return error when no products found', async () => {
      mockApiClient.request
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} })
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} })
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} });

      const result = await handlers.lookupProduct({ productName: 'nonexistent' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No products found matching');
    });
  });

  describe('printProductLabel', () => {
    it('should require productId parameter', async () => {
      const result = await handlers.printProductLabel({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters');
    });

    it('should print product label successfully', async () => {
      const mockPrintResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockPrintResponse);

      const result = await handlers.printProductLabel({ productId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/printlabel', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('printStockEntryLabel', () => {
    it('should require stockId and productId parameters', async () => {
      const result1 = await handlers.printStockEntryLabel({});
      expect(result1.isError).toBe(true);
      expect(result1.content[0].text).toContain('Missing required parameters');

      const result2 = await handlers.printStockEntryLabel({ stockId: 1 });
      expect(result2.isError).toBe(true);
      expect(result2.content[0].text).toContain('Missing required parameters');
    });

    it('should validate stock entry belongs to product', async () => {
      const mockStockEntry = { product_id: 2 };
      mockApiClient.request.mockResolvedValue({ data: mockStockEntry, status: 200, headers: {} });

      const result = await handlers.printStockEntryLabel({ stockId: 1, productId: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Product ID mismatch');
    });

    it('should print label when validation passes', async () => {
      const mockStockEntry = { product_id: 1 };
      const mockPrintResponse = { data: { success: true }, status: 200, headers: {} };

      mockApiClient.request
        .mockResolvedValueOnce({ data: mockStockEntry, status: 200, headers: {} })
        .mockResolvedValueOnce(mockPrintResponse);

      const result = await handlers.printStockEntryLabel({ stockId: 1, productId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/entry/1', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/entry/1/printlabel', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeFalsy();
    });
  });

  // ==================== GRANULAR STOCK ENTRY OPERATIONS TESTS ====================

  describe('consumeStockEntry', () => {
    it('should require stockId, productId, and amount parameters', async () => {
      const result1 = await handlers.consumeStockEntry({});
      expect(result1.isError).toBe(true);
      expect(result1.content[0].text).toContain('Missing required parameters');

      const result2 = await handlers.consumeStockEntry({ stockId: 1 });
      expect(result2.isError).toBe(true);
      expect(result2.content[0].text).toContain('Missing required parameters');

      const result3 = await handlers.consumeStockEntry({ stockId: 1, productId: 1 });
      expect(result3.isError).toBe(true);
      expect(result3.content[0].text).toContain('Missing required parameters');
    });

    it('should validate stock entry belongs to product', async () => {
      const mockStockEntry = { product_id: 2, stock_id: 'abc123', location_id: 1 };
      mockApiClient.request.mockResolvedValue({ data: mockStockEntry, status: 200, headers: {} });

      const result = await handlers.consumeStockEntry({ stockId: 1, productId: 1, amount: 2 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Product ID mismatch');
    });

    it('should consume stock entry when validation passes', async () => {
      const mockStockEntry = { product_id: 1, stock_id: 'abc123', location_id: 1 };
      const mockConsumeResponse = { data: { success: true }, status: 200, headers: {} };

      mockApiClient.request
        .mockResolvedValueOnce({ data: mockStockEntry, status: 200, headers: {} })
        .mockResolvedValueOnce(mockConsumeResponse);

      const result = await handlers.consumeStockEntry({
        stockId: 1,
        productId: 1,
        amount: 2,
        spoiled: true,
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/entry/1', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/consume', {
        method: 'POST',
        body: {
          amount: 2,
          spoiled: true,
          stock_entry_id: 'abc123',
          location_id: 1,
        },
        queryParams: {},
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('transferStockEntry', () => {
    it('should require stockId, productId, amount, and locationIdTo parameters', async () => {
      const result1 = await handlers.transferStockEntry({});
      expect(result1.isError).toBe(true);
      expect(result1.content[0].text).toContain('Missing required parameters');

      const result2 = await handlers.transferStockEntry({ stockId: 1, productId: 1 });
      expect(result2.isError).toBe(true);
      expect(result2.content[0].text).toContain('Missing required parameters');

      const result3 = await handlers.transferStockEntry({ stockId: 1, productId: 1, amount: 2 });
      expect(result3.isError).toBe(true);
      expect(result3.content[0].text).toContain('Missing required parameters');
    });

    it('should validate stock entry belongs to product', async () => {
      const mockStockEntry = { product_id: 2, stock_id: 'abc123', location_id: 1 };
      mockApiClient.request.mockResolvedValue({ data: mockStockEntry, status: 200, headers: {} });

      const result = await handlers.transferStockEntry({
        stockId: 1,
        productId: 1,
        amount: 2,
        locationIdTo: 3,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Product ID mismatch');
    });

    it('should transfer stock entry when validation passes', async () => {
      const mockStockEntry = { product_id: 1, stock_id: 'abc123', location_id: 1 };
      const mockTransferResponse = { data: { success: true }, status: 200, headers: {} };

      mockApiClient.request
        .mockResolvedValueOnce({ data: mockStockEntry, status: 200, headers: {} })
        .mockResolvedValueOnce(mockTransferResponse);

      const result = await handlers.transferStockEntry({
        stockId: 1,
        productId: 1,
        amount: 2,
        locationIdTo: 3,
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/entry/1', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/transfer', {
        method: 'POST',
        body: {
          amount: 2,
          location_id_from: 1,
          location_id_to: 3,
          transaction_type: 'transfer',
          stock_entry_id: 'abc123',
        },
        queryParams: {},
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('openStockEntry', () => {
    it('should require stockId, productId, and amount parameters', async () => {
      const result1 = await handlers.openStockEntry({});
      expect(result1.isError).toBe(true);
      expect(result1.content[0].text).toContain('Missing required parameters');

      const result2 = await handlers.openStockEntry({ stockId: 1 });
      expect(result2.isError).toBe(true);
      expect(result2.content[0].text).toContain('Missing required parameters');

      const result3 = await handlers.openStockEntry({ stockId: 1, productId: 1 });
      expect(result3.isError).toBe(true);
      expect(result3.content[0].text).toContain('Missing required parameters');
    });

    it('should validate stock entry belongs to product', async () => {
      const mockStockEntry = { product_id: 2, stock_id: 'abc123', location_id: 1 };
      mockApiClient.request.mockResolvedValue({ data: mockStockEntry, status: 200, headers: {} });

      const result = await handlers.openStockEntry({ stockId: 1, productId: 1, amount: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Product ID mismatch');
    });

    it('should open stock entry when validation passes', async () => {
      const mockStockEntry = { product_id: 1, stock_id: 'abc123', location_id: 1 };
      const mockOpenResponse = { data: { success: true }, status: 200, headers: {} };

      mockApiClient.request
        .mockResolvedValueOnce({ data: mockStockEntry, status: 200, headers: {} })
        .mockResolvedValueOnce(mockOpenResponse);

      const result = await handlers.openStockEntry({
        stockId: 1,
        productId: 1,
        amount: 1,
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/entry/1', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/open', {
        method: 'POST',
        body: {
          amount: 1,
          stock_entry_id: 'abc123',
          location_id: 1,
        },
        queryParams: {},
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('splitStockEntry', () => {
    it('should split single amount correctly', async () => {
      const mockOriginalEntry = {
        id: 123,
        amount: 5,
        note: 'Original note',
        best_before_date: '2024-12-31',
        purchased_date: '2024-01-01',
        location_id: 1,
        price: 2.5,
        shopping_location_id: 9,
        open: 1,
      };
      const mockUpdateResponse = { data: { success: true }, status: 200, headers: {} };

      mockApiClient.request.mockResolvedValue(mockUpdateResponse);

      const getUnitForm = (amount: number) => (amount === 1 ? 'piece' : 'pieces');
      const result = await handlers.splitStockEntry(mockOriginalEntry, [5], getUnitForm);

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/entry/123', {
        method: 'PUT',
        body: {
          amount: 5,
          open: true,
          note: 'Original note - 123 - 1',
          best_before_date: '2024-12-31',
          purchased_date: '2024-01-01',
          location_id: 1,
          price: 2.5,
          shopping_location_id: 9,
        },
        queryParams: {},
      });

      expect(result).toEqual([
        {
          stockId: 123,
          amount: 5,
          type: 'updated',
          unit: 'pieces',
        },
      ]);
    });

    it('should split multiple amounts correctly', async () => {
      const mockOriginalEntry = {
        id: 123,
        product_id: 456,
        amount: 5,
        note: 'Original note',
        best_before_date: '2024-12-31',
        purchased_date: '2024-01-01',
        location_id: 1,
        price: 2.5,
        shopping_location_id: null,
        open: 0,
      };
      const mockUpdateResponse = { data: { success: true }, status: 200, headers: {} };
      const mockCreateResponse = [{ stock_id: 'new123', id: 'new123' }];
      const mockStockResponse = [
        {
          id: 789,
          product_id: 456,
          stock_id: 'new123',
        },
      ];

      mockApiClient.request
        .mockResolvedValueOnce(mockUpdateResponse) // Update first entry
        .mockResolvedValueOnce({ data: mockCreateResponse, status: 200, headers: {} }) // Create second entry
        .mockResolvedValueOnce({ data: mockStockResponse, status: 200, headers: {} }); // Get stock entries

      const getUnitForm = (amount: number) => (amount === 1 ? 'piece' : 'pieces');
      const result = await handlers.splitStockEntry(mockOriginalEntry, [3, 2], getUnitForm);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        stockId: 123,
        amount: 3,
        type: 'updated',
        unit: 'pieces',
      });
      expect(result[1]).toEqual({
        stockId: 789,
        amount: 2,
        type: 'created',
        unit: 'pieces',
      });

      expect(mockApiClient.request).toHaveBeenNthCalledWith(1, '/stock/entry/123', {
        method: 'PUT',
        body: {
          amount: 3,
          open: false,
          note: 'Original note - 123 - 1',
          best_before_date: '2024-12-31',
          purchased_date: '2024-01-01',
          location_id: 1,
          price: 2.5,
        },
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenNthCalledWith(2, '/stock/products/456/add', {
        method: 'POST',
        body: {
          amount: 2,
          best_before_date: '2024-12-31',
          purchased_date: '2024-01-01',
          transaction_type: 'self-production',
          location_id: 1,
          note: 'Original note - 123 - 2',
          price: 2.5,
        },
        queryParams: {},
      });
    });

    it('should reject amounts that do not add up to the entry amount before any write', async () => {
      const mockOriginalEntry = { id: 123, product_id: 456, amount: 4 };
      const getUnitForm = () => 'pieces';

      await expect(
        handlers.splitStockEntry(mockOriginalEntry, [3, 3], getUnitForm),
      ).rejects.toThrow('stockAmounts add up to 6 but stock entry 123 holds 4');
      await expect(handlers.splitStockEntry(mockOriginalEntry, [2], getUnitForm)).rejects.toThrow(
        'stockAmounts add up to 2 but stock entry 123 holds 4',
      );
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should validate all amounts before writing anything', async () => {
      const getUnitForm = () => 'pieces';
      await expect(
        handlers.splitStockEntry({ id: 123, product_id: 456 }, [2, 0], getUnitForm),
      ).rejects.toThrow('Invalid amount at index 1: 0');
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should handle invalid amounts', async () => {
      const mockOriginalEntry = { id: 123 };
      const getUnitForm = () => 'pieces';

      // Test single amount validation (different error format)
      await expect(handlers.splitStockEntry(mockOriginalEntry, [0], getUnitForm)).rejects.toThrow(
        'Invalid amount: 0',
      );

      // Test multiple amounts validation (different error format)
      await expect(
        handlers.splitStockEntry(mockOriginalEntry, [1, -1], getUnitForm),
      ).rejects.toThrow('Invalid amount at index 1: -1');
    });
  });
});

describe('inventory tool definitions', () => {
  const props = (name: string) =>
    (inventoryToolDefinitions.find((d) => d.name === name)!.inputSchema.properties ?? {}) as Record<
      string,
      any
    >;

  it.each([
    'inventory_transactions_consume',
    'inventory_transactions_transfer',
    'inventory_transactions_open',
    'inventory_stock_entry_consume',
    'inventory_stock_entry_transfer',
    'inventory_stock_entry_open',
  ])('%s offers no note (Grocy does not store one)', (name) => {
    expect(props(name)).not.toHaveProperty('note');
  });

  it.each(['inventory_transactions_purchase', 'inventory_transactions_adjust'])(
    '%s keeps its note',
    (name) => {
      expect(props(name)).toHaveProperty('note');
    },
  );

  it('inventory_products_get offers only real product columns', () => {
    const fields: string[] = props('inventory_products_get').fields.items.enum;
    for (const gone of [
      'qu_factor_purchase_to_stock',
      'allow_label_per_unit',
      'energy_per_stock_unit',
      'calories_per_stock_unit',
      'calories_per_unit_factor',
    ]) {
      expect(fields).not.toContain(gone);
    }
    expect(fields).toEqual(expect.arrayContaining(['calories', 'qu_id_consume', 'due_type']));
    const description: string = props('inventory_products_get').fields.description;
    for (const f of fields) expect(description).toContain(f);
  });
});

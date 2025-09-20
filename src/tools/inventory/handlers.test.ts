import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InventoryToolHandlers } from './handlers.js';

// Mock API client
vi.mock('../../api/client.js', () => ({
  default: {
    request: vi.fn(),
    get: vi.fn()
  },
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  }
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
        headers: {}
      };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const result = await handlers.getAllStock({});

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });

      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[1].text)).toEqual(mockResponse.data);
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
        queryParams: {}
      });
    });

    it('should include details when requested', async () => {
      const mockResponse = { data: { expired: [], due: [] }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.getStockVolatile({ includeDetails: true });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/volatile', {
        method: 'GET',
        body: undefined,
        queryParams: { include_details: 'true' }
      });
    });
  });

  describe('inventoryProduct', () => {
    it('should require productId and newAmount', async () => {
      const result1 = await handlers.inventoryProduct({});
      expect(result1.isError).toBe(true);
      expect(result1.content[0].text).toContain('Missing required parameters: productId, newAmount');

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
        note: 'Inventory check'
      };

      await handlers.inventoryProduct(args);

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/inventory', {
        method: 'POST',
        body: expect.objectContaining({
          new_amount: 15,
          location_id: 2,
          note: 'Inventory check'
        }),
        queryParams: {}
      });
    });

    it('should use custom best before date when provided', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.inventoryProduct({
        productId: 1,
        newAmount: 10,
        bestBeforeDate: '2024-12-31'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/inventory', {
        method: 'POST',
        body: expect.objectContaining({
          best_before_date: '2024-12-31'
        }),
        queryParams: {}
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
          amount: 1
        }),
        queryParams: {}
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
        note: 'Bulk purchase'
      };

      await handlers.purchaseProduct(args);

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/add', {
        method: 'POST',
        body: expect.objectContaining({
          amount: 3,
          price: 15.99,
          location_id: 3,
          note: 'Bulk purchase'
        }),
        queryParams: {}
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
          transaction_type: 'consume'
        }),
        queryParams: {}
      });
    });

    it('should handle spoiled products', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.consumeProduct({ 
        productId: 1,
        spoiled: true, 
        amount: 2 
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/consume', {
        method: 'POST',
        body: expect.objectContaining({
          amount: 2,
          spoiled: true,
          transaction_type: 'inventory-correction'
        }),
        queryParams: {}
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
        fromLocationId: 1 
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
        note: 'Moving to pantry'
      };

      await handlers.transferProduct(args);

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/transfer', {
        method: 'POST',
        body: expect.objectContaining({
          amount: 5,
          location_id_from: 2,
          location_id_to: 3,
          note: 'Moving to pantry'
        }),
        queryParams: {}
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
          amount: 1
        }),
        queryParams: {}
      });
    });

    it('should include note when provided', async () => {
      const mockResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.openProduct({ productId: 5, amount: 2, note: 'Opening for family dinner' });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/5/open', {
        method: 'POST',
        body: expect.objectContaining({
          amount: 2,
          note: 'Opening for family dinner'
        }),
        queryParams: {}
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
          { id: 2, name: 'Product 2', description: 'Desc 2', location_id: 2 }
        ],
        status: 200,
        headers: {}
      };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const result = await handlers.getProducts({ fields: ['id', 'name'] });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/products', {
        method: 'GET',
        body: undefined,
        queryParams: {}
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
        data: [
          { id: 1, amount: 5, best_before_date: '2024-12-31', stock_id: 123 }
        ],
        status: 200,
        headers: {}
      };
      mockApiClient.request.mockResolvedValue(mockResponse);

      await handlers.getStockByProduct({ productId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/1/entries', {
        method: 'GET',
        body: undefined,
        queryParams: {}
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
        { id: 2, name: 'Orange Juice', description: 'Fresh orange juice', qu_id_stock: 1 }
      ];
      const mockLocations = [{ id: 1, name: 'Fridge' }];
      const mockUnits = [{ id: 1, name: 'liters' }];
      const mockStockEntries = [
        { id: 1, amount: 2, best_before_date: '2024-12-31', location_id: '1' }
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
        queryParams: {}
      });
      expect(result.isError).toBeFalsy();
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
        queryParams: {}
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/entry/1/printlabel', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeFalsy();
    });
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShoppingToolHandlers } from './handlers.js';

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

describe('ShoppingToolHandlers', () => {
  let handlers: ShoppingToolHandlers;

  beforeEach(() => {
    handlers = new ShoppingToolHandlers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getShoppingList', () => {
    it('should get shopping list', async () => {
      const mockShoppingList = [
        { id: 1, product_id: 1, amount: 2, note: 'Buy milk', shopping_list_id: 1 },
        { id: 2, product_id: 2, amount: 1, note: 'Buy bread', shopping_list_id: 1 },
      ];
      const mockProducts = [
        { id: 1, name: 'Milk', description: 'Whole milk', qu_id_stock: 4 },
        { id: 2, name: 'Bread', description: 'Wheat bread', qu_id_stock: 5 },
      ];
      const mockQuantityUnits = [
        { id: 4, name: 'liters' },
        { id: 5, name: 'pieces' },
      ];
      const mockShoppingLists = [{ id: 1, name: 'Groceries', description: 'Manual items' }];
      mockApiClient.request
        .mockResolvedValueOnce({ data: mockShoppingList, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockProducts, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockQuantityUnits, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockShoppingLists, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockShoppingLists[0], status: 200, headers: {} });

      const result = await handlers.getShoppingList({ shoppingListId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list', {
        method: 'GET',
        body: undefined,
        queryParams: { 'query[]': 'shopping_list_id=1' },
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Shopping list retrieved successfully');
      expect(result.structuredContent?.data).toEqual({
        list: {
          id: 1,
          name: 'Groceries',
          manual_items: 'Manual items',
        },
        items: [
          {
            id: 1,
            amount: 2,
            note: 'Buy milk',
            product: {
              id: 1,
              name: 'Milk',
              description: 'Whole milk',
              quIdStock: 4,
            },
            quantityUnit: {
              id: 4,
              name: 'liters',
            },
            shoppingList: {
              id: 1,
              name: 'Groceries',
            },
          },
          {
            id: 2,
            amount: 1,
            note: 'Buy bread',
            product: {
              id: 2,
              name: 'Bread',
              description: 'Wheat bread',
              quIdStock: 5,
            },
            quantityUnit: {
              id: 5,
              name: 'pieces',
            },
            shoppingList: {
              id: 1,
              name: 'Groceries',
            },
          },
        ],
      });
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getShoppingList({ shoppingListId: 1 });

      expect(result.isError).toBe(true);
    });
  });

  describe('addShoppingListItem', () => {
    it('should add shopping list item with all parameters', async () => {
      const mockResponse = { id: 1, product_id: 1, shopping_list_id: 2 };
      const mockProducts = [{ id: 1, name: 'Milk', description: 'Whole milk', qu_id_stock: 4 }];
      const mockQuantityUnits = [{ id: 4, name: 'liters' }];
      const mockShoppingLists = [{ id: 2, name: 'Groceries' }];
      mockApiClient.request
        .mockResolvedValueOnce({ data: mockResponse, status: 201, headers: {} })
        .mockResolvedValueOnce({ data: mockProducts, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockQuantityUnits, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockShoppingLists, status: 200, headers: {} });

      const result = await handlers.addShoppingListItem({
        productId: 1,
        amount: 3,
        shoppingListId: 2,
        note: 'Organic milk',
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list', {
        method: 'POST',
        body: {
          product_id: 1,
          amount: 3,
          shopping_list_id: 2,
          note: 'Organic milk',
        },
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Shopping list item added successfully');
      expect(result.structuredContent?.data).toEqual({
        id: 1,
        product: {
          id: 1,
          name: 'Milk',
          description: 'Whole milk',
          quIdStock: 4,
        },
        quantityUnit: {
          id: 4,
          name: 'liters',
        },
        shoppingList: {
          id: 2,
          name: 'Groceries',
        },
      });
    });

    it('should add shopping list item with defaults', async () => {
      const mockResponse = { id: 1, product_id: 1, shopping_list_id: 1 };
      const mockProducts = [{ id: 1, name: 'Milk', description: 'Whole milk', qu_id_stock: 4 }];
      const mockQuantityUnits = [{ id: 4, name: 'liters' }];
      const mockShoppingLists = [{ id: 1, name: 'Groceries' }];
      mockApiClient.request
        .mockResolvedValueOnce({ data: mockResponse, status: 201, headers: {} })
        .mockResolvedValueOnce({ data: mockProducts, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockQuantityUnits, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockShoppingLists, status: 200, headers: {} });

      const result = await handlers.addShoppingListItem({
        productId: 1,
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list', {
        method: 'POST',
        body: {
          product_id: 1,
          amount: 1,
          shopping_list_id: 1,
          note: '',
        },
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent?.data).toEqual({
        id: 1,
        product: {
          id: 1,
          name: 'Milk',
          description: 'Whole milk',
          quIdStock: 4,
        },
        quantityUnit: {
          id: 4,
          name: 'liters',
        },
        shoppingList: {
          id: 1,
          name: 'Groceries',
        },
      });
    });

    it('should require productId parameter', async () => {
      const result = await handlers.addShoppingListItem({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: productId');
    });

    it('should handle missing args', async () => {
      const result = await handlers.addShoppingListItem();

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: productId');
    });
  });

  describe('removeShoppingListItem', () => {
    it('should remove shopping list item', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {},
      });

      const result = await handlers.removeShoppingListItem({
        shoppingListItemId: 1,
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list/1', {
        method: 'DELETE',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Shopping list item removed successfully');
    });

    it('should require shoppingListItemId parameter', async () => {
      const result = await handlers.removeShoppingListItem({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: shoppingListItemId');
    });

    it('should handle missing args', async () => {
      const result = await handlers.removeShoppingListItem();

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: shoppingListItemId');
    });
  });

  describe('updateShoppingListItem', () => {
    it('should update shopping list item', async () => {
      const mockExistingItem = {
        id: 1,
        product_id: 1,
        amount: 2,
        shopping_list_id: 1,
        note: 'Old note',
      };
      const mockProducts = [{ id: 1, name: 'Milk', description: 'Whole milk', qu_id_stock: 4 }];
      const mockQuantityUnits = [{ id: 4, name: 'liters' }];
      const mockShoppingLists = [{ id: 1, name: 'Groceries' }];
      const mockResponse = {
        id: 1,
        product_id: 1,
        amount: 2,
        shopping_list_id: 1,
        note: 'New note',
      };

      mockApiClient.request
        .mockResolvedValueOnce({ data: mockExistingItem, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockResponse, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockProducts, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockQuantityUnits, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: mockShoppingLists, status: 200, headers: {} });

      const result = await handlers.updateShoppingListItem({
        shoppingListItemId: 1,
        note: 'New note',
      });

      expect(mockApiClient.request).toHaveBeenNthCalledWith(1, '/objects/shopping_list/1', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });

      expect(mockApiClient.request).toHaveBeenNthCalledWith(2, '/objects/shopping_list/1', {
        method: 'PUT',
        body: {
          id: 1,
          product_id: 1,
          amount: 2,
          shopping_list_id: 1,
          note: 'New note',
        },
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Shopping list item updated successfully');
      expect(result.structuredContent?.data).toEqual({
        id: 1,
        amount: 2,
        note: 'New note',
        product: {
          id: 1,
          name: 'Milk',
          description: 'Whole milk',
          quIdStock: 4,
        },
        quantityUnit: {
          id: 4,
          name: 'liters',
        },
        shoppingList: {
          id: 1,
          name: 'Groceries',
        },
      });
    });

    it('should require shoppingListItemId parameter', async () => {
      const result = await handlers.updateShoppingListItem({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: shoppingListItemId');
    });
  });

  describe('getShoppingLocations', () => {
    it('should get shopping locations', async () => {
      const mockLocations = [
        { id: 1, name: 'Grocery Store A' },
        { id: 2, name: 'Supermarket B' },
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockLocations,
        status: 200,
        headers: {},
      });

      const result = await handlers.getShoppingLocations();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_locations', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Shopping locations retrieved successfully');
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getShoppingLocations();

      expect(result.isError).toBe(true);
    });
  });

  describe('printShoppingListThermal', () => {
    it('should print shopping list thermally successfully', async () => {
      const mockPrintResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockPrintResponse);

      const result = await handlers.printShoppingListThermal({});

      expect(mockApiClient.request).toHaveBeenCalledWith('/print/shoppinglist/thermal', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain(
        'Shopping list sent to thermal printer successfully',
      );
    });
  });

  describe('getShoppingLists', () => {
    it('should get shopping lists', async () => {
      const mockShoppingLists = [
        { id: 1, name: 'Default', description: 'My first list' },
        { id: 2, name: 'Secondary', description: 'Another list' },
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockShoppingLists,
        status: 200,
        headers: {},
      });

      const result = await handlers.getShoppingLists();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_lists', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Shopping lists retrieved successfully');
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getShoppingLists();

      expect(result.isError).toBe(true);
    });
  });

  describe('updateShoppingList', () => {
    it('should update shopping list', async () => {
      const mockExistingList = { id: 1, name: 'Default', description: 'Old description' };
      const mockResponse = { id: 1, name: 'Default', description: 'New description' };

      mockApiClient.request
        .mockResolvedValueOnce({
          data: mockExistingList,
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: mockResponse,
          status: 200,
          headers: {},
        });

      const result = await handlers.updateShoppingList({
        shoppingListId: 1,
        manual_items: 'New description',
      });

      expect(mockApiClient.request).toHaveBeenNthCalledWith(1, '/objects/shopping_lists/1', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });

      expect(mockApiClient.request).toHaveBeenNthCalledWith(2, '/objects/shopping_lists/1', {
        method: 'PUT',
        body: {
          id: 1,
          name: 'Default',
          description: 'New description',
        },
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Shopping list updated successfully');
    });

    it('should require shoppingListId parameter', async () => {
      const result = await handlers.updateShoppingList({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: shoppingListId');
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShoppingToolHandlers } from './handlers.js';

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
        { id: 1, product_id: 1, amount: 2, note: 'Buy milk' },
        { id: 2, product_id: 2, amount: 1, note: 'Buy bread' }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockShoppingList,
        status: 200,
        headers: {}
      });

      const result = await handlers.getShoppingList();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Shopping list retrieved successfully');
    });

    it('should handle API errors', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getShoppingList();

      expect(result.isError).toBe(true);
    });
  });

  describe('addShoppingListItem', () => {
    it('should add shopping list item with all parameters', async () => {
      const mockResponse = { id: 1, product_id: 1 };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.addShoppingListItem({
        productId: 1,
        amount: 3,
        shoppingListId: 2,
        note: 'Organic milk'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list', {
        method: 'POST',
        body: {
          product_id: 1,
          amount: 3,
          shopping_list_id: 2,
          note: 'Organic milk'
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Shopping list item added successfully');
    });

    it('should add shopping list item with defaults', async () => {
      const mockResponse = { id: 1, product_id: 1 };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.addShoppingListItem({
        productId: 1
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list', {
        method: 'POST',
        body: {
          product_id: 1,
          amount: 1,
          shopping_list_id: 1,
          note: ''
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
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
        headers: {}
      });

      const result = await handlers.removeShoppingListItem({
        shoppingListItemId: 1
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list/1', {
        method: 'DELETE',
        body: undefined,
        queryParams: {}
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

  describe('getShoppingLocations', () => {
    it('should get shopping locations', async () => {
      const mockLocations = [
        { id: 1, name: 'Grocery Store A' },
        { id: 2, name: 'Supermarket B' }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockLocations,
        status: 200,
        headers: {}
      });

      const result = await handlers.getShoppingLocations();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_locations', {
        method: 'GET',
        body: undefined,
        queryParams: {}
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
});
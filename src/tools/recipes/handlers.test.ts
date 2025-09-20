import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecipeToolHandlers } from './handlers.js';

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

// Mock config
vi.mock('../../config/index.js', () => ({
  config: {
    parseToolConfiguration: vi.fn(() => ({
      toolSubConfigs: new Map([
        ['complete', new Map([
          ['allow_meal_plan_entry_already_done', false],
          ['print_labels', true],
          ['allow_no_meal_plan', false]
        ])]
      ])
    }))
  }
}));

import apiClient from '../../api/client.js';
const mockApiClient = vi.mocked(apiClient);

describe('RecipeToolHandlers', () => {
  let handlers: RecipeToolHandlers;

  beforeEach(() => {
    handlers = new RecipeToolHandlers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getRecipes', () => {
    it('should get recipes with specified fields', async () => {
      const mockRecipes = [
        { id: 1, name: 'Test Recipe 1', description: 'Test description 1' },
        { id: 2, name: 'Test Recipe 2', description: 'Test description 2' }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockRecipes,
        status: 200,
        headers: {}
      });

      const result = await handlers.getRecipes({ fields: ['id', 'name'] });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes', {
        method: 'GET',
        body: undefined,
        queryParams: { 'query[]': 'type=normal' }
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].type).toBe('text');
    });

    it('should require fields parameter', async () => {
      const result = await handlers.getRecipes({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: fields');
    });

    it('should handle empty response', async () => {
      mockApiClient.request.mockResolvedValue({
        data: null,
        status: 200,
        headers: {}
      });

      const result = await handlers.getRecipes({ fields: ['id', 'name'] });

      expect(result.isError).toBeUndefined();
    });
  });

  describe('getRecipeById', () => {
    it('should get recipe by ID', async () => {
      const mockRecipe = { id: 1, name: 'Test Recipe', description: 'Test description' };
      mockApiClient.request.mockResolvedValue({
        data: mockRecipe,
        status: 200,
        headers: {}
      });

      const result = await handlers.getRecipeById({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes/1', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should require recipeId parameter', async () => {
      const result = await handlers.getRecipeById({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: recipeId');
    });
  });

  describe('createRecipe', () => {
    it('should create a new recipe', async () => {
      const mockResponse = { id: 1, name: 'New Recipe' };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.createRecipe({
        name: 'New Recipe',
        description: 'A test recipe',
        baseServings: 4,
        instructions: 'Mix and cook'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes', {
        method: 'POST',
        body: {
          name: 'New Recipe',
          description: 'A test recipe',
          base_servings: 4,
          type: 'normal',
          instructions: 'Mix and cook'
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Recipe "New Recipe" created successfully');
    });

    it('should require name parameter', async () => {
      const result = await handlers.createRecipe({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: name');
    });

    it('should use defaults for optional parameters', async () => {
      const mockResponse = { id: 1, name: 'Simple Recipe' };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.createRecipe({ name: 'Simple Recipe' });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes', {
        method: 'POST',
        body: {
          name: 'Simple Recipe',
          description: '',
          base_servings: 1,
          type: 'normal',
          instructions: ''
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('getRecipeFulfillment', () => {
    it('should get recipe fulfillment', async () => {
      const mockFulfillment = { need_fulfilled: true, missing_products: [] };
      mockApiClient.request.mockResolvedValue({
        data: mockFulfillment,
        status: 200,
        headers: {}
      });

      const result = await handlers.getRecipeFulfillment({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/1/fulfillment', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should require recipeId parameter', async () => {
      const result = await handlers.getRecipeFulfillment({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: recipeId');
    });
  });

  describe('getAllRecipeFulfillment', () => {
    it('should get all recipe fulfillment', async () => {
      const mockFulfillment = [
        { recipe_id: 1, need_fulfilled: true },
        { recipe_id: 2, need_fulfilled: false }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockFulfillment,
        status: 200,
        headers: {}
      });

      const result = await handlers.getAllRecipeFulfillment();

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/fulfillment', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('consumeRecipe', () => {
    it('should consume recipe with default servings', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.consumeRecipe({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/consume', {
        method: 'POST',
        body: {
          recipe_id: 1,
          servings: 1
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Recipe consumed (1 servings)');
    });

    it('should consume recipe with specified servings', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.consumeRecipe({ recipeId: 1, servings: 4 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/consume', {
        method: 'POST',
        body: {
          recipe_id: 1,
          servings: 4
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Recipe consumed (4 servings)');
    });

    it('should require recipeId parameter', async () => {
      const result = await handlers.consumeRecipe({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: recipeId');
    });
  });

  describe('addAllProductsToShopping', () => {
    it('should add all recipe products to shopping list', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.addAllProductsToShopping({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/1/add-all-ingredients-to-shopping-list', {
        method: 'POST',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('All recipe products added to shopping list');
    });

    it('should require recipeId parameter', async () => {
      const result = await handlers.addAllProductsToShopping({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: recipeId');
    });
  });

  describe('addMissingProductsToShopping', () => {
    it('should add missing recipe products to shopping list', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.addMissingProductsToShopping({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/1/add-not-fulfilled-products-to-shopping-list', {
        method: 'POST',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Missing recipe products added to shopping list');
    });

    it('should require recipeId parameter', async () => {
      const result = await handlers.addMissingProductsToShopping({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: recipeId');
    });
  });

  describe('addRecipeToMealPlan', () => {
    it('should add recipe to meal plan', async () => {
      const mockResponse = { id: 1 };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.addRecipeToMealPlan({
        recipeId: 1,
        day: '2024-01-15',
        mealType: 'dinner'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'POST',
        body: {
          day: '2024-01-15',
          type: 'dinner',
          recipe_id: 1
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Recipe added to meal plan successfully');
    });

    it('should require recipeId and day parameters', async () => {
      const result = await handlers.addRecipeToMealPlan({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: recipeId, day');
    });

    it('should use default meal type', async () => {
      const mockResponse = { id: 1 };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 201,
        headers: {}
      });

      const result = await handlers.addRecipeToMealPlan({
        recipeId: 1,
        day: '2024-01-15'
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'POST',
        body: {
          day: '2024-01-15',
          type: 'lunch',
          recipe_id: 1
        },
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('getMealPlan', () => {
    it('should require date parameter', async () => {
      const result = await handlers.getMealPlan({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: date');
    });

    it('should validate date format', async () => {
      const result = await handlers.getMealPlan({ date: 'invalid-date' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid date format. Use YYYY-MM-DD.');
    });

    it('should return empty meal plan when no entries found', async () => {
      // Mock empty responses for all date queries
      mockApiClient.request.mockResolvedValue({
        data: [],
        status: 200,
        headers: {}
      });

      const result = await handlers.getMealPlan({ date: '2024-01-15' });

      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[1].text)).toEqual({
        message: 'No meals planned for the requested date',
        meal_plan_by_date: {}
      });
    });

    it('should get meal plan with enhanced data for single day', async () => {
      const mockMealPlanEntry = {
        id: 1,
        recipe_id: 73,
        section_id: 2,
        day: '2024-01-15',
        recipe_servings: 2,
        note: null,
        done: 0
      };

      const mockRecipe = {
        id: 73,
        name: 'Test Recipe',
        product_id: 438,
        userfields: null
      };

      const mockSection = {
        id: 2,
        name: 'Dinner',
        time_info: '18:00',
        userfields: null
      };

      const mockAllSections = [
        { id: 1, name: 'Breakfast', sort_number: 1, time_info: '08:00' },
        { id: 2, name: 'Dinner', sort_number: 2, time_info: '18:00' }
      ];

      // Mock the multiple API calls
      mockApiClient.request
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // day before
        .mockResolvedValueOnce({ data: [mockMealPlanEntry], status: 200, headers: {} }) // target day
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // day after
        .mockResolvedValueOnce({ data: mockRecipe, status: 200, headers: {} }) // recipe details
        .mockResolvedValueOnce({ data: mockAllSections, status: 200, headers: {} }); // all sections

      const result = await handlers.getMealPlan({ date: '2024-01-15' });

      expect(result.isError).toBeUndefined();
      
      const response = JSON.parse(result.content[1].text);
      expect(response).toEqual({
        meal_plan_by_date: {
          '2024-01-15': [{
            id: 1,
            day: '2024-01-15',
            section_id: 2,
            recipe_id: 73,
            recipe_servings: 2,
            note: null,
            done: 0
          }]
        },
        recipes: [{
          id: 73,
          name: 'Test Recipe',
          product_id: 438
        }],
        sections: [
          { id: 1, name: 'Breakfast', time_info: '08:00' },
          { id: 2, name: 'Dinner', time_info: '18:00' }
        ]
      });

      // Verify correct API calls were made
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'GET',
        body: undefined,
        queryParams: {
          'query[]': 'day=2024-01-14',
          order: 'day'
        }
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'GET',
        body: undefined,
        queryParams: {
          'query[]': 'day=2024-01-15',
          order: 'day'
        }
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'GET',
        body: undefined,
        queryParams: {
          'query[]': 'day=2024-01-16',
          order: 'day'
        }
      });
    });

    it('should handle weekly meal plan', async () => {
      const mockMealPlanEntry = {
        id: 1,
        recipe_id: 73,
        section_id: 2,
        day: '2024-01-19',
        recipe_servings: 2,
        note: null,
        done: 0
      };

      // Mock empty responses for most days, one entry on target day
      mockApiClient.request
        .mockResolvedValue({ data: [], status: 200, headers: {} }) // default for most calls
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // buffer day before
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // Monday
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // Tuesday
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // Wednesday
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // Thursday
        .mockResolvedValueOnce({ data: [mockMealPlanEntry], status: 200, headers: {} }) // Friday (target)
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // Saturday
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // Sunday
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // buffer day after
        .mockResolvedValueOnce({ data: { id: 73, name: 'Recipe', product_id: null }, status: 200, headers: {} }) // recipe
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }); // all sections

      const result = await handlers.getMealPlan({ date: '2024-01-19', weekly: true }); // Friday

      expect(result.isError).toBeUndefined();
      
      const response = JSON.parse(result.content[1].text);
      expect(response.meal_plan_by_date['2024-01-19']).toBeDefined();
      expect(response.meal_plan_by_date['2024-01-19'][0].id).toBe(1);

      // Should call for 9 days (week + 2 buffer days)
      expect(mockApiClient.request).toHaveBeenCalledTimes(11); // 9 meal plan + 1 recipe + 1 all sections
    });

    it('should handle API errors gracefully', async () => {
      mockApiClient.request.mockRejectedValue(new Error('API Error'));

      const result = await handlers.getMealPlan({ date: '2024-01-15' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error');
    });
  });

  describe('getMealPlanSections', () => {
    it('should get meal plan sections', async () => {
      const mockSections = [
        { id: 1, name: 'Breakfast' },
        { id: 2, name: 'Lunch' },
        { id: 3, name: 'Dinner' }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockSections,
        status: 200,
        headers: {}
      });

      const result = await handlers.getMealPlanSections();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan_sections', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('deleteRecipeFromMealPlan', () => {
    it('should delete recipe from meal plan', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {}
      });

      const result = await handlers.deleteRecipeFromMealPlan({ mealPlanEntryId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan/1', {
        method: 'DELETE',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Recipe deleted from meal plan successfully');
    });

    it('should require mealPlanEntryId parameter', async () => {
      const result = await handlers.deleteRecipeFromMealPlan({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: mealPlanEntryId');
    });
  });

  describe('searchRecipes', () => {
    it('should search recipes by name', async () => {
      const mockRecipes = [
        { id: 1, name: 'Pasta Recipe', description: 'Delicious pasta' },
        { id: 2, name: 'Pizza Recipe', description: 'Tasty pizza' },
        { id: 3, name: 'Salad Recipe', description: 'Fresh salad' }
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockRecipes,
        status: 200,
        headers: {}
      });

      const result = await handlers.searchRecipes({ query: 'pasta' });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes', {
        method: 'GET',
        body: undefined,
        queryParams: { 'query[]': 'type=normal' }
      });
      expect(result.isError).toBeUndefined();
    });

    it('should require query parameter', async () => {
      const result = await handlers.searchRecipes({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: query');
    });
  });

  describe('getRecipeNutrition', () => {
    it('should get recipe nutrition', async () => {
      const mockNutrition = { calories: 500, protein: 20 };
      mockApiClient.request.mockResolvedValue({
        data: mockNutrition,
        status: 200,
        headers: {}
      });

      const result = await handlers.getRecipeNutrition({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/1/nutrition', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeUndefined();
    });

    it('should require recipeId parameter', async () => {
      const result = await handlers.getRecipeNutrition({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: recipeId');
    });
  });

  describe('printRecipeLabel', () => {
    it('should require recipeId parameter', async () => {
      const result = await handlers.printRecipeLabel({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters');
    });

    it('should print recipe label successfully', async () => {
      const mockPrintResponse = { data: { success: true }, status: 200, headers: {} };
      mockApiClient.request.mockResolvedValue(mockPrintResponse);

      const result = await handlers.printRecipeLabel({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/1/printlabel', {
        method: 'GET',
        body: undefined,
        queryParams: {}
      });
      expect(result.isError).toBeFalsy();
    });
  });
});
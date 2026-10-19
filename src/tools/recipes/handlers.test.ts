import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecipeToolHandlers } from './handlers.js';

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

// Mock config
vi.mock('../../config/index.js', () => ({
  config: {
    parseToolConfiguration: vi.fn(() => ({
      toolSubConfigs: new Map([
        [
          'recipes_cooking_complete',
          new Map([
            ['allow_meal_plan_entry_already_done', false],
            ['print_labels', true],
            ['allow_no_meal_plan', false],
          ]),
        ],
      ]),
    })),
  },
}));

import apiClient from '../../api/client.js';
const mockApiClient = vi.mocked(apiClient);
const OK = { data: {}, status: 200, headers: {} };

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
        { id: 2, name: 'Test Recipe 2', description: 'Test description 2' },
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockRecipes,
        status: 200,
        headers: {},
      });

      const result = await handlers.getRecipes({ fields: ['id', 'name'] });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes', {
        method: 'GET',
        body: undefined,
        queryParams: { 'query[]': 'type=normal' },
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
        headers: {},
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
        headers: {},
      });

      const result = await handlers.getRecipeById({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes/1', {
        method: 'GET',
        body: undefined,
        queryParams: {},
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
        headers: {},
      });

      const result = await handlers.createRecipe({
        name: 'New Recipe',
        description: 'A test recipe',
        baseServings: 4,
        instructions: 'Mix and cook',
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes', {
        method: 'POST',
        body: {
          name: 'New Recipe',
          description: 'A test recipe\n\nMix and cook',
          base_servings: 4,
          type: 'normal',
        },
        queryParams: {},
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
        headers: {},
      });

      const result = await handlers.createRecipe({ name: 'Simple Recipe' });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes', {
        method: 'POST',
        body: {
          name: 'Simple Recipe',
          description: '',
          base_servings: 1,
          type: 'normal',
        },
        queryParams: {},
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
        headers: {},
      });

      const result = await handlers.getRecipeFulfillment({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/1/fulfillment', {
        method: 'GET',
        body: undefined,
        queryParams: {},
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
        { recipe_id: 2, need_fulfilled: false },
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockFulfillment,
        status: 200,
        headers: {},
      });

      const result = await handlers.getAllRecipeFulfillment();

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/fulfillment', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('consumeRecipe', () => {
    it('should consume recipe with default servings', async () => {
      mockApiClient.request
        .mockResolvedValueOnce({ data: { id: 1, desired_servings: 1 }, status: 200, headers: {} })
        .mockResolvedValueOnce({ data: { success: true }, status: 200, headers: {} });

      const result = await handlers.consumeRecipe({ recipeId: 1 });

      // desired_servings already matches: no PUT, just the consume
      expect(mockApiClient.request).toHaveBeenCalledTimes(2);
      expect(mockApiClient.request).toHaveBeenNthCalledWith(2, '/recipes/1/consume', {
        method: 'POST',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Recipe consumed (1 servings)');
    });

    it('should set desired_servings, consume, and restore the previous value', async () => {
      mockApiClient.request
        .mockResolvedValueOnce({ data: { id: 1, desired_servings: 2 }, status: 200, headers: {} })
        .mockResolvedValue(OK);

      const result = await handlers.consumeRecipe({ recipeId: 1, servings: 4 });

      expect(mockApiClient.request).toHaveBeenNthCalledWith(2, '/objects/recipes/1', {
        method: 'PUT',
        body: { desired_servings: 4 },
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenNthCalledWith(3, '/recipes/1/consume', {
        method: 'POST',
        body: undefined,
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenNthCalledWith(4, '/objects/recipes/1', {
        method: 'PUT',
        body: { desired_servings: 2 },
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Recipe consumed (4 servings)');
    });

    it('should restore desired_servings when the consume fails', async () => {
      mockApiClient.request
        .mockResolvedValueOnce({ data: { id: 1, desired_servings: 2 }, status: 200, headers: {} })
        .mockResolvedValueOnce(OK)
        .mockRejectedValueOnce(new Error('Not enough in stock'))
        .mockResolvedValueOnce(OK);

      const result = await handlers.consumeRecipe({ recipeId: 1, servings: 4 });

      expect(result.isError).toBe(true);
      expect(mockApiClient.request).toHaveBeenNthCalledWith(4, '/objects/recipes/1', {
        method: 'PUT',
        body: { desired_servings: 2 },
        queryParams: {},
      });
    });

    it('should reject non-positive servings', async () => {
      const result = await handlers.consumeRecipe({ recipeId: 1, servings: 0 });

      expect(result.isError).toBe(true);
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should require recipeId parameter', async () => {
      const result = await handlers.consumeRecipe({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: recipeId');
    });
  });

  describe('addAllProductsToShopping', () => {
    const resp = (data: any) => ({ data, status: 200, headers: {} });
    const routes = (map: Record<string, any>) =>
      mockApiClient.request.mockImplementation(async (endpoint: string, opts: any = {}) => {
        const key = `${opts.method ?? 'GET'} ${endpoint}`;
        return resp(key in map ? map[key] : {}) as any;
      });

    it('should add resolved stock-unit amounts, merging into existing rows of the list', async () => {
      routes({
        'GET /objects/recipes/1': { id: 1 },
        'GET /objects/recipes_pos_resolved': [
          { recipe_id: 1, product_id: 8, recipe_amount: 0.25, only_check_single_unit_in_stock: 0 },
          {
            recipe_id: 1,
            product_id: '9',
            recipe_amount: '0.5',
            only_check_single_unit_in_stock: 0,
          },
          // same product from a nested recipe
          { recipe_id: 1, product_id: 9, recipe_amount: 0.25, is_nested_recipe_pos: 1 },
          { recipe_id: 1, product_id: 10, recipe_amount: 3, only_check_single_unit_in_stock: 1 },
        ],
        'GET /objects/shopping_list': [{ id: 70, product_id: 9, amount: '1', shopping_list_id: 2 }],
        'GET /objects/products/8': { id: 8, qu_id_purchase: 4, qu_id_stock: 3 },
      });

      const result = await handlers.addAllProductsToShopping({ recipeId: 1, shoppingListId: 2 });

      expect(result.isError).toBeUndefined();
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes_pos_resolved', {
        method: 'GET',
        body: undefined,
        queryParams: { 'query[]': 'recipe_id=1' },
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list', {
        method: 'POST',
        body: { product_id: 8, amount: 0.25, qu_id: 4, shopping_list_id: 2 },
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list/70', {
        method: 'PUT',
        body: { amount: 1.75 },
        queryParams: {},
      });
      const endpoints = mockApiClient.request.mock.calls.map(([e]: any) => e);
      expect(endpoints).not.toContain('/stock/shoppinglist/add-product');
      expect(endpoints).not.toContain('/objects/products/10');
      expect(result.content[0].text).toContain(
        '2 recipe products added to shopping list (1 skipped)',
      );
    });

    it('should use the default list when none is given', async () => {
      routes({
        'GET /objects/recipes/1': { id: 1 },
        'GET /objects/recipes_pos_resolved': [{ recipe_id: 1, product_id: 8, recipe_amount: 2 }],
        'GET /objects/shopping_list': [],
        'GET /objects/products/8': { id: 8, qu_id_purchase: 4 },
      });

      await handlers.addAllProductsToShopping({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list', {
        method: 'GET',
        body: undefined,
        queryParams: { 'query[]': 'shopping_list_id=1' },
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/shopping_list', {
        method: 'POST',
        body: { product_id: 8, amount: 2, qu_id: 4, shopping_list_id: 1 },
        queryParams: {},
      });
    });

    it('should fail for a recipe that does not exist', async () => {
      mockApiClient.request.mockRejectedValueOnce(new Error('HTTP 404 error'));

      const result = await handlers.addAllProductsToShopping({ recipeId: 99 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Recipe 99 does not exist');
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);
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
        headers: {},
      });

      const result = await handlers.addMissingProductsToShopping({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith(
        '/recipes/1/add-not-fulfilled-products-to-shoppinglist',
        {
          method: 'POST',
          body: undefined,
          queryParams: {},
        },
      );
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
    it('should add recipe to meal plan with type, servings and section', async () => {
      const mockResponse = { created_object_id: '1' };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {},
      });

      const result = await handlers.addRecipeToMealPlan({
        recipeId: 5,
        day: '2024-01-15',
        servings: 2,
        sectionId: 3,
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'POST',
        body: {
          day: '2024-01-15',
          type: 'recipe',
          recipe_id: 5,
          recipe_servings: 2,
          section_id: 3,
        },
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Recipe added to meal plan successfully');
    });

    it('should accept -1 as the explicit "no section" value', async () => {
      mockApiClient.request.mockResolvedValue({ data: {}, status: 200, headers: {} });

      const result = await handlers.addRecipeToMealPlan({
        recipeId: 5,
        day: '2024-01-15',
        servings: 1,
        sectionId: -1,
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'POST',
        body: {
          day: '2024-01-15',
          type: 'recipe',
          recipe_id: 5,
          recipe_servings: 1,
          section_id: -1,
        },
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
    });

    it('should require recipeId, day, servings and sectionId parameters', async () => {
      const result = await handlers.addRecipeToMealPlan({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Missing required parameters: recipeId, day, servings, sectionId',
      );
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should reject an invalid day format', async () => {
      const result = await handlers.addRecipeToMealPlan({
        recipeId: 5,
        day: '15/01/2024',
        servings: 2,
        sectionId: 3,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('day must be a valid calendar date');
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should reject an impossible calendar date', async () => {
      for (const day of ['2024-02-30', '2024-13-45']) {
        const result = await handlers.addRecipeToMealPlan({
          recipeId: 5,
          day,
          servings: 2,
          sectionId: 3,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('day must be a valid calendar date');
      }
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should reject non-positive servings', async () => {
      const result = await handlers.addRecipeToMealPlan({
        recipeId: 5,
        day: '2024-01-15',
        servings: 0,
        sectionId: 3,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('servings must be a positive number');
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should reject section ids that cannot exist in Grocy (0, negative, fractional)', async () => {
      for (const sectionId of [0, -2, 1.5]) {
        const result = await handlers.addRecipeToMealPlan({
          recipeId: 5,
          day: '2024-01-15',
          servings: 2,
          sectionId,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          'sectionId must be a section id from recipes_mealplan_get_sections, or -1 for no section',
        );
      }
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should reject a non-numeric sectionId', async () => {
      const result = await handlers.addRecipeToMealPlan({
        recipeId: 5,
        day: '2024-01-15',
        servings: 2,
        sectionId: 'dinner',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('sectionId must be a valid number');
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });
  });

  describe('addNoteToMealPlan', () => {
    it('should add a note to the meal plan in a section', async () => {
      const mockResponse = { created_object_id: '13' };
      mockApiClient.request.mockResolvedValue({ data: mockResponse, status: 200, headers: {} });

      const result = await handlers.addNoteToMealPlan({
        day: '2024-01-15',
        note: 'Leftovers',
        sectionId: 2,
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'POST',
        body: { day: '2024-01-15', type: 'note', note: 'Leftovers', section_id: 2 },
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Note added to meal plan successfully');
      // created_object_id is normalized to a number by BaseToolHandler
      expect(result.structuredContent?.data).toEqual({ created_object_id: 13 });
    });

    it('should accept -1 as the explicit "no section" value', async () => {
      mockApiClient.request.mockResolvedValue({ data: {}, status: 200, headers: {} });

      const result = await handlers.addNoteToMealPlan({
        day: '2024-01-15',
        note: 'Eating out',
        sectionId: -1,
      });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'POST',
        body: { day: '2024-01-15', type: 'note', note: 'Eating out', section_id: -1 },
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
    });

    it('should require day, note and sectionId parameters', async () => {
      const result = await handlers.addNoteToMealPlan({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: day, note, sectionId');
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should handle missing args', async () => {
      const result = await handlers.addNoteToMealPlan(undefined);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: day, note, sectionId');
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should reject a whitespace-only note', async () => {
      const result = await handlers.addNoteToMealPlan({
        day: '2024-01-15',
        note: '   ',
        sectionId: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('note must be non-empty text');
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should reject an invalid day format', async () => {
      const result = await handlers.addNoteToMealPlan({
        day: '2024-1-5',
        note: 'Leftovers',
        sectionId: 2,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('day must be a valid calendar date');
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should reject a non-numeric sectionId', async () => {
      const result = await handlers.addNoteToMealPlan({
        day: '2024-01-15',
        note: 'Leftovers',
        sectionId: 'dinner',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('sectionId must be a valid number');
      expect(mockApiClient.request).not.toHaveBeenCalled();
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
      expect(result.content[0].text).toContain('YYYY-MM-DD');
    });

    it('should reject an impossible calendar date', async () => {
      const result = await handlers.getMealPlan({ date: '2026-02-30' });

      expect(result.isError).toBe(true);
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should query the requested week on hosts west of UTC', async () => {
      const previousTz = process.env.TZ;
      process.env.TZ = 'America/New_York';
      try {
        mockApiClient.request.mockResolvedValue({ data: [], status: 200, headers: {} });

        await handlers.getMealPlan({ date: '2026-10-19', weekly: true }); // Monday

        const days = mockApiClient.request.mock.calls.map(
          ([, opts]: any) => opts.queryParams['query[]'],
        );
        expect(days).toEqual([
          'day=2026-10-18',
          'day=2026-10-19',
          'day=2026-10-20',
          'day=2026-10-21',
          'day=2026-10-22',
          'day=2026-10-23',
          'day=2026-10-24',
          'day=2026-10-25',
          'day=2026-10-26',
        ]);
      } finally {
        if (previousTz === undefined) delete process.env.TZ;
        else process.env.TZ = previousTz;
      }
    });

    it('should return empty meal plan when no entries found', async () => {
      // Mock empty responses for all date queries
      mockApiClient.request.mockResolvedValue({
        data: [],
        status: 200,
        headers: {},
      });

      const result = await handlers.getMealPlan({ date: '2024-01-15' });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent?.data).toEqual({
        message: 'No meals planned for the requested date',
        meal_plan_by_date: {},
      });
    });

    it('should get meal plan with enhanced data for single day', async () => {
      const mockMealPlanEntry = {
        id: 1,
        type: 'recipe',
        recipe_id: 73,
        section_id: 2,
        day: '2024-01-15',
        recipe_servings: 2,
        note: null,
        done: 0,
      };

      const mockRecipe = {
        id: 73,
        name: 'Test Recipe',
        product_id: 438,
        userfields: null,
      };

      const mockAllSections = [
        { id: 1, name: 'Breakfast', sort_number: 1, time_info: '08:00' },
        { id: 2, name: 'Dinner', sort_number: 2, time_info: '18:00' },
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

      const response = result.structuredContent?.data;
      expect(response).toEqual({
        meal_plan_by_date: {
          '2024-01-15': [
            {
              id: 1,
              day: '2024-01-15',
              type: 'recipe',
              section_id: 2,
              recipe_id: 73,
              recipe_servings: 2,
              note: null,
              done: 0,
            },
          ],
        },
        recipes: [
          {
            id: 73,
            name: 'Test Recipe',
            product_id: 438,
          },
        ],
        sections: [
          { id: 1, name: 'Breakfast', time_info: '08:00' },
          { id: 2, name: 'Dinner', time_info: '18:00' },
        ],
      });

      // Verify correct API calls were made
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'GET',
        body: undefined,
        queryParams: {
          'query[]': 'day=2024-01-14',
          order: 'day',
        },
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'GET',
        body: undefined,
        queryParams: {
          'query[]': 'day=2024-01-15',
          order: 'day',
        },
      });
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan', {
        method: 'GET',
        body: undefined,
        queryParams: {
          'query[]': 'day=2024-01-16',
          order: 'day',
        },
      });
    });

    it('should pass through entry type and skip recipe lookup for note entries', async () => {
      const recipeEntry = {
        id: 1,
        type: 'recipe',
        recipe_id: 73,
        section_id: 2,
        day: '2024-01-15',
        recipe_servings: 2,
        note: null,
        done: 0,
      };
      const noteEntry = {
        id: 2,
        type: 'note',
        recipe_id: null,
        section_id: -1,
        day: '2024-01-15',
        recipe_servings: 1,
        note: 'Leftovers',
        done: 0,
      };
      // Entry created by the pre-fix add_recipe tool (upstream #2): unknown type but a recipe_id
      const legacyEntry = {
        id: 3,
        type: 'lunch',
        recipe_id: 74,
        section_id: -1,
        day: '2024-01-15',
        recipe_servings: 1,
        note: null,
        done: 0,
      };

      mockApiClient.request
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // day before
        .mockResolvedValueOnce({
          data: [recipeEntry, noteEntry, legacyEntry],
          status: 200,
          headers: {},
        }) // target day
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // day after
        .mockResolvedValueOnce({
          data: { id: 73, name: 'Test Recipe', product_id: 438 },
          status: 200,
          headers: {},
        }) // recipe 73
        .mockResolvedValueOnce({
          data: { id: 74, name: 'Legacy Recipe', product_id: null },
          status: 200,
          headers: {},
        }) // recipe 74
        .mockResolvedValueOnce({
          data: [{ id: -1, name: null, sort_number: -1, time_info: null }],
          status: 200,
          headers: {},
        }); // all sections

      const result = await handlers.getMealPlan({ date: '2024-01-15' });

      expect(result.isError).toBeUndefined();
      const response = result.structuredContent?.data as any;

      expect(response.meal_plan_by_date['2024-01-15']).toHaveLength(3);
      expect(response.meal_plan_by_date['2024-01-15'][1]).toEqual({
        id: 2,
        day: '2024-01-15',
        type: 'note',
        section_id: -1,
        recipe_id: null,
        recipe_servings: 1,
        note: 'Leftovers',
        done: 0,
      });
      expect(response.meal_plan_by_date['2024-01-15'][2].type).toBe('lunch');
      expect(response.recipes).toEqual([
        { id: 73, name: 'Test Recipe', product_id: 438 },
        { id: 74, name: 'Legacy Recipe', product_id: null },
      ]);

      // 3 day queries + 2 recipe lookups + 1 sections call; nothing for the note entry
      expect(mockApiClient.request).toHaveBeenCalledTimes(6);
      expect(mockApiClient.request).not.toHaveBeenCalledWith(
        '/objects/recipes/null',
        expect.anything(),
      );
    });

    it('should not look up any recipe when only note entries are planned', async () => {
      mockApiClient.request
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // day before
        .mockResolvedValueOnce({
          data: [
            {
              id: 5,
              type: 'note',
              recipe_id: null,
              section_id: 1,
              day: '2024-01-15',
              recipe_servings: 1,
              note: 'Eating out',
              done: 0,
            },
          ],
          status: 200,
          headers: {},
        }) // target day
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // day after
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }); // all sections

      const result = await handlers.getMealPlan({ date: '2024-01-15' });

      expect(result.isError).toBeUndefined();
      const response = result.structuredContent?.data as any;
      expect(response.recipes).toEqual([]);
      expect(response.meal_plan_by_date['2024-01-15'][0].type).toBe('note');
      expect(mockApiClient.request).toHaveBeenCalledTimes(4); // 3 day queries + sections
    });

    it('should handle weekly meal plan', async () => {
      const mockMealPlanEntry = {
        id: 1,
        recipe_id: 73,
        section_id: 2,
        day: '2024-01-19',
        recipe_servings: 2,
        note: null,
        done: 0,
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
        .mockResolvedValueOnce({
          data: { id: 73, name: 'Recipe', product_id: null },
          status: 200,
          headers: {},
        }) // recipe
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }); // all sections

      const result = await handlers.getMealPlan({ date: '2024-01-19', weekly: true }); // Friday

      expect(result.isError).toBeUndefined();

      const response = result.structuredContent?.data as any;
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
        { id: 3, name: 'Dinner' },
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockSections,
        status: 200,
        headers: {},
      });

      const result = await handlers.getMealPlanSections();

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan_sections', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('deleteMealPlanEntry', () => {
    it('should delete a meal plan entry', async () => {
      const mockResponse = { success: true };
      mockApiClient.request.mockResolvedValue({
        data: mockResponse,
        status: 200,
        headers: {},
      });

      const result = await handlers.deleteMealPlanEntry({ mealPlanEntryId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan/1', {
        method: 'DELETE',
        body: undefined,
        queryParams: {},
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Meal plan entry deleted successfully');
    });

    it('should require mealPlanEntryId parameter', async () => {
      const result = await handlers.deleteMealPlanEntry({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameters: mealPlanEntryId');
    });
  });

  describe('cookedSomething', () => {
    it('should refuse to complete a note entry without marking it done', async () => {
      mockApiClient.request.mockResolvedValueOnce({
        data: {
          id: 5,
          day: '2024-01-15',
          type: 'note',
          note: 'Leftovers',
          recipe_id: null,
          section_id: 1,
          done: 1, // already done: the type refusal must still win over the done check
        },
        status: 200,
        headers: {},
      });

      const result = await handlers.cookedSomething({ mealPlanEntryId: 5, stockAmounts: [1] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("cannot be cooked (type 'note', no recipe_id)");
      expect(result.content[0].text).not.toContain('already marked as done');
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);
      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/meal_plan/5', {
        method: 'GET',
        body: undefined,
        queryParams: {},
      });
    });

    it('should refuse entries with an unrecognised type before writing', async () => {
      // Entry shape reported in #2 (recipes_mealplan_add_recipe used to post type 'lunch')
      mockApiClient.request.mockResolvedValueOnce({
        data: { id: 6, day: '2024-01-15', type: 'lunch', recipe_id: 2, section_id: -1, done: 0 },
        status: 200,
        headers: {},
      });

      const result = await handlers.cookedSomething({ mealPlanEntryId: 6, stockAmounts: [2] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("cannot be cooked (type 'lunch')");
      expect(result.content[0].text).toContain('recipes_mealplan_delete_entry');
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);
      expect(mockApiClient.request).not.toHaveBeenCalledWith(
        '/objects/meal_plan/6',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('should refuse a recipe-typed entry without recipe_id', async () => {
      mockApiClient.request.mockResolvedValueOnce({
        data: { id: 8, day: '2024-01-15', type: 'recipe', recipe_id: null, section_id: 1, done: 0 },
        status: 200,
        headers: {},
      });

      const result = await handlers.cookedSomething({ mealPlanEntryId: 8, stockAmounts: [1] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("cannot be cooked (type 'recipe', no recipe_id)");
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);
    });

    it('should refuse an entry without a type', async () => {
      mockApiClient.request.mockResolvedValueOnce({
        data: { id: 9, day: '2024-01-15', recipe_id: 2, section_id: 1, done: 0 },
        status: 200,
        headers: {},
      });

      const result = await handlers.cookedSomething({ mealPlanEntryId: 9, stockAmounts: [1] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("cannot be cooked (type 'unknown')");
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);
    });

    it('should mark a recipe entry done and consume its shadow recipe', async () => {
      mockApiClient.request
        .mockResolvedValueOnce({
          data: {
            id: 7,
            day: '2024-01-15',
            type: 'recipe',
            recipe_id: 73,
            recipe_servings: 2,
            section_id: 2,
            done: 0,
          },
          status: 200,
          headers: {},
        }) // GET entry
        .mockResolvedValueOnce({ data: {}, status: 200, headers: {} }) // PUT servings
        .mockResolvedValueOnce({
          data: [{ id: 900, name: '2024-01-15#7' }],
          status: 200,
          headers: {},
        }) // shadow recipe lookup
        .mockResolvedValueOnce({ data: {}, status: 200, headers: {} }) // POST consume
        .mockResolvedValueOnce({ data: {}, status: 200, headers: {} }) // PUT done
        .mockResolvedValueOnce({
          data: { id: 73, name: 'Test Recipe', product_id: null },
          status: 200,
          headers: {},
        }); // GET recipe (no product: no stock split)

      const result = await handlers.cookedSomething({ mealPlanEntryId: 7, stockAmounts: [1, 2] });

      expect(result.isError).toBeUndefined();
      expect(mockApiClient.request).toHaveBeenNthCalledWith(2, '/objects/meal_plan/7', {
        method: 'PUT',
        body: { recipe_servings: 3 },
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenNthCalledWith(3, '/objects/recipes', {
        method: 'GET',
        body: undefined,
        queryParams: { 'query[]': 'name=2024-01-15#7' },
      });
      expect(mockApiClient.request).toHaveBeenNthCalledWith(4, '/recipes/900/consume', {
        method: 'POST',
        body: undefined,
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenNthCalledWith(5, '/objects/meal_plan/7', {
        method: 'PUT',
        body: { done: 1 },
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenCalledTimes(6);
      expect((result.structuredContent?.data as any).completedSteps).toEqual([
        'Recipe consumed via meal plan entry',
        'Meal plan entry marked as done',
      ]);
    });

    it('should not mark the entry done and should restore servings when the consume fails', async () => {
      mockApiClient.request
        .mockResolvedValueOnce({
          data: {
            id: 7,
            day: '2024-01-15',
            type: 'recipe',
            recipe_id: 73,
            recipe_servings: 2,
            section_id: 2,
            done: 0,
          },
          status: 200,
          headers: {},
        }) // GET entry
        .mockResolvedValueOnce(OK) // PUT servings
        .mockResolvedValueOnce({
          data: [{ id: 900, name: '2024-01-15#7' }],
          status: 200,
          headers: {},
        }) // shadow recipe lookup
        .mockRejectedValueOnce(new Error('Not enough in stock')) // POST consume
        .mockResolvedValueOnce(OK); // PUT restore

      const result = await handlers.cookedSomething({ mealPlanEntryId: 7, stockAmounts: [1, 2] });

      expect(result.isError).toBe(true);
      expect(mockApiClient.request).toHaveBeenNthCalledWith(5, '/objects/meal_plan/7', {
        method: 'PUT',
        body: { recipe_servings: 2 },
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenCalledTimes(5);
      expect(mockApiClient.request).not.toHaveBeenCalledWith(
        '/objects/meal_plan/7',
        expect.objectContaining({ body: expect.objectContaining({ done: 1 }) }),
      );
    });

    it('should restore servings when the shadow recipe is missing', async () => {
      mockApiClient.request
        .mockResolvedValueOnce({
          data: {
            id: 7,
            day: '2024-01-15',
            type: 'recipe',
            recipe_id: 73,
            recipe_servings: 2,
            done: 0,
          },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce(OK) // PUT servings
        .mockResolvedValueOnce({ data: [], status: 200, headers: {} }) // no shadow recipe
        .mockResolvedValueOnce(OK); // PUT restore

      const result = await handlers.cookedSomething({ mealPlanEntryId: 7, stockAmounts: [3] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('shadow recipe');
      expect(mockApiClient.request).toHaveBeenNthCalledWith(4, '/objects/meal_plan/7', {
        method: 'PUT',
        body: { recipe_servings: 2 },
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenCalledTimes(4);
    });

    it('should consume a direct recipe at the requested total servings and restore them', async () => {
      const { config } = await import('../../config/index.js');
      vi.mocked(config.parseToolConfiguration).mockReturnValueOnce({
        toolSubConfigs: new Map([
          [
            'recipes_cooking_complete',
            new Map([
              ['print_labels', false],
              ['allow_no_meal_plan', true],
            ]),
          ],
        ]),
      } as any);
      mockApiClient.request
        .mockResolvedValueOnce({ data: { id: 7, desired_servings: 1 }, status: 200, headers: {} })
        .mockResolvedValueOnce(OK) // PUT desired_servings 4
        .mockResolvedValueOnce(OK) // POST consume
        .mockResolvedValueOnce(OK) // PUT restore
        .mockResolvedValueOnce({ data: { id: 7, product_id: null }, status: 200, headers: {} });

      const result = await handlers.cookedSomething({ recipeId: 7, stockAmounts: [2, 2] });

      expect(result.isError).toBeUndefined();
      expect(mockApiClient.request).toHaveBeenNthCalledWith(2, '/objects/recipes/7', {
        method: 'PUT',
        body: { desired_servings: 4 },
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenNthCalledWith(3, '/recipes/7/consume', {
        method: 'POST',
        body: undefined,
        queryParams: {},
      });
      expect(mockApiClient.request).toHaveBeenNthCalledWith(4, '/objects/recipes/7', {
        method: 'PUT',
        body: { desired_servings: 1 },
        queryParams: {},
      });
    });

    it('should print a label for each split stock entry', async () => {
      const splitSpy = vi
        .spyOn((handlers as any).inventoryHandlers, 'splitStockEntry')
        .mockResolvedValue([
          { stockId: 50, amount: 1, type: 'updated', unit: '' },
          { stockId: 51, amount: 2, type: 'new', unit: '' },
          { stockId: 52, amount: 2, type: 'new', unit: '' },
        ]);
      mockApiClient.request.mockImplementation(async (endpoint: string, opts: any = {}) => {
        let data: any = {};
        if (endpoint === '/objects/meal_plan/7' && opts.method === 'GET')
          data = {
            id: 7,
            day: '2024-01-15',
            type: 'recipe',
            recipe_id: 73,
            recipe_servings: 2,
            done: 0,
          };
        else if (endpoint === '/objects/recipes' && opts.method === 'GET')
          data = [{ id: 900, name: '2024-01-15#7' }];
        else if (endpoint === '/objects/recipes/73') data = { id: 73, product_id: 40 };
        else if (endpoint === '/objects/products/40') data = { id: 40, qu_id_stock: null };
        else if (endpoint === '/stock/products/40/entries') data = [{ id: 50, amount: 5 }];
        return { data, status: 200, headers: {} } as any;
      });

      const result = await handlers.cookedSomething({
        mealPlanEntryId: 7,
        stockAmounts: [1, 2, 2],
      });

      expect(result.isError).toBeUndefined();
      expect(splitSpy).toHaveBeenCalled();
      const printed = mockApiClient.request.mock.calls
        .map(([endpoint]) => endpoint)
        .filter((endpoint) => endpoint.endsWith('/printlabel'));
      expect(printed).toEqual([
        '/stock/entry/50/printlabel',
        '/stock/entry/51/printlabel',
        '/stock/entry/52/printlabel',
      ]);
    });

    it('should take the per-unit entries as they are for label-per-unit products', async () => {
      const splitSpy = vi.spyOn((handlers as any).inventoryHandlers, 'splitStockEntry');
      mockApiClient.request.mockImplementation(async (endpoint: string, opts: any = {}) => {
        let data: any = {};
        if (endpoint === '/objects/meal_plan/7' && opts.method === 'GET')
          data = { id: 7, day: '2024-01-15', type: 'recipe', recipe_id: 73, recipe_servings: 2 };
        else if (endpoint === '/objects/recipes' && opts.method === 'GET')
          data = [{ id: 900, name: '2024-01-15#7' }];
        else if (endpoint === '/objects/recipes/73') data = { id: 73, product_id: 40 };
        else if (endpoint === '/objects/products/40')
          data = { id: 40, qu_id_stock: null, default_stock_label_type: 2 };
        else if (endpoint === '/stock/products/40/entries')
          data = [
            { id: 61, amount: 1 },
            { id: 60, amount: 1 },
          ];
        return { data, status: 200, headers: {} } as any;
      });

      const result = await handlers.cookedSomething({ mealPlanEntryId: 7, stockAmounts: [1, 1] });

      expect(result.isError).toBeUndefined();
      expect(splitSpy).not.toHaveBeenCalled();
      expect(mockApiClient.request).toHaveBeenCalledWith('/stock/products/40/entries', {
        method: 'GET',
        body: undefined,
        queryParams: { order: 'id:desc', limit: '2' },
      });
      const printed = mockApiClient.request.mock.calls
        .map(([endpoint]: any) => endpoint)
        .filter((endpoint: string) => endpoint.endsWith('/printlabel'));
      expect(printed).toEqual(['/stock/entry/61/printlabel', '/stock/entry/60/printlabel']);
    });

    it('should report a skipped split instead of failing when the newest lot does not match', async () => {
      mockApiClient.request.mockImplementation(async (endpoint: string, opts: any = {}) => {
        let data: any = {};
        if (endpoint === '/objects/meal_plan/7' && opts.method === 'GET')
          data = {
            id: 7,
            day: '2024-01-15',
            type: 'recipe',
            recipe_id: 73,
            recipe_servings: 2,
            done: 0,
          };
        else if (endpoint === '/objects/recipes' && opts.method === 'GET')
          data = [{ id: 900, name: '2024-01-15#7' }];
        else if (endpoint === '/objects/recipes/73') data = { id: 73, product_id: 40 };
        else if (endpoint === '/objects/products/40') data = { id: 40, qu_id_stock: null };
        else if (endpoint === '/stock/products/40/entries') data = [{ id: 50, amount: 9 }];
        return { data, status: 200, headers: {} } as any;
      });

      const result = await handlers.cookedSomething({ mealPlanEntryId: 7, stockAmounts: [2, 2] });

      expect(result.isError).toBeUndefined();
      expect(JSON.stringify(result.structuredContent)).toContain('Stock entry split skipped');
      const writes = mockApiClient.request.mock.calls.filter(
        ([endpoint, opts]: any) => endpoint.startsWith('/stock/') && opts?.method !== 'GET',
      );
      expect(writes).toEqual([]);
    });
  });

  describe('searchRecipes', () => {
    it('should search recipes by name', async () => {
      const mockRecipes = [
        { id: 1, name: 'Pasta Recipe', description: 'Delicious pasta' },
        { id: 2, name: 'Pizza Recipe', description: 'Tasty pizza' },
        { id: 3, name: 'Salad Recipe', description: 'Fresh salad' },
      ];
      mockApiClient.request.mockResolvedValue({
        data: mockRecipes,
        status: 200,
        headers: {},
      });

      const result = await handlers.searchRecipes({ query: 'pasta' });

      expect(mockApiClient.request).toHaveBeenCalledWith('/objects/recipes', {
        method: 'GET',
        body: undefined,
        queryParams: { 'query[]': 'type=normal' },
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
        headers: {},
      });

      const result = await handlers.getRecipeNutrition({ recipeId: 1 });

      expect(mockApiClient.request).toHaveBeenCalledWith('/recipes/1/nutrition', {
        method: 'GET',
        body: undefined,
        queryParams: {},
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
        queryParams: {},
      });
      expect(result.isError).toBeFalsy();
    });
  });
});

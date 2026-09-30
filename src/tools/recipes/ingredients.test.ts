import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/client.js', () => ({
  default: { request: vi.fn(), get: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('../../config/index.js', () => ({
  config: { server: { serialize_structured_to_content: false } },
}));

import apiClient from '../../api/client.js';
import { RecipeIngredientHandlers } from './ingredients.js';

const mockRequest = vi.mocked(apiClient).request;

const KILO = 2;
const GRAMO = 5;
const LITRO = 4;
const CUCHARADA = 6;
const UNIDAD = 3;
const UNITS = [
  { id: KILO, name: 'Kilo', name_plural: 'Kilos' },
  { id: GRAMO, name: 'Gramo', name_plural: 'Gramos' },
  { id: LITRO, name: 'Litro', name_plural: 'Litros' },
  { id: CUCHARADA, name: 'Cucharada', name_plural: 'Cucharadas' },
  { id: UNIDAD, name: 'Unidad', name_plural: 'Unidades' },
];
const PRODUCTS: Record<number, any> = {
  8: { id: 8, name: 'Magro de cerdo', qu_id_stock: KILO },
  9: { id: 9, name: '- Aceite de oliva', qu_id_stock: LITRO },
};
// Grocy's resolved graph: both directions per product.
const CONVERSIONS: Record<number, any[]> = {
  8: [
    { from_qu_id: GRAMO, to_qu_id: KILO, factor: 0.001 },
    { from_qu_id: KILO, to_qu_id: GRAMO, factor: 1000 },
  ],
  9: [
    { from_qu_id: CUCHARADA, to_qu_id: LITRO, factor: 0.015 },
    { from_qu_id: LITRO, to_qu_id: CUCHARADA, factor: 66.6666666667 },
  ],
};
let ROWS: Record<number, any> = {};

function grocy() {
  mockRequest.mockImplementation(async (endpoint: string, opts: any = {}) => {
    const method = opts.method ?? 'GET';
    const query = opts.queryParams?.['query[]'] as string | undefined;
    let data: any;
    if (endpoint === '/objects/quantity_units') data = UNITS;
    else if (endpoint.startsWith('/objects/products/'))
      data = PRODUCTS[Number(endpoint.split('/').pop())];
    else if (endpoint === '/objects/quantity_unit_conversions_resolved')
      data = CONVERSIONS[Number(query!.split('=')[1])] ?? [];
    else if (endpoint === '/objects/recipes_pos' && method === 'GET')
      data = Object.values(ROWS).filter((r) => `recipe_id=${r.recipe_id}` === query);
    else if (endpoint === '/objects/recipes_pos' && method === 'POST')
      data = { created_object_id: '77' };
    else if (endpoint.startsWith('/objects/recipes_pos/') && method === 'GET')
      data = ROWS[Number(endpoint.split('/').pop())];
    else data = {};
    return { data, status: 200, headers: {} } as any;
  });
}

function writes(method: string) {
  return mockRequest.mock.calls.filter(([, opts]: any) => opts?.method === method);
}

describe('RecipeIngredientHandlers', () => {
  let handlers: RecipeIngredientHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    ROWS = {};
    grocy();
    handlers = new RecipeIngredientHandlers();
  });

  it('stores 500 g of a kilo product as 0.5 (the stock unit), shown in grams', async () => {
    const result = await handlers.addIngredient({
      recipeId: 139,
      productId: 8,
      amount: 500,
      unit: 'Gramo',
    });

    expect(result.isError).toBeUndefined();
    const [[endpoint, opts]] = writes('POST') as any;
    expect(endpoint).toBe('/objects/recipes_pos');
    expect(opts.body).toMatchObject({ recipe_id: 139, product_id: 8, amount: 0.5, qu_id: GRAMO });
    expect(result.content[0]!.text).toContain('stored as 0.5 Kilo');
  });

  it('converts cooking units through Grocy conversions (2 tablespoons of oil = 0.03 L)', async () => {
    await handlers.addIngredient({ recipeId: 139, productId: 9, amount: 2, unit: 'cucharadas' });
    const [[, opts]] = writes('POST') as any;
    expect(opts.body).toMatchObject({ amount: 0.03, qu_id: CUCHARADA });
  });

  it('accepts a unit id and defaults to the stock unit', async () => {
    await handlers.addIngredient({ recipeId: 1, productId: 8, amount: 250, unit: String(GRAMO) });
    await handlers.addIngredient({ recipeId: 1, productId: 8, amount: 0.25 });
    const bodies = writes('POST').map(([, opts]: any) => opts.body);
    expect(bodies.map((b: any) => [b.amount, b.qu_id])).toEqual([
      [0.25, GRAMO],
      [0.25, KILO],
    ]);
  });

  it('refuses a unit without a conversion instead of storing the number as is', async () => {
    const result = await handlers.addIngredient({
      recipeId: 139,
      productId: 8,
      amount: 2,
      unit: 'Unidad',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain(
      'No quantity unit conversion from "Unidad" to "Kilo"',
    );
    expect(writes('POST')).toHaveLength(0);
  });

  it('rejects unknown units and non-positive amounts', async () => {
    const unknown = await handlers.addIngredient({
      recipeId: 1,
      productId: 8,
      amount: 1,
      unit: 'Pizca',
    });
    const zero = await handlers.addIngredient({
      recipeId: 1,
      productId: 8,
      amount: 0,
      unit: 'Gramo',
    });
    expect(unknown.content[0]!.text).toContain('does not exist');
    expect(zero.isError).toBe(true);
    expect(writes('POST')).toHaveLength(0);
  });

  it('lists what Grocy shows next to what it stores', async () => {
    ROWS = {
      1044: { id: 1044, recipe_id: 139, product_id: 8, amount: 0.5, qu_id: GRAMO, note: '' },
    };
    const result = await handlers.getIngredients({ recipeId: 139 });
    const [row] = (result.structuredContent as any).data;
    expect(row).toMatchObject({
      ingredientId: 1044,
      productName: 'Magro de cerdo',
      amount: 500,
      unit: 'Gramo',
      stockAmount: 0.5,
      stockUnit: 'Kilo',
    });
  });

  it("updates the amount in the ingredient's current unit", async () => {
    ROWS = { 1044: { id: 1044, recipe_id: 139, product_id: 8, amount: 0.5, qu_id: GRAMO } };
    await handlers.updateIngredient({ ingredientId: 1044, amount: 400 });
    const [[endpoint, opts]] = writes('PUT') as any;
    expect(endpoint).toBe('/objects/recipes_pos/1044');
    expect(opts.body).toEqual({ product_id: 8, amount: 0.4, qu_id: GRAMO });
  });

  it('needs an amount when the unit or product changes', async () => {
    ROWS = { 1044: { id: 1044, recipe_id: 139, product_id: 8, amount: 0.5, qu_id: GRAMO } };
    const result = await handlers.updateIngredient({ ingredientId: 1044, unit: 'Kilo' });
    expect(result.isError).toBe(true);
    expect(writes('PUT')).toHaveLength(0);
  });

  it('updates a note without touching the amount', async () => {
    ROWS = { 1044: { id: 1044, recipe_id: 139, product_id: 8, amount: 0.5, qu_id: GRAMO } };
    await handlers.updateIngredient({ ingredientId: 1044, note: 'en tacos' });
    const [[, opts]] = writes('PUT') as any;
    expect(opts.body).toEqual({ note: 'en tacos' });
  });
});

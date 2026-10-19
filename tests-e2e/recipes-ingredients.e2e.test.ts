import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { GrocyApi } from './harness/grocy-api.js';
import { McpSession } from './harness/mcp.js';
import { RecipesSeed, type Units } from './recipes-seed.js';

describe('recipes: management, ingredients and fulfillment', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  const seed = new RecipesSeed(grocy, 'ingr');
  let mcp: McpSession;
  let units: Units;
  let loc: number;
  let flour: number; // kg, kg <-> g
  let sugar: number; // kg, kg <-> g
  let salt: number; // kg, no conversion at all

  beforeAll(async () => {
    mcp = await McpSession.start(inject('grocyUrl'));
    units = await seed.units();
    loc = await seed.location();
    flour = await seed.weighedProduct('flour', units, loc);
    sugar = await seed.weighedProduct('sugar', units, loc);
    salt = await seed.product('salt', units.kg, loc);
  });
  afterAll(() => mcp?.close());

  const posRows = (recipeId: number) => grocy.objects('recipes_pos', `recipe_id=${recipeId}`);

  describe('recipes_management_*', () => {
    it('creates a normal recipe with base servings, description and instructions', async () => {
      const name = seed.name('created');
      const res = await mcp.ok('recipes_management_create', {
        name,
        baseServings: 4,
        description: 'A test dish',
        instructions: 'Mix and bake',
      });
      const id = Number(res.data.created_object_id);
      expect(id).toBeGreaterThan(0);

      const row = await grocy.get('recipes', id);
      expect(row.name).toBe(name);
      expect(Number(row.base_servings)).toBe(4);
      expect(row.type).toBe('normal');
      expect(row.description).toBe('A test dish\n\nMix and bake');

      const list = await mcp.ok('recipes_management_get', { fields: ['id', 'name'] });
      expect(list.data).toContainEqual({ id, name });
      expect(Object.keys(list.data[0]).sort()).toEqual(['id', 'name']);

      const byId = await mcp.ok('recipes_management_get_by_id', { recipeId: id });
      expect(byId.data.name).toBe(name);
      expect(Number(byId.data.base_servings)).toBe(4);
    });

    it('defaults base servings to 1', async () => {
      const res = await mcp.ok('recipes_management_create', { name: seed.name('default') });
      const row = await grocy.get('recipes', Number(res.data.created_object_id));
      expect(Number(row.base_servings)).toBe(1);
      expect(row.description ?? '').toBe('');
    });

    it('does not list meal plan shadow recipes', async () => {
      const recipe = await seed.recipe('shadowed');
      const entry = await grocy.create('meal_plan', {
        day: '2036-01-07',
        type: 'recipe',
        recipe_id: recipe,
        recipe_servings: 1,
        section_id: -1,
      });
      const shadows = await grocy.objects('recipes', `name=2036-01-07#${entry}`);
      expect(shadows).toHaveLength(1);

      const list = await mcp.ok('recipes_management_get', { fields: ['id', 'name', 'type'] });
      expect(list.data.map((r: any) => r.type)).not.toContain('mealplan-shadow');
      expect(list.data.map((r: any) => Number(r.id))).toContain(recipe);
      await grocy.request('DELETE', `objects/meal_plan/${entry}`);
    });

    // Grocy's default config calls the label webhook server side (LABEL_PRINTER_RUN_SERVER=true)
    // with an empty LABEL_PRINTER_WEBHOOK, so a print fails in its HTTP client
    it('print_label reports that no printer webhook is reachable, leaving the recipe', async () => {
      const id = await seed.recipe('label', 3);
      const before = await grocy.get('recipes', id);
      const res = await mcp.call('recipes_management_print_label', { recipeId: id });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/cURL error|URL rejected|URI must include/);
      expect(res.text).not.toMatch(/printed successfully/i);
      expect(await grocy.get('recipes', id)).toEqual(before);

      const unknown = await mcp.call('recipes_management_print_label', { recipeId: 999_999 });
      expect(unknown.isError).toBe(true);
    });
  });

  describe('recipes_ingredients_*', () => {
    let recipe: number;
    beforeAll(async () => {
      recipe = await seed.recipe('dough', 2);
    });

    it('add: converts an amount in grams into the kilo stock unit', async () => {
      const res = await mcp.ok('recipes_ingredients_add', {
        recipeId: recipe,
        productId: flour,
        amount: 500,
        unit: units.names.g,
        note: 'sifted',
      });
      expect(res.text).toContain('0.5');
      const id = Number(res.data.created_object_id);
      const row = await grocy.get('recipes_pos', id);
      expect(Number(row.recipe_id)).toBe(recipe);
      expect(Number(row.product_id)).toBe(flour);
      expect(Number(row.amount)).toBeCloseTo(0.5, 9);
      expect(Number(row.qu_id)).toBe(units.g);
      expect(row.note).toBe('sifted');
      expect(Number(row.only_check_single_unit_in_stock)).toBe(0);

      // Grocy itself reads it as 0.5 kg per 2 servings
      const resolved = await grocy.objects('recipes_pos_resolved', `recipe_pos_id=${id}`);
      expect(Number(resolved[0].recipe_amount)).toBeCloseTo(0.5, 9);
    });

    it('add: accepts the unit id and defaults to the stock unit', async () => {
      const byId = await mcp.ok('recipes_ingredients_add', {
        recipeId: recipe,
        productId: sugar,
        amount: 250,
        unit: String(units.g),
      });
      const row = await grocy.get('recipes_pos', Number(byId.data.created_object_id));
      expect(Number(row.amount)).toBeCloseTo(0.25, 9);
      expect(Number(row.qu_id)).toBe(units.g);

      const noUnit = await mcp.ok('recipes_ingredients_add', {
        recipeId: recipe,
        productId: salt,
        amount: 0.01,
        onlyCheckSingleUnitInStock: true,
      });
      const saltRow = await grocy.get('recipes_pos', Number(noUnit.data.created_object_id));
      expect(Number(saltRow.amount)).toBeCloseTo(0.01, 9);
      expect(Number(saltRow.qu_id)).toBe(units.kg);
      expect(Number(saltRow.only_check_single_unit_in_stock)).toBe(1);
    });

    it('add: refuses a unit the product has no conversion from, writing nothing', async () => {
      const before = await posRows(recipe);
      const res = await mcp.call('recipes_ingredients_add', {
        recipeId: recipe,
        productId: flour,
        amount: 2,
        unit: units.names.cup,
      });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/conversion/i);
      expect(await posRows(recipe)).toHaveLength(before.length);

      const unknown = await mcp.call('recipes_ingredients_add', {
        recipeId: recipe,
        productId: flour,
        amount: 2,
        unit: 'e2e-recipes-no-such-unit',
      });
      expect(unknown.isError).toBe(true);
      expect(await posRows(recipe)).toHaveLength(before.length);
    });

    // With "only check if any amount is in stock" Grocy keeps the amount in the row's own unit,
    // unconverted, and accepts any unit (productamountpicker.js AllowAnyQu, recipeform.blade.php).
    it('add: an only-check ingredient keeps the amount in its own unit', async () => {
      const pepper = await seed.weighedProduct('pepper', units, loc);
      const res = await mcp.ok('recipes_ingredients_add', {
        recipeId: recipe,
        productId: pepper,
        amount: 5,
        unit: units.names.g,
        onlyCheckSingleUnitInStock: true,
      });
      const row = await grocy.get('recipes_pos', Number(res.data.created_object_id));
      expect(Number(row.qu_id)).toBe(units.g);
      expect(Number(row.amount)).toBeCloseTo(5, 9);

      const cup = await mcp.call('recipes_ingredients_add', {
        recipeId: recipe,
        productId: pepper,
        amount: 1,
        unit: units.names.cup,
        onlyCheckSingleUnitInStock: true,
      });
      expect(cup.isError).toBe(false);
    });

    it('update/get: an only-check ingredient stays in its own unit', async () => {
      const own = await seed.recipe('only-check', 1);
      const id = await seed.ingredient(own, flour, 0.5, units.g);
      // switching the flag on keeps the 500 g Grocy shows, now stored as 500 in grams
      await mcp.ok('recipes_ingredients_update', {
        ingredientId: id,
        onlyCheckSingleUnitInStock: true,
      });
      let row = await grocy.get('recipes_pos', id);
      expect(Number(row.amount)).toBeCloseTo(500, 9);
      expect(Number(row.only_check_single_unit_in_stock)).toBe(1);

      await mcp.ok('recipes_ingredients_update', { ingredientId: id, amount: 20 });
      row = await grocy.get('recipes_pos', id);
      expect(Number(row.amount)).toBeCloseTo(20, 9);
      expect(Number(row.qu_id)).toBe(units.g);

      const res = await mcp.ok('recipes_ingredients_get', { recipeId: own });
      expect(res.data[0]).toMatchObject({
        amount: 20,
        unit: units.names.g,
        stockAmount: 0.02,
        onlyCheckSingleUnitInStock: true,
      });
    });

    it('get: shows amount in the row unit and the stored stock amount', async () => {
      // its own recipe, so it does not rely on what the add tests wrote
      const own = await seed.recipe('get', 2);
      await seed.ingredient(own, flour, 0.5, units.g, { note: 'sifted' });
      await seed.ingredient(own, salt, 0.01, units.kg, { only_check_single_unit_in_stock: 1 });
      const res = await mcp.ok('recipes_ingredients_get', { recipeId: own });
      const flourRow = res.data.find((r: any) => r.productId === flour);
      expect(flourRow).toMatchObject({
        amount: 500,
        unit: units.names.g,
        stockAmount: 0.5,
        stockUnit: units.names.kg,
        note: 'sifted',
        onlyCheckSingleUnitInStock: false,
      });
      expect(res.data.find((r: any) => r.productId === salt)).toMatchObject({
        stockAmount: 0.01,
        stockUnit: units.names.kg,
        onlyCheckSingleUnitInStock: true,
      });
      expect(res.data).toHaveLength(2);
      expect(res.data.every((r: any) => r.ingredientId > 0 && r.stockUnit)).toBe(true);
    });

    it('update: a new amount keeps the current unit and is stored in the stock unit', async () => {
      const id = await seed.ingredient(recipe, flour, 0.5, units.g, { note: 'sifted' });
      await mcp.ok('recipes_ingredients_update', { ingredientId: id, amount: 750 });
      const after = await grocy.get('recipes_pos', id);
      expect(Number(after.amount)).toBeCloseTo(0.75, 9);
      expect(Number(after.qu_id)).toBe(units.g);
      expect(after.note).toBe('sifted');

      await mcp.ok('recipes_ingredients_update', {
        ingredientId: id,
        amount: 1.2,
        unit: units.names.kg,
      });
      const inKg = await grocy.get('recipes_pos', id);
      expect(Number(inKg.amount)).toBeCloseTo(1.2, 9);
      expect(Number(inKg.qu_id)).toBe(units.kg);
    });

    it('update: a product change keeps the unit and converts for the new product', async () => {
      const ing = await seed.ingredient(recipe, flour, 0.3, units.g);
      const res = await mcp.ok('recipes_ingredients_update', {
        ingredientId: ing,
        productId: sugar,
        amount: 300,
      });
      expect(res.data).toMatchObject({ product_id: sugar, qu_id: units.g });
      const row = await grocy.get('recipes_pos', ing);
      expect(Number(row.product_id)).toBe(sugar);
      expect(Number(row.amount)).toBeCloseTo(0.3, 9);
      expect(Number(row.qu_id)).toBe(units.g);
    });

    it('update: refuses a product change the unit cannot convert to, leaving the row', async () => {
      const ing = await seed.ingredient(recipe, flour, 0.2, units.g);
      const res = await mcp.call('recipes_ingredients_update', {
        ingredientId: ing,
        productId: salt,
        amount: 200,
      });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/conversion/i);
      const row = await grocy.get('recipes_pos', ing);
      expect(Number(row.product_id)).toBe(flour);
      expect(Number(row.amount)).toBeCloseTo(0.2, 9);

      const noAmount = await mcp.call('recipes_ingredients_update', {
        ingredientId: ing,
        productId: sugar,
      });
      expect(noAmount.isError).toBe(true);
      expect(Number((await grocy.get('recipes_pos', ing)).product_id)).toBe(flour);
    });

    it('update: note and flags only leave the amount alone', async () => {
      const ing = await seed.ingredient(recipe, sugar, 0.1, units.g);
      await mcp.ok('recipes_ingredients_update', {
        ingredientId: ing,
        note: 'brown',
        notCheckStockFulfillment: true,
      });
      const row = await grocy.get('recipes_pos', ing);
      expect(row.note).toBe('brown');
      expect(Number(row.not_check_stock_fulfillment)).toBe(1);
      expect(Number(row.amount)).toBeCloseTo(0.1, 9);
      expect(Number(row.qu_id)).toBe(units.g);
    });

    it('delete: removes the ingredient row', async () => {
      const ing = await seed.ingredient(recipe, sugar, 0.1, units.kg);
      const res = await mcp.ok('recipes_ingredients_delete', { ingredientId: ing });
      expect(res.data).toEqual({ ingredientId: ing });
      expect((await posRows(recipe)).map((r) => Number(r.id))).not.toContain(ing);
    });
  });

  describe('recipes_fulfillment_*', () => {
    it('reports missing stock, then fulfilled once enough is bought', async () => {
      const oats = await seed.weighedProduct('oats', units, loc);
      const recipe = await seed.recipe('porridge', 1);
      await mcp.ok('recipes_ingredients_add', {
        recipeId: recipe,
        productId: oats,
        amount: 400,
        unit: units.names.g,
      });

      const short = await mcp.ok('recipes_fulfillment_get', { recipeId: recipe });
      expect(Number(short.data.recipe_id)).toBe(recipe);
      expect(Number(short.data.need_fulfilled)).toBe(0);
      expect(Number(short.data.missing_products_count)).toBe(1);

      await seed.purchase(oats, 0.3);
      const stillShort = await mcp.ok('recipes_fulfillment_get', { recipeId: recipe });
      expect(Number(stillShort.data.need_fulfilled)).toBe(0);

      await seed.purchase(oats, 0.2);
      const ok = await mcp.ok('recipes_fulfillment_get', { recipeId: recipe });
      expect(Number(ok.data.need_fulfilled)).toBe(1);
      expect(Number(ok.data.missing_products_count)).toBe(0);

      const all = await mcp.ok('recipes_fulfillment_get_all');
      const mine = all.data.find((r: any) => Number(r.recipe_id) === recipe);
      expect(Number(mine.need_fulfilled)).toBe(1);
    });
  });
});

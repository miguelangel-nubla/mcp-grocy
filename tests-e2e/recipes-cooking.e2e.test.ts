import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { GrocyApi } from './harness/grocy-api.js';
import { McpSession } from './harness/mcp.js';
import { RecipesSeed, type Units } from './recipes-seed.js';

const COMPLETE_MEAL_PLAN_MODE = {
  recipes_cooking_complete: {
    allow_no_meal_plan: false,
    allow_meal_plan_entry_already_done: false,
    print_labels: false,
  },
};

describe('recipes: cooking', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  const seed = new RecipesSeed(grocy, 'cook');
  let direct: McpSession; // harness default: recipes_cooking_complete takes recipeId
  let mealPlan: McpSession; // recipes_cooking_complete takes mealPlanEntryId
  let printing: McpSession; // direct mode with print_labels on (the tool's default)
  let recook: McpSession; // meal plan mode that allows an entry already done
  let units: Units;
  let loc: number;

  beforeAll(async () => {
    [direct, mealPlan, printing, recook] = await Promise.all([
      McpSession.start(inject('grocyUrl')),
      McpSession.start(inject('grocyUrl'), COMPLETE_MEAL_PLAN_MODE),
      McpSession.start(inject('grocyUrl'), {
        recipes_cooking_complete: { allow_no_meal_plan: true, print_labels: true },
      }),
      McpSession.start(inject('grocyUrl'), {
        recipes_cooking_complete: {
          ...COMPLETE_MEAL_PLAN_MODE.recipes_cooking_complete,
          allow_meal_plan_entry_already_done: true,
        },
      }),
    ]);
    units = await seed.units();
    loc = await seed.location();
  });
  afterAll(async () => {
    await direct?.close();
    await mealPlan?.close();
    await printing?.close();
    await recook?.close();
  });

  const consumeLog = (productId: number) =>
    grocy.objects('stock_log', `product_id=${productId}`, 'transaction_type=consume', 'undone=0');
  const producedLog = (productId: number) =>
    grocy.objects(
      'stock_log',
      `product_id=${productId}`,
      'transaction_type=self-production',
      'undone=0',
    );

  /** A recipe (base 2 servings) using 0.4 kg flour that produces a portion product. */
  async function dish(productExtra: Record<string, unknown> = {}, flourPrice = 2) {
    const flour = await seed.weighedProduct('flour', units, loc);
    await seed.purchase(flour, 2, flourPrice);
    const produced = await seed.product('portion', units.portion, loc, productExtra);
    const recipe = await seed.recipe('pie', 2, { product_id: produced });
    await seed.ingredient(recipe, flour, 0.4, units.g);
    return { flour, produced, recipe };
  }

  describe('recipes_cooking_consume', () => {
    it('consumes the ingredients scaled to servings and restores desired_servings', async () => {
      const flour = await seed.weighedProduct('flour', units, loc);
      const butter = await seed.weighedProduct('butter', units, loc);
      const salt = await seed.product('salt', units.kg, loc);
      await seed.purchase(flour, 1);
      await seed.purchase(butter, 1);
      await seed.purchase(salt, 1);
      const recipe = await seed.recipe('bread', 2);
      await seed.ingredient(recipe, flour, 0.4, units.g);
      await seed.ingredient(recipe, butter, 0.05, units.kg);
      // "only check if any is in stock": never consumed
      await seed.ingredient(recipe, salt, 0.01, units.kg, { only_check_single_unit_in_stock: 1 });

      const res = await direct.ok('recipes_cooking_consume', { recipeId: recipe, servings: 3 });
      expect(res.text).toContain('3 servings');

      expect(await grocy.stockAmount(flour)).toBeCloseTo(0.4, 6); // 1 - 0.4 * 3/2
      expect(await grocy.stockAmount(butter)).toBeCloseTo(0.925, 6); // 1 - 0.05 * 3/2
      expect(await grocy.stockAmount(salt)).toBeCloseTo(1, 6);

      const [log, ...more] = await consumeLog(flour);
      expect(more).toHaveLength(0);
      expect(Number(log.amount)).toBeCloseTo(-0.6, 6);
      expect(Number(log.recipe_id)).toBe(recipe);

      expect(Number((await grocy.get('recipes', recipe)).desired_servings)).toBe(2);
    });

    it('defaults to 1 serving and rejects a non-positive one without consuming', async () => {
      const flour = await seed.weighedProduct('flour', units, loc);
      await seed.purchase(flour, 1);
      const recipe = await seed.recipe('crackers', 2, { desired_servings: 4 });
      await seed.ingredient(recipe, flour, 0.2, units.kg);

      await direct.ok('recipes_cooking_consume', { recipeId: recipe });
      expect(await grocy.stockAmount(flour)).toBeCloseTo(0.9, 6); // 1 - 0.2 * 1/2
      expect(Number((await grocy.get('recipes', recipe)).desired_servings)).toBe(4);

      const bad = await direct.call('recipes_cooking_consume', { recipeId: recipe, servings: 0 });
      expect(bad.isError).toBe(true);
      expect(await grocy.stockAmount(flour)).toBeCloseTo(0.9, 6);
      expect(Number((await grocy.get('recipes', recipe)).desired_servings)).toBe(4);
    });
  });

  describe('recipes_cooking_complete, direct mode (recipeId)', () => {
    it('consumes for the total servings and splits the produced lot into stockAmounts', async () => {
      const { flour, produced, recipe } = await dish();

      const res = await direct.ok('recipes_cooking_complete', {
        recipeId: recipe,
        stockAmounts: [1, 2],
      });

      // 3 servings of a 2-serving recipe with 0.4 kg
      expect(await grocy.stockAmount(flour)).toBeCloseTo(1.4, 6);
      expect(Number((await grocy.get('recipes', recipe)).desired_servings)).toBe(2);

      expect(await grocy.stockAmount(produced)).toBeCloseTo(3, 6);
      const entries = await grocy.stockEntries(produced);
      expect(entries.map((e) => Number(e.amount)).sort()).toEqual([1, 2]);

      // both lots keep the price Grocy booked for the cooked lot
      const [booked] = await producedLog(produced);
      expect(Number(booked.price)).toBeGreaterThan(0);
      for (const entry of entries) expect(Number(entry.price)).toBeCloseTo(Number(booked.price), 6);

      const split = res.data.stockEntries.splitEntries;
      expect(split.map((e: any) => e.amount)).toEqual([1, 2]);
      expect(split.map((e: any) => Number(e.stockId)).sort()).toEqual(
        entries.map((e) => Number(e.id)).sort(),
      );
      expect(res.data.stockEntries.labelsPrinted).toBe(0);
    });

    it('splits the lot this cook produced, not older stock of the product', async () => {
      const { produced, recipe } = await dish();
      await seed.purchase(produced, 5, 1);
      const [older] = await grocy.stockEntries(produced);

      await direct.ok('recipes_cooking_complete', { recipeId: recipe, stockAmounts: [0.5, 0.5] });

      expect(await grocy.stockAmount(produced)).toBeCloseTo(6, 6);
      const entries = await grocy.stockEntries(produced);
      const kept = entries.find((e) => Number(e.id) === Number(older.id));
      expect(Number(kept.amount)).toBeCloseTo(5, 6);
      expect(
        entries
          .filter((e) => Number(e.id) !== Number(older.id))
          .map((e) => Number(e.amount))
          .sort(),
      ).toEqual([0.5, 0.5]);
    });

    it('label per unit: Grocy books one entry per unit and the tool reports them', async () => {
      const { flour, produced, recipe } = await dish({ default_stock_label_type: 2 });

      const res = await direct.ok('recipes_cooking_complete', {
        recipeId: recipe,
        stockAmounts: [1, 1, 1],
      });

      expect(await grocy.stockAmount(flour)).toBeCloseTo(1.4, 6);
      const entries = await grocy.stockEntries(produced);
      expect(entries.map((e) => Number(e.amount))).toEqual([1, 1, 1]);

      const split = res.data.stockEntries.splitEntries;
      expect(split).toHaveLength(3);
      expect(split.every((e: any) => e.type === 'per_unit' && e.amount === 1)).toBe(true);
      expect(split.map((e: any) => Number(e.stockId)).sort()).toEqual(
        entries.map((e) => Number(e.id)).sort(),
      );
    });

    it('a recipe without a produced product only consumes', async () => {
      const flour = await seed.weighedProduct('flour', units, loc);
      await seed.purchase(flour, 1);
      const recipe = await seed.recipe('soup', 1);
      await seed.ingredient(recipe, flour, 0.1, units.kg);

      const res = await direct.ok('recipes_cooking_complete', {
        recipeId: recipe,
        stockAmounts: [2],
      });
      expect(await grocy.stockAmount(flour)).toBeCloseTo(0.8, 6);
      expect(res.data.stockEntries.splitEntries).toEqual([]);
    });

    it('print_labels on: a printer failure does not undo the cook or the split', async () => {
      const { flour, produced, recipe } = await dish();
      const res = await printing.ok('recipes_cooking_complete', {
        recipeId: recipe,
        stockAmounts: [1, 1],
      });
      // the sandbox has no label printer: every print fails, the cook stands
      expect(res.data.stockEntries.labelsPrinted).toBe(0);
      expect(await grocy.stockAmount(flour)).toBeCloseTo(1.6, 6); // 2 - 0.4 * 2/2
      const entries = await grocy.stockEntries(produced);
      expect(entries.map((e) => Number(e.amount))).toEqual([1, 1]);
    });

    it('rejects a non-positive stock amount without touching stock', async () => {
      const { flour, produced, recipe } = await dish();
      for (const stockAmounts of [[0], [1, -1], []]) {
        const res = await direct.call('recipes_cooking_complete', {
          recipeId: recipe,
          stockAmounts,
        });
        expect(res.isError, JSON.stringify(stockAmounts)).toBe(true);
      }
      expect(await grocy.stockAmount(flour)).toBeCloseTo(2, 6);
      expect(await grocy.stockAmount(produced)).toBe(0);
    });
  });

  describe('recipes_cooking_complete, meal plan mode (mealPlanEntryId)', () => {
    async function planned(day: string, servings = 1) {
      const meal = await dish();
      const entry = await grocy.create('meal_plan', {
        day,
        type: 'recipe',
        recipe_id: meal.recipe,
        recipe_servings: servings,
        section_id: -1,
      });
      return { ...meal, entry };
    }

    it('consumes through the shadow recipe, marks the entry done and splits the lot', async () => {
      const { flour, produced, recipe, entry } = await planned('2036-05-04');
      expect(Number((await grocy.get('meal_plan', entry)).done)).toBe(0);

      const res = await mealPlan.ok('recipes_cooking_complete', {
        mealPlanEntryId: entry,
        stockAmounts: [0.5, 1.5, 2],
      });
      expect(res.data.completedSteps).toEqual(
        expect.arrayContaining([
          'Recipe consumed via meal plan entry',
          'Meal plan entry marked as done',
        ]),
      );

      const row = await grocy.get('meal_plan', entry);
      expect(Number(row.done)).toBe(1);
      expect(Number(row.recipe_servings)).toBe(4);

      // 4 servings of a 2-serving recipe with 0.4 kg
      expect(await grocy.stockAmount(flour)).toBeCloseTo(1.2, 6);
      expect(await grocy.stockAmount(produced)).toBeCloseTo(4, 6);
      const entries = await grocy.stockEntries(produced);
      expect(entries.map((e) => Number(e.amount)).sort()).toEqual([0.5, 1.5, 2]);
      const [booked] = await producedLog(produced);
      for (const e of entries) expect(Number(e.price)).toBeCloseTo(Number(booked.price), 6);

      // the original recipe's own servings are untouched
      expect(Number((await grocy.get('recipes', recipe)).desired_servings)).toBe(2);
    });

    it('refuses an entry that is already done, consuming nothing', async () => {
      const { flour, produced, entry } = await planned('2036-05-05');
      await grocy.request('PUT', `objects/meal_plan/${entry}`, { done: 1 });

      const res = await mealPlan.call('recipes_cooking_complete', {
        mealPlanEntryId: entry,
        stockAmounts: [1],
      });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/already marked as done/);
      expect(await grocy.stockAmount(flour)).toBeCloseTo(2, 6);
      expect(await grocy.stockAmount(produced)).toBe(0);
      expect(Number((await grocy.get('meal_plan', entry)).recipe_servings)).toBe(1);
    });

    it('allow_meal_plan_entry_already_done: cooks a done entry again', async () => {
      const { flour, produced, entry } = await planned('2036-05-08');
      await grocy.request('PUT', `objects/meal_plan/${entry}`, { done: 1 });

      await recook.ok('recipes_cooking_complete', { mealPlanEntryId: entry, stockAmounts: [2] });

      expect(await grocy.stockAmount(flour)).toBeCloseTo(1.6, 6); // 2 - 0.4 * 2/2
      expect(await grocy.stockAmount(produced)).toBeCloseTo(2, 6);
      const row = await grocy.get('meal_plan', entry);
      expect(Number(row.done)).toBe(1);
      expect(Number(row.recipe_servings)).toBe(2);
    });

    it('refuses a note entry and never marks it done', async () => {
      const note = await grocy.create('meal_plan', {
        day: '2036-05-06',
        type: 'note',
        note: 'Leftovers',
        section_id: -1,
      });
      const res = await mealPlan.call('recipes_cooking_complete', {
        mealPlanEntryId: note,
        stockAmounts: [1],
      });
      expect(res.isError).toBe(true);
      expect(Number((await grocy.get('meal_plan', note)).done)).toBe(0);
    });

    it('rejects a mismatched mode (recipeId only) and bad stockAmounts', async () => {
      const { flour, entry, recipe } = await planned('2036-05-07');
      const noEntry = await mealPlan.call('recipes_cooking_complete', {
        recipeId: recipe,
        stockAmounts: [1],
      });
      expect(noEntry.isError).toBe(true);

      const bad = await mealPlan.call('recipes_cooking_complete', {
        mealPlanEntryId: entry,
        stockAmounts: [],
      });
      expect(bad.isError).toBe(true);
      expect(await grocy.stockAmount(flour)).toBeCloseTo(2, 6);
      expect(Number((await grocy.get('meal_plan', entry)).done)).toBe(0);
    });
  });
});

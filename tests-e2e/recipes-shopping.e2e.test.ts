import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { GrocyApi } from './harness/grocy-api.js';
import { McpSession } from './harness/mcp.js';
import { RecipesSeed, type Units } from './recipes-seed.js';

describe('recipes: shopping list integration', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  const seed = new RecipesSeed(grocy, 'shop');
  let mcp: McpSession;
  let units: Units;
  let loc: number;

  beforeAll(async () => {
    mcp = await McpSession.start(inject('grocyUrl'));
    units = await seed.units();
    loc = await seed.location();
  });
  afterAll(() => mcp?.close());

  const rows = (productId: number) => grocy.objects('shopping_list', `product_id=${productId}`);
  const newList = () => grocy.create('shopping_lists', { name: seed.name('list') });

  describe('recipes_shopping_add_missing_products', () => {
    it('adds only the shortfall, in the stock unit', async () => {
      const rice = await seed.weighedProduct('rice', units, loc);
      const beans = await seed.weighedProduct('beans', units, loc);
      const recipe = await seed.recipe('rice-and-beans', 1);
      await seed.ingredient(recipe, rice, 2, units.kg);
      await seed.ingredient(recipe, beans, 0.5, units.g);
      await seed.purchase(rice, 0.5);
      await seed.purchase(beans, 1);

      await mcp.ok('recipes_shopping_add_missing_products', { recipeId: recipe });

      const [riceRow, ...more] = await rows(rice);
      expect(more).toHaveLength(0);
      expect(Number(riceRow.amount)).toBeCloseTo(1.5, 6);
      expect(Number(riceRow.shopping_list_id)).toBe(1);
      // beans are in stock: nothing to buy
      expect(await rows(beans)).toHaveLength(0);
      // stock is untouched
      expect(await grocy.stockAmount(rice)).toBeCloseTo(0.5, 6);

      // a second call does not order the same shortfall again
      await mcp.ok('recipes_shopping_add_missing_products', { recipeId: recipe });
      const again = await rows(rice);
      expect(again).toHaveLength(1);
      expect(Number(again[0].amount)).toBeCloseTo(1.5, 6);
    });
  });

  describe('recipes_shopping_add_all_products', () => {
    it('adds a fractional amount exactly (0.25 kg), ignoring stock', async () => {
      const butter = await seed.weighedProduct('butter', units, loc);
      await seed.purchase(butter, 5);
      const recipe = await seed.recipe('toast', 1);
      await seed.ingredient(recipe, butter, 0.25, units.g);
      const list = await newList();

      const res = await mcp.ok('recipes_shopping_add_all_products', {
        recipeId: recipe,
        shoppingListId: list,
      });
      expect(res.data.added).toEqual([{ product_id: butter, amount: 0.25 }]);

      const [row, ...more] = await rows(butter);
      expect(more).toHaveLength(0);
      expect(Number(row.amount)).toBeCloseTo(0.25, 9);
      expect(Number(row.shopping_list_id)).toBe(list);
      expect(Number(row.qu_id)).toBe(units.kg);
    });

    it("scales to the recipe's desired servings", async () => {
      const milk = await seed.product('milk', units.portion, loc);
      const recipe = await seed.recipe('pancakes', 2, { desired_servings: 6 });
      await seed.ingredient(recipe, milk, 1, units.portion);
      const list = await newList();

      await mcp.ok('recipes_shopping_add_all_products', { recipeId: recipe, shoppingListId: list });
      const [row] = await rows(milk);
      expect(Number(row.amount)).toBeCloseTo(3, 9);
    });

    it('includes nested recipes and merges into an existing row for the product', async () => {
      const flour = await seed.weighedProduct('flour', units, loc);
      const eggs = await seed.product('eggs', units.portion, loc);
      const vanilla = await seed.product('vanilla', units.portion, loc);
      const list = await newList();

      const base = await seed.recipe('batter', 1);
      await seed.ingredient(base, flour, 0.1, units.g);
      await seed.ingredient(base, eggs, 1, units.portion);
      const cake = await seed.recipe('cake', 1);
      await seed.ingredient(cake, flour, 0.25, units.kg);
      await seed.ingredient(cake, vanilla, 1, units.portion, {
        only_check_single_unit_in_stock: 1,
      });
      await grocy.create('recipes_nestings', {
        recipe_id: cake,
        includes_recipe_id: base,
        servings: 2,
      });
      const existingEggs = await grocy.create('shopping_list', {
        shopping_list_id: list,
        product_id: eggs,
        amount: 3,
        qu_id: units.portion,
      });

      const res = await mcp.ok('recipes_shopping_add_all_products', {
        recipeId: cake,
        shoppingListId: list,
      });
      expect(res.data.skipped).toEqual([
        { product_id: vanilla, reason: expect.stringMatching(/stock unit/) },
      ]);

      // 0.25 kg + 2 nested servings x 0.1 kg
      const flourRows = await rows(flour);
      expect(flourRows).toHaveLength(1);
      expect(Number(flourRows[0].amount)).toBeCloseTo(0.45, 9);
      expect(Number(flourRows[0].shopping_list_id)).toBe(list);

      // 3 already on the list + 2 nested servings x 1 egg, still one row
      const eggRows = await rows(eggs);
      expect(eggRows.map((r) => Number(r.id))).toEqual([existingEggs]);
      expect(Number(eggRows[0].amount)).toBeCloseTo(5, 9);

      expect(await rows(vanilla)).toHaveLength(0);
    });

    it('fails for a recipe that does not exist, writing nothing', async () => {
      const before = (await grocy.objects('shopping_list')).length;
      const res = await mcp.call('recipes_shopping_add_all_products', { recipeId: 999999 });
      expect(res.isError).toBe(true);
      expect(await grocy.objects('shopping_list')).toHaveLength(before);
    });
  });
});

/**
 * System tools (locations, units, users), the raw API passthrough (system_dev_*) with its write
 * guard, and how Grocy errors reach the tool result.
 */
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { GrocyApi } from './harness/grocy-api.js';
import { McpSession } from './harness/mcp.js';

const P = `e2e-system-${Date.now().toString(36)}`;

describe('system', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  let mcp: McpSession;

  let locationId: number;
  let gramId: number;
  let kiloId: number;
  let productId: number;
  let recipeId: number;
  let shoppingListId: number;
  let shoppingItemId: number;

  beforeAll(async () => {
    mcp = await McpSession.start(inject('grocyUrl'));

    locationId = await grocy.create('locations', { name: `${P}-pantry` });
    gramId = await grocy.create('quantity_units', { name: `${P}-g`, name_plural: `${P}-g` });
    kiloId = await grocy.create('quantity_units', { name: `${P}-kg`, name_plural: `${P}-kg` });
    productId = await grocy.create('products', {
      name: `${P}-flour`,
      location_id: locationId,
      qu_id_purchase: kiloId,
      qu_id_stock: kiloId,
      qu_id_consume: kiloId,
      qu_id_price: kiloId,
    });
    await grocy.create('quantity_unit_conversions', {
      from_qu_id: kiloId,
      to_qu_id: gramId,
      factor: 1000,
      product_id: productId,
    });
    recipeId = await grocy.create('recipes', { name: `${P}-bread`, base_servings: 1 });
    await grocy.create('recipes_pos', {
      recipe_id: recipeId,
      product_id: productId,
      amount: 0.5,
      qu_id: kiloId,
    });
    shoppingListId = await grocy.create('shopping_lists', { name: `${P}-list` });
    shoppingItemId = await grocy.create('shopping_list', {
      shopping_list_id: shoppingListId,
      product_id: productId,
      amount: 2,
      qu_id: kiloId,
    });
  });
  afterAll(() => mcp?.close());

  describe('read tools', () => {
    it('system_locations_get returns the locations Grocy has, seeded one included', async () => {
      const result = await mcp.ok('system_locations_get');
      const rows = await grocy.objects('locations');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(rows.length);
      expect(result.data).toContainEqual(
        expect.objectContaining({ id: locationId, name: `${P}-pantry` }),
      );
    });

    it('system_units_get returns the quantity units Grocy has', async () => {
      const result = await mcp.ok('system_units_get');
      const rows = await grocy.objects('quantity_units');
      expect(result.data).toHaveLength(rows.length);
      expect(result.data).toContainEqual(expect.objectContaining({ id: gramId, name: `${P}-g` }));
      expect(result.data).toContainEqual(expect.objectContaining({ id: kiloId, name: `${P}-kg` }));
    });

    it('system_users_get returns the Grocy users', async () => {
      const result = await mcp.ok('system_users_get');
      const users = await grocy.request('GET', 'users');
      expect(users.length).toBeGreaterThan(0);
      expect(result.data).toHaveLength(users.length);
      expect(result.data.map((u: any) => u.username)).toEqual(users.map((u: any) => u.username));
    });
  });

  describe('system_dev_call_api passthrough', () => {
    it('GET returns the Grocy response, query strings included', async () => {
      const result = await mcp.ok('system_dev_call_api', {
        endpoint: `objects/products?query[]=${encodeURIComponent(`name=${P}-flour`)}`,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ id: productId, qu_id_stock: kiloId });
    });

    it('accepts an /api/ prefix on the endpoint', async () => {
      const result = await mcp.ok('system_dev_call_api', {
        endpoint: `/api/objects/locations/${locationId}`,
      });
      expect(result.data).toMatchObject({ id: locationId, name: `${P}-pantry` });
    });

    it('POST of an unguarded entity creates it in Grocy', async () => {
      const name = `${P}-cellar`;
      const result = await mcp.ok('system_dev_call_api', {
        endpoint: 'objects/locations',
        method: 'POST',
        body: { name, description: 'made by the passthrough' },
      });
      const id = result.data.created_object_id;
      expect(id).toBeGreaterThan(0);
      expect(await grocy.get('locations', id)).toMatchObject({
        name,
        description: 'made by the passthrough',
      });
    });

    it('PUT of a product field other than the stock unit goes through', async () => {
      await mcp.ok('system_dev_call_api', {
        endpoint: `objects/products/${productId}`,
        method: 'PUT',
        body: { description: `${P} described` },
      });
      const product = await grocy.get('products', productId);
      expect(product.description).toBe(`${P} described`);
      expect(Number(product.qu_id_stock)).toBe(kiloId);
    });

    it('DELETE of a guarded entity row is allowed (no amount is written)', async () => {
      const id = await grocy.create('shopping_list', {
        shopping_list_id: shoppingListId,
        note: `${P} to delete`,
        amount: 1,
      });
      await mcp.ok('system_dev_call_api', {
        endpoint: `objects/shopping_list/${id}`,
        method: 'DELETE',
      });
      const left = await grocy.objects('shopping_list', `id=${id}`);
      expect(left).toEqual([]);
    });

    it('surfaces the Grocy error_message on a failed call', async () => {
      const result = await mcp.call('system_dev_call_api', { endpoint: `objects/${P}_nope` });
      expect(result.isError).toBe(true);
      expect(result.text).toContain('Entity does not exist or is not exposed');
    });
  });

  describe('write guard', () => {
    /** Snapshot of everything a guarded write in these tests could touch. */
    async function guardedState() {
      const [pos, list, mealPlan, chores, product, locations] = await Promise.all([
        grocy.objects('recipes_pos', `recipe_id=${recipeId}`),
        grocy.objects('shopping_list', `shopping_list_id=${shoppingListId}`),
        grocy.objects('meal_plan'),
        grocy.objects('chores'),
        grocy.get('products', productId),
        grocy.objects('locations'),
      ]);
      return { pos, list, mealPlan, chores, product, locations };
    }

    const today = new Date().toISOString().slice(0, 10);
    const recipePosBody = () => ({
      recipe_id: recipeId,
      product_id: productId,
      amount: 500,
      qu_id: gramId,
    });
    const shoppingBody = () => ({
      shopping_list_id: shoppingListId,
      product_id: productId,
      amount: 500,
      qu_id: gramId,
    });
    const mealPlanBody = () => ({ day: today, type: 'note', note: `${P} meal note` });

    // Each request is one Grocy would carry out if the guard let it through.
    const cases: Array<{
      label: string;
      method: string;
      endpoint: () => string;
      body: () => Record<string, unknown> | undefined;
      reason: RegExp;
    }> = [
      {
        label: 'POST objects/recipes_pos',
        method: 'POST',
        endpoint: () => 'objects/recipes_pos',
        body: recipePosBody,
        reason: /stock unit.*recipes_ingredients_add/,
      },
      {
        label: 'POST objects/recipes%5Fpos (encoded underscore)',
        method: 'POST',
        endpoint: () => 'objects/recipes%5Fpos',
        body: recipePosBody,
        reason: /recipes_pos amounts/,
      },
      {
        label: 'POST /api/objects/recipes_pos/ (prefix, trailing slash)',
        method: 'POST',
        endpoint: () => '/api/objects/recipes_pos/',
        body: recipePosBody,
        reason: /recipes_pos amounts/,
      },
      {
        label: 'POST objects/recipes_pos?force=1 (query string)',
        method: 'POST',
        endpoint: () => 'objects/recipes_pos?force=1',
        body: recipePosBody,
        reason: /recipes_pos amounts/,
      },
      {
        label: 'POST objects/products/../recipes_pos (dot segment)',
        method: 'POST',
        endpoint: () => 'objects/products/../recipes_pos',
        body: recipePosBody,
        reason: /dot segments/,
      },
      {
        label: 'POST objects/%2e%2e/objects/recipes_pos (encoded dot segment)',
        method: 'POST',
        endpoint: () => 'objects/%2e%2e/objects/recipes_pos',
        body: recipePosBody,
        reason: /dot segments/,
      },
      {
        label: 'POST objects//recipes_pos (empty segment)',
        method: 'POST',
        endpoint: () => 'objects//recipes_pos',
        body: recipePosBody,
        reason: /empty segments/,
      },
      {
        label: 'POST objects/shopping_list',
        method: 'POST',
        endpoint: () => 'objects/shopping_list',
        body: shoppingBody,
        reason: /shopping_list amounts.*shopping_list_add_item/,
      },
      {
        label: 'POST objects/./shopping_list (dot segment)',
        method: 'POST',
        endpoint: () => 'objects/./shopping_list',
        body: shoppingBody,
        reason: /dot segments/,
      },
      {
        label: 'POST objects%2Fshopping_list (encoded slash)',
        method: 'POST',
        endpoint: () => 'objects%2Fshopping_list',
        body: shoppingBody,
        reason: /shopping_list amounts/,
      },
      {
        label: 'PUT objects/shopping_list/<id>',
        method: 'PUT',
        endpoint: () => `objects/shopping_list/${shoppingItemId}`,
        body: () => ({ amount: 500, qu_id: gramId }),
        reason: /shopping_list amounts/,
      },
      {
        label: 'POST stock/shoppinglist/add-product',
        method: 'POST',
        endpoint: () => 'stock/shoppinglist/add-product',
        body: () => ({ list_id: shoppingListId, product_id: productId, product_amount: 500 }),
        reason: /shopping_list_add_item/,
      },
      {
        label: 'POST stock/shoppinglist/remove-product',
        method: 'POST',
        endpoint: () => 'stock/shoppinglist/remove-product',
        body: () => ({ list_id: shoppingListId, product_id: productId, product_amount: 1 }),
        reason: /shopping_list_remove_item/,
      },
      {
        label: 'POST objects/meal_plan',
        method: 'POST',
        endpoint: () => 'objects/meal_plan',
        body: mealPlanBody,
        reason: /meal_plan amounts.*recipes_mealplan_add/,
      },
      {
        label: 'POST objects/meal%5Fplan (encoded underscore)',
        method: 'POST',
        endpoint: () => 'objects/meal%5Fplan',
        body: mealPlanBody,
        reason: /meal_plan amounts/,
      },
      {
        label: 'POST objects/chores',
        method: 'POST',
        endpoint: () => 'objects/chores',
        body: () => ({ name: `${P}-chore`, period_type: 'manually' }),
        reason: /chores amounts/,
      },
      {
        label: 'PUT objects/products/<id> changing qu_id_stock',
        method: 'PUT',
        endpoint: () => `objects/products/${productId}`,
        body: () => ({ qu_id_stock: gramId }),
        reason: /stock unit/,
      },
      {
        label: 'PUT objects/products%2F<id> changing qu_id_stock (encoded slash)',
        method: 'PUT',
        endpoint: () => `objects/products%2F${productId}`,
        body: () => ({ qu_id_stock: gramId }),
        reason: /stock unit/,
      },
      {
        label: 'PUT objects/locations/../products/<id> changing qu_id_stock (dot segment)',
        method: 'PUT',
        endpoint: () => `objects/locations/../products/${productId}`,
        body: () => ({ qu_id_stock: gramId }),
        reason: /dot segments/,
      },
    ];

    for (const tool of ['system_dev_call_api', 'system_dev_test_request'] as const) {
      describe(tool, () => {
        for (const c of cases) {
          it(`refuses ${c.label} and leaves Grocy unchanged`, async () => {
            const before = await guardedState();
            const result = await mcp.call(tool, {
              method: c.method,
              endpoint: c.endpoint(),
              body: c.body(),
            });
            expect(result.isError, result.text).toBe(true);
            expect(result.text).toMatch(/Refused/);
            expect(result.text).toMatch(c.reason);
            expect(await guardedState()).toEqual(before);
          });
        }
      });
    }

    it('the refused stock-unit change really would have changed Grocy (control)', async () => {
      // Grocy itself accepts this PUT (grocy-next only once a kg => g conversion exists, which
      // beforeAll seeds), so the unchanged product above is the guard's doing.
      const sibling = await grocy.create('products', {
        name: `${P}-control`,
        location_id: locationId,
        qu_id_purchase: kiloId,
        qu_id_stock: kiloId,
        qu_id_consume: kiloId,
        qu_id_price: kiloId,
      });
      await grocy.create('quantity_unit_conversions', {
        from_qu_id: kiloId,
        to_qu_id: gramId,
        factor: 1000,
        product_id: sibling,
      });
      await grocy.request('PUT', `objects/products/${sibling}`, { qu_id_stock: gramId });
      expect(Number((await grocy.get('products', sibling)).qu_id_stock)).toBe(gramId);
    });
  });

  describe('system_dev_test_request', () => {
    it('reports status, headers and body of a successful request', async () => {
      const result = await mcp.ok('system_dev_test_request', {
        method: 'GET',
        endpoint: `/objects/products/${productId}`,
      });
      expect(result.data.response.statusCode).toBe(200);
      expect(result.data.response.body).toMatchObject({ id: productId, name: `${P}-flour` });
      expect(result.data.validation.isError).toBe(false);
      expect(result.data.request.method).toBe('GET');
      expect(JSON.stringify(result.data.request)).not.toContain('mcp-grocy-e2e-key');
    });

    it('POST of an unguarded entity creates it', async () => {
      const name = `${P}-garage`;
      const result = await mcp.ok('system_dev_test_request', {
        method: 'POST',
        endpoint: 'objects/locations',
        body: { name },
      });
      expect(result.data.response.statusCode).toBe(200);
      const id = Number(result.data.response.body.created_object_id);
      expect((await grocy.get('locations', id)).name).toBe(name);
    });

    it('reports the Grocy error status and error_message', async () => {
      const result = await mcp.call('system_dev_test_request', {
        method: 'GET',
        endpoint: `/objects/${P}_nope`,
      });
      expect(result.isError).toBe(false);
      expect(result.data.response.statusCode).toBe(400);
      expect(result.data.response.body).toEqual({
        error_message: 'Entity does not exist or is not exposed',
      });
      expect(result.data.validation.isError).toBe(true);
      expect(result.data.validation.messages).toEqual([
        'Request failed with status 400',
        'Entity does not exist or is not exposed',
      ]);
    });

    it('reports a rejected POST without writing anything', async () => {
      const before = await grocy.objects('locations');
      const result = await mcp.call('system_dev_test_request', {
        method: 'POST',
        endpoint: 'objects/locations',
        body: { name: `${P}-bad`, no_such_column: 1 },
      });
      expect(result.data.response.statusCode).toBe(400);
      expect(result.data.validation.isError).toBe(true);
      expect(result.data.validation.messages[0]).toBe('Request failed with status 400');
      expect(result.data.validation.messages[1]).toBe(result.data.response.body.error_message);
      expect(result.data.response.body.error_message).toMatch(/no_such_column/);
      expect(await grocy.objects('locations')).toEqual(before);
    });

    it('a one-off wrong GROCY-API-KEY header gets the 401 reported and redacted', async () => {
      const result = await mcp.call('system_dev_test_request', {
        method: 'GET',
        endpoint: '/objects/locations',
        headers: { 'GROCY-API-KEY': 'definitely-wrong' },
      });
      expect(result.isError).toBe(false);
      expect(result.data.response.statusCode).toBe(401);
      expect(result.data.validation.isError).toBe(true);
      expect(result.data.validation.messages[0]).toBe('Request failed with status 401');
      expect(result.data.request.headers['GROCY-API-KEY']).toBe('[REDACTED]');
      expect(result.text + JSON.stringify(result.data)).not.toContain('definitely-wrong');
    });
  });

  describe('Grocy errors reach regular tools', () => {
    it('a consume Grocy rejects surfaces its error_message and changes no stock', async () => {
      await grocy.request('POST', `stock/products/${productId}/add`, {
        amount: 1,
        location_id: locationId,
      });
      const logBefore = await grocy.objects('stock_log', `product_id=${productId}`);
      const result = await mcp.call('inventory_transactions_consume', {
        productId,
        amount: 5,
      });
      expect(result.isError).toBe(true);
      expect(result.text).toContain('Amount to be consumed cannot be > current stock amount');
      expect(await grocy.stockAmount(productId)).toBe(1);
      expect(await grocy.objects('stock_log', `product_id=${productId}`)).toEqual(logBefore);
    });
  });
});

describe('system with a wrong API key', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  let mcp: McpSession;

  beforeAll(async () => {
    mcp = await McpSession.start(inject('grocyUrl'), {}, { apiKey: 'e2e-system-wrong-key' });
  });
  afterAll(() => mcp?.close());

  it('a read tool reports that Grocy rejected the key', async () => {
    const result = await mcp.call('system_locations_get');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('HTTP 401: Grocy rejected the API key (check GROCY_API_KEY)');
    expect(result.text).not.toContain('e2e-system-wrong-key');
  });

  it('a passthrough write is rejected and creates nothing', async () => {
    const name = `${P}-unauthorized`;
    const result = await mcp.call('system_dev_call_api', {
      endpoint: 'objects/locations',
      method: 'POST',
      body: { name },
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('HTTP 401: Grocy rejected the API key');
    expect(await grocy.objects('locations', `name=${name}`)).toEqual([]);
  });

  it('system_dev_test_request reports the 401', async () => {
    const result = await mcp.call('system_dev_test_request', {
      method: 'GET',
      endpoint: '/system/info',
    });
    expect(result.data.response.statusCode).toBe(401);
    expect(result.data.validation.isError).toBe(true);
    expect(result.data.validation.messages[0]).toBe('Request failed with status 401');
  });
});

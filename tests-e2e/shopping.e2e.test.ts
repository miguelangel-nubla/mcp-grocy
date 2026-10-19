import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { GrocyApi } from './harness/grocy-api.js';
import { McpSession } from './harness/mcp.js';

const PREFIX = 'e2e-shopping-';
let seq = 0;
const unique = (label: string) => `${PREFIX}${label}-${Date.now()}-${++seq}`;

describe('shopping tools', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  let mcp: McpSession;

  // Seed: two units, two products with distinct stock/purchase units, two lists
  let unitPiece: number;
  let unitPack: number;
  let unitKilo: number;
  let productA: number; // stock: piece, purchase: pack
  let productB: number; // stock: kilo
  let listMain: number;
  let listOther: number;
  let locationId: number;

  beforeAll(async () => {
    mcp = await McpSession.start(inject('grocyUrl'));

    unitPiece = await grocy.create('quantity_units', {
      name: unique('piece'),
      name_plural: unique('pieces'),
    });
    unitPack = await grocy.create('quantity_units', {
      name: unique('pack'),
      name_plural: unique('packs'),
    });
    unitKilo = await grocy.create('quantity_units', {
      name: unique('kilo'),
      name_plural: unique('kilos'),
    });
    locationId = await grocy.firstId('locations');
    productA = await grocy.create('products', {
      name: unique('milk'),
      location_id: locationId,
      qu_id_stock: unitPiece,
      qu_id_purchase: unitPack,
      qu_id_consume: unitPiece,
      qu_id_price: unitPiece,
    });
    // purchase -> stock conversion (grocy-next creates a default one with the product)
    const conversions = await grocy.objects(
      'quantity_unit_conversions',
      `product_id=${productA}`,
      `from_qu_id=${unitPack}`,
    );
    if (!conversions.length) {
      await grocy.create('quantity_unit_conversions', {
        product_id: productA,
        from_qu_id: unitPack,
        to_qu_id: unitPiece,
        factor: 6,
      });
    }
    productB = await grocy.create('products', {
      name: unique('flour'),
      location_id: locationId,
      qu_id_stock: unitKilo,
      qu_id_purchase: unitKilo,
      qu_id_consume: unitKilo,
      qu_id_price: unitKilo,
    });
    listMain = await grocy.create('shopping_lists', {
      name: unique('list-main'),
      description: 'main list notes',
    });
    listOther = await grocy.create('shopping_lists', { name: unique('list-other') });
  });
  afterAll(() => mcp?.close());

  const rowsOf = (listId: number) => grocy.objects('shopping_list', `shopping_list_id=${listId}`);

  describe('shopping_lists_get / shopping_list_get', () => {
    it('lists every shopping list with description exposed as notes', async () => {
      const result = await mcp.ok('shopping_lists_get');
      const lists: any[] = result.data;
      const main = lists.find((l) => Number(l.id) === listMain);
      expect(main).toBeDefined();
      expect(main.notes).toBe('main list notes');
      expect(main).not.toHaveProperty('description');
      expect(lists.some((l) => Number(l.id) === listOther)).toBe(true);
      // fresh Grocy always has the default list 1
      expect(lists.some((l) => Number(l.id) === 1)).toBe(true);
    });

    it('returns list metadata and only that list items, enriched with product and unit', async () => {
      const listId = await grocy.create('shopping_lists', { name: unique('list-get') });
      const itemId = await grocy.create('shopping_list', {
        shopping_list_id: listId,
        product_id: productB,
        amount: 2.5,
        qu_id: unitKilo,
        note: 'enriched',
      });
      await grocy.create('shopping_list', {
        shopping_list_id: listOther,
        product_id: productB,
        amount: 1,
      });

      const result = await mcp.ok('shopping_list_get', { shoppingListId: listId });
      expect(Number(result.data.list.id)).toBe(listId);
      expect(result.data.items).toHaveLength(1);
      const item = result.data.items[0];
      expect(Number(item.id)).toBe(itemId);
      expect(Number(item.amount)).toBe(2.5);
      expect(item.note).toBe('enriched');
      expect(Number(item.product.id)).toBe(productB);
      expect(Number(item.product.quantityUnitStock.id)).toBe(unitKilo);
      expect(Number(item.quantityUnit.id)).toBe(unitKilo);
    });
  });

  describe('shopping_list_add_item', () => {
    it('adds a product with amount 0 when no amount is given', async () => {
      const result = await mcp.call('shopping_list_add_item', {
        productId: productA,
        shoppingListId: listMain,
      });
      expect(result.isError).toBe(false);
      const createdId = Number(result.data?.created_object_id);
      expect(createdId).toBeGreaterThan(0);

      const row = await grocy.get('shopping_list', createdId);
      expect(Number(row.product_id)).toBe(productA);
      expect(Number(row.shopping_list_id)).toBe(listMain);
      expect(Number(row.amount)).toBe(0);
    });

    it('stores amount and note on the requested list', async () => {
      const result = await mcp.ok('shopping_list_add_item', {
        productId: productB,
        amount: 1.5,
        note: 'organic please',
        shoppingListId: listOther,
      });
      const row = await grocy.get('shopping_list', Number(result.data.created_object_id));
      expect(Number(row.product_id)).toBe(productB);
      expect(Number(row.shopping_list_id)).toBe(listOther);
      expect(Number(row.amount)).toBe(1.5);
      expect(row.note).toBe('organic please');
    });

    it('defaults to shopping list 1', async () => {
      const result = await mcp.ok('shopping_list_add_item', { productId: productB, amount: 3 });
      const row = await grocy.get('shopping_list', Number(result.data.created_object_id));
      expect(Number(row.shopping_list_id)).toBe(1);
      expect(Number(row.amount)).toBe(3);
    });

    it('adds a note-only row (no product) when allowed', async () => {
      const note = unique('note-only');
      const result = await mcp.ok('shopping_list_add_item', { note, shoppingListId: listMain });
      const row = await grocy.get('shopping_list', Number(result.data.created_object_id));
      expect(row.product_id).toBeNull();
      expect(row.note).toBe(note);
      expect(Number(row.shopping_list_id)).toBe(listMain);
    });

    it('refuses a nonexistent product and writes nothing', async () => {
      const before = await grocy.objects('shopping_list');
      const result = await mcp.call('shopping_list_add_item', {
        productId: 9_999_999,
        shoppingListId: listMain,
      });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/does not exist/i);
      expect(await grocy.objects('shopping_list')).toHaveLength(before.length);
    });

    it('refuses productId 0 and a non-integer productId', async () => {
      const before = await grocy.objects('shopping_list');
      for (const productId of [0, 1.5]) {
        const result = await mcp.call('shopping_list_add_item', {
          productId,
          shoppingListId: listMain,
        });
        expect(result.isError).toBe(true);
      }
      expect(await grocy.objects('shopping_list')).toHaveLength(before.length);
    });

    it('refuses a call with neither product nor note', async () => {
      const before = await grocy.objects('shopping_list');
      const result = await mcp.call('shopping_list_add_item', { shoppingListId: listMain });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/productId or note/i);
      expect(await grocy.objects('shopping_list')).toHaveLength(before.length);
    });

    describe('with allow_note_only: false', () => {
      let strict: McpSession;
      beforeAll(async () => {
        strict = await McpSession.start(inject('grocyUrl'), {
          shopping_list_add_item: { allow_note_only: false },
        });
      });
      afterAll(() => strict?.close());

      it('refuses a note-only row', async () => {
        const before = await grocy.objects('shopping_list');
        const result = await strict.call('shopping_list_add_item', {
          note: unique('strict-note'),
          shoppingListId: listMain,
        });
        expect(result.isError).toBe(true);
        expect(await grocy.objects('shopping_list')).toHaveLength(before.length);
      });

      it('still adds a product row with a note', async () => {
        const result = await strict.ok('shopping_list_add_item', {
          productId: productA,
          amount: 2,
          note: 'strict ok',
          shoppingListId: listMain,
        });
        const row = await grocy.get('shopping_list', Number(result.data.created_object_id));
        expect(Number(row.product_id)).toBe(productA);
        expect(Number(row.amount)).toBe(2);
        expect(row.note).toBe('strict ok');
      });
    });
  });

  describe('shopping_list_update_item', () => {
    async function seedItem(fields: Record<string, unknown> = {}): Promise<number> {
      return grocy.create('shopping_list', {
        shopping_list_id: listMain,
        product_id: productA,
        amount: 4,
        qu_id: unitPack,
        note: 'original',
        ...fields,
      });
    }

    it('changes only amount, leaving product, unit, list and note untouched', async () => {
      const itemId = await seedItem();
      const result = await mcp.call('shopping_list_update_item', {
        shoppingListItemId: itemId,
        amount: 7,
      });
      expect(result.isError).toBe(false);
      expect(Number(result.data.amount)).toBe(7);

      const row = await grocy.get('shopping_list', itemId);
      expect(Number(row.amount)).toBe(7);
      expect(Number(row.product_id)).toBe(productA);
      expect(Number(row.qu_id)).toBe(unitPack);
      expect(Number(row.shopping_list_id)).toBe(listMain);
      expect(row.note).toBe('original');
    });

    it('edits the note', async () => {
      const itemId = await seedItem();
      await mcp.ok('shopping_list_update_item', { shoppingListItemId: itemId, note: 'edited' });
      const row = await grocy.get('shopping_list', itemId);
      expect(row.note).toBe('edited');
      expect(Number(row.amount)).toBe(4);
    });

    it('works on an item that has userfields defined for shopping_list', async () => {
      // A userfield makes Grocy add a `userfields` key to GET rows; the tool must not echo it
      // (removed again at the end, so other files sharing this Grocy are unaffected)
      const userfieldId = await grocy.create('userfields', {
        entity: 'shopping_list',
        name: `e2eshopping${Date.now()}`,
        caption: 'e2e-shopping-uf',
        type: 'text-single-line',
      });
      try {
        const itemId = await seedItem();
        const fetched = await grocy.get('shopping_list', itemId);
        expect(fetched).toHaveProperty('userfields');

        const result = await mcp.call('shopping_list_update_item', {
          shoppingListItemId: itemId,
          amount: 9,
          note: 'with userfields',
        });
        expect(result.isError).toBe(false);
        const row = await grocy.get('shopping_list', itemId);
        expect(Number(row.amount)).toBe(9);
        expect(row.note).toBe('with userfields');
      } finally {
        await grocy.request('DELETE', `objects/userfields/${userfieldId}`);
      }
    });

    it('resets qu_id to the new product stock unit on a product change', async () => {
      const itemId = await seedItem();
      const result = await mcp.ok('shopping_list_update_item', {
        shoppingListItemId: itemId,
        productId: productB,
      });
      expect(Number(result.data.product.id)).toBe(productB);
      expect(Number(result.data.quantityUnit.id)).toBe(unitKilo);

      const row = await grocy.get('shopping_list', itemId);
      expect(Number(row.product_id)).toBe(productB);
      expect(Number(row.qu_id)).toBe(unitKilo);
      expect(Number(row.amount)).toBe(4);
      expect(row.note).toBe('original');
    });

    it('keeps qu_id when the product given is the current one', async () => {
      const itemId = await seedItem();
      await mcp.ok('shopping_list_update_item', {
        shoppingListItemId: itemId,
        productId: productA,
        amount: 5,
      });
      const row = await grocy.get('shopping_list', itemId);
      expect(Number(row.product_id)).toBe(productA);
      expect(Number(row.qu_id)).toBe(unitPack);
      expect(Number(row.amount)).toBe(5);
    });

    it('moves an item to another list', async () => {
      const itemId = await seedItem();
      await mcp.ok('shopping_list_update_item', {
        shoppingListItemId: itemId,
        shoppingListId: listOther,
      });
      const row = await grocy.get('shopping_list', itemId);
      expect(Number(row.shopping_list_id)).toBe(listOther);
      expect((await rowsOf(listMain)).some((r) => Number(r.id) === itemId)).toBe(false);
      expect((await rowsOf(listOther)).some((r) => Number(r.id) === itemId)).toBe(true);
    });

    it('refuses a nonexistent product and leaves the row unchanged', async () => {
      const itemId = await seedItem();
      const result = await mcp.call('shopping_list_update_item', {
        shoppingListItemId: itemId,
        productId: 9_999_999,
        amount: 99,
      });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/does not exist/i);
      const row = await grocy.get('shopping_list', itemId);
      expect(Number(row.product_id)).toBe(productA);
      expect(Number(row.amount)).toBe(4);
      expect(Number(row.qu_id)).toBe(unitPack);
    });

    it('reports an error for a nonexistent item', async () => {
      const result = await mcp.call('shopping_list_update_item', {
        shoppingListItemId: 9_999_999,
        amount: 1,
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('shopping_list_remove_item', () => {
    it('deletes the row and only that row', async () => {
      const keep = await grocy.create('shopping_list', {
        shopping_list_id: listMain,
        product_id: productB,
        amount: 1,
      });
      const drop = await grocy.create('shopping_list', {
        shopping_list_id: listMain,
        product_id: productB,
        amount: 2,
      });
      const result = await mcp.call('shopping_list_remove_item', { shoppingListItemId: drop });
      expect(result.isError).toBe(false);

      const ids = (await rowsOf(listMain)).map((r) => Number(r.id));
      expect(ids).not.toContain(drop);
      expect(ids).toContain(keep);
    });

    it('reports an error for a nonexistent item and deletes nothing', async () => {
      const before = await grocy.objects('shopping_list');
      const result = await mcp.call('shopping_list_remove_item', {
        shoppingListItemId: 9_999_999,
      });
      expect(result.isError).toBe(true);
      expect(await grocy.objects('shopping_list')).toEqual(before);
    });
  });

  describe('shopping_list_update', () => {
    it('renames a list and sets its notes', async () => {
      const listId = await grocy.create('shopping_lists', {
        name: unique('list-rename'),
        description: 'old notes',
      });
      const name = unique('list-renamed');
      const result = await mcp.call('shopping_list_update', {
        shoppingListId: listId,
        name,
        notes: 'new notes',
      });
      expect(result.isError).toBe(false);

      const row = await grocy.get('shopping_lists', listId);
      expect(row.name).toBe(name);
      expect(row.description).toBe('new notes');
    });

    it('changes only the notes when no name is given', async () => {
      const original = unique('list-notes');
      const listId = await grocy.create('shopping_lists', { name: original });
      await mcp.ok('shopping_list_update', { shoppingListId: listId, notes: 'just notes' });
      const row = await grocy.get('shopping_lists', listId);
      expect(row.name).toBe(original);
      expect(row.description).toBe('just notes');
    });
  });

  describe('shopping_list_print_thermal', () => {
    it('surfaces the Grocy error when no thermal printer is reachable', async () => {
      const before = await rowsOf(listMain);
      const result = await mcp.call('shopping_list_print_thermal', { shoppingListId: listMain });
      expect(result.isError).toBe(true);
      expect(await rowsOf(listMain)).toEqual(before);
      // the printer connector's failure (e.g. 'Cannot initialise FilePrintConnector.')
      expect(result.text).toMatch(/print/i);
      expect(result.text).not.toMatch(/successfully/i);
    });
  });

  describe('shopping_locations_get', () => {
    it('returns the seeded shopping locations', async () => {
      const name = unique('store');
      const storeId = await grocy.create('shopping_locations', {
        name,
        description: 'corner shop',
      });
      const result = await mcp.ok('shopping_locations_get');
      const store = (result.data as any[]).find((s) => Number(s.id) === storeId);
      expect(store).toBeDefined();
      expect(store.name).toBe(name);
      expect(store.description).toBe('corner shop');
    });
  });
});

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { GrocyApi } from './harness/grocy-api.js';
import { McpSession } from './harness/mcp.js';
import { inventoryToolDefinitions } from '../src/tools/inventory/definitions.js';
import {
  amountAt,
  grocyDate,
  seedFixture,
  seedProduct,
  seedStock,
  stockLog,
  stockRows,
  uniqueName,
  type InventoryFixture,
} from './inventory-helpers.js';

describe('inventory stock queries and stock entries', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  let mcp: McpSession;
  let fx: InventoryFixture;

  beforeAll(async () => {
    mcp = await McpSession.start(inject('grocyUrl'));
    fx = await seedFixture(grocy);
  });
  afterAll(() => mcp?.close());

  /** Two lots of one product: the earlier-due one in the pantry, the later one in the cellar. */
  async function twoLots(label: string) {
    const p = await seedProduct(grocy, fx, label);
    await seedStock(grocy, p.id, 2, { location_id: fx.pantry, best_before_date: grocyDate(10) });
    await seedStock(grocy, p.id, 3, { location_id: fx.cellar, best_before_date: grocyDate(20) });
    const rows = await stockRows(grocy, p.id);
    const early = rows.find((r) => Number(r.location_id) === fx.pantry);
    const late = rows.find((r) => Number(r.location_id) === fx.cellar);
    return { p, early, late };
  }

  describe('products', () => {
    it('inventory_products_get returns only the requested fields', async () => {
      const p = await seedProduct(grocy, fx, 'get', { description: 'e2e desc' });
      const result = await mcp.ok('inventory_products_get', { fields: ['id', 'name'] });
      const row = result.data.find((r: any) => r.id === p.id);
      expect(row).toEqual({ id: p.id, name: p.name });
      expect(result.data.length).toBe((await grocy.objects('products')).length);
    });

    it('every advertised field exists on a Grocy product', async () => {
      const def = inventoryToolDefinitions.find((d) => d.name === 'inventory_products_get')!;
      const advertised: string[] = (def.inputSchema.properties as any).fields.items.enum;
      const p = await seedProduct(grocy, fx, 'fields');
      const columns = Object.keys(await grocy.get('products', p.id));
      expect(advertised.filter((f) => !columns.includes(f))).toEqual([]);
    });

    it('inventory_products_get_groups lists product groups', async () => {
      const name = uniqueName('group');
      const id = await grocy.create('product_groups', { name });
      const result = await mcp.ok('inventory_products_get_groups');
      expect(result.data).toEqual(expect.arrayContaining([expect.objectContaining({ id, name })]));
    });

    it('inventory_products_get_price_history returns purchase prices', async () => {
      const p = await seedProduct(grocy, fx, 'price');
      await mcp.ok('inventory_transactions_purchase', { productId: p.id, amount: 2, price: 1.5 });
      await mcp.ok('inventory_transactions_purchase', { productId: p.id, amount: 1, price: 2.25 });

      const result = await mcp.ok('inventory_products_get_price_history', { productId: p.id });
      const prices = result.data.map((r: any) => Number(r.price)).sort();
      expect(prices).toEqual([1.5, 2.25]);
    });

    it('inventory_products_get_price_history reports an error for an unknown product', async () => {
      const result = await mcp.call('inventory_products_get_price_history', {
        productId: 999_999,
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('inventory_products_lookup', () => {
    it('ranks an exact name, then word-start matches, then substrings', async () => {
      const token = `quokka${Date.now().toString(36)}`;
      // the substring hit is short, so Fuse alone would score it best
      const substring = await seedProduct(grocy, fx, 'lookup', {
        name: `e2e-inventory-em${token}dor`,
      });
      const wordStart = await seedProduct(grocy, fx, 'lookup', {
        name: `e2e-inventory-${token} jam with a long descriptive name`,
      });
      const exact = await seedProduct(grocy, fx, 'lookup', { name: `e2e-inventory-${token}` });
      await seedStock(grocy, exact.id, 2, { location_id: fx.cellar });

      // by the bare word: both word-start names come before the substring one
      const byWord = await mcp.ok('inventory_products_lookup', { productName: token });
      const wordIds = byWord.data.productMatches.map((m: any) => m.productId);
      expect(wordIds.slice(0, 3)).toEqual(
        expect.arrayContaining([exact.id, wordStart.id, substring.id]),
      );
      expect(wordIds[2]).toBe(substring.id);

      // by the full name: the exact name first, then the name that starts with it
      const result = await mcp.ok('inventory_products_lookup', { productName: exact.name });
      const ids = result.data.productMatches.map((m: any) => m.productId);
      expect(ids.slice(0, 2)).toEqual([exact.id, wordStart.id]);

      const top = result.data.productMatches[0];
      expect(top).toMatchObject({ productName: exact.name, totalStockAmount: 2 });
      expect(top.unit.id).toBe(fx.piece);
      expect(top.stockEntries).toEqual([expect.objectContaining({ locationId: fx.cellar })]);
      expect(result.data.allAvailableLocations).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: fx.cellar })]),
      );
    });

    it('flags a product stocked in more than one location', async () => {
      const { p } = await twoLots('lookup-multi');
      const result = await mcp.ok('inventory_products_lookup', { productName: p.name });
      const match = result.data.productMatches.find((m: any) => m.productId === p.id);
      expect(match.totalStockAmount).toBe(5);
      expect(match.stockEntries.map((e: any) => e.bestBeforeDate)).toEqual([
        grocyDate(10),
        grocyDate(20),
      ]);
      expect(match.locationInstructions).toMatch(/multiple locations/);
    });
  });

  describe('stock queries', () => {
    it('inventory_stock_get_all has one aggregated row per product', async () => {
      const { p } = await twoLots('get-all');
      const result = await mcp.ok('inventory_stock_get_all');
      const rows = result.data.filter((r: any) => Number(r.product_id) === p.id);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].amount)).toBe(5);
      expect(rows[0].best_before_date).toBe(grocyDate(10));
    });

    it('inventory_stock_get_by_product returns the stock rows with their locations', async () => {
      const { p, early, late } = await twoLots('by-product');
      const result = await mcp.ok('inventory_stock_get_by_product', { productId: p.id });
      expect(result.data).toHaveLength(2);
      const byId = new Map(result.data.map((r: any) => [r.id, r]));
      expect(byId.get(early.id)).toMatchObject({
        stock_id: early.stock_id,
        best_before_date: grocyDate(10),
      });
      expect(Number((byId.get(early.id) as any).location_id)).toBe(fx.pantry);
      expect(Number((byId.get(late.id) as any).amount)).toBe(3);
    });

    it('inventory_stock_get_by_location returns only that location', async () => {
      const { p, early, late } = await twoLots('by-location');
      const result = await mcp.ok('inventory_stock_get_by_location', { locationId: fx.cellar });

      const ids = result.data.map((r: any) => r.id);
      expect(ids).toContain(late.id);
      expect(ids).not.toContain(early.id);
      // every returned row really sits in the cellar
      const cellarIds = (await grocy.objects('stock', `location_id=${fx.cellar}`)).map((r) => r.id);
      expect([...ids].sort()).toEqual([...cellarIds].sort());
      const row = result.data.find((r: any) => r.id === late.id);
      expect(Number(row.product_id)).toBe(p.id);
      expect(Number(row.amount)).toBe(3);
    });

    describe('inventory_stock_get_volatile', () => {
      let dueIn3: number;
      let overdue: number;
      let expired: number;
      let missing: number;

      beforeAll(async () => {
        dueIn3 = (await seedProduct(grocy, fx, 'due-3')).id;
        await seedStock(grocy, dueIn3, 1, { best_before_date: grocyDate(3) });
        overdue = (await seedProduct(grocy, fx, 'overdue', { due_type: 1 })).id;
        await seedStock(grocy, overdue, 1, { best_before_date: grocyDate(-2) });
        expired = (await seedProduct(grocy, fx, 'expired', { due_type: 2 })).id;
        await seedStock(grocy, expired, 1, { best_before_date: grocyDate(-2) });
        missing = (await seedProduct(grocy, fx, 'missing', { min_stock_amount: 4 })).id;
      });

      const ids = (rows: any[]) => rows.map((r) => Number(r.product_id ?? r.id));

      it('defaults to a 5-day window and classifies overdue, expired and missing', async () => {
        const { data } = await mcp.ok('inventory_stock_get_volatile');
        expect(ids(data.due_products)).toContain(dueIn3);
        expect(ids(data.due_products)).not.toContain(overdue);
        expect(ids(data.overdue_products)).toContain(overdue);
        // Grocy lists every past-due lot as overdue (GetDueProducts(-1) ignores due_type) and
        // the due_type=2 ones also as expired
        expect(ids(data.expired_products)).toContain(expired);
        expect(ids(data.expired_products)).not.toContain(overdue);
        expect(ids(data.missing_products)).toContain(missing);
      });

      it('dueSoonDays narrows and widens the due-soon window', async () => {
        // Grocy anchors the window on SQLite's date('now', 'N days'), which is UTC: between
        // midnight and the UTC offset (00:00-02:00 in Madrid) the due-in-3 lot is 4 days out
        const narrow = await mcp.ok('inventory_stock_get_volatile', { dueSoonDays: 1 });
        expect(ids(narrow.data.due_products)).not.toContain(dueIn3);
        const wide = await mcp.ok('inventory_stock_get_volatile', { dueSoonDays: 4 });
        expect(ids(wide.data.due_products)).toContain(dueIn3);
      });

      it('rejects a dueSoonDays Grocy would ignore', async () => {
        const result = await mcp.call('inventory_stock_get_volatile', { dueSoonDays: 0 });
        expect(result.isError).toBe(true);
        expect(result.text).toMatch(/positive integer/);
      });
    });
  });

  describe('stock entry operations', () => {
    it('inventory_stock_entry_consume consumes from the chosen lot, not the first due', async () => {
      const { p, early, late } = await twoLots('entry-consume');

      const result = await mcp.ok('inventory_stock_entry_consume', {
        stockId: late.id,
        productId: p.id,
        amount: 1,
      });
      expect(result.data).toMatchObject({ consumedAmount: 1, spoiled: false });

      expect(Number((await grocy.get('stock', early.id)).amount)).toBe(2);
      expect(Number((await grocy.get('stock', late.id)).amount)).toBe(2);
      const consume = (await stockLog(grocy, p.id)).filter((r) => r.transaction_type === 'consume');
      expect(consume).toHaveLength(1);
      expect(consume[0].stock_id).toBe(late.stock_id);
    });

    it('inventory_stock_entry_consume logs spoiled lots', async () => {
      const { p, late } = await twoLots('entry-spoiled');
      await mcp.ok('inventory_stock_entry_consume', {
        stockId: late.id,
        productId: p.id,
        amount: 3,
        spoiled: true,
      });
      const rows = await stockRows(grocy, p.id);
      expect(rows.map((r) => r.id)).not.toContain(late.id);
      const consume = (await stockLog(grocy, p.id)).filter((r) => r.transaction_type === 'consume');
      expect(consume).toEqual([
        expect.objectContaining({ stock_id: late.stock_id, spoiled: expect.anything() }),
      ]);
      expect(Number(consume[0].spoiled)).toBe(1);
      expect(Number(consume[0].amount)).toBe(-3);
    });

    // Grocy's /stock/products/{id}/consume|open|transfer (with stock_entry_id) store no note
    // (StockService::ConsumeProduct/OpenProduct/TransferProduct have no note parameter), so the
    // stock entry tools do not offer one; a stray note is ignored and the call still goes through.
    it('stock entry tools offer no note and still act when a client sends one', async () => {
      const logged: Record<string, number> = {};
      for (const [tool, type, extra] of [
        ['inventory_stock_entry_consume', 'consume', {}],
        ['inventory_stock_entry_open', 'product-opened', {}],
        ['inventory_stock_entry_transfer', 'transfer_to', { locationIdTo: fx.pantry }],
      ] as const) {
        const def = inventoryToolDefinitions.find((d) => d.name === tool)!;
        expect(def.inputSchema.properties).not.toHaveProperty('note');
        const { p, late } = await twoLots(`entry-note-${type}`);
        await mcp.ok(tool, {
          stockId: late.id,
          productId: p.id,
          amount: 1,
          note: `e2e ${tool} note`,
          ...extra,
        });
        const log = (await stockLog(grocy, p.id)).filter((r) => r.transaction_type === type);
        expect(log.map((r) => r.note)).not.toContain(`e2e ${tool} note`);
        logged[tool] = log.length;
      }
      expect(logged).toEqual({
        inventory_stock_entry_consume: 1,
        inventory_stock_entry_open: 1,
        inventory_stock_entry_transfer: 1,
      });
    });

    it('stock entry tools refuse a productId the lot does not belong to', async () => {
      const { p, late } = await twoLots('entry-mismatch');
      const other = await seedProduct(grocy, fx, 'entry-other');
      const before = await stockLog(grocy, p.id);

      for (const [tool, extra] of [
        ['inventory_stock_entry_consume', {}],
        ['inventory_stock_entry_open', {}],
        ['inventory_stock_entry_transfer', { locationIdTo: fx.pantry }],
      ] as const) {
        const result = await mcp.call(tool, {
          stockId: late.id,
          productId: other.id,
          amount: 1,
          ...extra,
        });
        expect(result.isError, tool).toBe(true);
        expect(result.text, tool).toMatch(/mismatch/i);
      }
      expect(await stockLog(grocy, p.id)).toEqual(before);
      expect(Number((await grocy.get('stock', late.id)).amount)).toBe(3);
    });

    it('inventory_stock_entry_transfer moves part of one lot to another location', async () => {
      const { p, early, late } = await twoLots('entry-transfer');

      await mcp.ok('inventory_stock_entry_transfer', {
        stockId: late.id,
        productId: p.id,
        amount: 1,
        locationIdTo: fx.pantry,
      });

      const rows = await stockRows(grocy, p.id);
      expect(amountAt(rows, fx.cellar)).toBe(2);
      expect(amountAt(rows, fx.pantry)).toBe(3);
      // the moved unit keeps the late lot's due date; the early lot is untouched
      const moved = rows.filter(
        (r) => Number(r.location_id) === fx.pantry && r.best_before_date === grocyDate(20),
      );
      expect(moved.reduce((s, r) => s + Number(r.amount), 0)).toBe(1);
      expect(Number((await grocy.get('stock', early.id)).amount)).toBe(2);
      const types = (await stockLog(grocy, p.id)).map((r) => r.transaction_type);
      expect(types).toEqual(expect.arrayContaining(['transfer_from', 'transfer_to']));
    });

    it('inventory_stock_entry_open opens the chosen lot only', async () => {
      const { p, late } = await twoLots('entry-open');

      await mcp.ok('inventory_stock_entry_open', { stockId: late.id, productId: p.id, amount: 1 });

      const opened = (await stockRows(grocy, p.id)).filter((r) => Number(r.open) === 1);
      expect(opened.reduce((s, r) => s + Number(r.amount), 0)).toBe(1);
      expect(opened.every((r) => r.stock_id === late.stock_id)).toBe(true);
      const details = await grocy.request('GET', `stock/products/${p.id}`);
      expect(Number(details.stock_amount)).toBe(5);
      expect(Number(details.stock_amount_opened)).toBe(1);
    });
  });

  // Grocy's default config calls the label webhook server side (LABEL_PRINTER_RUN_SERVER=true)
  // with an empty LABEL_PRINTER_WEBHOOK (config-dist.php), so a print fails in the HTTP client:
  // grocy-next reports a cURL "URL rejected", upstream Guzzle "URI must include a scheme"
  describe('label printing without a printer', () => {
    const noPrinter = /cURL error|URL rejected|URI must include/;

    it('inventory_products_print_label reports that no printer webhook is reachable', async () => {
      const p = await seedProduct(grocy, fx, 'label');
      const result = await mcp.call('inventory_products_print_label', { productId: p.id });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(noPrinter);
    });

    it('inventory_stock_entry_print_label reports that no printer webhook is reachable', async () => {
      const { p, late } = await twoLots('entry-label');
      const result = await mcp.call('inventory_stock_entry_print_label', {
        stockId: late.id,
        productId: p.id,
      });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(noPrinter);
      expect(Number((await grocy.get('stock', late.id)).amount)).toBe(3);
    });

    it('inventory_stock_entry_print_label refuses a lot of another product', async () => {
      const { late } = await twoLots('entry-label-mismatch');
      const other = await seedProduct(grocy, fx, 'entry-label-other');
      const result = await mcp.call('inventory_stock_entry_print_label', {
        stockId: late.id,
        productId: other.id,
      });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/mismatch/i);
    });

    it('inventory_stock_entry_print_label reports an unknown stock entry', async () => {
      const p = await seedProduct(grocy, fx, 'label-missing');
      const result = await mcp.call('inventory_stock_entry_print_label', {
        stockId: 999_999,
        productId: p.id,
      });
      expect(result.isError).toBe(true);
    });
  });
});

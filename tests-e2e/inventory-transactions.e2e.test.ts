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

/** Input properties a tool advertises. */
function inputProps(name: string): Record<string, unknown> {
  const def = inventoryToolDefinitions.find((d) => d.name === name)!;
  return (def.inputSchema.properties ?? {}) as Record<string, unknown>;
}

describe('inventory transactions', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  let mcp: McpSession;
  let fx: InventoryFixture;

  beforeAll(async () => {
    mcp = await McpSession.start(inject('grocyUrl'));
    fx = await seedFixture(grocy);
  });
  afterAll(() => mcp?.close());

  describe('inventory_transactions_purchase', () => {
    it('adds stock with the given due date, price, location and note', async () => {
      const p = await seedProduct(grocy, fx, 'purchase');
      const bbd = grocyDate(30);

      const result = await mcp.ok('inventory_transactions_purchase', {
        productId: p.id,
        amount: 3,
        bestBeforeDate: bbd,
        price: 1.25,
        locationId: fx.cellar,
        note: 'e2e purchase note',
      });
      expect(result.text).toContain('Product purchased successfully');

      expect(await grocy.stockAmount(p.id)).toBe(3);
      const rows = await stockRows(grocy, p.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ best_before_date: bbd, note: 'e2e purchase note' });
      expect(Number(rows[0].location_id)).toBe(fx.cellar);
      expect(Number(rows[0].price)).toBeCloseTo(1.25);

      const log = await stockLog(grocy, p.id);
      expect(log).toHaveLength(1);
      expect(log[0].transaction_type).toBe('purchase');
      expect(Number(log[0].amount)).toBe(3);
    });

    it("uses the product's default location when none is given", async () => {
      const p = await seedProduct(grocy, fx, 'purchase-default-loc');
      await mcp.ok('inventory_transactions_purchase', { productId: p.id, amount: 2 });
      const rows = await stockRows(grocy, p.id);
      expect(amountAt(rows, fx.pantry)).toBe(2);
    });

    it('reports an error and writes nothing for a product that does not exist', async () => {
      const result = await mcp.call('inventory_transactions_purchase', {
        productId: 999_999,
        amount: 1,
      });
      expect(result.isError).toBe(true);
      expect(await grocy.objects('stock_log', 'product_id=999999')).toHaveLength(0);
    });
  });

  describe('inventory_transactions_consume', () => {
    it('reduces stock and logs a consume transaction', async () => {
      const p = await seedProduct(grocy, fx, 'consume');
      await seedStock(grocy, p.id, 5);

      const result = await mcp.ok('inventory_transactions_consume', { productId: p.id, amount: 2 });
      expect(result.data).toMatchObject({ productId: p.id, consumedAmount: 2, spoiled: false });
      expect(result.data.transactionIds).toHaveLength(1);

      expect(await grocy.stockAmount(p.id)).toBe(3);
      const consume = (await stockLog(grocy, p.id)).filter((r) => r.transaction_type === 'consume');
      expect(consume).toHaveLength(1);
      expect(Number(consume[0].amount)).toBe(-2);
      expect(Number(consume[0].spoiled)).toBe(0);
      expect(consume[0].transaction_id).toBe(result.data.transactionIds[0]);
    });

    it('logs a spoiled consume when spoiled is true', async () => {
      const p = await seedProduct(grocy, fx, 'consume-spoiled');
      await seedStock(grocy, p.id, 4);

      const result = await mcp.ok('inventory_transactions_consume', {
        productId: p.id,
        amount: 1,
        spoiled: true,
      });
      expect(result.data).toMatchObject({ consumedAmount: 1, spoiled: true });

      expect(await grocy.stockAmount(p.id)).toBe(3);
      const consume = (await stockLog(grocy, p.id)).filter((r) => r.transaction_type === 'consume');
      expect(consume).toHaveLength(1);
      expect(Number(consume[0].spoiled)).toBe(1);
      expect(Number(consume[0].amount)).toBe(-1);
    });

    it('consumes only from the given location', async () => {
      const p = await seedProduct(grocy, fx, 'consume-loc');
      // the pantry lot is due first, so Grocy's default pick would be the pantry
      await seedStock(grocy, p.id, 2, { location_id: fx.pantry, best_before_date: grocyDate(5) });
      await seedStock(grocy, p.id, 2, { location_id: fx.cellar, best_before_date: grocyDate(50) });

      const result = await mcp.ok('inventory_transactions_consume', {
        productId: p.id,
        amount: 1,
        locationId: fx.cellar,
      });
      expect(result.data.lots).toEqual([
        expect.objectContaining({ amount: 1, locationId: fx.cellar }),
      ]);

      const rows = await stockRows(grocy, p.id);
      expect(amountAt(rows, fx.pantry)).toBe(2);
      expect(amountAt(rows, fx.cellar)).toBe(1);
    });

    it('fails without changing stock when consuming more than is in stock', async () => {
      const p = await seedProduct(grocy, fx, 'consume-too-much');
      await seedStock(grocy, p.id, 1);

      const result = await mcp.call('inventory_transactions_consume', {
        productId: p.id,
        amount: 5,
      });
      expect(result.isError).toBe(true);
      expect(await grocy.stockAmount(p.id)).toBe(1);
      expect((await stockLog(grocy, p.id)).map((r) => r.transaction_type)).toEqual(['purchase']);
    });

    // Grocy's consume API stores no note (StockService::ConsumeProduct has no note parameter),
    // so the tool does not offer one; a stray note is ignored and the consume still goes through.
    it('offers no note and still consumes when a client sends one', async () => {
      expect(inputProps('inventory_transactions_consume')).not.toHaveProperty('note');
      const p = await seedProduct(grocy, fx, 'consume-note');
      await seedStock(grocy, p.id, 2);
      await mcp.ok('inventory_transactions_consume', {
        productId: p.id,
        amount: 1,
        note: 'e2e consume note',
      });
      expect(await grocy.stockAmount(p.id)).toBe(1);
      const consume = (await stockLog(grocy, p.id)).filter((r) => r.transaction_type === 'consume');
      expect(consume).toHaveLength(1);
      expect(consume[0].note).not.toBe('e2e consume note');
    });
  });

  describe('inventory_transactions_transfer', () => {
    it('moves an amount between locations and logs transfer_from/transfer_to', async () => {
      const p = await seedProduct(grocy, fx, 'transfer');
      await seedStock(grocy, p.id, 3, { location_id: fx.pantry });

      const result = await mcp.ok('inventory_transactions_transfer', {
        productId: p.id,
        amount: 2,
        fromLocationId: fx.pantry,
        toLocationId: fx.cellar,
      });
      expect(result.text).toContain('Product transferred successfully');

      expect(await grocy.stockAmount(p.id)).toBe(3);
      const rows = await stockRows(grocy, p.id);
      expect(amountAt(rows, fx.pantry)).toBe(1);
      expect(amountAt(rows, fx.cellar)).toBe(2);

      const types = (await stockLog(grocy, p.id)).map((r) => r.transaction_type);
      expect(types).toContain('transfer_from');
      expect(types).toContain('transfer_to');
    });

    // Grocy's transfer API stores no note (StockService::TransferProduct has no note
    // parameter), so the tool does not offer one.
    it('offers no note and still transfers when a client sends one', async () => {
      expect(inputProps('inventory_transactions_transfer')).not.toHaveProperty('note');
      const p = await seedProduct(grocy, fx, 'transfer-note');
      await seedStock(grocy, p.id, 2, { location_id: fx.pantry });
      await mcp.ok('inventory_transactions_transfer', {
        productId: p.id,
        amount: 1,
        fromLocationId: fx.pantry,
        toLocationId: fx.cellar,
        note: 'e2e transfer note',
      });
      expect(amountAt(await stockRows(grocy, p.id), fx.cellar)).toBe(1);
      const log = (await stockLog(grocy, p.id)).filter((r) => r.transaction_type === 'transfer_to');
      expect(log).toHaveLength(1);
      expect(log.map((r) => r.note)).not.toContain('e2e transfer note');
    });

    it('fails without moving anything when the source location lacks the amount', async () => {
      const p = await seedProduct(grocy, fx, 'transfer-short');
      await seedStock(grocy, p.id, 1, { location_id: fx.pantry });

      const result = await mcp.call('inventory_transactions_transfer', {
        productId: p.id,
        amount: 1,
        fromLocationId: fx.cellar,
        toLocationId: fx.pantry,
      });
      expect(result.isError).toBe(true);
      const rows = await stockRows(grocy, p.id);
      expect(amountAt(rows, fx.pantry)).toBe(1);
      expect(amountAt(rows, fx.cellar)).toBe(0);
    });
  });

  describe('inventory_transactions_adjust', () => {
    it('raises stock to the new amount with an inventory correction at the location', async () => {
      const p = await seedProduct(grocy, fx, 'adjust-up');
      await seedStock(grocy, p.id, 2, { location_id: fx.pantry });
      const bbd = grocyDate(40);

      await mcp.ok('inventory_transactions_adjust', {
        productId: p.id,
        newAmount: 5,
        bestBeforeDate: bbd,
        locationId: fx.cellar,
        note: 'e2e inventory note',
      });

      expect(await grocy.stockAmount(p.id)).toBe(5);
      const rows = await stockRows(grocy, p.id);
      const added = rows.find((r) => Number(r.location_id) === fx.cellar);
      expect(added).toMatchObject({ best_before_date: bbd, note: 'e2e inventory note' });
      expect(Number(added.amount)).toBe(3);

      const correction = (await stockLog(grocy, p.id)).filter(
        (r) => r.transaction_type === 'inventory-correction',
      );
      expect(correction).toHaveLength(1);
      expect(Number(correction[0].amount)).toBe(3);
    });

    it('lowers stock to the new amount', async () => {
      const p = await seedProduct(grocy, fx, 'adjust-down');
      await seedStock(grocy, p.id, 4);

      await mcp.ok('inventory_transactions_adjust', { productId: p.id, newAmount: 1 });

      expect(await grocy.stockAmount(p.id)).toBe(1);
      const correction = (await stockLog(grocy, p.id)).filter(
        (r) => r.transaction_type === 'inventory-correction',
      );
      expect(correction.reduce((s, r) => s + Number(r.amount), 0)).toBe(-3);
    });

    it('reports an error when the new amount equals the current one', async () => {
      const p = await seedProduct(grocy, fx, 'adjust-noop');
      const result = await mcp.call('inventory_transactions_adjust', {
        productId: p.id,
        newAmount: 0,
      });
      // Grocy refuses an inventory that does not change the amount
      expect(result.isError).toBe(true);
      expect(await stockLog(grocy, p.id)).toHaveLength(0);
    });
  });

  describe('inventory_transactions_open', () => {
    it('marks the given amount opened and logs product-opened', async () => {
      const p = await seedProduct(grocy, fx, 'open');
      await seedStock(grocy, p.id, 3);

      await mcp.ok('inventory_transactions_open', { productId: p.id, amount: 2 });

      const details = await grocy.request('GET', `stock/products/${p.id}`);
      expect(Number(details.stock_amount)).toBe(3);
      expect(Number(details.stock_amount_opened)).toBe(2);
      const opened = (await stockRows(grocy, p.id)).filter((r) => Number(r.open) === 1);
      expect(opened.reduce((s, r) => s + Number(r.amount), 0)).toBe(2);
      const log = (await stockLog(grocy, p.id)).filter(
        (r) => r.transaction_type === 'product-opened',
      );
      expect(log.reduce((s, r) => s + Number(r.amount), 0)).toBe(2);
    });

    it('opens one unit when no amount is given', async () => {
      const p = await seedProduct(grocy, fx, 'open-default');
      await seedStock(grocy, p.id, 3);

      await mcp.ok('inventory_transactions_open', { productId: p.id });

      const details = await grocy.request('GET', `stock/products/${p.id}`);
      expect(Number(details.stock_amount_opened)).toBe(1);
    });

    it('applies the after-open due date', async () => {
      const p = await seedProduct(grocy, fx, 'open-due', {
        default_best_before_days_after_open: 3,
      });
      await seedStock(grocy, p.id, 1, { best_before_date: grocyDate(60) });

      await mcp.ok('inventory_transactions_open', { productId: p.id, amount: 1 });

      const [row] = await stockRows(grocy, p.id);
      expect(Number(row.open)).toBe(1);
      expect(row.best_before_date).toBe(grocyDate(3));
    });

    // Grocy's open API stores no note (StockService::OpenProduct has no note parameter), so
    // the tool does not offer one.
    it('offers no note and still opens when a client sends one', async () => {
      expect(inputProps('inventory_transactions_open')).not.toHaveProperty('note');
      const p = await seedProduct(grocy, fx, 'open-note');
      await seedStock(grocy, p.id, 2);
      await mcp.ok('inventory_transactions_open', {
        productId: p.id,
        amount: 1,
        note: 'e2e open note',
      });
      const log = (await stockLog(grocy, p.id)).filter(
        (r) => r.transaction_type === 'product-opened',
      );
      expect(log).toHaveLength(1);
      expect(log.map((r) => r.note)).not.toContain('e2e open note');
    });

    it('fails when there is no unopened stock', async () => {
      const p = await seedProduct(grocy, fx, 'open-empty');
      const result = await mcp.call('inventory_transactions_open', { productId: p.id, amount: 1 });
      expect(result.isError).toBe(true);
      expect(await stockLog(grocy, p.id)).toHaveLength(0);
    });
  });

  describe('amounts are in the stock unit when the purchase unit differs', () => {
    let product: { id: number; name: string };
    let gram: number;

    beforeAll(async () => {
      const gramName = uniqueName('gram');
      gram = await grocy.create('quantity_units', { name: gramName, name_plural: gramName });
      const packName = uniqueName('pack');
      const pack = await grocy.create('quantity_units', { name: packName, name_plural: packName });
      product = await seedProduct(grocy, fx, 'flour', {
        qu_id_stock: gram,
        qu_id_consume: gram,
        qu_id_purchase: pack,
        qu_id_price: pack,
      });
      // 1 pack = 500 g. grocy-next pre-creates factor-1 conversions for a new product's
      // units, upstream does not: update or create, whichever applies
      const existing = await grocy.objects('quantity_unit_conversions', `product_id=${product.id}`);
      for (const [from, to, factor] of [
        [pack, gram, 500],
        [gram, pack, 1 / 500],
      ] as const) {
        const row = existing.find(
          (c) => Number(c.from_qu_id) === from && Number(c.to_qu_id) === to,
        );
        if (row) {
          await grocy.request('PUT', `objects/quantity_unit_conversions/${row.id}`, { factor });
        } else if (from === pack) {
          await grocy.create('quantity_unit_conversions', {
            from_qu_id: from,
            to_qu_id: to,
            factor,
            product_id: product.id,
          });
        }
      }
    });

    it('purchase, consume and adjust take grams, not packs', async () => {
      await mcp.ok('inventory_transactions_purchase', {
        productId: product.id,
        amount: 1000,
        price: 0.004,
      });
      expect(await grocy.stockAmount(product.id)).toBe(1000);
      const [purchase] = await stockLog(grocy, product.id);
      expect(Number(purchase.amount)).toBe(1000);
      expect(Number(purchase.price)).toBeCloseTo(0.004);

      await mcp.ok('inventory_transactions_consume', { productId: product.id, amount: 250 });
      expect(await grocy.stockAmount(product.id)).toBe(750);

      await mcp.ok('inventory_transactions_adjust', { productId: product.id, newAmount: 500 });
      expect(await grocy.stockAmount(product.id)).toBe(500);
    });

    it('lookup reports the stock unit', async () => {
      const result = await mcp.ok('inventory_products_lookup', { productName: product.name });
      const match = result.data.productMatches[0];
      expect(match.productId).toBe(product.id);
      expect(match.unit).toEqual({ id: gram, name: expect.stringContaining('gram') });
      expect(match.totalStockAmount).toBe(await grocy.stockAmount(product.id));
    });
  });
});

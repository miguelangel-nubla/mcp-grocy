/**
 * Seeding helpers shared by the inventory e2e files. Every name starts with `e2e-inventory-`
 * so other areas' files sharing the same Grocy never see these rows.
 */
import type { GrocyApi } from './harness/grocy-api.js';

export const PREFIX = 'e2e-inventory-';

let counter = 0;
/** Unique name per run and call: e2e-inventory-<label>-<n>-<stamp>. */
export function uniqueName(label: string): string {
  counter += 1;
  return `${PREFIX}${label}-${counter}-${Date.now().toString(36)}`;
}

/** YYYY-MM-DD in the Grocy container's timezone (TZ=Europe/Madrid), offset by `days`. */
export function grocyDate(days = 0): string {
  // today in Madrid, then calendar days in UTC: adding 24 h to the Madrid clock would skip or
  // repeat a day near midnight when the offset is crossed by a DST change
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface InventoryFixture {
  pantry: number;
  cellar: number;
  piece: number;
}

export async function seedFixture(grocy: GrocyApi): Promise<InventoryFixture> {
  const pantry = await grocy.create('locations', { name: uniqueName('pantry') });
  const cellar = await grocy.create('locations', { name: uniqueName('cellar') });
  const pieceName = uniqueName('piece');
  const piece = await grocy.create('quantity_units', {
    name: pieceName,
    name_plural: `${pieceName}s`,
  });
  return { pantry, cellar, piece };
}

/** Product stocked in pieces at the pantry unless `fields` says otherwise. */
export async function seedProduct(
  grocy: GrocyApi,
  fx: InventoryFixture,
  label: string,
  fields: Record<string, unknown> = {},
): Promise<{ id: number; name: string }> {
  const name = (fields.name as string) ?? uniqueName(label);
  const id = await grocy.create('products', {
    location_id: fx.pantry,
    qu_id_stock: fx.piece,
    qu_id_purchase: fx.piece,
    qu_id_consume: fx.piece,
    qu_id_price: fx.piece,
    // a fresh product treats opened as out of stock; keep stock_amount about amounts only
    treat_opened_as_out_of_stock: 0,
    ...fields,
    name,
  });
  return { id, name };
}

/** Purchase straight through the Grocy API (seeding, not the tool under test). */
export async function seedStock(
  grocy: GrocyApi,
  productId: number,
  amount: number,
  fields: Record<string, unknown> = {},
): Promise<void> {
  await grocy.request('POST', `stock/products/${productId}/add`, { amount, ...fields });
}

export async function stockLog(grocy: GrocyApi, productId: number): Promise<any[]> {
  const rows = await grocy.objects('stock_log', `product_id=${productId}`);
  return rows.sort((a, b) => Number(a.id) - Number(b.id));
}

/** Current stock rows (the `stock` table) of a product, ordered by id. */
export async function stockRows(grocy: GrocyApi, productId: number): Promise<any[]> {
  const rows = await grocy.objects('stock', `product_id=${productId}`);
  return rows.sort((a, b) => Number(a.id) - Number(b.id));
}

export function amountAt(rows: any[], locationId: number): number {
  return rows
    .filter((r) => Number(r.location_id) === locationId)
    .reduce((sum, r) => sum + Number(r.amount), 0);
}

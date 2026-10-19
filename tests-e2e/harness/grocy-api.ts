/**
 * Minimal Grocy REST client for seeding the sandbox and checking its state after a tool call.
 */
import { E2E_API_KEY } from './grocy-container.js';

export class GrocyApi {
  constructor(private readonly url: string) {}

  async request(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.url}/api/${path.replace(/^\//, '')}`, {
      method,
      headers: {
        'GROCY-API-KEY': E2E_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok)
      throw new Error(`Grocy ${method} ${path}: HTTP ${res.status} ${raw.slice(0, 500)}`);
    return raw ? JSON.parse(raw) : null;
  }

  async create(entity: string, fields: Record<string, unknown>): Promise<number> {
    const res = await this.request('POST', `objects/${entity}`, fields);
    return Number(res.created_object_id);
  }

  async get(entity: string, id: number): Promise<any> {
    return this.request('GET', `objects/${entity}/${id}`);
  }

  async objects(entity: string, ...query: string[]): Promise<any[]> {
    const qs = query.map((q) => `query[]=${encodeURIComponent(q)}`).join('&');
    return this.request('GET', `objects/${entity}${qs ? `?${qs}` : ''}`);
  }

  async firstId(entity: string): Promise<number> {
    const rows = await this.objects(entity);
    if (!rows.length) throw new Error(`fresh Grocy has no ${entity}`);
    return Number(rows[0].id);
  }

  /** Current stock amount of a product (0 when not in stock). */
  async stockAmount(productId: number): Promise<number> {
    const details = await this.request('GET', `stock/products/${productId}`);
    return Number(details?.stock_amount ?? 0);
  }

  async stockEntries(productId: number): Promise<any[]> {
    return this.request('GET', `stock/products/${productId}/entries`);
  }
}

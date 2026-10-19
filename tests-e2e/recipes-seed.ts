/**
 * Seeding helpers shared by the recipes-*.e2e.test.ts files. Every name starts with
 * 'e2e-recipes-<scope>-' so files sharing one Grocy never collide.
 */
import type { GrocyApi } from './harness/grocy-api.js';

export interface Units {
  kg: number;
  g: number;
  cup: number;
  portion: number;
  names: { kg: string; g: string; cup: string; portion: string };
}

export class RecipesSeed {
  private n = 0;

  constructor(
    readonly grocy: GrocyApi,
    readonly scope: string,
  ) {}

  name(what: string): string {
    return `e2e-recipes-${this.scope}-${what}-${++this.n}`;
  }

  async location(): Promise<number> {
    return this.grocy.create('locations', { name: this.name('loc') });
  }

  /** kg (stock unit of the weighed products), g, cup (never converted) and portion. */
  async units(): Promise<Units> {
    const names = {
      kg: `e2e-recipes-${this.scope}-kg`,
      g: `e2e-recipes-${this.scope}-g`,
      cup: `e2e-recipes-${this.scope}-cup`,
      portion: `e2e-recipes-${this.scope}-portion`,
    };
    const [kg, g, cup, portion] = await Promise.all(
      Object.values(names).map((name) =>
        this.grocy.create('quantity_units', { name, name_plural: `${name}s` }),
      ),
    );
    return { kg: kg!, g: g!, cup: cup!, portion: portion!, names };
  }

  async product(
    what: string,
    quId: number,
    locationId: number,
    extra: Record<string, unknown> = {},
  ): Promise<number> {
    return this.grocy.create('products', {
      name: this.name(what),
      location_id: locationId,
      qu_id_stock: quId,
      qu_id_purchase: quId,
      qu_id_consume: quId,
      qu_id_price: quId,
      ...extra,
    });
  }

  /** A kilo product with a product-specific kg -> g conversion (Grocy resolves g -> kg too). */
  async weighedProduct(what: string, units: Units, locationId: number): Promise<number> {
    const id = await this.product(what, units.kg, locationId);
    await this.grocy.create('quantity_unit_conversions', {
      from_qu_id: units.kg,
      to_qu_id: units.g,
      factor: 1000,
      product_id: id,
    });
    return id;
  }

  async recipe(
    what: string,
    baseServings = 1,
    extra: Record<string, unknown> = {},
  ): Promise<number> {
    const { desired_servings: desired, ...fields } = extra;
    const id = await this.grocy.create('recipes', {
      name: this.name(what),
      base_servings: baseServings,
      type: 'normal',
      ...fields,
    });
    // Grocy's recipes_desired_servings_default trigger (migration 0237) overwrites
    // desired_servings with base_servings on insert, so set it afterwards
    if (desired !== undefined) {
      await this.grocy.request('PUT', `objects/recipes/${id}`, { desired_servings: desired });
    }
    return id;
  }

  /** Raw ingredient row: amount is in the product's stock unit, as Grocy stores it. */
  async ingredient(
    recipeId: number,
    productId: number,
    stockAmount: number,
    quId: number,
    extra: Record<string, unknown> = {},
  ): Promise<number> {
    return this.grocy.create('recipes_pos', {
      recipe_id: recipeId,
      product_id: productId,
      amount: stockAmount,
      qu_id: quId,
      ...extra,
    });
  }

  async purchase(productId: number, amount: number, price?: number): Promise<void> {
    await this.grocy.request('POST', `stock/products/${productId}/add`, {
      amount,
      transaction_type: 'purchase',
      ...(price === undefined ? {} : { price }),
    });
  }
}

/** Float compare for Grocy decimals. */
export function near(actual: unknown, expected: number): boolean {
  return Math.abs(Number(actual) - expected) < 1e-6;
}

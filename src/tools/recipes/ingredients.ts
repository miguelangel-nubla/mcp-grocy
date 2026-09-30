/**
 * Recipe ingredient tools.
 *
 * Grocy stores `recipes_pos.amount` in the product's **stock** quantity unit; `qu_id` only
 * picks the unit Grocy shows. The web form converts what is typed before saving, a raw
 * `POST objects/recipes_pos` does not: `{amount: 500, qu_id: <Gramo>}` on a product stocked
 * in kilos is stored (and cooked, shopped and shown) as 500 kg. These tools take the amount
 * in the unit the caller names and convert it with Grocy's own conversion graph
 * (`quantity_unit_conversions_resolved`), failing instead of guessing when none exists.
 */

import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';
import { ValidationError } from '../../utils/errors.js';

interface QuantityUnit {
  id: number;
  name: string;
  name_plural?: string;
}

interface Product {
  id: number;
  name: string;
  qu_id_stock: number;
}

interface Conversion {
  from_qu_id: number;
  to_qu_id: number;
  factor: number;
}

/** Strip binary float noise (500 * 0.001 = 0.5, not 0.5000000000000001). */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}

export class RecipeIngredientHandlers extends BaseToolHandler {
  private async units(): Promise<QuantityUnit[]> {
    const rows = await this.apiCall<any[]>('/objects/quantity_units');
    return (rows || []).map((u) => ({ ...u, id: Number(u.id) }));
  }

  private async product(productId: number): Promise<Product> {
    const row = await this.apiCall<any>(`/objects/products/${productId}`);
    if (!row || row.qu_id_stock === undefined || row.qu_id_stock === null) {
      throw new ValidationError(`Product ${productId} not found or has no stock quantity unit.`);
    }
    return { id: Number(row.id), name: row.name, qu_id_stock: Number(row.qu_id_stock) };
  }

  private async conversions(productId: number): Promise<Conversion[]> {
    const rows = await this.apiCall<any[]>(
      '/objects/quantity_unit_conversions_resolved',
      'GET',
      undefined,
      {
        queryParams: { 'query[]': `product_id=${productId}` },
      },
    );
    return (rows || []).map((c) => ({
      from_qu_id: Number(c.from_qu_id),
      to_qu_id: Number(c.to_qu_id),
      factor: Number(c.factor),
    }));
  }

  /** The caller's unit: an id, or a name / plural name (case-insensitive); default the stock unit. */
  private resolveUnit(units: QuantityUnit[], product: Product, unit: unknown): QuantityUnit {
    if (unit === undefined || unit === null || unit === '') {
      const stock = units.find((u) => u.id === product.qu_id_stock);
      if (!stock)
        throw new ValidationError(
          `Stock unit ${product.qu_id_stock} of "${product.name}" not found.`,
        );
      return stock;
    }
    if (typeof unit === 'number' || /^\d+$/.test(String(unit))) {
      const hit = units.find((u) => u.id === Number(unit));
      if (!hit)
        throw new ValidationError(`Quantity unit id ${unit} does not exist. Use system_units_get.`);
      return hit;
    }
    const wanted = String(unit).trim().toLowerCase();
    const hits = units.filter(
      (u) => u.name.toLowerCase() === wanted || (u.name_plural || '').toLowerCase() === wanted,
    );
    if (hits.length !== 1) {
      throw new ValidationError(
        `Quantity unit "${unit}" ${hits.length ? 'is ambiguous' : 'does not exist'}. Use system_units_get and pass its id.`,
      );
    }
    return hits[0]!;
  }

  /** Amount in `unit` → the product's stock unit, or a ValidationError naming the missing conversion. */
  private toStock(
    amount: number,
    unit: QuantityUnit,
    product: Product,
    conversions: Conversion[],
    units: QuantityUnit[],
  ): number {
    if (unit.id === product.qu_id_stock) return clean(amount);
    const conv = conversions.find(
      (c) => c.from_qu_id === unit.id && c.to_qu_id === product.qu_id_stock,
    );
    if (!conv) {
      const stock = units.find((u) => u.id === product.qu_id_stock);
      throw new ValidationError(
        `No quantity unit conversion from "${unit.name}" to "${stock?.name ?? product.qu_id_stock}" for "${product.name}". ` +
          `Use the stock unit, or add the conversion in Grocy first.`,
      );
    }
    return clean(amount * conv.factor);
  }

  private fromStock(
    amount: number,
    quId: number,
    product: Product,
    conversions: Conversion[],
  ): number | null {
    if (quId === product.qu_id_stock) return clean(amount);
    const conv = conversions.find(
      (c) => c.from_qu_id === product.qu_id_stock && c.to_qu_id === quId,
    );
    return conv ? clean(amount * conv.factor) : null;
  }

  private validateAmount(amount: unknown): number {
    const value = Number(amount);
    if (amount === undefined || amount === null || !Number.isFinite(value) || value <= 0) {
      throw new ValidationError('amount must be a positive number (in the unit you pass as unit).');
    }
    return value;
  }

  private describe(
    amount: number,
    unit: QuantityUnit,
    stockAmount: number,
    product: Product,
    units: QuantityUnit[],
  ) {
    const stock = units.find((u) => u.id === product.qu_id_stock);
    return `${amount} ${unit.name} of "${product.name}" (stored as ${stockAmount} ${stock?.name ?? ''} in its stock unit)`;
  }

  public getIngredients: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { recipeId } = args || {};
      this.validateRequired({ recipeId }, ['recipeId']);

      const rows =
        (await this.apiCall<any[]>('/objects/recipes_pos', 'GET', undefined, {
          queryParams: { 'query[]': `recipe_id=${recipeId}` },
        })) || [];
      const units = await this.units();
      const unitName = (id: number) => units.find((u) => u.id === id)?.name ?? String(id);

      const out = [];
      for (const row of rows) {
        const product = await this.product(Number(row.product_id));
        const conversions = await this.conversions(product.id);
        const stockAmount = Number(row.amount);
        const quId =
          row.qu_id === null || row.qu_id === undefined ? product.qu_id_stock : Number(row.qu_id);
        out.push({
          ingredientId: Number(row.id),
          productId: product.id,
          productName: product.name,
          amount: this.fromStock(stockAmount, quId, product, conversions),
          unit: unitName(quId),
          stockAmount,
          stockUnit: unitName(product.qu_id_stock),
          note: row.note || '',
          onlyCheckSingleUnitInStock: Number(row.only_check_single_unit_in_stock || 0) === 1,
          notCheckStockFulfillment: Number(row.not_check_stock_fulfillment || 0) === 1,
        });
      }
      return this.createSuccess(
        out,
        'amount/unit is what Grocy shows; stockAmount/stockUnit is what Grocy stores and uses for stock and shopping.',
      );
    });
  };

  public addIngredient: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const {
        recipeId,
        productId,
        amount,
        unit,
        note,
        onlyCheckSingleUnitInStock,
        notCheckStockFulfillment,
      } = args || {};
      this.validateRequired({ recipeId, productId, amount }, ['recipeId', 'productId', 'amount']);
      const value = this.validateAmount(amount);

      const product = await this.product(Number(productId));
      const units = await this.units();
      const conversions = await this.conversions(product.id);
      const qu = this.resolveUnit(units, product, unit);
      const stockAmount = this.toStock(value, qu, product, conversions, units);

      const result = await this.apiCall('/objects/recipes_pos', 'POST', {
        recipe_id: Number(recipeId),
        product_id: product.id,
        amount: stockAmount,
        qu_id: qu.id,
        note: note || '',
        only_check_single_unit_in_stock: onlyCheckSingleUnitInStock ? 1 : 0,
        not_check_stock_fulfillment: notCheckStockFulfillment ? 1 : 0,
      });
      return this.createSuccess(
        result,
        `Added ${this.describe(value, qu, stockAmount, product, units)}`,
      );
    });
  };

  public updateIngredient: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const {
        ingredientId,
        productId,
        amount,
        unit,
        note,
        onlyCheckSingleUnitInStock,
        notCheckStockFulfillment,
      } = args || {};
      this.validateRequired({ ingredientId }, ['ingredientId']);

      const row = await this.apiCall<any>(`/objects/recipes_pos/${ingredientId}`);
      if (!row) throw new ValidationError(`Ingredient ${ingredientId} not found.`);
      const product = await this.product(Number(productId ?? row.product_id));
      const units = await this.units();
      const conversions = await this.conversions(product.id);

      const body: Record<string, unknown> = {};
      let message = `Updated ingredient ${ingredientId}`;
      const productChanged =
        productId !== undefined && Number(productId) !== Number(row.product_id);
      if (amount !== undefined || unit !== undefined || productChanged) {
        if (amount === undefined) {
          throw new ValidationError('Pass amount (in unit) when changing the unit or product.');
        }
        const value = this.validateAmount(amount);
        const qu =
          unit !== undefined
            ? this.resolveUnit(units, product, unit)
            : this.resolveUnit(
                units,
                product,
                productChanged ? undefined : Number(row.qu_id ?? product.qu_id_stock),
              );
        const stockAmount = this.toStock(value, qu, product, conversions, units);
        Object.assign(body, { product_id: product.id, amount: stockAmount, qu_id: qu.id });
        message += `: ${this.describe(value, qu, stockAmount, product, units)}`;
      }
      if (note !== undefined) body.note = note;
      if (onlyCheckSingleUnitInStock !== undefined)
        body.only_check_single_unit_in_stock = onlyCheckSingleUnitInStock ? 1 : 0;
      if (notCheckStockFulfillment !== undefined)
        body.not_check_stock_fulfillment = notCheckStockFulfillment ? 1 : 0;
      if (Object.keys(body).length === 0) {
        throw new ValidationError(
          'Nothing to update: pass amount/unit, productId, note or a flag.',
        );
      }

      await this.apiCall(`/objects/recipes_pos/${ingredientId}`, 'PUT', body);
      return this.createSuccess({ ingredientId: Number(ingredientId), ...body }, message);
    });
  };

  public deleteIngredient: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { ingredientId } = args || {};
      this.validateRequired({ ingredientId }, ['ingredientId']);
      await this.apiCall(`/objects/recipes_pos/${ingredientId}`, 'DELETE');
      return this.createSuccess(
        { ingredientId: Number(ingredientId) },
        `Deleted ingredient ${ingredientId}`,
      );
    });
  };
}

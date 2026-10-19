import { describe, it, expect } from 'vitest';
import { refuseRawWrite } from './write-guard.js';

describe('refuseRawWrite', () => {
  it('refuses writes that store amounts without the unit conversion', () => {
    for (const [method, endpoint] of [
      ['POST', 'objects/recipes_pos'],
      ['PUT', '/api/objects/recipes_pos/12'],
      ['post', 'objects/shopping_list'],
      ['PUT', 'objects/meal_plan/3'],
      ['POST', 'objects/chores'],
      ['POST', 'stock/shoppinglist/add-product'],
      ['POST', '/stock/shoppinglist/remove-product?x=1'],
    ]) {
      expect(refuseRawWrite(method!, endpoint!, {}), `${method} ${endpoint}`).toMatch(/^Refused/);
    }
  });

  it('points to the tool that converts the unit', () => {
    expect(refuseRawWrite('POST', 'objects/recipes_pos', { amount: 500 })).toContain(
      'recipes_ingredients_add',
    );
    expect(refuseRawWrite('POST', 'objects/recipes_pos', {})).toContain('500 kg');
  });

  it('refuses a stock unit change', () => {
    expect(refuseRawWrite('PUT', 'objects/products/8', { qu_id_stock: 2 })).toContain('old => new');
    expect(refuseRawWrite('PUT', 'objects/products/8', { name: 'Magro' })).toBeNull();
    expect(refuseRawWrite('POST', 'objects/products', { name: 'New', qu_id_stock: 2 })).toBeNull();
  });

  it('refuses dot segments and backslashes that axios resolves onto a guarded path', () => {
    for (const [method, endpoint] of [
      ['POST', 'objects/./recipes_pos'],
      ['POST', 'x/../objects/recipes_pos'],
      ['POST', './objects/shopping_list'],
      ['POST', '../objects/shopping_list'],
      ['POST', 'objects/%2e/recipes_pos'],
      ['POST', 'objects/x/%2E%2E/recipes_pos'],
      ['POST', 'objects\\recipes_pos'],
      ['POST', 'objects/recipes_pos/.'],
      ['POST', 'objects/recipes\t_pos'],
      ['POST', 'objects/recipes_pos '],
      ['POST', '//objects/recipes_pos'],
      ['POST', 'objects//recipes_pos'],
    ]) {
      expect(refuseRawWrite(method!, endpoint!, {}), `${method} ${endpoint}`).toMatch(/^Refused/);
    }
    expect(refuseRawWrite('PUT', 'objects/x/../products/8', { qu_id_stock: 2 })).toMatch(
      /^Refused/,
    );
  });

  it('decodes percent-escapes once, as Grocy (Slim) does, before matching', () => {
    for (const [method, endpoint] of [
      ['POST', 'objects/recipes%5Fpos'],
      ['POST', 'objects/%72ecipes_pos/3'],
      ['POST', 'stock/shoppinglist/add%2Dproduct'],
      ['POST', 'stock%2Fshoppinglist%2Fremove-product'],
      ['POST', '%61pi/objects/chores'],
      ['POST', 'objects/recipes%255Fpos'],
      ['POST', 'objects/%E0%A4%A'],
      // Slim decodes route placeholders a second time
      ['PUT', 'objects/recipes%255Fpos/3'],
    ]) {
      expect(refuseRawWrite(method!, endpoint!, {}), `${method} ${endpoint}`).toMatch(/^Refused/);
    }
    expect(refuseRawWrite('PUT', 'objects/products%2F8', { qu_id_stock: 2 })).toContain(
      'old => new',
    );
    expect(refuseRawWrite('PUT', 'objects/products%252F8', { qu_id_stock: 2 })).toMatch(/^Refused/);
  });

  it('lets reads, deletes and unrelated writes through', () => {
    expect(refuseRawWrite('GET', 'objects/recipes_pos', null)).toBeNull();
    expect(refuseRawWrite('DELETE', 'objects/recipes_pos/12', null)).toBeNull();
    expect(refuseRawWrite('POST', 'objects/recipes', { name: 'x' })).toBeNull();
    expect(refuseRawWrite('POST', 'objects/recipes_pos_resolved', {})).toBeNull();
    expect(refuseRawWrite('POST', '/api/objects/recipes/', { name: 'x' })).toBeNull();
    expect(refuseRawWrite('POST', 'stock/products/by-barcode/abc%20def/add', {})).toBeNull();
    expect(refuseRawWrite('PUT', 'objects/products/8?x=../y', { name: 'Magro' })).toBeNull();
  });
});

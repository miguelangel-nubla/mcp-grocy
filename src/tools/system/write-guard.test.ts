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

  it('lets reads, deletes and unrelated writes through', () => {
    expect(refuseRawWrite('GET', 'objects/recipes_pos', null)).toBeNull();
    expect(refuseRawWrite('DELETE', 'objects/recipes_pos/12', null)).toBeNull();
    expect(refuseRawWrite('POST', 'objects/recipes', { name: 'x' })).toBeNull();
    expect(refuseRawWrite('POST', 'objects/recipes_pos_resolved', {})).toBeNull();
  });
});

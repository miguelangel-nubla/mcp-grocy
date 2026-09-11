import { describe, it, expect } from 'vitest';
import { BaseToolHandler } from './base.js';

class TestHandler extends BaseToolHandler {
  public testNormalize(data: any): any {
    return this.normalizeResponseData(data);
  }

  public testSuccess(data: any, message?: string) {
    return this.createSuccess(data, message);
  }
}

describe('BaseToolHandler normalization', () => {
  const handler = new TestHandler();

  it('normalizes created_object_id string to number', () => {
    const input = { created_object_id: '1330' };
    const output = handler.testNormalize(input);
    expect(output).toEqual({ created_object_id: 1330 });
  });

  it('leaves created_object_id untouched if already a number', () => {
    const input = { created_object_id: 1330 };
    const output = handler.testNormalize(input);
    expect(output).toEqual({ created_object_id: 1330 });
  });

  it('normalizes string id to number', () => {
    const input = { id: '46', name: 'Arroz redondo' };
    const output = handler.testNormalize(input);
    expect(output).toEqual({ id: 46, name: 'Arroz redondo' });
  });

  it('normalizes nested objects and arrays', () => {
    const input = {
      list: { id: '1', name: 'Groceries' },
      items: [
        { id: '10', product: { id: '46', name: 'Rice' } },
        { id: '11', product: { id: '55', name: 'Beans' } },
      ],
    };
    const output = handler.testNormalize(input);
    expect(output).toEqual({
      list: { id: 1, name: 'Groceries' },
      items: [
        { id: 10, product: { id: 46, name: 'Rice' } },
        { id: 11, product: { id: 55, name: 'Beans' } },
      ],
    });
  });

  it('does not touch barcodes, dates, or non-id fields', () => {
    const input = {
      id: '1',
      barcode: '012345678905',
      created_at: '2026-09-11 12:00:00',
      note: '46',
    };
    const output = handler.testNormalize(input);
    expect(output).toEqual({
      id: 1,
      barcode: '012345678905',
      created_at: '2026-09-11 12:00:00',
      note: '46',
    });
  });

  it('createSuccess automatically applies normalization to structuredContent and textContent', () => {
    const res = handler.testSuccess({ created_object_id: '1330' }, 'Created');
    expect(res.structuredContent?.data).toEqual({ created_object_id: 1330 });
  });
});

import { describe, it, expect } from 'vitest';
import { validateShoppingListAddItemSubConfigs } from './validations.js';
import { createShoppingListAddItemDefinition, getShoppingToolDefinitions } from './definitions.js';

describe('shopping validations', () => {
  describe('validateShoppingListAddItemSubConfigs', () => {
    it('should accept valid boolean allow_note_only true', () => {
      const subConfigs = new Map<string, any>([['allow_note_only', true]]);
      expect(() => validateShoppingListAddItemSubConfigs(subConfigs)).not.toThrow();
    });

    it('should accept valid boolean allow_note_only false', () => {
      const subConfigs = new Map<string, any>([['allow_note_only', false]]);
      expect(() => validateShoppingListAddItemSubConfigs(subConfigs)).not.toThrow();
    });

    it('should reject non-boolean allow_note_only', () => {
      const subConfigs = new Map<string, any>([['allow_note_only', 'false']]);
      expect(() => validateShoppingListAddItemSubConfigs(subConfigs)).toThrow(
        'allow_note_only must be a boolean',
      );
    });

    it('should reject unknown sub-configuration options', () => {
      const subConfigs = new Map<string, any>([
        ['allow_note_only', true],
        ['invalid_option', 123],
      ]);
      expect(() => validateShoppingListAddItemSubConfigs(subConfigs)).toThrow(
        /Unknown sub-configuration option/,
      );
    });
  });

  describe('createShoppingListAddItemDefinition', () => {
    it('should generate definition allowing note only when allowNoteOnly is true', () => {
      const def = createShoppingListAddItemDefinition(true);
      expect(def.name).toBe('shopping_list_add_item');
      expect(def.inputSchema.required).toEqual([]);
      expect(def.description).toContain('omit the product ID');
      expect(def.inputSchema.properties.productId.minimum).toBe(1);
      expect(def.inputSchema.properties.productId.description).toContain('Optional');
      expect(def.inputSchema.properties.note.description).toContain(
        'Required if productId is omitted',
      );
    });

    it('should generate definition requiring productId when allowNoteOnly is false', () => {
      const def = createShoppingListAddItemDefinition(false);
      expect(def.name).toBe('shopping_list_add_item');
      expect(def.inputSchema.required).toEqual(['productId']);
      expect(def.description).toContain('all rows must correspond to an existing product');
      expect(def.inputSchema.properties.productId.minimum).toBe(1);
      expect(def.inputSchema.properties.productId.description).toContain(
        'must be a valid product ID >= 1',
      );
      expect(def.inputSchema.properties.note.description).toContain(
        'Additional notes for the product',
      );
    });

    it('should generate tool definitions array via getShoppingToolDefinitions', () => {
      const defs = getShoppingToolDefinitions(false);
      const addItemDef = defs.find((d) => d.name === 'shopping_list_add_item');
      expect(addItemDef).toBeDefined();
      expect(addItemDef?.inputSchema.required).toEqual(['productId']);
      expect(addItemDef?.inputSchema.properties.productId.minimum).toBe(1);
    });
  });
});

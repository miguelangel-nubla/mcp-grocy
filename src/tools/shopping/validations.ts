/**
 * Shopping tools sub-configuration validation functions
 */

import { ValidationHelpers } from '../validation-helpers.js';
import { type SubConfigValidator } from '../types.js';

/**
 * Validation function for shopping_list_add_item tool sub-configurations
 */
export const validateShoppingListAddItemSubConfigs: SubConfigValidator = (
  subConfigs: Map<string, any>,
) => {
  const allowNoteOnly = subConfigs.get('allow_note_only');

  // Validate types
  ValidationHelpers.validateBoolean(allowNoteOnly, 'allow_note_only');

  // Check for unknown options
  const knownOptions = new Set(['allow_note_only', 'ack_token']);
  ValidationHelpers.validateKnownOptions(subConfigs, knownOptions, 'shopping_list_add_item');
};

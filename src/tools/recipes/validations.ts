/**
 * Recipe tools sub-configuration validation functions
 */

import { ValidationHelpers } from '../validation-helpers.js';
import { type SubConfigValidator } from '../types.js';

/**
 * Validation function for complete tool sub-configurations
 */
export const validateCompleteSubConfigs: SubConfigValidator = (subConfigs: Map<string, any>) => {
  const allowMealPlanEntryAlreadyDone = subConfigs.get('allow_meal_plan_entry_already_done');
  const allowNoMealPlan = subConfigs.get('allow_no_meal_plan');
  const printLabels = subConfigs.get('print_labels');

  // Validate types
  ValidationHelpers.validateBoolean(allowMealPlanEntryAlreadyDone, 'allow_meal_plan_entry_already_done');
  ValidationHelpers.validateBoolean(allowNoMealPlan, 'allow_no_meal_plan');
  ValidationHelpers.validateBoolean(printLabels, 'print_labels');

  // Business logic validation
  if (allowNoMealPlan && allowMealPlanEntryAlreadyDone) {
    throw new Error('allow_no_meal_plan and allow_meal_plan_entry_already_done cannot both be true - they are mutually exclusive modes');
  }

  // Check for unknown options
  const knownOptions = new Set(['allow_meal_plan_entry_already_done', 'allow_no_meal_plan', 'print_labels', 'ack_token']);
  ValidationHelpers.validateKnownOptions(subConfigs, knownOptions, 'complete');
};
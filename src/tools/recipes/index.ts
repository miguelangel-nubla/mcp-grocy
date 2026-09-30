import { ToolModule } from '../types.js';
import { recipeToolDefinitions } from './definitions.js';
import { RecipeToolHandlers } from './handlers.js';
import { RecipeIngredientHandlers } from './ingredients.js';
import { validateCompleteSubConfigs } from './validations.js';

// Use simplified handlers
const handlers = new RecipeToolHandlers();
const ingredients = new RecipeIngredientHandlers();

export const recipeModule: ToolModule = {
  definitions: recipeToolDefinitions,
  handlers: {
    // Recipe Management
    recipes_management_get: handlers.getRecipes,
    recipes_management_get_by_id: handlers.getRecipeById,
    recipes_management_create: handlers.createRecipe,
    recipes_management_print_label: handlers.printRecipeLabel,

    // Recipe Ingredients (amounts converted to the product's stock unit)
    recipes_ingredients_get: ingredients.getIngredients,
    recipes_ingredients_add: ingredients.addIngredient,
    recipes_ingredients_update: ingredients.updateIngredient,
    recipes_ingredients_delete: ingredients.deleteIngredient,

    // Recipe Fulfillment
    recipes_fulfillment_get: handlers.getRecipeFulfillment,
    recipes_fulfillment_get_all: handlers.getAllRecipeFulfillment,

    // Meal Planning
    recipes_mealplan_get: handlers.getMealPlan,
    recipes_mealplan_get_sections: handlers.getMealPlanSections,
    recipes_mealplan_add_recipe: handlers.addRecipeToMealPlan,
    recipes_mealplan_add_note: handlers.addNoteToMealPlan,
    recipes_mealplan_delete_entry: handlers.deleteMealPlanEntry,

    // Recipe Cooking
    recipes_cooking_consume: handlers.consumeRecipe,
    recipes_cooking_complete: handlers.cookedSomething,

    // Shopping Integration
    recipes_shopping_add_all_products: handlers.addAllProductsToShopping,
    recipes_shopping_add_missing_products: handlers.addMissingProductsToShopping,
  },
  validators: {
    recipes_cooking_complete: validateCompleteSubConfigs,
  },
};

export * from './definitions.js';

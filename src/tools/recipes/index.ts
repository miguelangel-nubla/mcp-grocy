import { ToolModule } from '../types.js';
import { recipeToolDefinitions } from './definitions.js';
import { RecipeToolHandlers } from './handlers.js';

// Use simplified handlers
const handlers = new RecipeToolHandlers();

export const recipeModule: ToolModule = {
  definitions: recipeToolDefinitions,
  handlers: {
    // Recipe Management
    recipes_management_get: handlers.getRecipes,
    recipes_management_get_by_id: handlers.getRecipeById,
    recipes_management_create: handlers.createRecipe,
    
    // Recipe Fulfillment
    recipes_fulfillment_get: handlers.getRecipeFulfillment,
    recipes_fulfillment_get_all: handlers.getAllRecipeFulfillment,
    
    // Meal Planning
    recipes_mealplan_get: handlers.getMealPlan,
    recipes_mealplan_get_sections: handlers.getMealPlanSections,
    recipes_mealplan_add_recipe: handlers.addRecipeToMealPlan,
    recipes_mealplan_delete_entry: handlers.deleteRecipeFromMealPlan,
    
    // Recipe Cooking
    recipes_cooking_consume: handlers.consumeRecipe,
    recipes_cooking_cooked_something: handlers.cookedSomething,
    
    // Shopping Integration
    recipes_shopping_add_all_products: handlers.addAllProductsToShopping,
    recipes_shopping_add_missing_products: handlers.addMissingProductsToShopping
  }
};

export * from './definitions.js';
/**
 * Simplified recipe tool handlers
 * Demonstrates the new simplified pattern
 */

import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';
import { InventoryToolHandlers } from '../inventory/handlers.js';

export class RecipeToolHandlers extends BaseToolHandler {
  private inventoryHandlers = new InventoryToolHandlers();

  /**
   * Helper method to get meal plan for multiple days
   */
  private async getMealPlanForDays(dates: Date[]): Promise<any[]> {
    const allResults: any[] = [];
    
    for (const date of dates) {
      const dayString = date.toISOString().split('T')[0]!;
      
      const dayResult = await this.apiCall(`/objects/meal_plan`, 'GET', undefined, {
        queryParams: { 
          'query[]': `day=${dayString}`,
          order: 'day'
        }
      });
      
      if (Array.isArray(dayResult)) {
        allResults.push(...dayResult);
      }
    }
    
    return allResults;
  }

  /**
   * Get recipes with specified fields
   */
  public getRecipes: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { fields } = args || {};
      
      // Validate required parameters
      this.validateRequired({ fields }, ['fields']);
      const fieldList = this.parseArrayParam(fields, 'fields');

      // Fetch recipes
      const recipes = await this.apiCall('/objects/recipes', 'GET', undefined, {
        queryParams: { 'query[]': 'type=normal' }
      });

      if (!Array.isArray(recipes)) {
        return this.createSuccess([]);
      }

      // Filter to requested fields
      const filteredRecipes = this.filterFields(recipes, fieldList);
      
      return this.createSuccess(filteredRecipes);
    });
  };

  /**
   * Get recipe by ID
   */
  public getRecipeById: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { recipeId } = args || {};
      
      this.validateRequired({ recipeId }, ['recipeId']);
      const id = this.parseNumberParam(recipeId, 'recipeId');
      
      const recipe = await this.apiCall(`/objects/recipes/${id}`);
      
      return this.createSuccess(recipe);
    });
  };

  /**
   * Get recipe fulfillment information
   */
  public getRecipeFulfillment: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { recipeId } = args || {};
      
      this.validateRequired({ recipeId }, ['recipeId']);
      const id = this.parseNumberParam(recipeId, 'recipeId');
      
      const fulfillment = await this.apiCall(`/recipes/${id}/fulfillment`);
      
      return this.createSuccess(fulfillment);
    });
  };

  /**
   * Add recipe to meal plan
   */
  public addRecipeToMealPlan: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { recipeId, day, mealType } = args || {};
      
      this.validateRequired({ recipeId, day }, ['recipeId', 'day']);
      const id = this.parseNumberParam(recipeId, 'recipeId');
      
      const mealPlanData = {
        day,
        type: mealType || 'lunch',
        recipe_id: id
      };
      
      const result = await this.apiCall('/objects/meal_plan', 'POST', mealPlanData);
      
      return this.createSuccess(result, 'Recipe added to meal plan successfully');
    });
  };

  /**
   * Cook recipe - consume ingredients from stock
   */
  public cookRecipe: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { recipeId, servings } = args || {};
      
      this.validateRequired({ recipeId }, ['recipeId']);
      const id = this.parseNumberParam(recipeId, 'recipeId');
      const servingCount = this.parseNumberParam(servings, 'servings', false) || 1;
      
      // Get recipe details first
      const recipe = await this.apiCall(`/objects/recipes/${id}`);
      
      // Cook the recipe
      const cookData = {
        recipe_id: id,
        servings: servingCount
      };
      
      const result = await this.apiCall('/recipes/cook', 'POST', cookData);
      
      return this.createSuccess({
        recipe: recipe.name,
        servings: servingCount,
        result
      }, `Recipe "${recipe.name}" cooked successfully`);
    });
  };

  /**
   * Get recipe nutrition information
   */
  public getRecipeNutrition: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { recipeId } = args || {};
      
      this.validateRequired({ recipeId }, ['recipeId']);
      const id = this.parseNumberParam(recipeId, 'recipeId');
      
      const nutrition = await this.apiCall(`/recipes/${id}/nutrition`);
      
      return this.createSuccess(nutrition);
    });
  };

  /**
   * Search recipes by name or ingredients
   */
  public searchRecipes: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { query, fields } = args || {};
      
      this.validateRequired({ query }, ['query']);
      const fieldList = this.parseArrayParam(fields || ['id', 'name'], 'fields');
      
      // Get all recipes and filter locally
      // Note: This could be optimized with server-side search if Grocy supports it
      const recipes = await this.apiCall('/objects/recipes', 'GET', undefined, {
        queryParams: { 'query[]': 'type=normal' }
      });
      
      if (!Array.isArray(recipes)) {
        return this.createSuccess([]);
      }
      
      const searchTerm = query.toLowerCase();
      const filtered = recipes.filter((recipe: any) => 
        recipe.name?.toLowerCase().includes(searchTerm) ||
        recipe.description?.toLowerCase().includes(searchTerm)
      );
      
      const result = this.filterFields(filtered, fieldList);
      
      return this.createSuccess(result);
    });
  };

  // ==================== MEAL PLANNING METHODS ====================

  /**
   * Get meal plan data with context
   */
  public getMealPlan: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { date, weekly } = args || {};

      // Date parameter is mandatory
      this.validateRequired({ date }, ['date']);
      
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD.');
      }

      const datesToQuery: Date[] = [];
      
      if (weekly) {
        // For weekly view, get the start of the week (Monday)
        const dayOfWeek = targetDate.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const startDate = new Date(targetDate);
        startDate.setDate(targetDate.getDate() + mondayOffset);
        
        // Get all 7 days of the week with ±1 day buffer for timezone issues
        for (let i = -1; i <= 7; i++) {
          const day = new Date(startDate);
          day.setDate(startDate.getDate() + i);
          datesToQuery.push(day);
        }
      } else {
        // Get the specific date with ±1 day buffer for timezone issues
        const dayBefore = new Date(targetDate);
        dayBefore.setDate(targetDate.getDate() - 1);
        
        const dayAfter = new Date(targetDate);
        dayAfter.setDate(targetDate.getDate() + 1);
        
        datesToQuery.push(dayBefore, targetDate, dayAfter);
      }

      const result = await this.getMealPlanForDays(datesToQuery);
      
      if (result.length === 0) {
        return this.createSuccess({
          message: weekly ? 'No meals planned for the requested week' : 'No meals planned for the requested date',
          meal_plan_by_date: {}
        }, 'Meal plan retrieved successfully');
      }

      // Extract unique recipe IDs 
      const recipeIds = [...new Set(result.map(entry => entry.recipe_id).filter(id => id))];

      // Fetch recipe details and all sections in parallel
      const [recipeDetails, allSections] = await Promise.all([
        Promise.all(recipeIds.map(recipeId => 
          this.apiCall(`/objects/recipes/${recipeId}`)
        )),
        this.apiCall('/objects/meal_plan_sections')
      ]);

      // Simplify meal plan entries - don't merge recipe/section details
      const simplifiedMealPlanByDate: Record<string, any[]> = {};
      
      result.forEach(entry => {
        const entryDate = entry.day;
        if (!simplifiedMealPlanByDate[entryDate]) {
          simplifiedMealPlanByDate[entryDate] = [];
        }
        
        simplifiedMealPlanByDate[entryDate].push({
          id: entry.id,
          day: entry.day,
          section_id: entry.section_id,
          recipe_id: entry.recipe_id,
          recipe_servings: entry.recipe_servings,
          note: entry.note,
          done: entry.done
        });
      });

      return this.createSuccess({
        meal_plan_by_date: simplifiedMealPlanByDate,
        recipes: recipeDetails.map((recipe: any) => ({
          id: recipe.id,
          name: recipe.name,
          product_id: recipe.product_id,
        })),
        sections: Array.isArray(allSections) ? allSections.map((section: any) => ({
          id: section.id,
          name: section.name,
          time_info: section.time_info
        })) : []
      }, 'Meal plan retrieved successfully');
    });
  };

  /**
   * Get meal plan sections
   */
  public getMealPlanSections: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const result = await this.apiCall('/objects/meal_plan_sections');
      return this.createSuccess(result, 'Meal plan sections retrieved successfully');
    });
  };

  /**
   * Delete recipe from meal plan
   */
  public deleteRecipeFromMealPlan: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { mealPlanEntryId } = args || {};
      this.validateRequired({ mealPlanEntryId }, ['mealPlanEntryId']);

      const result = await this.apiCall(`/objects/meal_plan/${mealPlanEntryId}`, 'DELETE');
      return this.createSuccess(result, 'Recipe deleted from meal plan successfully');
    });
  };

  // ==================== RECIPE CREATION ====================

  /**
   * Create a new recipe
   */
  public printRecipeLabel: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { recipeId } = args || {};
      this.validateRequired({ recipeId }, ['recipeId']);

      const result = await this.apiCall(`/recipes/${recipeId}/printlabel`);
      return this.createSuccess(result, 'Recipe label printed successfully');
    });
  };

  public createRecipe: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { name, description, baseServings, instructions } = args || {};
      
      this.validateRequired({ name }, ['name']);
      
      const recipeData = {
        name,
        description: description || '',
        base_servings: baseServings || 1,
        type: 'normal',
        instructions: instructions || ''
      };
      
      const result = await this.apiCall('/objects/recipes', 'POST', recipeData);
      
      return this.createSuccess(result, `Recipe "${name}" created successfully`);
    });
  };

  // ==================== RECIPE FULFILLMENT ====================

  /**
   * Get fulfillment status for all recipes
   */
  public getAllRecipeFulfillment: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const fulfillment = await this.apiCall('/recipes/fulfillment');
      
      return this.createSuccess(fulfillment);
    });
  };

  // ==================== RECIPE CONSUMPTION ====================

  /**
   * Consume/cook a recipe (simple version)
   */
  public consumeRecipe: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { recipeId, servings } = args || {};
      
      this.validateRequired({ recipeId }, ['recipeId']);
      const id = this.parseNumberParam(recipeId, 'recipeId');
      const servingCount = this.parseNumberParam(servings, 'servings', false) || 1;
      
      const consumeData = {
        recipe_id: id,
        servings: servingCount
      };
      
      const result = await this.apiCall('/recipes/consume', 'POST', consumeData);
      
      return this.createSuccess(result, `Recipe consumed (${servingCount} servings)`);
    });
  };

  // ==================== RECIPE SHOPPING INTEGRATION ====================

  /**
   * Add all products from a recipe to shopping list
   */
  public addAllProductsToShopping: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { recipeId } = args || {};
      
      this.validateRequired({ recipeId }, ['recipeId']);
      const id = this.parseNumberParam(recipeId, 'recipeId');
      
      const result = await this.apiCall(`/recipes/${id}/add-all-ingredients-to-shopping-list`, 'POST');
      
      return this.createSuccess(result, 'All recipe products added to shopping list');
    });
  };

  /**
   * Add missing products from a recipe to shopping list
   */
  public addMissingProductsToShopping: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { recipeId } = args || {};
      
      this.validateRequired({ recipeId }, ['recipeId']);
      const id = this.parseNumberParam(recipeId, 'recipeId');
      
      const result = await this.apiCall(`/recipes/${id}/add-not-fulfilled-products-to-shopping-list`, 'POST');
      
      return this.createSuccess(result, 'Missing recipe products added to shopping list');
    });
  };

  // ==================== COOKING METHODS ====================

  /**
   * Mark recipe from meal plan entry as cooked - modernized version
   */
  public cookedSomething: ToolHandler = async (args: any): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const { mealPlanEntryId, recipeId, stockAmounts } = args || {};
      
      // Get configuration from unified config
      const { config } = await import('../../config/index.js');
      const { toolSubConfigs } = config.parseToolConfiguration();
      const subConfigs = toolSubConfigs?.get('complete');
      
      const allowMealPlanEntryAlreadyDone = subConfigs?.get('allow_meal_plan_entry_already_done') ?? false;
      const printLabels = subConfigs?.get('print_labels') ?? true;
      const allowNoMealPlan = subConfigs?.get('allow_no_meal_plan') ?? false;
      
      // Validate parameters based on configuration
      if (!allowNoMealPlan && !mealPlanEntryId) {
        throw new Error('mealPlanEntryId is required when allow_no_meal_plan is false.');
      }
      
      if (allowNoMealPlan && !recipeId) {
        throw new Error('recipeId is required when allow_no_meal_plan is true.');
      }
      
      if (allowNoMealPlan && mealPlanEntryId) {
        throw new Error('mealPlanEntryId should not be provided when allow_no_meal_plan is true. Use recipeId instead.');
      }

      this.validateRequired({ stockAmounts }, ['stockAmounts']);
      
      if (!Array.isArray(stockAmounts) || stockAmounts.length === 0) {
        throw new Error('stockAmounts must be a non-empty array of serving amounts.');
      }

      // Validate all stock amounts are positive numbers
      for (let i = 0; i < stockAmounts.length; i++) {
        const amount = stockAmounts[i]!;
        if (typeof amount !== 'number' || amount <= 0) {
          throw new Error(`stockAmounts[${i}] must be a positive number, got: ${amount}`);
        }
      }

      const completedSteps: string[] = [];
      let actualRecipeId: number;
      let totalServings: number;
      let mealPlanDate: string;
      let mealplanShadow: string;
      
      if (allowNoMealPlan) {
        // Direct recipe mode - no meal plan entry involved
        actualRecipeId = recipeId;
        totalServings = stockAmounts.reduce((sum: number, amount: number) => sum + amount, 0);
        mealPlanDate = new Date().toISOString().split('T')[0]!;
        mealplanShadow = `${mealPlanDate}#direct-recipe-${actualRecipeId}`;
        
        completedSteps.push('Using direct recipe mode (no meal plan entry)');
      } else {
        // Meal plan mode - traditional workflow
        const mealPlanEntry = await this.apiCall(`/objects/meal_plan/${mealPlanEntryId}`);

        if (!mealPlanEntry) {
          throw new Error(`Meal plan entry ${mealPlanEntryId} not found.`);
        }

        if (mealPlanEntry.done == 1 && !allowMealPlanEntryAlreadyDone) {
          throw new Error(`Meal plan entry ${mealPlanEntryId} is already marked as done. Cannot mark as cooked again.`);
        }

        actualRecipeId = mealPlanEntry.recipe_id;
        totalServings = stockAmounts.reduce((sum: number, amount: number) => sum + amount, 0);
        mealPlanDate = mealPlanEntry.day || new Date().toISOString().split('T')[0]!;
        mealplanShadow = `${mealPlanDate}#${mealPlanEntryId}`;
        
        // Mark the meal plan entry as done and update recipe_servings
        await this.apiCall(`/objects/meal_plan/${mealPlanEntryId}`, 'PUT', {
          done: 1,
          recipe_servings: totalServings
        });
        completedSteps.push('Meal plan entry marked as done');
      }

      // Consume recipe ingredients
      if (allowNoMealPlan) {
        // Direct consumption using the recipe ID
        await this.apiCall(`/recipes/${actualRecipeId}/consume`, 'POST');
        completedSteps.push('Recipe consumed directly');
      } else {
        // Query for the mealplan shadow recipe by name
        const shadowRecipes = await this.apiCall('/objects/recipes', 'GET', undefined, {
          queryParams: { 'query[]': `name=${mealplanShadow}` }
        });
        
        if (!Array.isArray(shadowRecipes) || shadowRecipes.length === 0) {
          throw new Error(`Mealplan shadow recipe '${mealplanShadow}' not found. Cannot consume ingredients.`);
        }
        
        const shadowRecipeId = shadowRecipes[0]!.id;
        
        // Consume ingredients using the shadow recipe ID
        await this.apiCall(`/recipes/${shadowRecipeId}/consume`, 'POST');
        completedSteps.push('Recipe consumed via meal plan entry');
      }

      // Handle stock entry splitting and label printing
      let stockEntries: { splitEntries: Array<{stockId: any, amount: number, type: string, unit: string}>, labelsPrinted: number } = { splitEntries: [], labelsPrinted: 0 };
      
      const recipe = await this.apiCall(`/objects/recipes/${actualRecipeId}`);
      
      if (recipe && recipe.product_id) {
        // Get product details and most recent stock entry
        const [product, entries] = await Promise.all([
          this.apiCall(`/objects/products/${recipe.product_id}`),
          this.apiCall(`/stock/products/${recipe.product_id}/entries`, 'GET', undefined, {
            queryParams: { order: 'row_created_timestamp:desc', limit: '1' }
          })
        ]);
        
        // Get quantity unit info
        let quantityUnit = null;
        if (product.qu_id_stock) {
          try {
            quantityUnit = await this.apiCall(`/objects/quantity_units/${product.qu_id_stock}`);
          } catch (error) {
            console.warn('Failed to fetch quantity unit:', error);
          }
        }
        
        // Helper function to get correct unit form
        const getUnitForm = (amount: number): string => {
          if (!quantityUnit || !quantityUnit.name) return '';
          if (amount === 1) return quantityUnit.name;
          return quantityUnit.name_plural || quantityUnit.name;
        };
        
        if (Array.isArray(entries) && entries.length > 0) {
          const originalEntry = entries[0]!;
          
          // Use the real stock splitting functionality
          stockEntries.splitEntries = await this.inventoryHandlers.splitStockEntry(
            originalEntry, 
            stockAmounts, 
            getUnitForm
          );
          
          // Print labels for all entries (if enabled)
          if (printLabels) {
            for (const entry of stockEntries.splitEntries) {
              try {
                await this.apiCall(`/stock/entry/${originalEntry.id}/printlabel`);
                stockEntries.labelsPrinted++;
              } catch (error) {
                console.error(`Failed to print label for stock entry ${entry.stockId}:`, error);
              }
            }
          }
        }
      }

      return this.createSuccess({
        message: `Recipe ${actualRecipeId} cooked (${totalServings} servings consumed, ${stockEntries.splitEntries.length} stock entries created, ${stockEntries.labelsPrinted} labels printed)`,
        stockEntries,
        completedSteps
      });
    });
  };
}

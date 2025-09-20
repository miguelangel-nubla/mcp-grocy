import { ToolDefinition } from '../types.js';
import { config } from '../../config/index.js';

export const recipeToolDefinitions: ToolDefinition[] = [
  // ==================== RECIPE MANAGEMENT ====================
  {
    name: 'recipes_management_get',
    description: '[RECIPES/MANAGEMENT] Get specific fields for all recipes from your Grocy instance. You must specify which fields to retrieve.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['id', 'name', 'description', 'base_servings', 'desired_servings', 'not_check_shoppinglist', 'type', 'picture_file_name', 'ingredients', 'instructions']
          },
          description: 'Array of field names to retrieve. For basic lookup use ["id", "name"]. For recipe planning use ["id", "name", "description", "base_servings"]. Available fields: id, name, description, base_servings, desired_servings, not_check_shoppinglist, type, picture_file_name, ingredients, instructions'
        }
      },
      required: ['fields']
    }
  },
  {
    name: 'recipes_management_get_by_id',
    description: '[RECIPES/MANAGEMENT] Get a specific recipe by its ID from your Grocy instance.',
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description: 'ID of the recipe to retrieve. Use recipes_management_get tool to find the correct recipe ID by name.'
        }
      },
      required: ['recipeId']
    }
  },
  {
    name: 'recipes_management_create',
    description: '[RECIPES/MANAGEMENT] Create a new recipe in your Grocy instance with the provided name, description, base servings, and instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the recipe'
        },
        description: {
          type: 'string',
          description: 'Description of the recipe (optional)'
        },
        baseServings: {
          type: 'number',
          description: 'Base servings for the recipe (e.g., 4 for a family recipe)',
          default: 1
        },
        instructions: {
          type: 'string',
          description: 'Recipe instructions (optional)'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'recipes_fulfillment_get',
    description: '[RECIPES/FULFILLMENT] Check fulfillment status for a specific recipe (what ingredients are available vs needed).',
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description: 'ID of the recipe to check fulfillment for. Use recipes_management_get tool to find the correct recipe ID by name.'
        },
        onlyMissing: {
          type: 'boolean',
          description: 'If true, only return missing/insufficient ingredients',
          default: false
        }
      },
      required: ['recipeId']
    }
  },
  {
    name: 'recipes_fulfillment_get_all',
    description: '[RECIPES/FULFILLMENT] Get fulfillment status for all recipes (overview of which recipes can be made with current stock).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  // ==================== MEAL PLANNING ====================
  {
    name: 'recipes_mealplan_get',
    description: '[RECIPES/MEALPLAN] Get your meal plan data from Grocy instance with corresponding recipe details. Returns planned meals for the requested date plus surrounding days for context. Use this to find out what recipes/meals are planned for a specific date (e.g., "what\'s for dinner tomorrow", "recipes for today", "meal plan for next week"). The returned data includes the id field (meal plan entry ID) which can be used with recipes_mealplan_delete_entry.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        date: {
          type: 'string',
          description: 'Date in YYYY-MM-DD format (e.g., "2024-12-25"). The tool will return meal plans for this date plus the previous and next day for better context.'
        },
        weekly: {
          type: 'boolean',
          description: 'If true, returns the entire calendar week containing the specified date.'
        }
      },
      required: ['date']
    }
  },
  {
    name: 'recipes_mealplan_get_sections',
    description: '[RECIPES/MEALPLAN] Get all available meal plan sections from your Grocy instance (e.g., Breakfast, Lunch, Dinner, Snacks). Use this to find valid section IDs for recipes_mealplan_add_recipe.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'recipes_mealplan_add_recipe',
    description: '[RECIPES/MEALPLAN] Add a recipe to the meal plan for a specific date and meal section. Use recipes_management_get to find recipe IDs and recipes_mealplan_get_sections to find valid section IDs and their names.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        recipeId: {
          type: 'number',
          description: 'ID of the recipe to add to the meal plan. Use recipes_management_get tool to find valid recipe IDs and their names.'
        },
        day: {
          type: 'string',
          description: 'Day to add the recipe to in YYYY-MM-DD format (e.g., "2024-12-25").'
        },
        servings: {
          type: 'number',
          description: 'Number of servings for this meal plan entry (e.g., 2 for a family of two, 4 for a family of four).'
        },
        sectionId: {
          type: 'number',
          description: 'ID of the meal plan section that defines when this meal will be consumed (e.g., breakfast, lunch, dinner, snacks). Use recipes_mealplan_get_sections tool to discover what sections are available in your Grocy instance and get their specific IDs and names.'
        }
      },
      required: ['recipeId', 'day', 'servings', 'sectionId']
    }
  },
  {
    name: 'recipes_mealplan_delete_entry',
    description: '[RECIPES/MEALPLAN] Delete a specific recipe entry from the meal plan. Use recipes_mealplan_get to find the mealPlanEntryId of the entry you want to remove.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mealPlanEntryId: {
          type: 'number',
          description: 'ID of the specific meal plan entry to delete. Use recipes_mealplan_get to find the correct entry ID.'
        }
      },
      required: ['mealPlanEntryId']
    }
  },

  // ==================== COOKING ====================
  {
    name: 'recipes_cooking_consume',
    description: '[RECIPES/COOKING] Consume/cook a recipe, which removes the required ingredients from stock.',
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description: 'ID of the recipe to consume. Use recipes_management_get tool to find the correct recipe ID by name.'
        },
        servings: {
          type: 'number',
          description: 'Number of servings to cook (scales ingredient consumption accordingly)',
          default: 1
        }
      },
      required: ['recipeId']
    }
  },

  // ==================== SHOPPING INTEGRATION ====================
  {
    name: 'recipes_shopping_add_all_products',
    description: '[RECIPES/SHOPPING] Add all products from a recipe to the shopping list.',
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description: 'ID of the recipe whose products should be added to shopping list. Use recipes_management_get tool to find the correct recipe ID by name.'
        }
      },
      required: ['recipeId']
    }
  },
  {
    name: 'recipes_shopping_add_missing_products',
    description: '[RECIPES/SHOPPING] Add only the missing/insufficient products from a recipe to the shopping list (based on current stock levels).',
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description: 'ID of the recipe to check for missing products. Use recipes_management_get tool to find the correct recipe ID by name.'
        }
      },
      required: ['recipeId']
    }
  },

  // ==================== ADVANCED COOKING ====================
  (() => {
    const { toolSubConfigs } = config.parseToolConfiguration();
    const subConfigs = toolSubConfigs?.get('cooked_something');
    const allowNoMealPlan = subConfigs?.get('allow_no_meal_plan') ?? false;
    const allowAlreadyDone = subConfigs?.get('allow_meal_plan_entry_already_done') ?? false;
    
    return {
      name: 'recipes_cooking_cooked_something',
      description: '[RECIPES/COOKING] When the user cooks something this records it as done, consumes recipe ingredients, and creates labeled stock entries with custom portion sizes.',
      inputSchema: {
        type: 'object',
        properties: {
          ...(allowNoMealPlan ? {
            recipeId: {
              type: 'number',
              description: 'ID of the recipe to cook directly.'
            }
          } : {
            mealPlanEntryId: {
              type: 'number', 
              description: `ID of the meal plan entry.${allowAlreadyDone ? '' : ' Note: This will fail if the meal plan entry is already marked as done (done=1).'}`
            }
          }),
          stockAmounts: {
            type: 'array',
            items: {
              type: 'number',
              minimum: 0.1
            },
            description: 'Array of serving amounts for each stock entry to create (e.g., [1, 2, 2] for 1 single serving + 2 double servings). Total will be used for ingredient consumption.'
          }
        },
        required: [
          ...(allowNoMealPlan ? ['recipeId'] : ['mealPlanEntryId']),
          'stockAmounts'
        ]
      }
    };
  })()
];
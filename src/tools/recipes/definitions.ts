import { ToolDefinition } from '../types.js';
import { config } from '../../config/index.js';

const RECIPES_COOKING_COMPLETE_TOOL = 'recipes_cooking_complete';

export const recipeToolDefinitions: ToolDefinition[] = [
  // ==================== RECIPE MANAGEMENT ====================
  {
    name: 'recipes_management_get',
    description:
      '[RECIPES/MANAGEMENT] **List/search many recipes**—you choose which fields (e.g. id+name). For one full recipe by ID use recipes_management_get_by_id.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'id',
              'name',
              'description',
              'base_servings',
              'desired_servings',
              'not_check_shoppinglist',
              'type',
              'picture_file_name',
              'ingredients',
              'instructions',
            ],
          },
          description:
            'Array of field names to retrieve. For basic lookup use ["id", "name"]. For recipe planning use ["id", "name", "description", "base_servings"]. Available fields: id, name, description, base_servings, desired_servings, not_check_shoppinglist, type, picture_file_name, ingredients, instructions',
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'recipes_management_get_by_id',
    description:
      '[RECIPES/MANAGEMENT] **Single recipe** by recipeId (full record). To scan or filter many recipes use recipes_management_get with a fields list.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description:
            'ID of the recipe to retrieve. Use recipes_management_get tool to find the correct recipe ID by name.',
        },
      },
      required: ['recipeId'],
    },
  },
  {
    name: 'recipes_management_create',
    description:
      '[RECIPES/MANAGEMENT] Create a new recipe in your Grocy instance with the provided name, description, base servings, and instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the recipe',
        },
        description: {
          type: 'string',
          description: 'Description of the recipe (optional)',
        },
        baseServings: {
          type: 'number',
          description: 'Base servings for the recipe (e.g., 4 for a family recipe)',
          default: 1,
        },
        instructions: {
          type: 'string',
          description: 'Recipe instructions (optional)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'recipes_management_print_label',
    description:
      '[RECIPES/MANAGEMENT] Print a Grocycode label for a recipe. Use recipes_management_get to find valid recipeId values.',
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description:
            'ID of the recipe to print label for. Use recipes_management_get tool to find the correct recipe ID.',
        },
      },
      required: ['recipeId'],
    },
  },
  {
    name: 'recipes_fulfillment_get',
    description:
      '[RECIPES/FULFILLMENT] **Single recipe**—can I make this dish? Ingredient coverage vs stock for one recipeId. For an overview of many recipes at once use recipes_fulfillment_get_all.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description:
            'ID of the recipe to check fulfillment for. Use recipes_management_get tool to find the correct recipe ID by name.',
        },
        onlyMissing: {
          type: 'boolean',
          description: 'If true, only return missing/insufficient ingredients',
          default: false,
        },
      },
      required: ['recipeId'],
    },
  },
  {
    name: 'recipes_fulfillment_get_all',
    description:
      '[RECIPES/FULFILLMENT] **All recipes**—batch view of which recipes are makeable with current stock (no recipeId). For one named recipe use recipes_fulfillment_get.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ==================== MEAL PLANNING ====================
  {
    name: 'recipes_mealplan_get',
    description:
      '[RECIPES/MEALPLAN] Get your meal plan data from Grocy instance with corresponding recipe details. Returns planned meals for the requested date plus surrounding days for context. Use this to find out what recipes/meals are planned for a specific date (e.g., "what\'s for dinner tomorrow", "recipes for today", "meal plan for next week"). The returned data includes the id field (meal plan entry ID) which can be used with recipes_mealplan_delete_entry.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        date: {
          type: 'string',
          description:
            'Date in YYYY-MM-DD format (e.g., "2024-12-25"). The tool will return meal plans for this date plus the previous and next day for better context.',
        },
        weekly: {
          type: 'boolean',
          description: 'If true, returns the entire calendar week containing the specified date.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'recipes_mealplan_get_sections',
    description:
      '[RECIPES/MEALPLAN] **Read-only:** list meal plan section names/IDs (Breakfast, Dinner, …). Does not return planned meals or dates—use recipes_mealplan_get for the calendar. Needed before recipes_mealplan_add_recipe to pick sectionId; the row with id -1 and name null is Grocy\'s built-in "no section".',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'recipes_mealplan_add_recipe',
    description:
      '[RECIPES/MEALPLAN] **Write:** put a recipe on the calendar (date + section + servings). Not for listing sections (recipes_mealplan_get_sections) or viewing the plan (recipes_mealplan_get).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        recipeId: {
          type: 'number',
          description:
            'ID of the recipe to add to the meal plan. Use recipes_management_get tool to find valid recipe IDs and their names.',
        },
        day: {
          type: 'string',
          description: 'Day to add the recipe to in YYYY-MM-DD format (e.g., "2024-12-25").',
        },
        servings: {
          type: 'number',
          description:
            'Number of servings for this meal plan entry (e.g., 2 for a family of two, 4 for a family of four).',
        },
        sectionId: {
          type: 'number',
          description:
            'ID of the meal plan section that defines when this meal will be consumed (e.g., breakfast, lunch, dinner, snacks). Use recipes_mealplan_get_sections tool to discover what sections are available in your Grocy instance and get their specific IDs and names. Use -1 for Grocy\'s built-in "no section"; if the user names no meal or section, use -1 rather than guessing.',
        },
      },
      required: ['recipeId', 'day', 'servings', 'sectionId'],
    },
  },
  {
    name: 'recipes_mealplan_delete_entry',
    description:
      '[RECIPES/MEALPLAN] Delete a specific recipe entry from the meal plan. Use recipes_mealplan_get to find the mealPlanEntryId of the entry you want to remove.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mealPlanEntryId: {
          type: 'number',
          description:
            'ID of the specific meal plan entry to delete. Use recipes_mealplan_get to find the correct entry ID.',
        },
      },
      required: ['mealPlanEntryId'],
    },
  },

  // ==================== COOKING ====================
  {
    name: 'recipes_cooking_consume',
    description:
      '[RECIPES/COOKING] Consume/cook a recipe, which removes the required ingredients from stock.',
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description:
            'ID of the recipe to consume. Use recipes_management_get tool to find the correct recipe ID by name.',
        },
        servings: {
          type: 'number',
          description: 'Number of servings to cook (scales ingredient consumption accordingly)',
          default: 1,
        },
      },
      required: ['recipeId'],
    },
  },

  // ==================== SHOPPING INTEGRATION ====================
  {
    name: 'recipes_shopping_add_all_products',
    description:
      '[RECIPES/SHOPPING] Add **every** recipe ingredient to the shopping list (ignores what you already have). For only what you are short on use recipes_shopping_add_missing_products.',
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description:
            'ID of the recipe whose products should be added to shopping list. Use recipes_management_get tool to find the correct recipe ID by name.',
        },
      },
      required: ['recipeId'],
    },
  },
  {
    name: 'recipes_shopping_add_missing_products',
    description:
      '[RECIPES/SHOPPING] Add **only missing or insufficient** ingredients (compares to stock). To add the full ingredient set regardless of stock use recipes_shopping_add_all_products.',
    inputSchema: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'number',
          description:
            'ID of the recipe to check for missing products. Use recipes_management_get tool to find the correct recipe ID by name.',
        },
      },
      required: ['recipeId'],
    },
  },

  // ==================== ADVANCED COOKING ====================
  (() => {
    const { toolSubConfigs } = config.parseToolConfiguration();
    const subConfigs = toolSubConfigs?.get(RECIPES_COOKING_COMPLETE_TOOL);
    const allowNoMealPlan = subConfigs?.get('allow_no_meal_plan') ?? false;
    const allowAlreadyDone = subConfigs?.get('allow_meal_plan_entry_already_done') ?? false;

    return {
      name: 'recipes_cooking_complete',
      description:
        '[RECIPES/COOKING] When the user cooks something this records it as done, consumes recipe ingredients, and creates labeled stock entries with custom portion sizes.',
      inputSchema: {
        type: 'object',
        properties: {
          ...(allowNoMealPlan
            ? {
                recipeId: {
                  type: 'number',
                  description: 'ID of the recipe to cook directly.',
                },
              }
            : {
                mealPlanEntryId: {
                  type: 'number',
                  description: `ID of the meal plan entry.${allowAlreadyDone ? '' : ' Note: This will fail if the meal plan entry is already marked as done (done=1).'}`,
                },
              }),
          stockAmounts: {
            type: 'array',
            items: {
              type: 'number',
              minimum: 0.1,
            },
            description:
              'Array of serving amounts for each stock entry to create (e.g., [1, 2, 2] for 1 single serving + 2 double servings). Total will be used for ingredient consumption.',
          },
        },
        required: [...(allowNoMealPlan ? ['recipeId'] : ['mealPlanEntryId']), 'stockAmounts'],
      },
    };
  })(),
];

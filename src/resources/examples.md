# Grocy MCP usage examples

> **MCP server name:** Your client names this server in its config (`mcp-grocy`, `grocy`, etc.). The first argument to helpers like `use_mcp_tool` must match **your** setup. Examples below use `mcp-grocy`.

## Setting up a private Grocy demo

1. Visit [https://demo.grocy.info](https://demo.grocy.info).
2. Use **Create a private demo instance**.
3. Put URL and API key in `.env`:

   ```
   GROCY_BASE_URL=https://your-name-xxxxx.demo.grocy.info
   GROCY_API_KEY=your-private-api-key
   ```

For **`system_dev_call_api`** / **`system_dev_test_request`**, pass endpoint **paths** only (no full URL), e.g. `objects/products` or `/api/stock`—the client resolves them against `GROCY_BASE_URL`.

## Inventory and shopping

### All stock entries

```typescript
use_mcp_tool('mcp-grocy', 'inventory_stock_get_all', {});
```

### Volatile stock (due / overdue / missing)

```typescript
use_mcp_tool('mcp-grocy', 'inventory_stock_get_volatile', {
  includeDetails: true,
});
```

### Products (pick fields)

```typescript
use_mcp_tool('mcp-grocy', 'inventory_products_get', {
  fields: ['id', 'name', 'description'],
});
```

### Shopping list

```typescript
use_mcp_tool('mcp-grocy', 'shopping_list_get', {});

use_mcp_tool('mcp-grocy', 'shopping_list_add_item', {
  productId: 1,
  amount: 2,
  shoppingListId: 1,
  note: 'Get the organic variety',
});
```

### Purchase (product-level)

```typescript
use_mcp_tool('mcp-grocy', 'inventory_transactions_purchase', {
  productId: 1,
  amount: 2,
  bestBeforeDate: '2024-12-31',
  price: 3.99,
  locationId: 1,
});
```

### Consume one stock row (`stockId` from `inventory_stock_get_by_product`)

```typescript
use_mcp_tool('mcp-grocy', 'inventory_stock_entry_consume', {
  stockId: 10,
  productId: 1,
  amount: 1,
  spoiled: false,
});
```

## Recipes and meal plan

### List recipes (selected fields)

```typescript
use_mcp_tool('mcp-grocy', 'recipes_management_get', {
  fields: ['id', 'name', 'description', 'base_servings'],
});
```

### Fulfillment for one recipe

```typescript
use_mcp_tool('mcp-grocy', 'recipes_fulfillment_get', {
  recipeId: 1,
  onlyMissing: false,
});
```

### Meal plan for a date

```typescript
use_mcp_tool('mcp-grocy', 'recipes_mealplan_get', {
  date: '2024-07-01',
  weekly: false,
});
```

### Meal plan sections (Breakfast / Dinner / …)

```typescript
use_mcp_tool('mcp-grocy', 'recipes_mealplan_get_sections', {});
```

### Add recipe to meal plan

```typescript
use_mcp_tool('mcp-grocy', 'recipes_mealplan_add_recipe', {
  recipeId: 1,
  day: '2024-07-01',
  servings: 2,
  sectionId: 3,
});
```

Use **`recipes_mealplan_get_sections`** for valid `sectionId` values.

### Add a note to the meal plan (no recipe)

```typescript
use_mcp_tool('mcp-grocy', 'recipes_mealplan_add_note', {
  day: '2024-07-01',
  note: 'Leftovers from Sunday',
  sectionId: 3,
});
```

Same `sectionId` values as above (`-1` = Grocy's built-in "no section").

### Remove a meal plan entry

```typescript
use_mcp_tool('mcp-grocy', 'recipes_mealplan_delete_entry', {
  mealPlanEntryId: 123,
});
```

Use **`recipes_mealplan_get`** to find `mealPlanEntryId`. Works for recipe and note entries.

### Cook / consume recipe ingredients

```typescript
use_mcp_tool('mcp-grocy', 'recipes_cooking_consume', {
  recipeId: 1,
  servings: 2,
});
```

## Chores, tasks, locations

### Chores (recurring) vs tasks (to-dos)

```typescript
use_mcp_tool('mcp-grocy', 'household_chores_get', {});
use_mcp_tool('mcp-grocy', 'household_tasks_get', {});
```

### Track chore execution

```typescript
use_mcp_tool('mcp-grocy', 'household_chores_execute', {
  choreId: 1,
  executedBy: 1,
  trackedTime: '2024-06-30 15:30:00',
});
```

### Complete a task

```typescript
use_mcp_tool('mcp-grocy', 'household_tasks_complete', {
  taskId: 1,
  note: 'Task completed successfully',
});
```

### Storage locations vs shopping (store) locations

```typescript
use_mcp_tool('mcp-grocy', 'system_locations_get', {});
use_mcp_tool('mcp-grocy', 'shopping_locations_get', {});
```

### Transfer one stock row to another location

```typescript
use_mcp_tool('mcp-grocy', 'inventory_stock_entry_transfer', {
  stockId: 10,
  productId: 1,
  amount: 1,
  locationIdTo: 2,
  note: 'Moving to kitchen',
});
```

For moving by product without a `stockId`, use **`inventory_transactions_transfer`**.

## Advanced / escape hatches

### Arbitrary Grocy API object path

```typescript
use_mcp_tool('mcp-grocy', 'system_dev_call_api', {
  endpoint: 'objects/product_barcodes',
  method: 'GET',
});
```

### Raw request with full diagnostics

```typescript
use_mcp_tool('mcp-grocy', 'system_dev_test_request', {
  method: 'GET',
  endpoint: '/api/stock/products/by-barcode/1234567890',
  headers: {
    'Accept-Language': 'en-US',
  },
});
```

## Tool reference

Authoritative names and parameters live in **`src/tools/*/definitions.ts`** in this repository. Grocy’s own HTTP API is documented at [Grocy API](https://github.com/grocy/grocy#api).

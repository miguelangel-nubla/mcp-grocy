/**
 * Writes the raw passthrough tools (system_dev_*) refuse.
 *
 * Grocy stores recipe ingredient, shopping list, meal plan and chore amounts in the product's
 * stock quantity unit; `qu_id` is only the unit shown. The Grocy UI converts what is typed,
 * a raw write does not, so `{amount: 500, qu_id: <Gramo>}` on a kilo product becomes 500 kg.
 * Changing a product's stock unit rescales every stored amount and needs an old => new
 * conversion first. Those writes go through the dedicated tools instead.
 */

const AMOUNT_ENTITIES: Record<string, string> = {
  recipes_pos: 'recipes_ingredients_add / recipes_ingredients_update',
  shopping_list: 'shopping_list_add_item / shopping_list_update_item',
  meal_plan: 'recipes_mealplan_add_recipe / recipes_mealplan_add_note',
  chores: 'the Grocy UI',
};

const AMOUNT_ENDPOINTS: Record<string, string> = {
  'stock/shoppinglist/add-product': 'shopping_list_add_item',
  'stock/shoppinglist/remove-product': 'shopping_list_remove_item',
};

/** Returns why this request is refused, or null when it may go through. */
export function refuseRawWrite(method: string, endpoint: string, body: unknown): string | null {
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'GET') return null;
  const path = String(endpoint || '')
    .replace(/^\/?(?:api\/)?/, '')
    .split('?')[0]!
    .replace(/\/+$/, '');

  const entity = path.match(/^objects\/([^/]+)(?:\/|$)/)?.[1];
  if (entity && entity in AMOUNT_ENTITIES && verb !== 'DELETE') {
    return (
      `Refused ${verb} ${path}: Grocy stores ${entity} amounts in the product's stock unit and a raw write ` +
      `skips the unit conversion (500 g on a kilo product would be 500 kg). Use ${AMOUNT_ENTITIES[entity]}.`
    );
  }
  if (path in AMOUNT_ENDPOINTS) {
    return `Refused ${verb} ${path}: amounts must be in the product's stock unit; use ${AMOUNT_ENDPOINTS[path]}.`;
  }
  if (
    entity === 'products' &&
    verb === 'PUT' &&
    body !== null &&
    typeof body === 'object' &&
    'qu_id_stock' in (body as Record<string, unknown>)
  ) {
    return (
      `Refused ${verb} ${path}: changing a product's stock unit rescales every stored amount of it and needs an ` +
      `old => new quantity unit conversion first. Do it in the Grocy UI.`
    );
  }
  return null;
}

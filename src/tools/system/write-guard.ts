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

/**
 * The path (without the leading `/api/`) Grocy routes the endpoint to, or null when that is ambiguous.
 *
 * Slim rawurldecodes the path once before FastRoute matches it, so `recipes%5Fpos` routes to
 * `recipes_pos` and `products%2F8` to `products/8`: decode once the same way. axios builds the
 * request path with WHATWG URL, which resolves `.`, `..` and `%2e` segments, turns `\\` into `/`
 * and drops tabs, newlines and trailing spaces; refuse any path that resolution would change, and
 * anything a second decode or a proxy could still route elsewhere (`%`, `//`, a nested `api/`).
 */
function routedPath(endpoint: string): string | null {
  const raw = String(endpoint || '')
    .split(/[?#]/)[0]!
    .replace(/^\/?(?:api\/)?/, '');
  // eslint-disable-next-line no-control-regex
  if (/[\s\x00-\x1f\x7f\\]/.test(raw)) return null;
  let decoded: string;
  let resolved: string;
  try {
    decoded = decodeURIComponent(raw);
    resolved = decodeURIComponent(new URL(`http://grocy/api/${raw}`).pathname);
  } catch {
    return null;
  }
  if (resolved !== `/api/${decoded}`) return null;
  const path = decoded.replace(/\/+$/, '');
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f\\%]|(?:^|\/)\.{1,2}(?:\/|$)|\/\/|^\/|^api(?:\/|$)/.test(path)) return null;
  return path;
}

/** Returns why this request is refused, or null when it may go through. */
export function refuseRawWrite(method: string, endpoint: string, body: unknown): string | null {
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'GET') return null;
  const path = routedPath(endpoint);
  if (path === null) {
    return (
      `Refused ${verb} ${endpoint}: write endpoints must be plain paths under /api/ without dot segments, ` +
      `empty segments, backslashes or invalid/double percent-escapes.`
    );
  }

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

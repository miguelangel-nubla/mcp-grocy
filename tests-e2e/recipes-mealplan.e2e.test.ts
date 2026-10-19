import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { GrocyApi } from './harness/grocy-api.js';
import { McpSession } from './harness/mcp.js';
import { RecipesSeed } from './recipes-seed.js';

// Far-future days only this file plans on. 2037-03-02 is a Monday, 2037-03-08 its Sunday.
const MON = '2037-03-02';
const THU = '2037-03-05';
const SUN = '2037-03-08';

describe('recipes: meal plan', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  const seed = new RecipesSeed(grocy, 'mealplan');
  let mcp: McpSession;
  let recipe: number;
  let section: number;

  beforeAll(async () => {
    mcp = await McpSession.start(inject('grocyUrl'));
    recipe = await seed.recipe('stew', 2);
    section = await grocy.create('meal_plan_sections', { name: seed.name('dinner') });
  });
  afterAll(() => mcp?.close());

  const entriesOn = (day: string) => grocy.objects('meal_plan', `day=${day}`);

  it('lists sections, including the built-in "no section"', async () => {
    const res = await mcp.ok('recipes_mealplan_get_sections');
    const ids = res.data.map((s: any) => Number(s.id));
    expect(ids).toContain(-1);
    expect(ids).toContain(section);
  });

  it('add_recipe: stores a recipe entry and Grocy builds its shadow recipe', async () => {
    const res = await mcp.ok('recipes_mealplan_add_recipe', {
      recipeId: recipe,
      day: MON,
      servings: 3,
      sectionId: section,
    });
    const id = Number(res.data.created_object_id);
    const row = await grocy.get('meal_plan', id);
    expect(row).toMatchObject({ day: MON, type: 'recipe' });
    expect(Number(row.recipe_id)).toBe(recipe);
    expect(Number(row.recipe_servings)).toBe(3);
    expect(Number(row.section_id)).toBe(section);
    expect(Number(row.done)).toBe(0);

    const [shadow] = await grocy.objects('recipes', `name=${MON}#${id}`);
    expect(shadow?.type).toBe('mealplan-shadow');
  });

  it('add_recipe: -1 is "no section"; invalid days and sections write nothing', async () => {
    const res = await mcp.ok('recipes_mealplan_add_recipe', {
      recipeId: recipe,
      day: SUN,
      servings: 1,
      sectionId: -1,
    });
    expect(
      Number((await grocy.get('meal_plan', Number(res.data.created_object_id))).section_id),
    ).toBe(-1);

    const before = (await grocy.objects('meal_plan')).length;
    for (const args of [
      { day: '2037-02-30', sectionId: -1, servings: 1 },
      { day: '05/03/2037', sectionId: -1, servings: 1 },
      { day: THU, sectionId: 0, servings: 1 },
      { day: THU, sectionId: -1, servings: 0 },
    ]) {
      const bad = await mcp.call('recipes_mealplan_add_recipe', { recipeId: recipe, ...args });
      expect(bad.isError, JSON.stringify(args)).toBe(true);
    }
    expect(await grocy.objects('meal_plan')).toHaveLength(before);
  });

  it('add_note: stores a note entry without a recipe', async () => {
    const res = await mcp.ok('recipes_mealplan_add_note', {
      day: THU,
      note: 'Eating out',
      sectionId: section,
    });
    const row = await grocy.get('meal_plan', Number(res.data.created_object_id));
    expect(row).toMatchObject({ day: THU, type: 'note', note: 'Eating out' });
    expect(row.recipe_id ?? null).toBeNull();
    expect(Number(row.section_id)).toBe(section);

    const empty = await mcp.call('recipes_mealplan_add_note', {
      day: THU,
      note: '   ',
      sectionId: -1,
    });
    expect(empty.isError).toBe(true);
    expect(await entriesOn(THU)).toHaveLength(1);
  });

  // The get tests read a week of their own, seeded straight through the API, so they do not
  // depend on what the add_* tests above left behind (or on running after them).
  describe('get', () => {
    const W = {
      prevSat: '2037-04-04',
      mon: '2037-04-06',
      tue: '2037-04-07',
      thu: '2037-04-09',
      sat: '2037-04-11',
      sun: '2037-04-12',
      nextTue: '2037-04-14',
    };
    let monEntry: number;
    let outBefore: number;
    let outAfter: number;

    const note = (day: string, text: string) =>
      grocy.create('meal_plan', { day, type: 'note', note: text, section_id: -1 });

    beforeAll(async () => {
      monEntry = await grocy.create('meal_plan', {
        day: W.mon,
        type: 'recipe',
        recipe_id: recipe,
        recipe_servings: 2,
        section_id: section,
      });
      await note(W.thu, 'thursday');
      await note(W.sat, 'saturday');
      await note(W.sun, 'sunday');
      outBefore = await note(W.prevSat, 'previous saturday');
      outAfter = await note(W.nextTue, 'next tuesday');
    });

    it('one day returns that day with the days around it', async () => {
      const res = await mcp.ok('recipes_mealplan_get', { date: W.tue });
      expect(Object.keys(res.data.meal_plan_by_date).sort()).toEqual([W.mon]);
      const [entry] = res.data.meal_plan_by_date[W.mon];
      expect(entry).toMatchObject({ type: 'recipe', day: W.mon, done: 0 });
      expect(Number(entry.id)).toBe(monEntry);
      expect(Number(entry.recipe_id)).toBe(recipe);
      expect(res.data.recipes.map((r: any) => Number(r.id))).toContain(recipe);
      expect(res.data.sections.map((s: any) => Number(s.id))).toContain(section);

      const nothing = await mcp.ok('recipes_mealplan_get', { date: '2037-06-15' });
      expect(nothing.data.meal_plan_by_date).toEqual({});
    });

    it('weekly: Monday-to-Sunday week, also when the date is a Sunday', async () => {
      const week = (
        await Promise.all(
          ['06', '07', '08', '09', '10', '11', '12'].map((d) => entriesOn(`2037-04-${d}`)),
        )
      ).flat();
      expect(week).toHaveLength(4);

      for (const date of [W.thu, W.sun, W.mon]) {
        const res = await mcp.ok('recipes_mealplan_get', { date, weekly: true });
        const byDate = res.data.meal_plan_by_date;
        expect(Object.keys(byDate), date).toEqual(
          expect.arrayContaining([W.mon, W.thu, W.sat, W.sun]),
        );
        const ids = Object.values(byDate)
          .flat()
          .map((e: any) => Number(e.id));
        expect(ids, date).not.toContain(outBefore);
        expect(ids, date).not.toContain(outAfter);
        // every planned entry of the week is there, with nothing duplicated
        expect(ids.filter((id) => week.some((w) => Number(w.id) === id)).sort()).toEqual(
          week.map((w) => Number(w.id)).sort(),
        );
        expect(new Set(ids).size).toBe(ids.length);
      }
    });
  });

  it('get weekly: returns no days outside Monday-to-Sunday', async () => {
    await grocy.create('meal_plan', {
      day: '2037-03-01',
      type: 'note',
      note: 'sun',
      section_id: -1,
    });
    await grocy.create('meal_plan', {
      day: '2037-03-09',
      type: 'note',
      note: 'mon',
      section_id: -1,
    });
    const res = await mcp.ok('recipes_mealplan_get', { date: THU, weekly: true });
    for (const day of Object.keys(res.data.meal_plan_by_date)) {
      expect(day >= MON && day <= SUN, day).toBe(true);
    }
  });

  it('delete_entry: removes the entry and its shadow recipe', async () => {
    const add = await mcp.ok('recipes_mealplan_add_recipe', {
      recipeId: recipe,
      day: '2037-03-04',
      servings: 2,
      sectionId: -1,
    });
    const id = Number(add.data.created_object_id);
    expect(await grocy.objects('recipes', `name=2037-03-04#${id}`)).toHaveLength(1);

    await mcp.ok('recipes_mealplan_delete_entry', { mealPlanEntryId: id });
    expect((await grocy.objects('meal_plan')).map((r) => Number(r.id))).not.toContain(id);
    expect(await grocy.objects('recipes', `name=2037-03-04#${id}`)).toHaveLength(0);

    const note = await mcp.ok('recipes_mealplan_add_note', {
      day: '2037-03-04',
      note: 'temp',
      sectionId: -1,
    });
    await mcp.ok('recipes_mealplan_delete_entry', {
      mealPlanEntryId: Number(note.data.created_object_id),
    });
    expect(await entriesOn('2037-03-04')).toHaveLength(0);

    const missing = await mcp.call('recipes_mealplan_delete_entry', { mealPlanEntryId: id });
    expect(missing.isError).toBe(true);
  });
});

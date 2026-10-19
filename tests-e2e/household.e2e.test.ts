/**
 * Household tools (chores, tasks, batteries, equipment, undo, label printing) against a real
 * Grocy. Every test checks Grocy's own rows (chores_log, tasks, battery_charge_cycles) after
 * the tool call, not just the tool's text.
 */
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { GrocyApi } from './harness/grocy-api.js';
import { McpSession } from './harness/mcp.js';

const PREFIX = `e2e-household-${Date.now().toString(36)}-`;
// the e2e container runs with TZ=Europe/Madrid (harness/grocy-container.ts), like prod
const GROCY_TZ = 'Europe/Madrid';

/** Current wall-clock time in `tz` as Grocy writes it: YYYY-MM-DD HH:mm:ss. */
function wallClock(tz: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

/** Distance in seconds between two naive YYYY-MM-DD HH:mm:ss timestamps. */
function secondsApart(a: string, b: string): number {
  const parse = (s: string) => Date.parse(`${s.replace(' ', 'T')}Z`);
  return Math.abs(parse(a) - parse(b)) / 1000;
}

/** A Grocy-generated timestamp is "now" in Grocy's local time, and not UTC. */
function expectServerLocalNow(timestamp: string): void {
  expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  expect(secondsApart(timestamp, wallClock(GROCY_TZ))).toBeLessThan(120);
  // Europe/Madrid is UTC+1 or UTC+2, so a UTC timestamp would be an hour or more off
  expect(secondsApart(timestamp, wallClock('UTC'))).toBeGreaterThan(1800);
}

describe('household tools', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  let mcp: McpSession;

  const choreLog = (choreId: number) => grocy.objects('chores_log', `chore_id=${choreId}`);
  const chargeCycles = (batteryId: number) =>
    grocy.objects('battery_charge_cycles', `battery_id=${batteryId}`);

  async function seedChore(name: string, fields: Record<string, unknown> = {}): Promise<number> {
    return grocy.create('chores', {
      name: PREFIX + name,
      period_type: 'daily',
      period_days: 1,
      ...fields,
    });
  }

  async function seedUser(name: string): Promise<number> {
    const username = PREFIX + name;
    await grocy.request('POST', 'users', { username, password: 'e2e-household-pw' });
    const users: any[] = await grocy.request('GET', 'users');
    const user = users.find((u) => u.username === username);
    if (!user) throw new Error(`user ${username} was not created`);
    return Number(user.id);
  }

  beforeAll(async () => {
    mcp = await McpSession.start(inject('grocyUrl'));
  });
  afterAll(() => mcp?.close());

  it('exposes all ten household tools', () => {
    const household = mcp.toolNames.filter((n) => n.startsWith('household_')).sort();
    expect(household).toEqual(
      [
        'household_actions_undo',
        'household_batteries_charge',
        'household_batteries_get',
        'household_batteries_print_label',
        'household_chores_execute',
        'household_chores_get',
        'household_chores_print_label',
        'household_equipment_get',
        'household_tasks_complete',
        'household_tasks_get',
      ].sort(),
    );
  });

  describe('list tools', () => {
    it('household_chores_get returns the seeded chore rows', async () => {
      const id = await seedChore('list-chore');
      const result = await mcp.ok('household_chores_get');
      const row = (result.data as any[]).find((c) => c.id === id);
      expect(row).toMatchObject({ id, name: PREFIX + 'list-chore', period_type: 'daily' });
    });

    it('household_tasks_get returns the seeded task rows', async () => {
      const id = await grocy.create('tasks', {
        name: PREFIX + 'list-task',
        due_date: '2026-12-01',
      });
      const result = await mcp.ok('household_tasks_get');
      const row = (result.data as any[]).find((t) => t.id === id);
      expect(row).toMatchObject({ id, name: PREFIX + 'list-task', due_date: '2026-12-01' });
      expect(Number(row.done)).toBe(0);
    });

    it('household_batteries_get returns the seeded battery rows', async () => {
      const id = await grocy.create('batteries', {
        name: PREFIX + 'list-battery',
        charge_interval_days: 30,
      });
      const result = await mcp.ok('household_batteries_get');
      const row = (result.data as any[]).find((b) => b.id === id);
      expect(row).toMatchObject({ id, name: PREFIX + 'list-battery' });
      expect(Number(row.charge_interval_days)).toBe(30);
    });

    it('household_equipment_get returns the seeded equipment rows', async () => {
      const id = await grocy.create('equipment', {
        name: PREFIX + 'list-equipment',
        description: 'drill',
      });
      const result = await mcp.ok('household_equipment_get');
      const row = (result.data as any[]).find((e) => e.id === id);
      expect(row).toMatchObject({ id, name: PREFIX + 'list-equipment', description: 'drill' });
    });
  });

  describe('household_chores_execute', () => {
    it('defaults the tracked time to Grocy server-local now (not UTC), done by the API user', async () => {
      const choreId = await seedChore('exec-default');
      const result = await mcp.ok('household_chores_execute', { choreId });

      const log = await choreLog(choreId);
      expect(log).toHaveLength(1);
      expect(Number(log[0].skipped)).toBe(0);
      expect(Number(log[0].undone)).toBe(0);
      expect(Number(log[0].done_by_user_id)).toBe(1);
      expectServerLocalNow(log[0].tracked_time);

      // the tool returns the chores_log row Grocy created
      expect(result.data).toMatchObject({
        id: Number(log[0].id),
        tracked_time: log[0].tracked_time,
      });

      const current = await grocy.request('GET', `chores/${choreId}`);
      expect(current.last_tracked).toBe(log[0].tracked_time);
      expect(Number(current.tracked_count)).toBe(1);
    });

    it('records the given trackedTime verbatim', async () => {
      const choreId = await seedChore('exec-time');
      const result = await mcp.ok('household_chores_execute', {
        choreId,
        trackedTime: '2026-03-28 02:30:00',
      });

      const log = await choreLog(choreId);
      expect(log).toHaveLength(1);
      expect(log[0].tracked_time).toBe('2026-03-28 02:30:00');
      expect(result.data.tracked_time).toBe('2026-03-28 02:30:00');
    });

    it('rejects or honours an ISO-8601 trackedTime instead of silently recording now', async () => {
      const choreId = await seedChore('exec-iso');
      const result = await mcp.call('household_chores_execute', {
        choreId,
        trackedTime: '2026-01-15T08:00:00',
      });
      const log = await choreLog(choreId);
      if (result.isError) {
        expect(log).toHaveLength(0);
      } else {
        expect(log).toHaveLength(1);
        expect(log[0].tracked_time).toBe('2026-01-15 08:00:00');
      }
    });

    it('truncates to the date for track_date_only chores', async () => {
      const choreId = await seedChore('exec-date-only', { track_date_only: 1 });
      await mcp.ok('household_chores_execute', { choreId, trackedTime: '2026-02-10 17:45:12' });
      const log = await choreLog(choreId);
      expect(log[0].tracked_time).toBe('2026-02-10 00:00:00');
    });

    it('skipped: true logs a skipped execution', async () => {
      const choreId = await seedChore('exec-skip');
      await mcp.ok('household_chores_execute', { choreId, skipped: true });

      const log = await choreLog(choreId);
      expect(log).toHaveLength(1);
      expect(Number(log[0].skipped)).toBe(1);
      expectServerLocalNow(log[0].tracked_time);
    });

    it('skipped: false logs a normal execution', async () => {
      const choreId = await seedChore('exec-noskip');
      await mcp.ok('household_chores_execute', { choreId, skipped: false });
      const log = await choreLog(choreId);
      expect(log).toHaveLength(1);
      expect(Number(log[0].skipped)).toBe(0);
    });

    it('fails without logging when skipping an unscheduled (manual) chore', async () => {
      const choreId = await seedChore('exec-skip-manual', { period_type: 'manually' });
      const result = await mcp.call('household_chores_execute', { choreId, skipped: true });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/can't be skipped/i);
      expect(await choreLog(choreId)).toHaveLength(0);
    });

    it('executedBy sets done_by_user_id', async () => {
      const userId = await seedUser('doer');
      const choreId = await seedChore('exec-by');
      await mcp.ok('household_chores_execute', { choreId, executedBy: userId });

      const log = await choreLog(choreId);
      expect(log).toHaveLength(1);
      expect(Number(log[0].done_by_user_id)).toBe(userId);
    });

    it('fails without logging for an unknown executedBy user', async () => {
      const choreId = await seedChore('exec-bad-user');
      const result = await mcp.call('household_chores_execute', { choreId, executedBy: 999999 });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/user does not exist/i);
      expect(await choreLog(choreId)).toHaveLength(0);
    });

    it('fails for a chore that does not exist', async () => {
      const result = await mcp.call('household_chores_execute', { choreId: 999999 });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/chore does not exist/i);
      expect(await choreLog(999999)).toHaveLength(0);
    });

    it('consumes the linked product when the chore is set to', async () => {
      const locationId = await grocy.firstId('locations');
      const quId = await grocy.firstId('quantity_units');
      const productId = await grocy.create('products', {
        name: PREFIX + 'chore-product',
        location_id: locationId,
        qu_id_purchase: quId,
        qu_id_stock: quId,
      });
      await grocy.request('POST', `stock/products/${productId}/add`, { amount: 5 });
      const choreId = await seedChore('exec-consume', {
        period_type: 'manually',
        consume_product_on_execution: 1,
        product_id: productId,
        product_amount: 2,
      });

      await mcp.ok('household_chores_execute', { choreId });

      expect(await choreLog(choreId)).toHaveLength(1);
      expect(await grocy.stockAmount(productId)).toBe(3);
      const consumed = await grocy.objects(
        'stock_log',
        `product_id=${productId}`,
        'transaction_type=consume',
      );
      expect(consumed).toHaveLength(1);
      expect(Number(consumed[0].amount)).toBe(-2);
    });
  });

  describe('household_tasks_complete', () => {
    it('marks the task done at Grocy server-local now by default', async () => {
      const taskId = await grocy.create('tasks', { name: PREFIX + 'complete-default' });
      await mcp.ok('household_tasks_complete', { taskId });

      const task = await grocy.get('tasks', taskId);
      expect(Number(task.done)).toBe(1);
      expectServerLocalNow(task.done_timestamp);
    });

    it('records the given doneTime', async () => {
      const taskId = await grocy.create('tasks', { name: PREFIX + 'complete-time' });
      await mcp.ok('household_tasks_complete', { taskId, doneTime: '2026-05-04 09:10:11' });

      const task = await grocy.get('tasks', taskId);
      expect(Number(task.done)).toBe(1);
      expect(task.done_timestamp).toBe('2026-05-04 09:10:11');
    });

    it('rejects or honours a date-only doneTime instead of silently recording now', async () => {
      const taskId = await grocy.create('tasks', { name: PREFIX + 'complete-date-only' });
      const result = await mcp.call('household_tasks_complete', {
        taskId,
        doneTime: '2026-05-04',
      });
      const task = await grocy.get('tasks', taskId);
      if (result.isError) {
        expect(Number(task.done)).toBe(0);
      } else {
        expect(task.done_timestamp).toBe('2026-05-04 00:00:00');
      }
    });

    it('fails for a task that does not exist', async () => {
      const result = await mcp.call('household_tasks_complete', { taskId: 999999 });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/task does not exist/i);
    });
  });

  describe('household_batteries_charge', () => {
    it('logs a charge cycle at Grocy server-local now by default', async () => {
      const batteryId = await grocy.create('batteries', { name: PREFIX + 'charge-default' });
      const result = await mcp.ok('household_batteries_charge', { batteryId });

      const cycles = await chargeCycles(batteryId);
      expect(cycles).toHaveLength(1);
      expect(Number(cycles[0].undone)).toBe(0);
      expectServerLocalNow(cycles[0].tracked_time);
      expect(result.data).toMatchObject({ id: Number(cycles[0].id), battery_id: batteryId });

      const details = await grocy.request('GET', `batteries/${batteryId}`);
      expect(details.last_charged).toBe(cycles[0].tracked_time);
      expect(Number(details.charge_cycles_count)).toBe(1);
    });

    it('records the given trackedTime', async () => {
      const batteryId = await grocy.create('batteries', { name: PREFIX + 'charge-time' });
      await mcp.ok('household_batteries_charge', {
        batteryId,
        trackedTime: '2026-06-07 20:21:22',
      });
      const cycles = await chargeCycles(batteryId);
      expect(cycles).toHaveLength(1);
      expect(cycles[0].tracked_time).toBe('2026-06-07 20:21:22');
    });

    it('rejects or honours an ISO-8601 trackedTime instead of silently recording now', async () => {
      const batteryId = await grocy.create('batteries', { name: PREFIX + 'charge-iso' });
      const result = await mcp.call('household_batteries_charge', {
        batteryId,
        trackedTime: '2026-06-07T20:21:22',
      });
      const cycles = await chargeCycles(batteryId);
      if (result.isError) {
        expect(cycles).toHaveLength(0);
      } else {
        expect(cycles[0].tracked_time).toBe('2026-06-07 20:21:22');
      }
    });

    it('fails for a battery that does not exist', async () => {
      const result = await mcp.call('household_batteries_charge', { batteryId: 999999 });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/battery does not exist/i);
      expect(await chargeCycles(999999)).toHaveLength(0);
    });
  });

  describe('household_actions_undo', () => {
    it('undoes a chore execution by its execution id', async () => {
      const choreId = await seedChore('undo-chore');
      const exec = await mcp.ok('household_chores_execute', { choreId });
      const executionId = Number(exec.data.id);

      await mcp.ok('household_actions_undo', { entityType: 'chore', id: executionId });

      const row = await grocy.get('chores_log', executionId);
      expect(Number(row.undone)).toBe(1);
      expectServerLocalNow(row.undone_timestamp);
      const current = await grocy.request('GET', `chores/${choreId}`);
      expect(current.last_tracked).toBeNull();
      expect(Number(current.tracked_count)).toBe(0);
    });

    it('fails when the chore execution was already undone', async () => {
      const choreId = await seedChore('undo-chore-twice');
      const exec = await mcp.ok('household_chores_execute', { choreId });
      await mcp.ok('household_actions_undo', { entityType: 'chores', id: exec.data.id });

      const again = await mcp.call('household_actions_undo', {
        entityType: 'chores',
        id: exec.data.id,
      });
      expect(again.isError).toBe(true);
      expect(again.text).toMatch(/already undone/i);
    });

    it('undoes a task completion by task id', async () => {
      const taskId = await grocy.create('tasks', { name: PREFIX + 'undo-task' });
      await mcp.ok('household_tasks_complete', { taskId });
      expect(Number((await grocy.get('tasks', taskId)).done)).toBe(1);

      await mcp.ok('household_actions_undo', { entityType: 'task', id: taskId });

      const task = await grocy.get('tasks', taskId);
      expect(Number(task.done)).toBe(0);
      expect(task.done_timestamp).toBeNull();
    });

    it('undoes a battery charge cycle by its charge cycle id', async () => {
      const batteryId = await grocy.create('batteries', { name: PREFIX + 'undo-battery' });
      const charge = await mcp.ok('household_batteries_charge', { batteryId });
      const cycleId = Number(charge.data.id);

      await mcp.ok('household_actions_undo', { entityType: 'batteries', id: cycleId });

      const cycle = await grocy.get('battery_charge_cycles', cycleId);
      expect(Number(cycle.undone)).toBe(1);
      const details = await grocy.request('GET', `batteries/${batteryId}`);
      expect(details.last_charged).toBeNull();
    });

    it('rejects an unknown entity type at the input schema', async () => {
      const result = await mcp.call('household_actions_undo', { entityType: 'equipment', id: 1 });
      expect(result.isError).toBe(true);
    });
  });

  describe('label printing without a label printer', () => {
    // The sandbox Grocy has no LABEL_PRINTER_WEBHOOK; with LABEL_PRINTER_RUN_SERVER (default
    // true) Grocy tries to POST to the empty URL and answers 400 (Chores/BatteriesApiController
    // ::*PrintLabel). The tool must report that as an error, not a printed label.
    it('household_chores_print_label reports the failure and leaves the chore untouched', async () => {
      const choreId = await seedChore('print-chore');
      const result = await mcp.call('household_chores_print_label', { choreId });
      expect(result.isError).toBe(true);
      expect(result.text).not.toMatch(/printed successfully/i);
      expect(await choreLog(choreId)).toHaveLength(0);
    });

    it('household_batteries_print_label reports the failure and leaves the battery untouched', async () => {
      const batteryId = await grocy.create('batteries', { name: PREFIX + 'print-battery' });
      const result = await mcp.call('household_batteries_print_label', { batteryId });
      expect(result.isError).toBe(true);
      expect(result.text).not.toMatch(/printed successfully/i);
      expect(await chargeCycles(batteryId)).toHaveLength(0);
    });

    it('household_chores_print_label fails for an unknown chore', async () => {
      const result = await mcp.call('household_chores_print_label', { choreId: 999999 });
      expect(result.isError).toBe(true);
    });
  });
});

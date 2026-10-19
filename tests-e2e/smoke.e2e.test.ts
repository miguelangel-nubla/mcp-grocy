import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { GrocyApi } from './harness/grocy-api.js';
import { McpSession } from './harness/mcp.js';

describe('smoke', () => {
  const grocy = new GrocyApi(inject('grocyUrl'));
  let mcp: McpSession;

  beforeAll(async () => {
    mcp = await McpSession.start(inject('grocyUrl'));
  });
  afterAll(() => mcp?.close());

  it('lists every tool, dev tools included', () => {
    expect(mcp.toolNames.length).toBeGreaterThanOrEqual(60);
    expect(mcp.toolNames).toContain('system_dev_call_api');
  });

  it('reads Grocy locations through a tool', async () => {
    const result = await mcp.ok('system_locations_get');
    const locations = await grocy.objects('locations');
    expect(JSON.stringify(result.data)).toContain(locations[0].name);
  });
});

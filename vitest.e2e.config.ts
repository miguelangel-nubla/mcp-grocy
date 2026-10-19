import { defineConfig } from 'vitest/config';

// End-to-end suite: the built server against a real Grocy in Docker (npm run test:e2e).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests-e2e/**/*.e2e.test.ts'],
    globalSetup: ['tests-e2e/harness/global-setup.ts'],
    // one Grocy per run, shared by every file: run files one at a time
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 240_000,
  },
});

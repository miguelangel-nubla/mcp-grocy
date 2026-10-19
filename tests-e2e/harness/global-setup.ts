import type { TestProject } from 'vitest/node';
import { flavorFromEnv, startGrocy, stopGrocy } from './grocy-container.js';

declare module 'vitest' {
  export interface ProvidedContext {
    grocyUrl: string;
    grocyFlavor: 'next' | 'upstream';
  }
}

export default async function setup(project: TestProject) {
  const flavor = flavorFromEnv();
  const grocy = await startGrocy(flavor);
  console.log(`E2E Grocy (${flavor}) ${grocy.image} at ${grocy.url}`);
  project.provide('grocyUrl', grocy.url);
  project.provide('grocyFlavor', flavor);
  return () => stopGrocy(grocy.name);
}

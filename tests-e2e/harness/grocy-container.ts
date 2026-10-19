/**
 * Throwaway Grocy container for the end-to-end suite.
 *
 * E2E_GROCY_FLAVOR picks the backend: `next` (default, the grocy-next fork prod runs) or
 * `upstream` (linuxserver/grocy). E2E_GROCY_IMAGE overrides the pinned image. Keep the
 * grocy-next tag in step with grocy-agent's n8n e2e stack (integrations/n8n/e2e/compose.yaml).
 */
import { execFileSync } from 'node:child_process';

export type GrocyFlavor = 'next' | 'upstream';

const IMAGES: Record<GrocyFlavor, string> = {
  next: 'ghcr.io/miguelangel-nubla/grocy-next:dev-b22e8b2',
  upstream: 'lscr.io/linuxserver/grocy:v4.7.1-ls345',
};

/** grocy-next's latest migration (0258: stock QU changes need a conversion). */
const GROCY_NEXT_DB_VERSION = 258;

export const E2E_API_KEY = 'mcp-grocy-e2e-key';

export interface GrocyContainer {
  name: string;
  flavor: GrocyFlavor;
  image: string;
  url: string;
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function flavorFromEnv(): GrocyFlavor {
  const flavor = process.env.E2E_GROCY_FLAVOR ?? 'next';
  if (flavor !== 'next' && flavor !== 'upstream') {
    throw new Error(`E2E_GROCY_FLAVOR must be "next" or "upstream", got "${flavor}"`);
  }
  return flavor;
}

export async function startGrocy(flavor: GrocyFlavor): Promise<GrocyContainer> {
  const image = process.env.E2E_GROCY_IMAGE || IMAGES[flavor];
  const name = `mcp-grocy-e2e-${flavor}-${process.pid}`;

  // TZ matches prod, so server-local time handling is exercised away from UTC
  docker(
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '--tmpfs',
    '/config',
    '-e',
    'PUID=1000',
    '-e',
    'PGID=1000',
    '-e',
    'TZ=Europe/Madrid',
    '-p',
    '127.0.0.1::80',
    image,
  );

  try {
    // `/` (unlike /login) runs the schema migrations, but on a cold start the first `/`
    // redirects before the DB exists: ready = a later `/` built it
    let ready = false;
    for (let i = 0; i < 90 && !ready; i++) {
      try {
        docker(
          'exec',
          name,
          'sh',
          '-c',
          'curl -fsS -o /dev/null http://localhost/ && test -s /config/data/grocy.db',
        );
        ready = true;
      } catch {
        await sleep(2000);
      }
    }
    if (!ready) throw new Error(`Grocy container ${name} did not become ready`);
    docker('exec', name, 'curl', '-fsS', '-o', '/dev/null', 'http://localhost/');

    // Grocy has no API to mint a key; the app user `abc` owns the DB, so write it as abc
    const versionCheck =
      flavor === 'next'
        ? `if ($v !== ${GROCY_NEXT_DB_VERSION}) { fwrite(STDERR, "grocy db_version $v, want ${GROCY_NEXT_DB_VERSION} (grocy-next)\\n"); exit(1); }`
        : '';
    docker(
      'exec',
      '-u',
      'abc',
      name,
      'php',
      '-r',
      '$db = new PDO("sqlite:/config/data/grocy.db");' +
        '$v = (int) $db->query("SELECT MAX(migration) FROM migrations")->fetchColumn();' +
        versionCheck +
        '$db->prepare("INSERT INTO api_keys (api_key, user_id, expires) VALUES (?, 1, ?)")' +
        `->execute(["${E2E_API_KEY}", "2999-12-31 23:59:59"]);`,
    );

    const port = docker('port', name, '80/tcp').split('\n')[0]!.split(':').pop();
    return { name, flavor, image, url: `http://127.0.0.1:${port}` };
  } catch (error) {
    stopGrocy(name);
    throw error;
  }
}

export function stopGrocy(name: string): void {
  if (process.env.E2E_KEEP === '1') {
    console.log(`E2E_KEEP=1: leaving container ${name} running`);
    return;
  }
  try {
    docker('rm', '-f', name);
  } catch {
    // already gone
  }
}

import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { promisify } from 'util';

describe('Production Environment', () => {
  it('should load all modules correctly when run as production server', async () => {
    // Run the actual production server process to see what modules are loaded
    const child = spawn('node', ['build/main.js'], {
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Kill the process after 3 seconds to get the startup logs
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 3000);

    await new Promise((resolve) => {
      child.on('exit', resolve);
    });

    console.log('STDOUT:', stdout);
    console.log('STDERR:', stderr);

    // Check for the module loading log
    const moduleLoadingMatch = stderr.match(/Loaded (\d+) tool modules/);
    if (moduleLoadingMatch) {
      const moduleCount = parseInt(moduleLoadingMatch[1]);
      console.log(`Production server loaded ${moduleCount} modules`);
      expect(moduleCount).toBe(5); // Should load all 5 modules
    }

    // Check for invalid tools error
    const invalidToolsMatch = stderr.match(/Invalid tools: ([^.]+)/);
    if (invalidToolsMatch) {
      console.log('Invalid tools found:', invalidToolsMatch[1]);
      throw new Error(`Server found invalid tools: ${invalidToolsMatch[1]}`);
    }
  }, 10000); // 10 second timeout
});
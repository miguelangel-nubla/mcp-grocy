#!/usr/bin/env node

/**
 * This script prepares the dev release by ensuring proper versioning.
 * It reads the version from the package.json in the main branch and
 * ensures the next dev version is properly incremented from there.
 *
 * Usage:
 *   node prepare-dev-release.js [options]
 *
 * Options:
 *   --force          Force update even if not on dev branch
 *   --dry-run        Show what would be done without making changes
 *   --patch          Increment patch version
 *   --minor          Increment minor version
 *   --major          Increment major version
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(process.cwd(), 'package.json');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  force: args.includes('--force'),
  dryRun: args.includes('--dry-run'),
  patch: args.includes('--patch'),
  minor: args.includes('--minor'),
  major: args.includes('--major'),
};

async function prepareDevRelease() {
  try {
    console.log('Preparing dev release with proper versioning...');
    console.log('Options:', options);

    // Get current branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    console.log(`Current branch: ${currentBranch}`);

    if (currentBranch !== 'dev' && !options.force) {
      console.log('Not on dev branch, use --force to override.');
      process.exit(0);
    }

    // Fetch latest version from the main branch
    console.log('Fetching latest version from main branch...');

    // Ensure we have the latest main branch data
    execSync('git fetch origin main --tags');

    // Get the latest main branch version from package.json
    const mainPackageJson = execSync('git show origin/main:package.json').toString();
    const mainVersion = JSON.parse(mainPackageJson).version;
    console.log(`Latest main branch version: ${mainVersion}`);

    // Read the current package.json
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);

    // Get current version
    const currentVersion = packageJson.version;
    console.log(`Current version in package.json: ${currentVersion}`);

    // Determine if and how we should update the version
    let shouldUpdate = false;
    let newVersion;

    // Check if current version is already a dev version
    const isDevVersion = currentVersion.includes('-dev');

    // Split the version into parts
    let versionParts;
    let devNumber = 1;

    if (isDevVersion) {
      // Extract base version and dev number
      const [baseVersion, devPart] = currentVersion.split('-dev.');
      versionParts = baseVersion.split('.');
      devNumber = parseInt(devPart) + 1; // Increment the dev number
    } else {
      versionParts = currentVersion.split('.');
    }

    const [major, minor, patch] = versionParts;

    if (options.major) {
      // Major version increment
      newVersion = `${parseInt(major) + 1}.0.0-dev.1`;
      shouldUpdate = true;
    } else if (options.minor) {
      // Minor version increment
      newVersion = `${major}.${parseInt(minor) + 1}.0-dev.1`;
      shouldUpdate = true;
    } else if (options.patch) {
      // Forced patch version increment
      newVersion = `${major}.${minor}.${parseInt(patch) + 1}-dev.1`;
      shouldUpdate = true;
    } else if (isDevVersion) {
      // Just increment the dev number for existing dev version
      const baseVersion = `${major}.${minor}.${patch}`;
      newVersion = `${baseVersion}-dev.${devNumber}`;
      shouldUpdate = true;
    } else if (currentVersion === mainVersion) {
      // Convert from main version to dev version
      newVersion = `${major}.${minor}.${parseInt(patch) + 1}-dev.1`;
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      console.log(`Updating version in package.json from ${currentVersion} to ${newVersion}`);

      if (!options.dryRun) {
        // Update package.json
        packageJson.version = newVersion;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
        console.log(`Updated package.json version to ${newVersion}`);
      } else {
        console.log(`[Dry run] Would update version to ${newVersion}`);
      }
    } else if (currentVersion.includes('-dev')) {
      console.log(`Package.json already has a dev version (${currentVersion}), no update needed.`);
    } else {
      console.log(
        `Version update not needed. Use --patch, --minor, or --major to force an update.`,
      );
    }

    console.log('Dev release preparation complete.');
  } catch (error) {
    console.error('Error in prepareDevRelease:', error);
    process.exit(1);
  }
}

// Run the function
prepareDevRelease().catch(console.error);

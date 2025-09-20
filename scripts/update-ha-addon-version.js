#!/usr/bin/env node

/**
 * Update version in config.yaml for Home Assistant addon compatibility
 * 
 * Home Assistant addons REQUIRE a version field in config.yaml that matches
 * the Docker image tag. Semantic-release updates package.json automatically,
 * but we need to manually sync config.yaml to maintain addon compatibility.
 * 
 * See: https://developers.home-assistant.io/docs/add-ons/configuration/
 */

import { readFileSync, writeFileSync } from 'fs';
import { parse, stringify } from 'yaml';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/update-ha-addon-version.js <version>');
  process.exit(1);
}

try {
  const configPath = 'config.yaml';
  const configContent = readFileSync(configPath, 'utf8');
  const config = parse(configContent);
  
  config.version = version;
  
  const updatedContent = stringify(config);
  writeFileSync(configPath, updatedContent);
  
  console.log(`Updated config.yaml with version ${version}`);
} catch (error) {
  console.error('Error updating config.yaml:', error.message);
  process.exit(1);
}
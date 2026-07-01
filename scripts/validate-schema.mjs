#!/usr/bin/env node
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { validateMissionExport } from './scanner.mjs';

/** Valid mission file extensions */
const MISSION_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);

/** Files to skip when discovering all missions */
const SKIP_FILENAMES = new Set(['index.json']);

/**
 * Recursively discovers all mission files under the given directory.
 * Returns an array of relative file paths.
 */
function discoverMissionFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...discoverMissionFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = entry.name.substring(entry.name.lastIndexOf('.'));
      if (MISSION_EXTENSIONS.has(ext) && !SKIP_FILENAMES.has(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const args = process.argv.slice(2);

let files;
if (args.includes('--all')) {
  // Discover all mission files under fixes/ (used for push/schedule/dispatch)
  files = discoverMissionFiles('fixes');
  console.log(`Discovered ${files.length} mission files to validate.\n`);
} else {
  files = args.flatMap(a => a.split(/\s+/)).filter(Boolean);
}

if (files.length === 0) {
  console.log('No files to validate.');
  process.exit(0);
}

let hasErrors = false;

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`❌ ${file}: Could not read file: ${err.message}`);
    hasErrors = true;
    continue;
  }

  let data;
  try {
    if (file.endsWith('.json')) {
      data = JSON.parse(content);
    } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
      data = yaml.load(content);
    } else {
      // Try JSON first, then YAML
      try {
        data = JSON.parse(content);
      } catch {
        data = yaml.load(content);
      }
    }
  } catch (err) {
    console.error(`❌ ${file}: Parse error: ${err.message}`);
    hasErrors = true;
    continue;
  }

  const result = validateMissionExport(data);

  if (result.valid) {
    console.log(`✅ ${file}: Valid kc-mission-v1`);
  } else {
    console.error(`❌ ${file}:`);
    for (const error of result.errors) {
      console.error(`   - ${error}`);
    }
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\n❌ Schema validation failed.');
  process.exit(1);
} else {
  console.log('\n✅ All files passed schema validation.');
  process.exit(0);
}

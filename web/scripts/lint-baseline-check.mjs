#!/usr/bin/env node
/**
 * Lint baseline checker — fails CI only on NEW violations not in baseline.
 * 
 * Usage:
 *   npm run lint:check         # CI mode: fail on new violations
 *   npm run lint:baseline      # Update baseline with current violations
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = path.join(__dirname, '..', '.eslint-baseline.json');
const TEMP_FILE = path.join(__dirname, '..', '.eslint-current.json');

const isUpdateMode = process.argv.includes('--update');

// Run eslint with JSON output
console.log('Running eslint...');
try {
  const output = execSync('npx eslint . --format json', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large output
  });
  // No violations — exit clean
  fs.writeFileSync(TEMP_FILE, output || '[]');
} catch (err) {
  // eslint exits non-zero on violations — capture output
  if (err.stdout) {
    fs.writeFileSync(TEMP_FILE, err.stdout);
  } else {
    console.error('Eslint failed:', err.message);
    process.exit(1);
  }
}

// Parse results
const currentData = JSON.parse(fs.readFileSync(TEMP_FILE, 'utf8'));
const currentViolations = extractViolations(currentData);

// Update mode — write baseline and exit
if (isUpdateMode) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(currentViolations, null, 2));
  console.log(`✅ Baseline updated: ${currentViolations.length} violations recorded`);
  fs.unlinkSync(TEMP_FILE);
  process.exit(0);
}

// Check mode — compare against baseline
if (!fs.existsSync(BASELINE_FILE)) {
  console.error('❌ No baseline file found. Generate with: npm run lint:baseline');
  fs.unlinkSync(TEMP_FILE);
  process.exit(1);
}

const baselineViolations = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));

// Compare by count per (file, rule) — line/column shifts from refactors are not new violations.
const baselineCounts = countByFileRule(baselineViolations);
const currentCounts = countByFileRule(currentViolations);

// Keys that appear in current but exceed baseline count → new violations
const allKeys = new Set([...Object.keys(baselineCounts), ...Object.keys(currentCounts)]);
const newEntries = [];
const fixedEntries = [];

for (const key of allKeys) {
  const baselineCount = baselineCounts[key] || 0;
  const currentCount = currentCounts[key] || 0;
  if (currentCount > baselineCount) {
    newEntries.push({ key, added: currentCount - baselineCount });
  } else if (currentCount < baselineCount) {
    fixedEntries.push({ key, removed: baselineCount - currentCount });
  }
}

const newViolationCount = newEntries.reduce((sum, e) => sum + e.added, 0);
const fixedViolationCount = fixedEntries.reduce((sum, e) => sum + e.removed, 0);

fs.unlinkSync(TEMP_FILE);

// Report
console.log(`\n📊 Lint Baseline Check`);
console.log(`   Baseline: ${baselineViolations.length} violations`);
console.log(`   Current:  ${currentViolations.length} violations`);
console.log(`   Fixed:    ${fixedViolationCount} violations`);
console.log(`   New:      ${newViolationCount} violations\n`);

if (fixedEntries.length > 0) {
  console.log('✨ Violations fixed (run `npm run lint:baseline` to update baseline):');
  fixedEntries.forEach(({ key, removed }) => {
    const [, rule] = key.split('\0');
    console.log(`   ${rule}: ${removed} fixed`);
  });
  console.log();
}

if (newEntries.length > 0) {
  console.log('❌ New lint violations detected:\n');
  newEntries.forEach(({ key, added }) => {
    const [file, rule] = key.split('\0');
    console.log(`   ${rule} (${added} new) in ${file}`);
    // Show the actual new violations for context
    const current = currentViolations.filter(v => v.file === file && v.rule === rule);
    current.slice(0, 5).forEach(v => {
      console.log(`     ${v.file}:${v.line}:${v.column} — ${v.message}`);
    });
    if (current.length > 5) {
      console.log(`     ... and ${current.length - 5} more`);
    }
  });
  console.log('\n❌ CI fails on new violations. Fix them or update baseline after review.');
  console.log('   Tip: For unused catch bindings (no-unused-vars), use `catch { }` instead');
  console.log('   of `catch (err)` when you don\'t need the error value. See eslint.config.js.');
  process.exit(1);
}

console.log('✅ No new violations — build gate passes');
process.exit(0);

// Helpers
function extractViolations(eslintData) {
  return eslintData.flatMap(file => 
    file.messages.map(msg => ({
      file: file.filePath.replace(/.*\/web\//, ''),
      rule: msg.ruleId || 'null',
      line: msg.line,
      column: msg.column,
      message: msg.message,
    }))
  );
}

// Count violations per (file, rule) key — used for line-number-independent comparison.
function countByFileRule(violations) {
  const counts = {};
  violations.forEach(v => {
    const key = `${v.file}\0${v.rule}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

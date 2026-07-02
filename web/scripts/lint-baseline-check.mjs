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

// Build sets for comparison (file:line:column:rule)
const baselineSet = new Set(baselineViolations.map(v => `${v.file}:${v.line}:${v.column}:${v.rule}`));
const currentSet = new Set(currentViolations.map(v => `${v.file}:${v.line}:${v.column}:${v.rule}`));

const newViolations = currentViolations.filter(v => 
  !baselineSet.has(`${v.file}:${v.line}:${v.column}:${v.rule}`)
);

const fixedViolations = baselineViolations.filter(v =>
  !currentSet.has(`${v.file}:${v.line}:${v.column}:${v.rule}`)
);

fs.unlinkSync(TEMP_FILE);

// Report
console.log(`\n📊 Lint Baseline Check`);
console.log(`   Baseline: ${baselineViolations.length} violations`);
console.log(`   Current:  ${currentViolations.length} violations`);
console.log(`   Fixed:    ${fixedViolations.length} violations`);
console.log(`   New:      ${newViolations.length} violations\n`);

if (fixedViolations.length > 0) {
  console.log('✨ Violations fixed (run `npm run lint:baseline` to update baseline):');
  const byRule = groupByRule(fixedViolations);
  Object.entries(byRule).forEach(([rule, violations]) => {
    console.log(`   ${rule}: ${violations.length} fixed`);
  });
  console.log();
}

if (newViolations.length > 0) {
  console.log('❌ New lint violations detected:\n');
  const byRule = groupByRule(newViolations);
  Object.entries(byRule).forEach(([rule, violations]) => {
    console.log(`   ${rule} (${violations.length} new):`);
    violations.slice(0, 5).forEach(v => {
      console.log(`     ${v.file}:${v.line}:${v.column} — ${v.message}`);
    });
    if (violations.length > 5) {
      console.log(`     ... and ${violations.length - 5} more`);
    }
  });
  console.log('\n❌ CI fails on new violations. Fix them or update baseline after review.');
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

function groupByRule(violations) {
  const groups = {};
  violations.forEach(v => {
    if (!groups[v.rule]) groups[v.rule] = [];
    groups[v.rule].push(v);
  });
  return groups;
}

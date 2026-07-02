#!/usr/bin/env node
/**
 * lint-baseline-check.mjs
 *
 * Compares current ESLint warning counts per rule against a checked-in baseline.
 * Fails if any rule exceeds its baseline count (regression).
 * Reports rules that decreased (baseline can be tightened).
 *
 * Usage: node scripts/lint-baseline-check.mjs [--update]
 *   --update  Regenerate the baseline file from current counts
 *
 * The baseline file (.eslint-baseline.json) lives at the repo root.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, '..');
const BASELINE_PATH = resolve(__dirname, '../../.eslint-baseline.json');
const isUpdate = process.argv.includes('--update');

function runEslint() {
  let stdout = '';
  try {
    stdout = execSync('npx eslint . --format json', {
      cwd: WEB_DIR,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    // ESLint exits non-zero when there are errors/warnings; still parse stdout
    stdout = err.stdout || '';
    if (!stdout) {
      console.error('❌ ESLint produced no output.');
      if (err.stderr) console.error('stderr:', err.stderr.slice(0, 500));
      process.exit(1);
    }
  }

  let results;
  try {
    results = JSON.parse(stdout);
  } catch {
    console.error('❌ Failed to parse ESLint JSON output.');
    console.error('First 200 chars:', stdout.slice(0, 200));
    process.exit(1);
  }
  return results;
}

function countByRule(results) {
  const warnings = {};
  let errorCount = 0;
  let fatalCount = 0;

  for (const file of results) {
    for (const msg of file.messages || []) {
      if (msg.fatal) {
        fatalCount++;
        continue;
      }
      if (msg.severity === 2) {
        errorCount++;
        continue;
      }
      if (msg.severity === 1) {
        const rule = msg.ruleId || '_unknown';
        warnings[rule] = (warnings[rule] || 0) + 1;
      }
    }
  }

  return { warnings, errorCount, fatalCount };
}

function readBaseline() {
  try {
    const content = readFileSync(BASELINE_PATH, 'utf-8');
    const data = JSON.parse(content);
    if (data.version !== 1) {
      console.error(`❌ Unknown baseline version: ${data.version}`);
      process.exit(1);
    }
    return data.rules || {};
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null; // No baseline file
    }
    console.error('❌ Failed to read baseline:', err.message);
    process.exit(1);
  }
}

function writeBaseline(warnings) {
  const sorted = Object.fromEntries(
    Object.entries(warnings).sort(([a], [b]) => a.localeCompare(b))
  );
  const baseline = {
    version: 1,
    generated: new Date().toISOString(),
    comment: 'Per-rule ESLint warning baseline. Update with: cd web && npm run lint:update-baseline',
    rules: sorted,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  const total = Object.values(warnings).reduce((s, n) => s + n, 0);
  console.log(`✅ Baseline updated: ${Object.keys(sorted).length} rules, ${total} total warnings`);
}

// --- Main ---

console.log('🔍 Running ESLint...');
const results = runEslint();
const { warnings, errorCount, fatalCount } = countByRule(results);

if (fatalCount > 0) {
  console.error(`❌ ${fatalCount} fatal ESLint error(s) (parse/config failures). Fix before proceeding.`);
  process.exit(1);
}

if (errorCount > 0 && isUpdate) {
  console.error(`❌ ${errorCount} ESLint error(s) present. Fix errors before updating baseline.`);
  process.exit(1);
}

if (isUpdate) {
  writeBaseline(warnings);
  process.exit(0);
}

// --- Check mode ---
const baseline = readBaseline();

if (baseline === null || Object.keys(baseline).length === 0) {
  const total = Object.values(warnings).reduce((s, n) => s + n, 0);
  console.log(`\n📊 ESLint: ${total} warnings across ${Object.keys(warnings).length} rules`);
  console.log('⚠️  No per-rule baseline found. Run `cd web && npm run lint:update-baseline` to initialize.');
  console.log('   Falling back to total-count check against .lint-warning-baseline');
  // Don't fail — let the legacy total-count gate handle it until baseline is populated
  process.exit(0);
}

const regressions = [];
const improvements = [];

// Check all current warnings against baseline
for (const [rule, count] of Object.entries(warnings)) {
  const allowed = baseline[rule] ?? 0;
  if (count > allowed) {
    regressions.push({ rule, count, allowed });
  } else if (count < allowed) {
    improvements.push({ rule, count, allowed });
  }
}

// Check for rules that were fully fixed
for (const [rule, allowed] of Object.entries(baseline)) {
  if (!(rule in warnings) && allowed > 0) {
    improvements.push({ rule, count: 0, allowed });
  }
}

const totalWarnings = Object.values(warnings).reduce((s, n) => s + n, 0);
console.log(`\n📊 ESLint Summary: ${totalWarnings} warnings across ${Object.keys(warnings).length} rules`);
if (errorCount > 0) {
  console.log(`⚠️  ${errorCount} error(s) also present (not tracked by baseline)`);
}

if (improvements.length > 0) {
  console.log(`\n🎉 Improvements (update baseline with \`cd web && npm run lint:update-baseline\`):`);
  for (const { rule, count, allowed } of improvements.sort((a, b) => (b.allowed - b.count) - (a.allowed - a.count))) {
    console.log(`   ${rule}: ${allowed} → ${count} (−${allowed - count})`);
  }
}

if (regressions.length > 0) {
  console.error(`\n❌ Lint regressions detected (${regressions.length} rule(s) exceeded baseline):\n`);
  for (const { rule, count, allowed } of regressions.sort((a, b) => (b.count - b.allowed) - (a.count - a.allowed))) {
    console.error(`   ${rule}: ${allowed} allowed → ${count} found (+${count - allowed})`);
  }
  console.error(`\nTo fix: resolve the new warnings, or run \`cd web && npm run lint:update-baseline\``);
  process.exit(1);
}

console.log('\n✅ No lint regressions detected.');
process.exit(0);

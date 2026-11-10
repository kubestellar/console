#!/usr/bin/env node
/**
 * Advisory detector for trivial "export-only" test stubs (issue #24890).
 *
 * A stub is a test file whose every assertion only checks that an export is
 * defined / is a function, and that never renders or calls anything.
 * Phase 1 is warning-only: it reports the count and file list against the
 * recorded baseline (scripts/export-only-test-baseline.json) and exits 0.
 *
 * Usage:
 *   node scripts/check-export-only-tests.mjs           # report (never fails)
 *   node scripts/check-export-only-tests.mjs --update  # rewrite baseline
 *   node scripts/check-export-only-tests.mjs --strict  # fail on count increase (future flip)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = path.join(__dirname, '..')
const SRC_DIR = path.join(WEB_ROOT, 'src')
const BASELINE_FILE = path.join(__dirname, 'export-only-test-baseline.json')

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/
const EXPECT_RE = /\bexpect\(/g
const TRIVIAL_EXPECT_RE =
  /\bexpect\(\s*(?:typeof\s+)?[\w$.]+\s*\)\s*\.(?:not\s*\.\s*toBeUndefined\(\s*\)|toBeDefined\(\s*\)|toBeTruthy\(\s*\)|toBe\(\s*['"]function['"]\s*\))/g
const BEHAVIOR_RE = /\b(render|renderHook|mount|fireEvent|userEvent|act|waitFor)\s*\(/

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (TEST_FILE_RE.test(entry.name)) out.push(full)
  }
}

export function isExportOnlyStub(source) {
  const total = (source.match(EXPECT_RE) || []).length
  if (total === 0) return false
  const trivial = (source.match(TRIVIAL_EXPECT_RE) || []).length
  return trivial === total && !BEHAVIOR_RE.test(source)
}

function findStubs() {
  const files = []
  walk(SRC_DIR, files)
  return files
    .filter(f => isExportOnlyStub(fs.readFileSync(f, 'utf8')))
    .map(f => path.relative(WEB_ROOT, f).split(path.sep).join('/'))
    .sort()
}

function main() {
  const stubs = findStubs()

  if (process.argv.includes('--update')) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify({ count: stubs.length, files: stubs }, null, 2) + '\n')
    console.log(`Baseline updated: ${stubs.length} export-only test stubs recorded`)
    return
  }

  const baseline = fs.existsSync(BASELINE_FILE)
    ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
    : { count: 0, files: [] }
  const known = new Set(baseline.files)
  const added = stubs.filter(f => !known.has(f))

  console.log(`Export-only test stubs: ${stubs.length} (baseline ${baseline.count})`)
  stubs.forEach(f => console.log(`  ${known.has(f) ? ' ' : '+'} ${f}`))

  const increased = stubs.length > baseline.count || added.length > 0
  if (increased) {
    console.log(`::warning::Export-only test stubs increased: ${added.length} new file(s). Render the component and assert real behavior.`)
    added.forEach(f => console.log(`::warning file=web/${f}::Export-only test stub (only asserts the export is defined)`))
  }
  if (process.argv.includes('--strict') && increased) process.exit(1)
}

main()

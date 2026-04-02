#!/usr/bin/env node
/**
 * Post-build safety checks for production bundles.
 *
 * Runs automatically via the `postbuild` npm script after every `npm run build`.
 * Catches classes of bugs that pass tsc + vite build but crash at runtime.
 *
 * Checks:
 * 1. Vite define corruption — vendor code with `undefined()` calls
 * 2. Critical chunks exist and are non-empty
 * 3. MSW not leaked into non-demo production builds
 * 4. Bundle size regression — catches accidental dependency inlining
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS_DIR = join(import.meta.dirname, '..', 'dist', 'assets')
const DIST_DIR = join(import.meta.dirname, '..', 'dist')

if (!existsSync(ASSETS_DIR)) {
  // No dist yet (dev mode) — skip silently
  process.exit(0)
}

const allFiles = readdirSync(ASSETS_DIR)
let failed = false

function fail(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`)
  failed = true
}

function pass(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`)
}

// ── Check 1: Vite define corruption ──────────────────────────────────────
// Vite's `define` does literal text replacement. Bare `console.log` rules
// replace occurrences in vendor code, turning `console.log(...)` into
// `undefined(...)` → `TypeError: (void 0) is not a function` at runtime.

const vendorFiles = allFiles.filter((name) => name.endsWith('.js'))

let defineCorrupted = false
for (const file of vendorFiles) {
  const content = readFileSync(join(ASSETS_DIR, file), 'utf8')
  const matches = content.match(/void 0\(/g)
  if (matches && matches.length > 0) {
    fail(
      `${file} contains ${matches.length} \`undefined()\` calls — ` +
      `Vite define likely replaced \`console.*\` in vendor code. ` +
      `Only use \`globalThis.console.*\` in vite.config.ts define.`,
    )
    defineCorrupted = true
  }
}
if (!defineCorrupted) pass('No Vite define corruption in vendor bundles')

// ── Check 2: Critical chunks exist and are non-empty ─────────────────────
// Code splitting must produce these chunks. If any are missing or empty,
// the app will fail to load with a blank page or chunk load error.

const CRITICAL_PREFIXES = ['index-', 'vendor-', 'react-vendor-']
/** Minimum size in bytes — anything below this is likely an empty/broken chunk */
const MIN_CHUNK_SIZE_BYTES = 1_000

let check2Failed = false
for (const prefix of CRITICAL_PREFIXES) {
  const chunk = allFiles.find(
    (name) => name.startsWith(prefix) && name.endsWith('.js'),
  )
  if (!chunk) {
    fail(`Missing critical chunk: ${prefix}*.js`)
    check2Failed = true
    continue
  }
  const size = statSync(join(ASSETS_DIR, chunk)).size
  if (size < MIN_CHUNK_SIZE_BYTES) {
    fail(`${chunk} is suspiciously small (${size} bytes) — likely broken`)
    check2Failed = true
  }
}
if (!check2Failed) pass('Critical chunks present and non-empty')

// ── Check 3: MSW not leaked into non-demo builds ────────────────────────
// In demo mode (VITE_DEMO_MODE=true), MSW is expected. But if it somehow
// activates unconditionally, real API calls get intercepted and the app
// shows mock data to real users. Check: the MSW browser import should only
// appear in the demo/mock chunk, not in the main index bundle.

const indexChunk = allFiles.find(
  (name) => name.startsWith('index-') && name.endsWith('.js'),
)
if (indexChunk) {
  const indexContent = readFileSync(join(ASSETS_DIR, indexChunk), 'utf8')
  // Detect MSW being statically bundled by looking for MSW-specific module
  // identifiers. A dynamic import would keep these out of the index chunk.
  // Note: the string 'mockServiceWorker' is a legitimate URL reference and is
  // NOT a reliable signal — only the actual MSW API symbols indicate static bundling.
  const mswSignals = ['msw/browser', 'setupWorker']
  const leaked = mswSignals.filter((sig) => indexContent.includes(sig))
  if (leaked.length > 0) {
    fail(
      `MSW identifiers (${leaked.join(', ')}) found statically in ${indexChunk}. ` +
      `MSW must be behind a dynamic import() so it only loads in demo mode.`,
    )
  } else {
    pass('MSW is not statically bundled in index chunk')
  }
}

// ── Check 4: Bundle size regression ──────────────────────────────────────
// Catches accidental dependency inlining (e.g., Three.js, Chart.js, or
// the entire node_modules ending up in one chunk). Thresholds are generous
// — they should only trip on catastrophic regressions, not normal growth.

/** Size limits in bytes — ~2x current sizes to catch catastrophic inlining */
const SIZE_LIMITS = {
  'index-':        1_500_000,  // ~430KB currently → fail at 1.5MB
  'vendor-':       3_000_000,  // ~1.2MB currently → fail at 3MB
  'react-vendor-':   500_000,  // ~135KB currently → fail at 500KB
}

let sizeOk = true
for (const [prefix, limit] of Object.entries(SIZE_LIMITS)) {
  const chunk = allFiles.find(
    (name) => name.startsWith(prefix) && name.endsWith('.js'),
  )
  if (!chunk) continue // Already caught by check 2
  const size = statSync(join(ASSETS_DIR, chunk)).size
  if (size > limit) {
    const limitMB = (limit / 1_000_000).toFixed(1)
    const sizeMB = (size / 1_000_000).toFixed(1)
    fail(
      `${chunk} is ${sizeMB}MB — exceeds ${limitMB}MB limit. ` +
      `A dependency may have been accidentally inlined.`,
    )
    sizeOk = false
  }
}
if (sizeOk) pass('Bundle sizes within limits')

// ── Check 5: index.html exists and references JS entry ───────────────────
const indexHtml = join(DIST_DIR, 'index.html')
if (!existsSync(indexHtml)) {
  fail('dist/index.html is missing')
} else {
  const html = readFileSync(indexHtml, 'utf8')
  if (!html.includes('assets/index-')) {
    fail('index.html does not reference an index-*.js entry point')
  } else {
    pass('index.html references JS entry point')
  }
}

// ── Result ───────────────────────────────────────────────────────────────
if (failed) {
  console.error('\n\x1b[31mPost-build safety check FAILED\x1b[0m')
  process.exit(1)
} else {
  console.log('\n\x1b[32mAll post-build safety checks passed\x1b[0m')
}

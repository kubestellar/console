#!/usr/bin/env node
/**
 * Post-build safety check: ensures Vite's `define` config hasn't corrupted
 * vendor/dependency bundles by replacing `console.*` calls with `undefined()`.
 *
 * Background: Vite's `define` does literal text replacement. A rule like
 * `'console.log': 'undefined'` replaces ALL occurrences — including inside
 * vendor code — turning `console.log(...)` into `undefined(...)` which
 * crashes at runtime as `TypeError: (void 0) is not a function`.
 *
 * This script scans all vendor-*.js bundles in dist/assets/ for the pattern
 * `void 0(` which is the minified form of `undefined(...)`. If found, the
 * build fails before deployment.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS_DIR = join(import.meta.dirname, '..', 'dist', 'assets')

if (!existsSync(ASSETS_DIR)) {
  // No dist yet (dev mode) — skip
  process.exit(0)
}

const vendorFiles = readdirSync(ASSETS_DIR).filter(
  (name) => name.startsWith('vendor-') && name.endsWith('.js'),
)

let failed = false
for (const file of vendorFiles) {
  const content = readFileSync(join(ASSETS_DIR, file), 'utf8')
  // Match `void 0(` — the minified form of `undefined(...)` which is always a bug
  const matches = content.match(/void 0\(/g)
  if (matches && matches.length > 0) {
    console.error(
      `\x1b[31mERROR: ${file} contains ${matches.length} \`undefined()\` calls.\x1b[0m`,
    )
    console.error(
      `  Vite's \`define\` config likely replaced \`console.*\` in vendor code.`,
    )
    console.error(
      `  Only use \`globalThis.console.*\` in vite.config.ts define — never bare \`console.*\`.`,
    )
    failed = true
  }
}

if (failed) {
  process.exit(1)
} else {
  console.log('✓ Vendor bundle safety check passed')
}

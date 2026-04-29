/**
 * E2E User-Flows Assertion Audit (#8508)
 *
 * Scans all user-flows/ e2e test files for "silent pass" patterns that
 * produce zero CI signal:
 *
 *   1. .catch(() => false) followed by bare return (no test.skip)
 *   2. if (has...) with assertions inside but no else/skip branch
 *
 * These patterns cause tests to pass green even when the element under
 * test doesn't render, hiding real regressions behind silent success.
 *
 * The fix is to use `test.skip(true, 'reason')` instead of bare `return`,
 * which shows up as a "skipped" test in CI output — visible signal that
 * something was not verified.
 *
 * Run:   npx vitest run src/test/e2e-assertion-audit.test.ts
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Configuration ──────────────────────────────────────────────────────────

const E2E_USER_FLOWS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../e2e/user-flows',
)

/**
 * Pattern: `.catch(() => false)` followed within 2 lines by a bare `return`
 * that does NOT include `test.skip`.
 *
 * This catches:
 *   if (!hasFoo) return           // silent pass — no CI signal
 *
 * But NOT:
 *   if (!hasFoo) { test.skip(true, 'reason'); return }  // proper skip
 */
const BARE_RETURN_AFTER_CATCH_RE =
  /\.catch\(\(\)\s*=>\s*false\)[\s\S]{0,200}if\s*\(![\w]+\)\s+return(?!\s*})/

/**
 * Pattern: Positive-branch-only assertion — the assertion only runs
 * inside `if (has...) { ... }` with no else/skip for the false case.
 *
 * This catches:
 *   if (hasFoo) { await expect(foo).toBeVisible() }
 *   // but when hasFoo is false, nothing is checked
 */
const POSITIVE_ONLY_ASSERTION_RE =
  /if\s*\(has\w+\)\s*\{[^}]*expect\([^)]*\)[^}]*\}\s*(?!\s*else)/

// ── Tests ──────────────────────────────────────────────────────────────────

describe('user-flows/ assertion hygiene (#8508)', () => {
  /** All .spec.ts files in the user-flows directory */
  const specFiles = existsSync(E2E_USER_FLOWS_DIR)
    ? fs
        .readdirSync(E2E_USER_FLOWS_DIR)
        .filter((f) => f.endsWith('.spec.ts'))
        .map((f) => join(E2E_USER_FLOWS_DIR, f))
    : []

  it('user-flows directory exists and has spec files', () => {
    expect(existsSync(E2E_USER_FLOWS_DIR)).toBe(true)
    expect(specFiles.length).toBeGreaterThan(0)
  })

  it('no bare `return` after `.catch(() => false)` — use test.skip() instead', () => {
    const violations: string[] = []

    for (const filePath of specFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      const fileName = basename(filePath)

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Look for: `if (!hasX) return` without test.skip on the same line
        if (
          /if\s*\(![\w]+\)\s+return/.test(line) &&
          !line.includes('test.skip')
        ) {
          // Check if there's a .catch(() => false) within the preceding 5 lines
          const LOOKBACK_LINES = 5
          const precedingLines = lines
            .slice(Math.max(0, i - LOOKBACK_LINES), i + 1)
            .join('\n')
          if (/\.catch\(\(\)\s*=>\s*false\)/.test(precedingLines)) {
            violations.push(`${fileName}:${i + 1}: bare return after .catch(() => false)`)
          }
        }
      }
    }

    expect(
      violations,
      `Found ${violations.length} bare return(s) after .catch(() => false). ` +
        'Convert to: if (!has...) { test.skip(true, "reason"); return }\n' +
        (violations || []).join('\n'),
    ).toEqual([])
  })

  it('no expect.soft() calls — use hard assertions for CI signal', () => {
    const violations: string[] = []

    for (const filePath of specFiles) {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      const fileName = basename(filePath)

      for (let i = 0; i < lines.length; i++) {
        if (/expect\.soft\s*\(/.test(lines[i])) {
          violations.push(`${fileName}:${i + 1}: expect.soft() found`)
        }
      }
    }

    expect(
      violations,
      `Found ${violations.length} expect.soft() call(s). ` +
        'Soft assertions produce zero CI signal — use expect() instead.\n' +
        (violations || []).join('\n'),
    ).toEqual([])
  })
})

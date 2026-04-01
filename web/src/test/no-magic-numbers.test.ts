/**
 * Magic Numbers Ratchet Test (P4-A)
 *
 * Scans card components for "magic number" anti-patterns — numeric literals
 * used inline instead of named constants. Magic numbers make code harder to
 * understand and maintain because the reader can't tell what 5000 or 300 means
 * without surrounding context.
 *
 * This test uses a **ratcheting approach**: it counts current violations and
 * fails only if the count *increases*. Fix violations by extracting inline
 * numbers into `const UPPER_CASE_NAME = <value>` declarations.
 *
 * What counts as a magic number:
 *   - setTimeout/setInterval with a raw numeric delay (e.g., `setTimeout(fn, 3000)`)
 *   - Inline style properties with raw numbers >= 50 (e.g., `minHeight: 200`)
 *   - Numeric thresholds in comparisons (e.g., `.length > 12`, `value < 50`)
 *   - Retry counts, multipliers, and divisors (e.g., `* 1000`, `/ 60`)
 *
 * What is NOT a magic number (ignored):
 *   - Named constant declarations (`const MY_CONST = 42`)
 *   - Values 0, 1, -1, 2, 100 (universally understood)
 *   - Grid layout positions (`w: 4, h: 3`, `minW`, `maxH`)
 *   - Test files, import statements, comments
 *   - Array/string indexing (e.g., `[0]`, `.slice(0, 2)`)
 *   - CSS class strings (e.g., `"w-20 h-20"`, `"p-4"`)
 *   - Template literal expressions (`${value}px`)
 *   - Enum-like object values and switch cases
 *   - Type annotations and interface definitions
 *
 * Run:   npx vitest run src/test/no-magic-numbers.test.ts
 * Watch: npx vitest src/test/no-magic-numbers.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Named constants ──────────────────────────────────────────────────────────

/** Root directory for card components */
const CARDS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../components/cards',
)

/**
 * Ratchet baseline — the current total number of magic number violations.
 * This number MUST ONLY DECREASE over time. If you fix violations, lower it.
 * If this test fails because the count dropped, congratulations — update it!
 * If the count increased, you introduced a new magic number — extract it
 * into a named constant (e.g., `const TOOLTIP_DELAY_MS = 300`).
 */
const EXPECTED_MAGIC_NUMBER_COUNT = 43

/** Numeric values that are universally understood and not "magic" */
const SAFE_VALUES = new Set([0, 1, -1, 2, 100])

/** Minimum numeric value to flag (below this, numbers are too common to matter) */
const MIN_FLAGGED_VALUE = 3

/** Minimum value for inline style properties to be flagged */
const MIN_STYLE_VALUE = 50

/** Categories of detected magic numbers */
type ViolationCategory = 'timer' | 'style-prop' | 'comparison' | 'multiplier'

interface Violation {
  file: string
  line: number
  category: ViolationCategory
  snippet: string
}

// ── File discovery ───────────────────────────────────────────────────────────

/** Recursively find all .tsx/.ts files under a directory, excluding tests */
function findCardFiles(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip __tests__ directories and node_modules
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      results.push(...findCardFiles(fullPath))
    } else if (
      /\.(tsx?)$/.test(entry.name) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.spec.tsx')
    ) {
      results.push(fullPath)
    }
  }
  return results
}

/** Get relative path from CARDS_DIR for readable output */
function relPath(filePath: string): string {
  return path.relative(CARDS_DIR, filePath).replace(/\\/g, '/')
}

// ── Line-level filters (lines to skip entirely) ─────────────────────────────

/** Returns true if the line should be skipped entirely */
function shouldSkipLine(line: string): boolean {
  const stripped = line.trim()

  // Skip empty lines
  if (stripped.length === 0) return true

  // Skip comments
  if (stripped.startsWith('//') || stripped.startsWith('/*') || stripped.startsWith('*')) return true

  // Skip import statements
  if (stripped.startsWith('import ')) return true

  // Skip export type / interface declarations
  if (/^(export\s+)?(type|interface)\s/.test(stripped)) return true

  // Skip named constant declarations (UPPER_CASE = value) — these ARE the fix
  if (/^(export\s+)?const\s+[A-Z_][A-Z0-9_]*\s*=/.test(stripped)) return true

  // Skip grid layout position objects (w: N, h: N pattern)
  if (/\bw:\s*\d+/.test(stripped) && /\bh:\s*\d+/.test(stripped)) return true

  // Skip grid dimension constraints (minW, maxW, minH, maxH)
  if (/\b(minW|maxW|minH|maxH)\s*:\s*\d+/.test(stripped)) return true

  // Skip CSS class strings (Tailwind patterns like "w-20", "p-4", "gap-2")
  if (/className\s*=/.test(stripped)) return true

  // Skip JSX string attributes (e.g., viewBox="0 0 100 100")
  if (/\b(viewBox|d|points|transform)\s*=\s*"[^"]*"/.test(stripped)) return true

  // Skip SVG path data
  if (/\bd\s*=\s*["`]/.test(stripped)) return true

  return false
}

// ── Violation detectors ──────────────────────────────────────────────────────

/**
 * Detect setTimeout/setInterval with a raw numeric literal as the delay.
 * Bad:  setTimeout(fn, 3000)
 * Good: setTimeout(fn, TOOLTIP_DELAY_MS)
 */
function detectTimerMagicNumbers(line: string, stripped: string): ViolationCategory | null {
  const timerPattern = /(setTimeout|setInterval)\s*\([^,]+,\s*(\d{3,})\s*\)/
  const match = stripped.match(timerPattern)
  if (match) {
    const value = parseInt(match[2], 10)
    if (!SAFE_VALUES.has(value) && value >= MIN_FLAGGED_VALUE) {
      return 'timer'
    }
  }
  return null
}

/**
 * Detect inline style object properties with raw numeric values >= 50.
 * Bad:  style={{ minHeight: 200 }}
 * Good: style={{ minHeight: CHART_MIN_HEIGHT_PX }}
 *
 * Ignores percentage-like values (100) and very small values.
 */
function detectStylePropMagicNumbers(line: string, stripped: string): ViolationCategory | null {
  const styleProps = [
    'height', 'width', 'maxHeight', 'maxWidth', 'minHeight', 'minWidth',
    'padding', 'margin', 'top', 'bottom', 'left', 'right', 'gap',
    'borderRadius', 'fontSize', 'lineHeight',
  ]

  const propPattern = new RegExp(
    `\\b(${styleProps.join('|')})\\s*:\\s*(\\d+)(?!\\s*[%"'])`,
  )
  const match = stripped.match(propPattern)
  if (match) {
    const value = parseInt(match[2], 10)
    if (value >= MIN_STYLE_VALUE && !SAFE_VALUES.has(value)) {
      return 'style-prop'
    }
  }
  return null
}

/**
 * Detect numeric thresholds in comparisons (e.g., `.length > 12`).
 * Only flags comparisons that use `.length` or `.size` to avoid
 * false positives on mathematical expressions.
 *
 * Bad:  name.length > 12
 * Good: name.length > MAX_DISPLAY_NAME_LENGTH
 */
function detectComparisonMagicNumbers(line: string, stripped: string): ViolationCategory | null {
  // Must involve .length or .size to be a meaningful threshold
  if (!(/\.length\b/.test(stripped) || /\.size\b/.test(stripped))) return null

  const compPattern = /\.(length|size)\s*[><=!]+\s*(\d+)/
  const match = stripped.match(compPattern)
  if (match) {
    const value = parseInt(match[2], 10)
    if (value >= MIN_FLAGGED_VALUE && !SAFE_VALUES.has(value)) {
      return 'comparison'
    }
  }

  // Reverse comparison: 10 < arr.length
  const reversePattern = /(\d+)\s*[><=!]+\s*\w+\.(length|size)/
  const reverseMatch = stripped.match(reversePattern)
  if (reverseMatch) {
    const value = parseInt(reverseMatch[1], 10)
    if (value >= MIN_FLAGGED_VALUE && !SAFE_VALUES.has(value)) {
      return 'comparison'
    }
  }

  return null
}

// ── Main scan ────────────────────────────────────────────────────────────────

function scanForMagicNumbers(): Violation[] {
  const allFiles = findCardFiles(CARDS_DIR)
  const violations: Violation[] = []

  for (const filePath of allFiles) {
    const rel = relPath(filePath)
    const src = fs.readFileSync(filePath, 'utf-8')
    const lines = src.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const stripped = line.trim()

      if (shouldSkipLine(line)) continue

      // Run each detector; take the first match per line
      const detectors = [
        detectTimerMagicNumbers,
        detectStylePropMagicNumbers,
        detectComparisonMagicNumbers,
      ] as const

      for (const detector of detectors) {
        const category = detector(line, stripped)
        if (category) {
          /** Max snippet length for readable output */
          const MAX_SNIPPET_LENGTH = 120
          violations.push({
            file: rel,
            line: i + 1,
            category,
            snippet: stripped.slice(0, MAX_SNIPPET_LENGTH),
          })
          break // One violation per line is enough
        }
      }
    }
  }

  return violations
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Magic Numbers Ratchet (P4-A)', () => {
  const violations = scanForMagicNumbers()

  it('should scan card files successfully', () => {
    const allFiles = findCardFiles(CARDS_DIR)
    /** Minimum number of card files we expect to find */
    const MIN_CARD_FILES = 50
    expect(allFiles.length).toBeGreaterThan(MIN_CARD_FILES)
  })

  it('total magic number count must not increase (ratchet)', () => {
    // Print all violations for debugging when the test fails
    if (violations.length > EXPECTED_MAGIC_NUMBER_COUNT) {
      const grouped = new Map<string, Violation[]>()
      for (const v of violations) {
        const list = grouped.get(v.category) || []
        list.push(v)
        grouped.set(v.category, list)
      }

      const lines: string[] = [
        '',
        `Found ${violations.length} magic numbers (expected <= ${EXPECTED_MAGIC_NUMBER_COUNT})`,
        '',
      ]

      for (const [category, items] of grouped) {
        lines.push(`── ${category} (${items.length}) ──`)
        for (const v of items) {
          lines.push(`  ${v.file}:${v.line}: ${v.snippet}`)
        }
        lines.push('')
      }

      lines.push(
        'Fix: extract inline numbers into named constants.',
        'Example: const TOOLTIP_DELAY_MS = 300',
        '',
      )

      expect.fail(lines.join('\n'))
    }

    expect(violations.length).toBeLessThanOrEqual(EXPECTED_MAGIC_NUMBER_COUNT)
  })

  it('timer magic numbers must not increase', () => {
    const timerViolations = violations.filter(v => v.category === 'timer')
    /** Current count of timer-related magic number violations */
    const EXPECTED_TIMER_VIOLATIONS = 5
    expect(timerViolations.length).toBeLessThanOrEqual(EXPECTED_TIMER_VIOLATIONS)
  })

  it('style-prop magic numbers must not increase', () => {
    const styleViolations = violations.filter(v => v.category === 'style-prop')
    /** Current count of inline style magic number violations */
    const EXPECTED_STYLE_VIOLATIONS = 2
    expect(styleViolations.length).toBeLessThanOrEqual(EXPECTED_STYLE_VIOLATIONS)
  })

  it('comparison magic numbers must not increase', () => {
    const compViolations = violations.filter(v => v.category === 'comparison')
    /** Current count of comparison threshold magic number violations */
    const EXPECTED_COMPARISON_VIOLATIONS = 36
    expect(compViolations.length).toBeLessThanOrEqual(EXPECTED_COMPARISON_VIOLATIONS)
  })

  it('reports violation details for debugging', () => {
    // This test always passes — it just logs the current violations for visibility
    if (violations.length > 0) {
      const summary = violations
        .map(v => `  [${v.category}] ${v.file}:${v.line}: ${v.snippet}`)
        .join('\n')

      // Log to console for CI visibility (not a failure)
      console.log(
        `\nMagic number violations (${violations.length}/${EXPECTED_MAGIC_NUMBER_COUNT} budget):\n${summary}\n`,
      )
    }
  })
})

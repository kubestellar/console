/**
 * Tailwind Spacing Standardization Ratchet
 *
 * Scans component and page source for arbitrary pixel-based Tailwind spacing
 * utilities such as `mt-[5px]` or `left-[7px]`. These should generally use the
 * standard Tailwind spacing scale instead (`mt-1`, `left-2`, etc.) so spacing
 * stays consistent across the UI.
 *
 * This test uses a ratcheting approach: the count must never increase. If you
 * fix violations, lower the expected count.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_ROOTS = [
  resolve(SRC_DIR, 'components'),
  resolve(SRC_DIR, 'pages'),
]

// Current baseline for arbitrary pixel-based spacing utilities.
// This budget MUST only shrink over time.
const EXPECTED_ARBITRARY_SPACING_COUNT = 12

const MIN_EXPECTED_SOURCE_FILES = 100
const MAX_SNIPPET_LENGTH = 140

const SPACING_UTILITY_PATTERN = /(?<![\w-])(?<utility>-?(?:m|mx|my|mt|mr|mb|ml|ms|me|p|px|py|pt|pr|pb|pl|ps|pe|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left))-\[(?<value>-?\d+(?:\.\d+)?)px\]/g

interface Violation {
  file: string
  line: number
  utility: string
  value: string
  snippet: string
}

function findSourceFiles(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      results.push(...findSourceFiles(fullPath))
      continue
    }

    if (
      /\.(tsx?|jsx?)$/.test(entry.name) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.spec.tsx') &&
      !entry.name.endsWith('.stories.ts') &&
      !entry.name.endsWith('.stories.tsx')
    ) {
      results.push(fullPath)
    }
  }

  return results
}

function relPath(filePath: string): string {
  return relative(SRC_DIR, filePath).replace(/\\/g, '/')
}

function shouldSkipLine(line: string): boolean {
  const stripped = line.trim()

  if (stripped.length === 0) return true
  if (stripped.startsWith('//') || stripped.startsWith('/*') || stripped.startsWith('*') || stripped.startsWith('{/*')) return true
  if (stripped.startsWith('import ')) return true
  if (stripped.startsWith('export type ') || stripped.startsWith('type ') || stripped.startsWith('interface ') || stripped.startsWith('export interface ')) return true

  return false
}

function scanForArbitrarySpacingUtilities(): Violation[] {
  const files = SOURCE_ROOTS.flatMap(findSourceFiles)
  const violations: Violation[] = []

  for (const filePath of files) {
    const lines = readFileSync(filePath, 'utf-8').split('\n')

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (shouldSkipLine(line)) continue

      SPACING_UTILITY_PATTERN.lastIndex = 0
      const matches = line.matchAll(SPACING_UTILITY_PATTERN)
      for (const match of matches) {
        const utility = match.groups?.utility
        const value = match.groups?.value
        if (!utility || !value) continue

        violations.push({
          file: relPath(filePath),
          line: index + 1,
          utility,
          value,
          snippet: line.trim().slice(0, MAX_SNIPPET_LENGTH),
        })
      }
    }
  }

  return violations
}

describe('Tailwind spacing standardization ratchet', () => {
  const sourceFiles = SOURCE_ROOTS.flatMap(findSourceFiles)
  const violations = scanForArbitrarySpacingUtilities()

  it('scans a non-trivial set of component and page files', () => {
    expect(sourceFiles.length).toBeGreaterThan(MIN_EXPECTED_SOURCE_FILES)
  })

  it('arbitrary pixel-based spacing utilities must not increase', () => {
    if (violations.length > EXPECTED_ARBITRARY_SPACING_COUNT) {
      const lines: string[] = [
        '',
        `Found ${violations.length} arbitrary pixel-based Tailwind spacing utilities (expected <= ${EXPECTED_ARBITRARY_SPACING_COUNT}).`,
        '',
      ]

      for (const violation of violations) {
        lines.push(`  ${violation.file}:${violation.line} [${violation.utility}-[${violation.value}px]] ${violation.snippet}`)
      }

      lines.push(
        '',
        'Prefer the standard Tailwind spacing scale instead of arbitrary pixel values when an equivalent exists.',
        'Examples: mt-[5px] -> mt-1, left-[7px] -> left-2, px-[5px] -> px-1.5',
        '',
      )

      expect.fail(lines.join('\n'))
    }

    expect(violations.length).toBeLessThanOrEqual(EXPECTED_ARBITRARY_SPACING_COUNT)
  })

  it('reports violation details for debugging', () => {
    expect(violations).toBeDefined()
  })
})

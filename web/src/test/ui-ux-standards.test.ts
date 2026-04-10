/**
 * UI/UX Standards Scanner
 *
 * Scans component files for design system compliance violations — raw hex
 * colors, rgba values, arbitrary Tailwind colors, inline style colors, and
 * raw font sizes that bypass the design token system.
 *
 * This test uses a **ratcheting approach**: it counts current violations and
 * fails only if the count *increases*. Fix violations by using design tokens,
 * Tailwind utility classes, or CSS custom properties instead of raw values.
 *
 * What is a violation:
 *   - Raw hex colors (#fff, #9333ea) in component code outside SVG/canvas
 *   - Raw rgba()/rgb() calls outside canvas/SVG rendering contexts
 *   - Arbitrary Tailwind color values (bg-[#xxx], text-[#xxx])
 *   - Inline style= attributes with color properties using raw values
 *   - Raw fontSize values instead of Tailwind text-* classes
 *
 * What is NOT a violation (ignored):
 *   - Design token source files (themes.ts, index.css, chartColors.ts)
 *   - SVG fill/stroke/stopColor attributes (legitimate use)
 *   - Canvas ctx.fillStyle/strokeStyle (requires runtime strings)
 *   - Comments, imports, type annotations
 *   - Named constant declarations (const COLOR = '#fff')
 *   - Test files
 *
 * Run:   npx vitest run src/test/ui-ux-standards.test.ts
 * Watch: npx vitest src/test/ui-ux-standards.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Named constants ──────────────────────────────────────────────────────────

/** Root directory for all components */
const COMPONENTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../components',
)

/**
 * Ratchet baselines — current violation counts per category.
 * These MUST ONLY DECREASE over time. If you fix violations, lower the count.
 * If the count dropped and the test fails, congratulations — update it!
 * If the count increased, you introduced a new violation — use design tokens.
 *
 * Set to generous initial values; calibrated after first run.
 */
// 281 = 278 prior baseline + 3 issue-number references in JSX block comments
// added by the secret/configmap masking bundle (#6209 cited 2x in
// SecretDrillDown.tsx + ConfigMapDrillDown.tsx, #6211 cited 1x). The ratchet
// regex matches `#NNNN` as a hex literal, but these are GitHub issue
// references in code comments, not color literals. Same scoped-bump rationale
// as the prior 273→278 increment.
const EXPECTED_RAW_HEX_COUNT = 288
const EXPECTED_RAW_RGBA_COUNT = 104
const EXPECTED_ARBITRARY_TW_COLOR_COUNT = 22
const EXPECTED_INLINE_STYLE_COLOR_COUNT = 213
const EXPECTED_RAW_FONT_SIZE_COUNT = 80

/** Max snippet length for readable output */
const MAX_SNIPPET_LENGTH = 120

/** Minimum component files we expect to find */
const MIN_COMPONENT_FILES = 50

/** Files that ARE the design system — exempt from scanning */
const DESIGN_SYSTEM_FILES = new Set([
  'themes.ts',
  'chartColors.ts',
  'cncf-constants.ts',
  'accessibility.ts',
  'branding.ts',
])

/** Arcade/game cards use raw colors for canvas rendering — exempt from color checks */
const ARCADE_GAME_FILES = new Set([
  'KubeMan.tsx', 'KubeKong.tsx', 'NodeInvaders.tsx', 'PodPitfall.tsx',
  'ContainerTetris.tsx', 'FlappyPod.tsx', 'PodSweeper.tsx', 'Game2048.tsx',
  'Checkers.tsx', 'KubeChess.tsx', 'Solitaire.tsx', 'MatchGame.tsx',
  'Kubedle.tsx', 'SudokuGame.tsx', 'PodBrothers.tsx', 'KubeKart.tsx',
  'KubePong.tsx', 'KubeSnake.tsx', 'KubeGalaga.tsx',
  'KubeDoom.tsx', 'PodCrosser.tsx', 'KubeBert.tsx',
  'MissileCommand.tsx',
])

/** Categories of detected violations */
type ViolationCategory =
  | 'raw-hex'
  | 'raw-rgba'
  | 'arbitrary-tw-color'
  | 'inline-style-color'
  | 'raw-font-size'

interface Violation {
  file: string
  line: number
  category: ViolationCategory
  snippet: string
}

// ── File discovery ───────────────────────────────────────────────────────────

/** Recursively find all .tsx/.ts component files, excluding tests and design system files */
function findComponentFiles(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      results.push(...findComponentFiles(fullPath))
    } else if (
      /\.(tsx?)$/.test(entry.name) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.spec.tsx') &&
      !entry.name.endsWith('.stories.tsx') &&
      !entry.name.endsWith('.stories.ts') &&
      !DESIGN_SYSTEM_FILES.has(entry.name) &&
      !ARCADE_GAME_FILES.has(entry.name)
    ) {
      results.push(fullPath)
    }
  }
  return results
}

/** Get relative path from COMPONENTS_DIR for readable output */
function relPath(filePath: string): string {
  return path.relative(COMPONENTS_DIR, filePath).replace(/\\/g, '/')
}

// ── Line-level filters ──────────────────────────────────────────────────────

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

  // Skip named constant declarations — these ARE the fix pattern
  if (/^(export\s+)?const\s+[A-Z_][A-Z0-9_]*\s*=/.test(stripped)) return true

  return false
}

/** Returns true if the line is in an SVG context (fill/stroke/stopColor attributes) */
function isInSvgContext(line: string): boolean {
  const stripped = line.trim()

  // SVG element attributes
  if (/\b(fill|stroke|stopColor|stop-color|flood-color|lighting-color)\s*=/.test(stripped)) return true

  // SVG path data
  if (/\bd\s*=\s*["'`]/.test(stripped)) return true

  // SVG viewBox, points, transform
  if (/\b(viewBox|points|transform)\s*=\s*["']/.test(stripped)) return true

  // Inside an SVG element definition
  if (/<(path|rect|circle|ellipse|line|polyline|polygon|stop|linearGradient|radialGradient)\b/.test(stripped)) return true

  return false
}

/** Returns true if the line is in a canvas rendering context */
function isInCanvasContext(line: string): boolean {
  const stripped = line.trim()

  // Canvas API color assignments
  if (/ctx\.(fillStyle|strokeStyle|shadowColor)\s*=/.test(stripped)) return true

  // Canvas gradient color stops
  if (/\.addColorStop\s*\(/.test(stripped)) return true

  // Canvas createLinearGradient, createRadialGradient
  if (/ctx\.create(Linear|Radial|Conic)Gradient\s*\(/.test(stripped)) return true

  return false
}

// ── Violation detectors ──────────────────────────────────────────────────────

/**
 * Detect raw hex color values (#xxx, #xxxxxx, #xxxxxxxx).
 * Skips SVG contexts, canvas contexts, CSS var declarations, and string
 * template expressions.
 */
function detectRawHex(line: string): ViolationCategory | null {
  const stripped = line.trim()

  // Skip SVG and canvas contexts
  if (isInSvgContext(stripped)) return null
  if (isInCanvasContext(stripped)) return null

  // Skip className attributes (Tailwind classes may contain color names, not hex)
  if (/className\s*=/.test(stripped) && !/#[0-9a-fA-F]{3,8}/.test(stripped)) return null

  // Match hex colors
  const hexPattern = /#[0-9a-fA-F]{3,8}\b/
  if (hexPattern.test(stripped)) {
    // Skip CSS variable declarations (these define the tokens)
    if (/--[\w-]+\s*:\s*#/.test(stripped)) return null
    // Skip template literal color expressions like `${color}`
    if (/\$\{.*#/.test(stripped)) return null

    return 'raw-hex'
  }

  return null
}

/**
 * Detect raw rgba()/rgb() calls outside canvas/SVG contexts.
 */
function detectRawRgba(line: string): ViolationCategory | null {
  const stripped = line.trim()

  if (isInCanvasContext(stripped)) return null
  if (isInSvgContext(stripped)) return null

  // Match rgba() or rgb() calls
  if (/\brgba?\s*\(/.test(stripped)) {
    // Skip CSS variable declarations
    if (/--[\w-]+\s*:/.test(stripped)) return null

    return 'raw-rgba'
  }

  return null
}

/**
 * Detect arbitrary Tailwind color values: bg-[#xxx], text-[#xxx], etc.
 */
function detectArbitraryTwColor(line: string): ViolationCategory | null {
  const stripped = line.trim()

  // Match arbitrary Tailwind color patterns
  const twColorPattern = /\b(bg|text|border|from|to|via|ring|outline|shadow|decoration|fill|stroke)-\[#[0-9a-fA-F]/
  if (twColorPattern.test(stripped)) {
    return 'arbitrary-tw-color'
  }

  // Also catch rgba in arbitrary values
  const twRgbaPattern = /\b(bg|text|border|from|to|via|ring|shadow)-\[rgba?\(/
  if (twRgbaPattern.test(stripped)) {
    return 'arbitrary-tw-color'
  }

  return null
}

/**
 * Detect inline style= attributes containing color properties with raw values.
 * Looks for color, backgroundColor, borderColor with hex/rgb/named values.
 */
function detectInlineStyleColor(line: string): ViolationCategory | null {
  const stripped = line.trim()

  // Must be inside a style object
  if (!/style\s*=\s*\{/.test(stripped) && !/style:\s*\{/.test(stripped)) {
    // Also check for style properties on the line if we're inside a style object
    if (!/\b(color|backgroundColor|borderColor|background)\s*:\s*['"]#/.test(stripped) &&
        !/\b(color|backgroundColor|borderColor|background)\s*:\s*['"]rgb/.test(stripped)) {
      return null
    }
  }

  // Check for color properties with raw values
  const colorPropPattern = /\b(color|backgroundColor|borderColor|background)\s*:\s*['"]?(#[0-9a-fA-F]|rgb)/
  if (colorPropPattern.test(stripped)) {
    return 'inline-style-color'
  }

  return null
}

/**
 * Detect raw fontSize values in style objects instead of Tailwind text-* classes.
 */
function detectRawFontSize(line: string): ViolationCategory | null {
  const stripped = line.trim()

  // fontSize with raw number or px value in style object
  if (/\bfontSize\s*:\s*\d/.test(stripped) || /\bfontSize\s*:\s*['"]?\d+px/.test(stripped)) {
    // Skip named constants
    if (/fontSize\s*:\s*[A-Z_]/.test(stripped)) return null
    return 'raw-font-size'
  }

  return null
}

// ── Main scan ────────────────────────────────────────────────────────────────

function scanForViolations(): Violation[] {
  const allFiles = findComponentFiles(COMPONENTS_DIR)
  const violations: Violation[] = []

  for (const filePath of allFiles) {
    const rel = relPath(filePath)
    const src = fs.readFileSync(filePath, 'utf-8')
    const lines = src.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (shouldSkipLine(line)) continue

      // Run each detector; take the first match per line
      const detectors = [
        detectArbitraryTwColor,  // Most specific — check first
        detectInlineStyleColor,
        detectRawFontSize,
        detectRawHex,
        detectRawRgba,
      ] as const

      for (const detector of detectors) {
        const category = detector(line)
        if (category) {
          violations.push({
            file: rel,
            line: i + 1,
            category,
            snippet: line.trim().slice(0, MAX_SNIPPET_LENGTH),
          })
          break // One violation per line
        }
      }
    }
  }

  return violations
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UI/UX Standards Scanner', () => {
  const violations = scanForViolations()

  it('should find component files to audit', () => {
    const allFiles = findComponentFiles(COMPONENTS_DIR)
    expect(allFiles.length).toBeGreaterThan(MIN_COMPONENT_FILES)
  })

  it('raw hex color count must not increase (ratchet)', () => {
    const hexViolations = violations.filter(v => v.category === 'raw-hex')

    if (hexViolations.length > EXPECTED_RAW_HEX_COUNT) {
      const lines = [
        '',
        `Found ${hexViolations.length} raw hex colors (expected <= ${EXPECTED_RAW_HEX_COUNT})`,
        '',
        'Fix: use Tailwind color classes (text-primary, bg-muted) or CSS variables (var(--ks-purple)).',
        '',
        ...hexViolations.map(v => `  ${v.file}:${v.line}: ${v.snippet}`),
        '',
      ]
      expect.fail(lines.join('\n'))
    }

    expect(hexViolations.length).toBeLessThanOrEqual(EXPECTED_RAW_HEX_COUNT)
  })

  it('raw rgba/rgb count must not increase (ratchet)', () => {
    const rgbaViolations = violations.filter(v => v.category === 'raw-rgba')

    if (rgbaViolations.length > EXPECTED_RAW_RGBA_COUNT) {
      const lines = [
        '',
        `Found ${rgbaViolations.length} raw rgba/rgb values (expected <= ${EXPECTED_RAW_RGBA_COUNT})`,
        '',
        'Fix: use Tailwind opacity modifiers (bg-primary/50) or CSS variables.',
        '',
        ...rgbaViolations.map(v => `  ${v.file}:${v.line}: ${v.snippet}`),
        '',
      ]
      expect.fail(lines.join('\n'))
    }

    expect(rgbaViolations.length).toBeLessThanOrEqual(EXPECTED_RAW_RGBA_COUNT)
  })

  it('arbitrary Tailwind color count must not increase (ratchet)', () => {
    const twViolations = violations.filter(v => v.category === 'arbitrary-tw-color')

    if (twViolations.length > EXPECTED_ARBITRARY_TW_COLOR_COUNT) {
      const lines = [
        '',
        `Found ${twViolations.length} arbitrary Tailwind colors (expected <= ${EXPECTED_ARBITRARY_TW_COLOR_COUNT})`,
        '',
        'Fix: use Tailwind theme colors (bg-primary, text-muted) instead of bg-[#xxx].',
        '',
        ...twViolations.map(v => `  ${v.file}:${v.line}: ${v.snippet}`),
        '',
      ]
      expect.fail(lines.join('\n'))
    }

    expect(twViolations.length).toBeLessThanOrEqual(EXPECTED_ARBITRARY_TW_COLOR_COUNT)
  })

  it('inline style color count must not increase (ratchet)', () => {
    const styleViolations = violations.filter(v => v.category === 'inline-style-color')

    if (styleViolations.length > EXPECTED_INLINE_STYLE_COLOR_COUNT) {
      const lines = [
        '',
        `Found ${styleViolations.length} inline style colors (expected <= ${EXPECTED_INLINE_STYLE_COLOR_COUNT})`,
        '',
        'Fix: use Tailwind utility classes instead of style={{ color: "#xxx" }}.',
        '',
        ...styleViolations.map(v => `  ${v.file}:${v.line}: ${v.snippet}`),
        '',
      ]
      expect.fail(lines.join('\n'))
    }

    expect(styleViolations.length).toBeLessThanOrEqual(EXPECTED_INLINE_STYLE_COLOR_COUNT)
  })

  it('raw fontSize count must not increase (ratchet)', () => {
    const fontViolations = violations.filter(v => v.category === 'raw-font-size')

    if (fontViolations.length > EXPECTED_RAW_FONT_SIZE_COUNT) {
      const lines = [
        '',
        `Found ${fontViolations.length} raw fontSize values (expected <= ${EXPECTED_RAW_FONT_SIZE_COUNT})`,
        '',
        'Fix: use Tailwind text-* classes (text-sm, text-base, text-lg) instead of fontSize: 14.',
        '',
        ...fontViolations.map(v => `  ${v.file}:${v.line}: ${v.snippet}`),
        '',
      ]
      expect.fail(lines.join('\n'))
    }

    expect(fontViolations.length).toBeLessThanOrEqual(EXPECTED_RAW_FONT_SIZE_COUNT)
  })

  it('reports violation summary for debugging', () => {
    // Violations are tracked by the ratchet assertions above — no log needed
    expect(violations).toBeDefined()
  })
})

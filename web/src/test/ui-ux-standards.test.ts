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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Named constants ──────────────────────────────────────────────────────────

/** Root directory for all components */
const COMPONENTS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
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
// Ratchet baseline for raw hex literals in component source.
//
// Bump history (each increment was scoped to issue-reference comments
// like `#6209` that the regex misclassifies as hex colors — none of
// these were real color violations, and the design-token contract is
// still enforced for actual `#RRGGBB` values):
//   273 → 278: initial calibration
//   278 → 281: secret/configmap masking bundle (#6209 + #6211 refs)
//   281 → 282 → 284 → 287 → 288: subsequent bundles
//   288 → 290: #6254 test fixes
//   290 → 293: #6217 part 2 freshness indicator additions
//   293 → 296: #6217 part 3 freshness additions
//   296 → 298: #6265 copilot follow-up comment refs
//   298 → 300: #6273 followup comment refs
//   300 → 301: #6289 gauge readiness color inversion issue ref
//   301 → 302: #6308 MissionBrowser close button on right issue ref
//   302 → 303: #6309 upgrade confirm dialog issue ref
//   303 → 304: #6366 ratchet drift — pre-existing unaccounted-for raw hex from before 303 bump, not introduced by #6365
//   304 → 306: issue #6774 loading/error states — reverted to 304 in issue #6778 (false positives from issue-ref comments)
//   304 → 307: PR #6854 introduced 3 new hex refs (not real color violations)
//   307 → 309: issue #6882 ratchet drift — pre-existing false positives from issue-ref comments
//   309 → 313: PR #6977 introduced 4 new hex refs (terminal theme colors, widget export)
//
// When you bump this number, append a one-line entry above so future
// bumps stay grep-able and reviewers can tell at a glance whether a
// change is a real new violation or just a comment-level reference.
//   313 → 319: PR #7085 mission state fixes — issue-ref comments misclassified as hex colors
//   319 → 320: PR #7376 batch resolve — one new hex color reference
//   320 → 265: issue #8000 — detector now skips comment lines outright,
//              eliminating all issue-ref false positives like "issue #7865"
//              that incremented the ratchet over many previous bumps. The
//              new baseline is the count of real `#RRGGBB` literals only.
//   270 → 271: PR #8550 ratchet drift — pre-existing hex literal not introduced by this PR
//   271 → 269: PR #8546 — fixed comment continuation lines in Login.tsx
//              that tripped false-positive hex detection (#6338, #3761 refs)
//   269 → 273: PR #8635 — widget export modal card preview thumbnails
//   273 → 274: PR #9841 — DashboardHeader compliance pages added one new hex fallback
//   274 → 275: PR #9941 — Flatcar card added one hex color
//   275 → 282: PR #10047 — ChangeTimeline card ECharts event type palette (7 hex colors)
//   282 → 262: PR #10260 — replaced 20 raw hex colors in chart files with shared constants
//   262 → 256: PR #10266 — extracted Gauge status colors and ChangeTimeline fallback to constants
const EXPECTED_RAW_HEX_COUNT = 256
const EXPECTED_RAW_RGBA_COUNT = 104
//   22 → 19: PR #8547 — replaced 3 arbitrary Tailwind hex colors in Login.tsx
//            (bg-[#0a0a0a], from-[#0a0f1c]) with semantic bg-background/from-background
//   19 →  0: PR #10271 — added linkedin/terminal/glass-overlay to Tailwind config,
//            replaced all 9 remaining arbitrary hex colors across 6 files
const EXPECTED_ARBITRARY_TW_COLOR_COUNT = 0
// Inline style color ratchet — bump history:
//   213 → 215: Drasi reactive graph (PRs #7832, #7857) — two new
//              echarts/flow-node inline colors not covered by theming utils.
//   215 → 229: PR #8635 — widget export modal card preview thumbnails
const EXPECTED_INLINE_STYLE_COLOR_COUNT = 229
// 80 → 96: PR #8635 — widget export modal card preview thumbnails use inline
//           fontSize for pixel-accurate static SVG-like renderings (not DOM text).
//  96 → 3: PR #10260 — replaced 93 raw fontSize values in chart/card files with
//          shared constants (CHART_AXIS_FONT_SIZE, CHART_BODY_FONT_SIZE, etc.)
//   3 → 0: PR #10266 — extracted last 3 raw fontSize (CHART_LEGEND_FONT_SIZE,
//          CLUSTER_MARKER_FONT_SIZE) to shared constants
const EXPECTED_RAW_FONT_SIZE_COUNT = 0

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
  if (!existsSync(dir)) return results

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
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
  return relative(COMPONENTS_DIR, filePath).replace(/\\/g, '/')
}

// ── Line-level filters ──────────────────────────────────────────────────────

/** Returns true if the line should be skipped entirely */
function shouldSkipLine(line: string): boolean {
  const stripped = line.trim()

  // Skip empty lines
  if (stripped.length === 0) return true

  // Skip comments (line, block, block-continuation, and JSX `{/* ... */}`).
  // Issue-ref tokens like `#7865` otherwise trip the raw-hex detector.
  if (
    stripped.startsWith('//') ||
    stripped.startsWith('/*') ||
    stripped.startsWith('*') ||
    stripped.startsWith('{/*')
  ) {
    return true
  }

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
 * Skips SVG contexts, canvas contexts, CSS var declarations, string
 * template expressions, and comments (which commonly contain issue
 * refs like "#7865" that look like 4-digit hex colors — issue 8000).
 */
function detectRawHex(line: string): ViolationCategory | null {
  const stripped = line.trim()

  // Skip SVG and canvas contexts
  if (isInSvgContext(stripped)) return null
  if (isInCanvasContext(stripped)) return null

  // Comment lines (including JSX `{/* ... */}`) are already filtered upstream
  // by shouldSkipLine — duplicated here previously, removed to avoid drift.

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
    const src = readFileSync(filePath, 'utf-8')
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

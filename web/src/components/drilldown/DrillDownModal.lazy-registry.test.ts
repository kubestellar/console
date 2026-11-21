/**
 * Lazy-registry integrity test for DrillDownModal.views.tsx (#24983).
 *
 * DrillDownModal.views.tsx lazy-loads every drill-down view with
 * `safeLazy(() => import('./views/X'), 'X')`. DrillDownModal.views.test.tsx
 * mocks safeLazy and asserts routing via a `view-<exportName>` marker, so the
 * invariant is: **every lazy entry must use a real named export whose name
 * matches the component const name**. The service view previously used
 * `'default'` (its module only had a default export), which rendered
 * `view-default` instead of `view-ServiceDrillDown` and failed the nightly
 * unit-test suite every run since #24972.
 *
 * This file statically verifies the registry so the same class of regression
 * (a default-export view wired into the routing table) fails fast in CI
 * instead of only surfacing through the mocked render test.
 *
 * Run:   npx vitest run src/components/drilldown/DrillDownModal.lazy-registry.test.ts
 * Watch: npx vitest src/components/drilldown/DrillDownModal.lazy-registry.test.ts
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Named constants ────────────────────────────────────────────────────────
const HERE = dirname(fileURLToPath(import.meta.url))
const VIEWS_FILE = join(HERE, 'DrillDownModal.views.tsx')
/** Minimum number of lazy view entries — guards against accidental deletion */
const MIN_LAZY_VIEWS = 25
/** Extensions probed when resolving a bare import path to a real file */
const MODULE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const

// ── Types & helpers ────────────────────────────────────────────────────────
interface LazyEntry {
  /** const name in DrillDownModal.views.tsx, e.g. ServiceDrillDown */
  component: string
  /** import specifier, e.g. ./views/ServiceDrillDown */
  modulePath: string
  /** export name passed to safeLazy, e.g. 'ServiceDrillDown' */
  exportName: string
}

/**
 * Extracts every `const Name = safeLazy(() => import('path'), 'export')`
 * entry from the views source.
 */
function extractLazyEntries(source: string): LazyEntry[] {
  const entries: LazyEntry[] = []
  const re =
    /const\s+(\w+)\s*=\s*safeLazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)\s*,\s*'([^']+)'\s*\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    entries.push({ component: match[1], modulePath: match[2], exportName: match[3] })
  }
  return entries
}

/** Resolves an import specifier (relative to the views file) to an existing file. */
function resolveModuleFile(viewsFile: string, modulePath: string): string | null {
  const base = resolve(dirname(viewsFile), modulePath)
  for (const ext of MODULE_EXTENSIONS) {
    if (existsSync(`${base}${ext}`)) return `${base}${ext}`
  }
  for (const ext of MODULE_EXTENSIONS) {
    const indexFile = join(base, `index${ext}`)
    if (existsSync(indexFile)) return indexFile
  }
  return null
}

/**
 * Builds a regex matching a *real named* export of `name` in a module.
 * `export default X` is deliberately NOT accepted — it does not create a
 * named export, which is exactly the #24983 failure mode.
 */
function namedExportRegex(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `export\\s+(?:async\\s+)?(?:function|const|class|let|var)\\s+${escaped}\\b` +
      `|export\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`,
  )
}

// ── Fixtures ───────────────────────────────────────────────────────────────
const viewsSource = readFileSync(VIEWS_FILE, 'utf-8')
const lazyEntries = extractLazyEntries(viewsSource)

describe('DrillDownModal lazy registry (DrillDownModal.views.tsx)', () => {
  it(`registers at least ${MIN_LAZY_VIEWS} lazy views`, () => {
    expect(
      lazyEntries.length,
      `expected >= ${MIN_LAZY_VIEWS} safeLazy entries in DrillDownModal.views.tsx, found ${lazyEntries.length}`,
    ).toBeGreaterThanOrEqual(MIN_LAZY_VIEWS)
  })

  it('never lazy-loads a view through the "default" export (#24983)', () => {
    const defaultEntries = lazyEntries.filter((e) => e.exportName === 'default')
    expect(
      defaultEntries,
      'safeLazy entries using \'default\' break the view-<name> routing markers ' +
        '(see DrillDownModal.views.test.tsx). Give the module a named export and ' +
        `reference it by name instead:\n${defaultEntries
          .map((e) => `  - ${e.component} → ${e.modulePath} ('default')`)
          .join('\n')}`,
    ).toHaveLength(0)
  })

  it('uses the component name as the safeLazy export name for every view', () => {
    const mismatched = lazyEntries.filter((e) => e.exportName !== e.component)
    expect(
      mismatched,
      'export name should match the const name so routing markers line up:\n' +
        mismatched.map((e) => `  - ${e.component} → '${e.exportName}'`).join('\n'),
    ).toHaveLength(0)
  })

  it('references only module files that exist', () => {
    const missing = lazyEntries
      .filter((e) => resolveModuleFile(VIEWS_FILE, e.modulePath) === null)
      .map((e) => `${e.component} → ${e.modulePath}`)
    expect(missing, `safeLazy imports reference missing files:\n${missing.join('\n')}`).toHaveLength(0)
  })

  it('every referenced module exposes the named export used in safeLazy', () => {
    const mismatches: string[] = []
    for (const entry of lazyEntries) {
      const file = resolveModuleFile(VIEWS_FILE, entry.modulePath)
      if (!file) continue // covered by the existence test above
      const content = readFileSync(file, 'utf-8')
      if (!namedExportRegex(entry.exportName).test(content)) {
        mismatches.push(`${entry.exportName} not a named export of ${entry.modulePath}`)
      }
    }
    expect(
      mismatches,
      `safeLazy export names missing from target modules:\n${mismatches.join('\n')}`,
    ).toHaveLength(0)
  })

  it('ServiceDrillDown module exposes both a named export and a default alias (#24983)', async () => {
    const mod = await import('./views/ServiceDrillDown')
    expect(typeof mod.ServiceDrillDown, 'ServiceDrillDown should be a named export').toBe('function')
    expect(mod.default, 'default export should alias the named export').toBe(mod.ServiceDrillDown)
  })
})

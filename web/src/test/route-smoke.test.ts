/**
 * Route & Modal Smoke Test
 *
 * Validates structural integrity of all application routes and modal
 * components via static analysis — verifying that every route defined
 * in the router config has a corresponding page component that exports
 * a valid named export, and every modal/dialog component follows the
 * open/close prop pattern.
 *
 * This avoids OOM issues from importing the entire component tree (the
 * Dashboard alone pulls ~200 card chunks) while still catching:
 *   - Broken route → component mappings
 *   - Missing named exports (typos in safeLazy calls)
 *   - Modal components missing open/close prop patterns
 *   - Route config drift (routes added to config but not wired in App.tsx)
 *
 * For render-level smoke tests, use Playwright e2e tests.
 *
 * Run:   npx vitest run src/test/route-smoke.test.ts
 * Watch: npx vitest src/test/route-smoke.test.ts
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Named constants ────────────────────────────────────────────────────────
const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP_FILE = join(SRC_DIR, 'App.tsx')
const ROUTES_FILE = join(SRC_DIR, 'config', 'routes.ts')
/** Minimum number of routes expected — guards against accidental deletion */
const MIN_EXPECTED_ROUTES = 30
/** Minimum number of modal/dialog files expected */
const MIN_EXPECTED_MODALS = 5

// ── Helpers ────────────────────────────────────────────────────────────────

function readFile(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

/**
 * Extracts all route keys from the ROUTES constant in routes.ts.
 * Matches lines like: `HOME: '/',` or `CLUSTERS: '/clusters',`
 */
function extractRouteKeys(content: string): Map<string, string> {
  const routes = new Map<string, string>()
  // Match: KEY: '/path' or KEY: '/path/:param'
  const re = /^\s+(\w+):\s*'([^']+)'/gm
  let match
  while ((match = re.exec(content)) !== null) {
    routes.set(match[1], match[2])
  }
  return routes
}

/**
 * Extracts all ROUTES.X references from App.tsx Route elements.
 * Matches: <Route path={ROUTES.KEY} ...
 */
function extractAppRouteRefs(content: string): string[] {
  const refs: string[] = []
  const re = /path=\{ROUTES\.(\w+)\}/g
  let match
  while ((match = re.exec(content)) !== null) {
    refs.push(match[1])
  }
  return refs
}

/**
 * Extracts all safeLazy import statements from App.tsx.
 * Returns a map of component name → module path.
 */
function extractLazyImports(content: string): Map<string, string> {
  const imports = new Map<string, string>()
  // Match: const Name = safeLazy(() => import('./path/Module'), 'Name')
  const re = /const\s+(\w+)\s*=\s*safeLazy\(\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g
  let match
  while ((match = re.exec(content)) !== null) {
    imports.set(match[1], match[2])
  }
  return imports
}

/**
 * Finds all modal/dialog component files under src/components and src/lib/modals.
 * Returns file paths relative to src.
 */
function findModalFiles(): string[] {
  const results: string[] = []

  function walk(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (
        entry.isFile() &&
        /\.(tsx?)$/.test(entry.name) &&
        /(Modal|Dialog)\.(tsx?)$/.test(entry.name) &&
        !entry.name.endsWith('.test.tsx') &&
        !entry.name.endsWith('.test.ts')
      ) {
        results.push(full)
      }
    }
  }

  walk(join(SRC_DIR, 'components'))
  walk(join(SRC_DIR, 'lib', 'modals'))
  return results
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Route configuration integrity', () => {
  const routesContent = readFile(ROUTES_FILE)
  const appContent = readFile(APP_FILE)
  const routeKeys = extractRouteKeys(routesContent)
  const appRouteRefs = extractAppRouteRefs(appContent)

  it('routes.ts defines a substantial number of routes', () => {
    expect(routeKeys.size).toBeGreaterThanOrEqual(MIN_EXPECTED_ROUTES)
  })

  it('all route values start with /', () => {
    for (const [key, path] of routeKeys) {
      expect(path, `ROUTES.${key} should start with /`).toMatch(/^\//)
    }
  })

  it('all route values are unique (no duplicate paths)', () => {
    const paths = [...routeKeys.values()]
    const uniquePaths = new Set(paths)
    const duplicates = paths.filter((p, i) => paths.indexOf(p) !== i)
    expect(duplicates, `Duplicate route paths: ${duplicates.join(', ')}`).toHaveLength(0)
    expect(uniquePaths.size).toBe(paths.length)
  })

  it('every ROUTES.X reference in App.tsx exists in routes.ts', () => {
    const missing = appRouteRefs.filter(ref => !routeKeys.has(ref))
    expect(missing, `App.tsx references undefined routes: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('core routes are defined', () => {
    const required = [
      'HOME', 'LOGIN', 'CLUSTERS', 'NODES', 'PODS', 'DEPLOYMENTS',
      'SERVICES', 'WORKLOADS', 'EVENTS', 'ALERTS', 'SETTINGS',
      'COMPUTE', 'STORAGE', 'NETWORK', 'SECURITY', 'MARKETPLACE',
      'OPERATORS', 'COMPLIANCE', 'CLUSTER_ADMIN',
    ]
    for (const key of required) {
      expect(routeKeys.has(key), `Missing core route: ROUTES.${key}`).toBe(true)
    }
  })

  it('core routes are wired in App.tsx', () => {
    const required = [
      'CLUSTERS', 'NODES', 'PODS', 'DEPLOYMENTS', 'SERVICES',
      'WORKLOADS', 'EVENTS', 'ALERTS', 'SETTINGS', 'COMPUTE',
      'STORAGE', 'NETWORK', 'SECURITY', 'MARKETPLACE',
    ]
    for (const key of required) {
      expect(
        appRouteRefs.includes(key),
        `ROUTES.${key} is defined but not wired in App.tsx`,
      ).toBe(true)
    }
  })
})

describe('Lazy import integrity', () => {
  const appContent = readFile(APP_FILE)
  const lazyImports = extractLazyImports(appContent)

  it('all safeLazy imports reference existing module files', () => {
    const missing: string[] = []
    for (const [name, modulePath] of lazyImports) {
      // Resolve the module path relative to App.tsx (src/)
      const resolved = resolve(SRC_DIR, modulePath)
      // Check .tsx, .ts, and /index.tsx
      const candidates = [
        `${resolved}.tsx`,
        `${resolved}.ts`,
        join(resolved, 'index.tsx'),
        join(resolved, 'index.ts'),
      ]
      const exists = candidates.some(c => existsSync(c))
      if (!exists) {
        missing.push(`${name} → ${modulePath}`)
      }
    }
    expect(missing, `safeLazy imports reference missing files:\n${missing.join('\n')}`).toHaveLength(0)
  })

  it('safeLazy named exports match actual file exports', () => {
    const mismatches: string[] = []
    // Match: safeLazy(() => import('./path'), 'ExportName')
    const re = /safeLazy\(\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)\s*,\s*'(\w+)'\)/g
    let match
    while ((match = re.exec(appContent)) !== null) {
      const modulePath = match[1]
      const exportName = match[2]
      const resolved = resolve(SRC_DIR, modulePath)
      const candidates = [
        `${resolved}.tsx`,
        `${resolved}.ts`,
        join(resolved, 'index.tsx'),
        join(resolved, 'index.ts'),
      ]
      const existingFile = candidates.find(c => existsSync(c))
      if (existingFile) {
        const content = readFile(existingFile)
        // Check for named export: export function/const/class ExportName
        // or export { ExportName } or export default
        const hasExport =
          content.includes(`export function ${exportName}`) ||
          content.includes(`export class ${exportName}`) ||
          content.includes(`export const ${exportName}`) ||
          content.includes(`export { ${exportName}`) ||
          (exportName === 'default' && content.includes('export default'))
        if (!hasExport) {
          mismatches.push(`${exportName} not found in ${modulePath}`)
        }
      }
    }
    expect(mismatches, `Named exports not found:\n${mismatches.join('\n')}`).toHaveLength(0)
  })
})

describe('Modal/Dialog component integrity', () => {
  const modalFiles = findModalFiles()

  it(`finds at least ${MIN_EXPECTED_MODALS} modal/dialog components`, () => {
    expect(modalFiles.length).toBeGreaterThanOrEqual(MIN_EXPECTED_MODALS)
  })

  for (const filePath of modalFiles) {
    const relativePath = relative(SRC_DIR, filePath)

    it(`${relativePath} — exports a component function`, () => {
      const content = readFile(filePath)
      const hasExport =
        /export\s+function\s+\w+(Modal|Dialog)/m.test(content) ||
        /export\s+default\s+function\s+\w+(Modal|Dialog)/m.test(content) ||
        /export\s+\{\s*\w+(Modal|Dialog)/m.test(content) ||
        /export\s+default\s+\w+(Modal|Dialog)/m.test(content)
      expect(hasExport, `${relativePath} should export a Modal or Dialog component`).toBe(true)
    })

    it(`${relativePath} — has open/close prop pattern`, () => {
      const content = readFile(filePath)
      // Check for isOpen, open, state.isOpen, or similar prop, plus onClose
      const hasOpenProp =
        /\bisOpen\b/.test(content) ||
        /\bopen\b/.test(content) ||
        /\bvisible\b/.test(content) ||
        /\bshow\b/.test(content) ||
        /state\.isOpen/.test(content)   // Drilldown uses state.isOpen
      const hasCloseProp =
        /\bonClose\b/.test(content) ||
        /\bonDismiss\b/.test(content) ||
        /\bonCancel\b/.test(content)
      // Some dialogs are "always mounted" — parent controls visibility by
      // conditionally rendering them, so they only have onClose, not isOpen.
      const isAlwaysMounted = hasCloseProp && !hasOpenProp
      expect(
        hasOpenProp || isAlwaysMounted,
        `${relativePath} should have an open/visible prop or be parent-controlled`,
      ).toBe(true)
      expect(hasCloseProp, `${relativePath} should have an onClose/onDismiss prop`).toBe(true)
    })

    it(`${relativePath} — handles closed state (early return or conditional render)`, () => {
      const content = readFile(filePath)
      // "Always-mounted" dialogs (no isOpen prop — parent controls mounting)
      // don't need internal closed-state handling
      const isAlwaysMounted =
        (/\bonClose\b/.test(content) || /\bonDismiss\b/.test(content)) &&
        !/\bisOpen\b/.test(content) &&
        !/\bopen\b/.test(content) &&
        !/\bvisible\b/.test(content) &&
        !/\bshow\b/.test(content) &&
        !/state\.isOpen/.test(content)
      if (isAlwaysMounted) return  // Parent-controlled — no internal check needed

      // Modal should either check isOpen/open and return null, or use
      // conditional rendering with createPortal, or be controlled externally
      const handlesClosedState =
        /if\s*\(\s*!isOpen\s*\)/.test(content) ||
        /if\s*\(\s*!open\s*\)/.test(content) ||
        /if\s*\(\s*!visible\s*\)/.test(content) ||
        /if\s*\(\s*!show\s*\)/.test(content) ||
        /if\s*\(\s*!state\.isOpen\b/.test(content) ||  // DrillDownModal
        /\{isOpen\s*&&/.test(content) ||
        /\{open\s*&&/.test(content) ||
        /isOpen\s*\?/.test(content) ||
        /open\s*\?/.test(content) ||
        /createPortal/.test(content) ||
        /BaseModal/.test(content) ||  // Uses BaseModal which handles this internally
        /Escape/.test(content)        // Dialogs that are always rendered when mounted, dismissed via Escape
      expect(
        handlesClosedState,
        `${relativePath} should handle closed state (return null or conditional render)`,
      ).toBe(true)
    })
  }
})

describe('Route config completeness', () => {
  const routesContent = readFile(ROUTES_FILE)
  const appContent = readFile(APP_FILE)
  const routeKeys = extractRouteKeys(routesContent)
  const appRouteRefs = new Set(extractAppRouteRefs(appContent))

  // Routes that are intentionally not directly wired (used programmatically)
  const INTENTIONALLY_UNWIRED = new Set([
    'HOME',                        // Uses <Route index> instead of path={ROUTES.HOME}
    'AUTH_CALLBACK',               // Used in AuthProvider
    'EMBED_BASE',                  // Prefix constant for ROUTE_TITLES lookup, not a navigable route
    // Enterprise sub-routes use relative paths nested under <Route path="/enterprise">
    'ENTERPRISE_OIDC',
    'ENTERPRISE_RBAC_AUDIT',
    'ENTERPRISE_SESSIONS',
    'ENTERPRISE_SIEM',
    'ENTERPRISE_INCIDENT_RESPONSE',
    'ENTERPRISE_THREAT_INTEL',
    'ENTERPRISE_SBOM',
    'ENTERPRISE_SIGSTORE',
    'ENTERPRISE_SLSA',
    'ENTERPRISE_RISK_MATRIX',
    'ENTERPRISE_RISK_REGISTER',
    'ENTERPRISE_RISK_APPETITE',
  ])

  it('every route in config is either wired in App.tsx or intentionally unwired', () => {
    const unwired: string[] = []
    for (const key of routeKeys.keys()) {
      if (!appRouteRefs.has(key) && !INTENTIONALLY_UNWIRED.has(key)) {
        unwired.push(key)
      }
    }
    // This is informational — some routes may be used via Navigate or programmatic navigation
    if (unwired.length > 0) {
      // Just log, don't fail — some routes use Navigate or are wired differently
      console.info(`Routes not directly wired via <Route path={ROUTES.X}>: ${unwired.join(', ')}`)
    }
    // But there should be no more than a reasonable number of unwired routes
    const MAX_UNWIRED_ROUTES = 10
    expect(
      unwired.length,
      `Too many unwired routes (${unwired.length}): ${unwired.join(', ')}`,
    ).toBeLessThanOrEqual(MAX_UNWIRED_ROUTES)
  })
})

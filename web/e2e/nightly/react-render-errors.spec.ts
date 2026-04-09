import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

/**
 * React Render Error Detection — Nightly
 *
 * Catches React-specific render errors across all dashboard routes:
 *   - Error #185: "Maximum update depth exceeded" (infinite setState loops)
 *   - "Too many re-renders" (similar loop in function components)
 *   - Hook ordering violations
 *   - Render-phase state update warnings
 *
 * These errors are often caught by error boundaries and appear only as
 * console.error — NOT as unhandled pageerror events.  The standard
 * dashboard-health test only fails on pageerror, so this test fills
 * the gap by explicitly failing on React-critical console output.
 *
 * Run locally:
 *   npx playwright test e2e/nightly/react-render-errors.spec.ts -c e2e/nightly/nightly.config.ts
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Time to wait after navigation for all cards to render and settle (ms) */
const CARD_SETTLE_MS = 5_000

/** Extra settle time for routes with pagination (triggers useLayoutEffect) */
const PAGINATION_EXTRA_SETTLE_MS = 2_000

/** Navigation timeout per route (ms) */
const NAV_TIMEOUT_MS = 30_000

/**
 * React-critical error patterns that indicate real bugs.
 * Each pattern maps to a short human-readable name for the report.
 */
const REACT_CRITICAL_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  {
    pattern: /Maximum update depth exceeded/i,
    name: 'React #185: Infinite setState loop',
  },
  {
    pattern: /Too many re-renders/i,
    name: 'Infinite re-render loop',
  },
  {
    pattern: /Rendered more hooks than during the previous render/i,
    name: 'Hook ordering violation',
  },
  {
    pattern: /Rendered fewer hooks than expected/i,
    name: 'Hook ordering violation (fewer)',
  },
  {
    pattern: /Cannot update a component.*while rendering a different component/i,
    name: 'Cross-component setState during render',
  },
  {
    pattern: /Cannot update during an existing state transition/i,
    name: 'setState during state transition',
  },
  {
    pattern: /Minified React error #185/i,
    name: 'React #185 (minified)',
  },
  {
    pattern: /Minified React error #301/i,
    name: 'React #301: Too many re-renders (minified)',
  },
]

/** All dashboard routes that render cards (where React loop bugs surface) */
const DASHBOARD_ROUTES: Array<{
  path: string
  name: string
  hasPagination: boolean
}> = [
  { path: '/', name: 'Home', hasPagination: true },
  { path: '/clusters', name: 'Clusters', hasPagination: true },
  { path: '/workloads', name: 'Workloads', hasPagination: true },
  { path: '/nodes', name: 'Nodes', hasPagination: true },
  { path: '/deployments', name: 'Deployments', hasPagination: true },
  { path: '/pods', name: 'Pods', hasPagination: true },
  { path: '/services', name: 'Services', hasPagination: true },
  { path: '/operators', name: 'Operators', hasPagination: true },
  { path: '/helm', name: 'Helm', hasPagination: true },
  { path: '/logs', name: 'Logs', hasPagination: false },
  { path: '/compute', name: 'Compute', hasPagination: true },
  { path: '/storage', name: 'Storage', hasPagination: true },
  { path: '/network', name: 'Network', hasPagination: true },
  { path: '/events', name: 'Events', hasPagination: true },
  { path: '/security', name: 'Security', hasPagination: true },
  { path: '/gitops', name: 'GitOps', hasPagination: true },
  { path: '/alerts', name: 'Alerts', hasPagination: true },
  { path: '/cost', name: 'Cost', hasPagination: true },
  { path: '/security-posture', name: 'Compliance', hasPagination: true },
  { path: '/compliance', name: 'Compliance (alt)', hasPagination: true },
  { path: '/data-compliance', name: 'Data Compliance', hasPagination: true },
  { path: '/gpu-reservations', name: 'GPU Reservations', hasPagination: true },
  { path: '/namespaces', name: 'Namespaces', hasPagination: true },
  { path: '/deploy', name: 'Deploy', hasPagination: true },
  { path: '/ai-ml', name: 'AI/ML', hasPagination: true },
  { path: '/ai-agents', name: 'AI Agents', hasPagination: true },
  { path: '/llm-d-benchmarks', name: 'Benchmarks', hasPagination: true },
  { path: '/cluster-admin', name: 'Cluster Admin', hasPagination: true },
  { path: '/ci-cd', name: 'CI/CD', hasPagination: true },
  { path: '/marketplace', name: 'Marketplace', hasPagination: true },
]

// ── Types ────────────────────────────────────────────────────────────────────

interface ReactError {
  patternName: string
  message: string
  route: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function matchReactCriticalError(text: string): string | null {
  for (const { pattern, name } of REACT_CRITICAL_PATTERNS) {
    if (pattern.test(text)) return name
  }
  return null
}

async function setupDemoMode(page: Page) {
  await page.goto('/login', { timeout: NAV_TIMEOUT_MS })
  await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

/**
 * If the page has pagination controls, click through pages to exercise
 * the useStablePageHeight / useLayoutEffect code paths that caused #185.
 */
async function exercisePagination(page: Page): Promise<void> {
  const nextButtons = page.locator(
    'button:has-text("Next"), button:has-text("›"), [aria-label="Next page"], [data-testid="pagination-next"]'
  )
  const count = await nextButtons.count()
  if (count === 0) return

  // Click the first visible "next" button up to 2 times
  const MAX_PAGE_CLICKS = 2
  for (let i = 0; i < MAX_PAGE_CLICKS; i++) {
    const btn = nextButtons.first()
    const isDisabled = await btn.isDisabled().catch(() => true)
    if (isDisabled) break
    await btn.click().catch(() => {
      /* ignore click failures — button may have disappeared */
    })
    await page.waitForTimeout(PAGINATION_EXTRA_SETTLE_MS)
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('React Render Error Detection', () => {
  const allErrors: ReactError[] = []

  for (const route of DASHBOARD_ROUTES) {
    test(`no React render errors on ${route.name} (${route.path})`, async ({
      page,
    }) => {
      const routeErrors: ReactError[] = []

      // Capture console output for React-critical errors
      page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() !== 'error' && msg.type() !== 'warning') return
        const text = msg.text()
        const patternName = matchReactCriticalError(text)
        if (patternName) {
          routeErrors.push({
            patternName,
            message: text.slice(0, 500),
            route: route.path,
          })
        }
      })

      // Also catch unhandled exceptions that match React patterns
      page.on('pageerror', (err) => {
        const text = err.stack || err.message
        const patternName = matchReactCriticalError(text)
        if (patternName) {
          routeErrors.push({
            patternName,
            message: text.slice(0, 500),
            route: route.path,
          })
        }
      })

      // Setup demo mode and navigate
      await setupDemoMode(page)
      await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS,
      })

      // Wait for cards to render and effects to settle
      await page.waitForTimeout(CARD_SETTLE_MS)

      // Exercise pagination to trigger useLayoutEffect cascades
      if (route.hasPagination) {
        await exercisePagination(page)
      }

      // Collect errors for the summary
      allErrors.push(...routeErrors)

      // Log findings
      if (routeErrors.length > 0) {
        console.log(
          `[React Errors] ✗ ${route.path}: ${routeErrors.length} error(s)`
        )
        for (const err of routeErrors) {
          console.log(`  → ${err.patternName}: ${err.message.slice(0, 120)}`)
        }
      } else {
        console.log(`[React Errors] ✓ ${route.path}: clean`)
      }

      // FAIL if any React-critical errors found
      expect(
        routeErrors.length,
        `React render errors on ${route.path}:\n${routeErrors.map((e) => `  [${e.patternName}] ${e.message.slice(0, 200)}`).join('\n')}`
      ).toBe(0)
    })
  }

  // ── Mobile viewport tests ────────────────────────────────────────────────
  // Mobile viewports trigger different code paths (useMobile, isNarrow) that
  // can cause infinite render loops not caught by desktop-only tests.

  const MOBILE_VIEWPORT = { width: 393, height: 852 }
  const MOBILE_ROUTES = [
    { path: '/', name: 'Home (mobile)' },
    { path: '/clusters', name: 'Clusters (mobile)' },
    { path: '/workloads', name: 'Workloads (mobile)' },
    { path: '/deploy', name: 'Deploy (mobile)' },
    { path: '/ai-ml', name: 'AI/ML (mobile)' },
  ]

  for (const route of MOBILE_ROUTES) {
    test(`no React render errors on ${route.name} at mobile viewport`, async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE_VIEWPORT)

      const routeErrors: ReactError[] = []

      page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() !== 'error' && msg.type() !== 'warning') return
        const text = msg.text()
        const patternName = matchReactCriticalError(text)
        if (patternName) {
          routeErrors.push({ patternName, message: text.slice(0, 500), route: route.path })
        }
      })

      page.on('pageerror', (err) => {
        const text = err.stack || err.message
        const patternName = matchReactCriticalError(text)
        if (patternName) {
          routeErrors.push({ patternName, message: text.slice(0, 500), route: route.path })
        }
      })

      await setupDemoMode(page)
      await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
      await page.waitForTimeout(CARD_SETTLE_MS)

      // Also check for error boundary rendering
      const errorBoundary = await page.locator('text=This page encountered an error').count()
      if (errorBoundary > 0) {
        routeErrors.push({
          patternName: 'Error boundary rendered',
          message: 'Error boundary visible on page at mobile viewport',
          route: route.path,
        })
      }

      allErrors.push(...routeErrors)

      if (routeErrors.length > 0) {
        console.log(`[React Errors] ✗ ${route.name}: ${routeErrors.length} error(s)`)
        for (const err of routeErrors) {
          console.log(`  → ${err.patternName}: ${err.message.slice(0, 120)}`)
        }
      } else {
        console.log(`[React Errors] ✓ ${route.name}: clean`)
      }

      expect(
        routeErrors.length,
        `React render errors on ${route.name}:\n${routeErrors.map((e) => `  [${e.patternName}] ${e.message.slice(0, 200)}`).join('\n')}`
      ).toBe(0)
    })
  }

  test.afterAll(async () => {
    console.log('\n' + '═'.repeat(60))
    console.log('REACT RENDER ERROR SUMMARY')
    console.log('═'.repeat(60))

    if (allErrors.length === 0) {
      console.log('✓ No React render errors detected across all routes')
    } else {
      console.log(`✗ ${allErrors.length} React error(s) found:\n`)

      // Group by pattern
      const byPattern = new Map<string, ReactError[]>()
      for (const err of allErrors) {
        const list = byPattern.get(err.patternName) || []
        list.push(err)
        byPattern.set(err.patternName, list)
      }

      for (const [pattern, errors] of byPattern) {
        console.log(
          `  ${pattern} (${errors.length}x): ${(errors || []).map((e) => e.route).join(', ')}`
        )
      }
    }

    console.log('═'.repeat(60))
  })
})

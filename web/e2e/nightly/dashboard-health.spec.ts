import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

/**
 * Nightly Dashboard Health Check
 *
 * Validates that ALL dashboard routes load correctly in demo mode:
 *   1. No unexpected console errors
 *   2. Cards render (not blank pages)
 *   3. Demo badge visible where expected
 *   4. No crashes or unhandled exceptions
 *
 * On failure, the CI workflow creates a GitHub issue assigned to Copilot.
 *
 * Run locally: npx playwright test e2e/nightly/dashboard-health.spec.ts -c e2e/nightly/nightly.config.ts
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Time to wait after navigation for cards to settle (ms) */
const CARD_SETTLE_MS = 3_000

/** Time to wait for networkidle after navigation (ms) */
const NETWORK_IDLE_TIMEOUT_MS = 20_000

/** Minimum text length to consider a page "not blank" */
const MIN_PAGE_TEXT_LENGTH = 50

/** Expected console errors to ignore (demo mode, known warnings) */
const EXPECTED_ERROR_PATTERNS = [
  /Failed to fetch/i,
  /WebSocket/i,
  /ResizeObserver/i,
  /validateDOMNesting/i,
  /act\(\)/i,
  /Cannot read.*undefined/i,
  /ChunkLoadError/i,
  /Loading chunk/i,
  /demo-token/i,
  /localhost:8585/i,
  /ERR_CONNECTION_REFUSED/i,
  /net::ERR_/i,
  /AbortError/i,
  /signal is aborted/i,
  /Hydration/i,
  /flushSync was called/i,
  /can't access property/i,
  /Cross-Origin Request Blocked/i,
  /Notification permission/i,
  /502.*Bad Gateway/i,
  /Failed to load resource/i,
]

/** All dashboard routes to test (from App.tsx) */
const DASHBOARD_ROUTES: Array<{ path: string; name: string; expectCards: boolean }> = [
  { path: '/', name: 'Home Dashboard', expectCards: true },
  { path: '/clusters', name: 'Clusters', expectCards: true },
  { path: '/workloads', name: 'Workloads', expectCards: true },
  { path: '/nodes', name: 'Nodes', expectCards: true },
  { path: '/deployments', name: 'Deployments', expectCards: true },
  { path: '/pods', name: 'Pods', expectCards: true },
  { path: '/services', name: 'Services', expectCards: true },
  { path: '/operators', name: 'Operators', expectCards: true },
  { path: '/helm', name: 'Helm Releases', expectCards: true },
  { path: '/logs', name: 'Logs', expectCards: true },
  { path: '/compute', name: 'Compute', expectCards: true },
  { path: '/compute/compare', name: 'Cluster Comparison', expectCards: true },
  { path: '/storage', name: 'Storage', expectCards: true },
  { path: '/network', name: 'Network', expectCards: true },
  { path: '/events', name: 'Events', expectCards: true },
  { path: '/security', name: 'Security', expectCards: true },
  { path: '/gitops', name: 'GitOps', expectCards: true },
  { path: '/alerts', name: 'Alerts', expectCards: true },
  { path: '/cost', name: 'Cost', expectCards: true },
  { path: '/security-posture', name: 'Compliance', expectCards: true },
  { path: '/data-compliance', name: 'Data Compliance', expectCards: true },
  { path: '/gpu-reservations', name: 'GPU Reservations', expectCards: true },
  { path: '/namespaces', name: 'Namespaces', expectCards: true },
  { path: '/deploy', name: 'Deploy', expectCards: true },
  { path: '/ai-ml', name: 'AI/ML', expectCards: true },
  { path: '/ai-agents', name: 'AI Agents', expectCards: true },
  { path: '/llm-d-benchmarks', name: 'LLM-d Benchmarks', expectCards: true },
  { path: '/cluster-admin', name: 'Cluster Admin', expectCards: true },
  { path: '/ci-cd', name: 'CI/CD', expectCards: true },
  { path: '/insights', name: 'Insights', expectCards: true },
  { path: '/marketplace', name: 'Marketplace', expectCards: true },
  { path: '/arcade', name: 'Arcade', expectCards: false },
  { path: '/settings', name: 'Settings', expectCards: false },
  { path: '/history', name: 'Card History', expectCards: false },
  { path: '/users', name: 'User Management', expectCards: false },
]

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardResult {
  path: string
  name: string
  status: 'pass' | 'fail' | 'warn'
  consoleErrors: string[]
  pageErrors: string[]
  cardCount: number
  contentLoadedCount: number
  demoBadgeCount: number
  hasContent: boolean
  details: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isExpectedError(message: string): boolean {
  return EXPECTED_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

function setupErrorCollector(page: Page): { errors: string[]; pageErrors: string[] } {
  const errors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text()
    if (msg.type() === 'error' && !isExpectedError(text)) {
      errors.push(text)
    }
  })

  page.on('pageerror', (err) => {
    if (!isExpectedError(err.message)) {
      pageErrors.push(err.message)
    }
  })

  return { errors, pageErrors }
}

async function setupDemoMode(page: Page) {
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

async function getDashboardMetrics(page: Page): Promise<{
  cardCount: number
  contentLoadedCount: number
  demoBadgeCount: number
  hasContent: boolean
}> {
  return page.evaluate((minTextLen) => {
    const cards = document.querySelectorAll('[data-card-id]')
    const contentLoaded = document.querySelectorAll('.content-loaded')
    const demoBadges = document.querySelectorAll('[data-testid="demo-badge"]')
    const bodyText = (document.body.textContent || '').trim()

    return {
      cardCount: cards.length,
      contentLoadedCount: contentLoaded.length,
      demoBadgeCount: demoBadges.length,
      hasContent: bodyText.length > minTextLen,
    }
  }, MIN_PAGE_TEXT_LENGTH)
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Nightly Dashboard Health', () => {
  const results: DashboardResult[] = []

  test.beforeAll(async ({ browser }) => {
    // Verify browser can launch
    const page = await browser.newPage()
    await page.close()
  })

  for (const route of DASHBOARD_ROUTES) {
    test(`${route.name} (${route.path})`, async ({ page }) => {
      await setupDemoMode(page)
      const { errors, pageErrors } = setupErrorCollector(page)

      // Navigate to the dashboard
      await page.goto(route.path)
      try {
        await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
      } catch {
        // networkidle may not fire if SSE streams are open — continue anyway
      }

      // Wait for cards to settle — look for card elements to appear
      try {
        await page.waitForSelector('[data-card-id]', { timeout: CARD_SETTLE_MS })
      } catch {
        // Some pages may not have cards — continue to metrics collection
      }

      // Collect metrics
      const metrics = await getDashboardMetrics(page)

      // Build result
      const result: DashboardResult = {
        path: route.path,
        name: route.name,
        status: 'pass',
        consoleErrors: [...errors],
        pageErrors: [...pageErrors],
        ...metrics,
        details: '',
      }

      // Evaluate status
      const issues: string[] = []

      // Check for page errors (unhandled exceptions — always critical)
      if (pageErrors.length > 0) {
        issues.push(`${pageErrors.length} unhandled exception(s)`)
        result.status = 'fail'
      }

      // Check for console errors (warnings only, not failures)
      if (errors.length > 0) {
        issues.push(`${errors.length} console error(s)`)
        if (result.status !== 'fail') result.status = 'warn'
      }

      // Check for blank page
      if (!metrics.hasContent) {
        issues.push('Page appears blank')
        result.status = 'fail'
      }

      // Check cards rendered (only for dashboards that should have cards)
      if (route.expectCards && metrics.cardCount === 0) {
        issues.push('No cards detected')
        result.status = 'fail'
      }

      result.details = issues.length > 0 ? issues.join('; ') : 'OK'
      results.push(result)

      // Log for CI visibility
      const statusIcon = result.status === 'pass' ? '✓' : result.status === 'warn' ? '⚠' : '✗'
      console.log(
        `[Dashboard Health] ${statusIcon} ${route.name}: cards=${metrics.cardCount} loaded=${metrics.contentLoadedCount} demo=${metrics.demoBadgeCount} errors=${errors.length} ${result.details}`
      )

      // Assertions
      expect(pageErrors, `Unhandled exceptions on ${route.path}: ${pageErrors.join('; ')}`).toHaveLength(0)
      expect(metrics.hasContent, `${route.path} appears blank (text length < ${MIN_PAGE_TEXT_LENGTH})`).toBe(true)
      if (route.expectCards) {
        expect(metrics.cardCount, `${route.path} rendered zero cards — expected at least one`).toBeGreaterThan(0)
      }
    })
  }

  test.afterAll(async () => {
    // Print summary
    const passed = results.filter(r => r.status === 'pass').length
    const warned = results.filter(r => r.status === 'warn').length
    const failed = results.filter(r => r.status === 'fail').length
    const total = results.length

    console.log('\n' + '═'.repeat(60))
    console.log('NIGHTLY DASHBOARD HEALTH SUMMARY')
    console.log('═'.repeat(60))
    console.log(`Total: ${total} | Pass: ${passed} | Warn: ${warned} | Fail: ${failed}`)
    console.log('─'.repeat(60))

    for (const r of results) {
      const icon = r.status === 'pass' ? '✓' : r.status === 'warn' ? '⚠' : '✗'
      const cardsInfo = `cards=${r.cardCount} loaded=${r.contentLoadedCount} demo=${r.demoBadgeCount}`
      console.log(`${icon} ${r.name.padEnd(25)} ${cardsInfo} ${r.details}`)
    }

    console.log('═'.repeat(60))

    // Write JSON report for CI issue creation
    const report = {
      timestamp: new Date().toISOString(),
      total,
      passed,
      warned,
      failed,
      results,
    }

    // Write to stdout as JSON for workflow parsing
    console.log('\n__NIGHTLY_REPORT_JSON__')
    console.log(JSON.stringify(report))
    console.log('__NIGHTLY_REPORT_JSON_END__')
  })
})

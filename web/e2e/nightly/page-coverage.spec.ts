import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

/**
 * Nightly Page Coverage Smoke Tests (P3-B)
 *
 * Validates that previously-untested feature pages load correctly in demo mode:
 *   1. No blank screens (meaningful content is rendered)
 *   2. No uncaught page errors (unhandled exceptions)
 *   3. No React error boundaries triggered
 *   4. Pages render within a reasonable timeout
 *
 * These pages had 0 test coverage before this file was added.
 *
 * Run locally:
 *   npx playwright test e2e/nightly/page-coverage.spec.ts -c e2e/nightly/nightly.config.ts
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Time to wait after navigation for page content to settle (ms) */
const PAGE_SETTLE_MS = 3_000

/** Time to wait for networkidle after navigation (ms) */
const NETWORK_IDLE_TIMEOUT_MS = 20_000

/** Minimum text length to consider a page "not blank" (characters) */
const MIN_PAGE_TEXT_LENGTH = 50

/** Maximum time allowed for a page to render meaningful content (ms) */
const PAGE_RENDER_TIMEOUT_MS = 30_000

/** Number of separator characters in summary output */
const SUMMARY_SEPARATOR_LENGTH = 60

/** Padding width for page names in summary output (characters) */
const PAGE_NAME_PAD_WIDTH = 25

/** Expected console errors to ignore (demo mode, known framework warnings) */
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
  /127\.0\.0\.1:8585/i,
  /ERR_CONNECTION_REFUSED/i,
  /net::ERR_/i,
  /AbortError/i,
  /signal is aborted/i,
  /Hydration/i,
  /flushSync was called/i,
  /can't access property/i,
  /Cross-Origin Request Blocked/i,
]

/** Text patterns that indicate a React error boundary has been triggered */
const ERROR_BOUNDARY_PATTERNS = [
  'Something went wrong',
  'Error boundary',
  'An error occurred',
  'Application error',
  'Unexpected error',
  'chunk failed',
]

/**
 * Feature pages that previously had zero test coverage.
 *
 * expectCards: true  = uses DashboardPage with card grid (most dashboards)
 * expectCards: false = custom layout without data-card-id elements (e.g. Arcade)
 */
const UNTESTED_PAGES: Array<{ path: string; name: string; expectCards: boolean }> = [
  { path: '/arcade', name: 'Arcade', expectCards: false },
  { path: '/marketplace', name: 'Marketplace', expectCards: true },
  { path: '/ai-agents', name: 'AI Agents', expectCards: true },
  { path: '/ci-cd', name: 'CI/CD', expectCards: true },
  { path: '/karmada-ops', name: 'Karmada Ops', expectCards: true },
  { path: '/helm', name: 'Helm Releases', expectCards: true },
  { path: '/logs', name: 'Logs', expectCards: true },
  { path: '/cost', name: 'Cost', expectCards: true },
  { path: '/data-compliance', name: 'Data Compliance', expectCards: true },
  { path: '/security-posture', name: 'Security Posture', expectCards: true },
  { path: '/gpu-reservations', name: 'GPU Reservations', expectCards: true },
]

// ── Types ────────────────────────────────────────────────────────────────────

interface PageCoverageResult {
  path: string
  name: string
  status: 'pass' | 'fail' | 'warn'
  pageErrors: string[]
  consoleErrors: string[]
  hasContent: boolean
  hasErrorBoundary: boolean
  cardCount: number
  renderTimeMs: number
  details: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isExpectedError(message: string): boolean {
  return EXPECTED_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

function setupErrorCollector(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text()
    if (msg.type() === 'error' && !isExpectedError(text)) {
      consoleErrors.push(text)
    }
  })

  page.on('pageerror', (err) => {
    if (!isExpectedError(err.message)) {
      pageErrors.push(err.message)
    }
  })

  return { consoleErrors, pageErrors }
}

async function setupDemoMode(page: Page) {
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

async function getPageMetrics(page: Page): Promise<{
  hasContent: boolean
  hasErrorBoundary: boolean
  cardCount: number
}> {
  return page.evaluate(
    ({ minTextLen, errorPatterns }) => {
      const bodyText = (document.body.textContent || '').trim()
      const cards = document.querySelectorAll('[data-card-id]')

      // Check for React error boundary fallback text
      const hasErrorBoundary = errorPatterns.some(pattern =>
        bodyText.toLowerCase().includes(pattern.toLowerCase()),
      )

      return {
        hasContent: bodyText.length > minTextLen,
        hasErrorBoundary,
        cardCount: cards.length,
      }
    },
    { minTextLen: MIN_PAGE_TEXT_LENGTH, errorPatterns: ERROR_BOUNDARY_PATTERNS },
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Nightly Page Coverage — Untested Feature Pages', () => {
  const results: PageCoverageResult[] = []

  test.beforeAll(async ({ browser }) => {
    // Verify browser can launch
    const page = await browser.newPage()
    await page.close()
  })

  for (const route of UNTESTED_PAGES) {
    test(`${route.name} (${route.path}) loads without errors`, async ({ page }) => {
      await setupDemoMode(page)
      const { consoleErrors, pageErrors } = setupErrorCollector(page)

      // Measure render time
      const startTime = Date.now()

      // Navigate to the page
      await page.goto(route.path)
      try {
        await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
      } catch {
        // networkidle may not fire if SSE streams are open — continue anyway
      }

      // Wait for page content to settle
      await page.waitForTimeout(PAGE_SETTLE_MS)

      const renderTimeMs = Date.now() - startTime

      // Collect metrics
      const metrics = await getPageMetrics(page)

      // Build result
      const result: PageCoverageResult = {
        path: route.path,
        name: route.name,
        status: 'pass',
        pageErrors: [...pageErrors],
        consoleErrors: [...consoleErrors],
        ...metrics,
        renderTimeMs,
        details: '',
      }

      // Evaluate status
      const issues: string[] = []

      // Check for unhandled exceptions (always critical)
      if (pageErrors.length > 0) {
        issues.push(`${pageErrors.length} unhandled exception(s)`)
        result.status = 'fail'
      }

      // Check for React error boundary
      if (metrics.hasErrorBoundary) {
        issues.push('React error boundary triggered')
        result.status = 'fail'
      }

      // Check for blank page
      if (!metrics.hasContent) {
        issues.push('Page appears blank')
        result.status = 'fail'
      }

      // Check cards rendered (only for pages that should have cards)
      if (route.expectCards && metrics.cardCount === 0) {
        issues.push('No cards detected')
        result.status = 'fail'
      }

      // Check render time
      if (renderTimeMs > PAGE_RENDER_TIMEOUT_MS) {
        issues.push(`Render time ${renderTimeMs}ms exceeds ${PAGE_RENDER_TIMEOUT_MS}ms threshold`)
        result.status = 'fail'
      }

      // Console errors are warnings, not failures
      if (consoleErrors.length > 0) {
        issues.push(`${consoleErrors.length} console error(s)`)
        if (result.status !== 'fail') result.status = 'warn'
      }

      result.details = issues.length > 0 ? issues.join('; ') : 'OK'
      results.push(result)

      // Log for CI visibility
      const statusIcon = result.status === 'pass' ? '✓' : result.status === 'warn' ? '⚠' : '✗'
      console.log(
        `[Page Coverage] ${statusIcon} ${route.name}: cards=${metrics.cardCount} content=${metrics.hasContent} errorBoundary=${metrics.hasErrorBoundary} errors=${consoleErrors.length} render=${renderTimeMs}ms ${result.details}`,
      )

      // Assertions
      expect(
        pageErrors,
        `Unhandled exceptions on ${route.path}: ${pageErrors.join('; ')}`,
      ).toHaveLength(0)

      expect(
        metrics.hasErrorBoundary,
        `${route.path} triggered a React error boundary`,
      ).toBe(false)

      expect(
        metrics.hasContent,
        `${route.path} appears blank (text length < ${MIN_PAGE_TEXT_LENGTH})`,
      ).toBe(true)

      if (route.expectCards) {
        expect(
          metrics.cardCount,
          `${route.path} rendered zero cards — expected at least one`,
        ).toBeGreaterThan(0)
      }

      expect(
        renderTimeMs,
        `${route.path} took ${renderTimeMs}ms to render, exceeds ${PAGE_RENDER_TIMEOUT_MS}ms`,
      ).toBeLessThanOrEqual(PAGE_RENDER_TIMEOUT_MS)
    })
  }

  test.afterAll(async () => {
    // Print summary
    const passed = results.filter(r => r.status === 'pass').length
    const warned = results.filter(r => r.status === 'warn').length
    const failed = results.filter(r => r.status === 'fail').length
    const total = results.length

    console.log('\n' + '═'.repeat(SUMMARY_SEPARATOR_LENGTH))
    console.log('NIGHTLY PAGE COVERAGE SUMMARY')
    console.log('═'.repeat(SUMMARY_SEPARATOR_LENGTH))
    console.log(`Total: ${total} | Pass: ${passed} | Warn: ${warned} | Fail: ${failed}`)
    console.log('─'.repeat(SUMMARY_SEPARATOR_LENGTH))

    for (const r of results) {
      const icon = r.status === 'pass' ? '✓' : r.status === 'warn' ? '⚠' : '✗'
      const info = `cards=${r.cardCount} content=${r.hasContent} render=${r.renderTimeMs}ms`
      console.log(`${icon} ${r.name.padEnd(PAGE_NAME_PAD_WIDTH)} ${info} ${r.details}`)
    }

    console.log('═'.repeat(SUMMARY_SEPARATOR_LENGTH))

    // Write JSON report for CI parsing
    const report = {
      timestamp: new Date().toISOString(),
      total,
      passed,
      warned,
      failed,
      results,
    }

    console.log('\n__PAGE_COVERAGE_REPORT_JSON__')
    console.log(JSON.stringify(report))
    console.log('__PAGE_COVERAGE_REPORT_JSON_END__')
  })
})

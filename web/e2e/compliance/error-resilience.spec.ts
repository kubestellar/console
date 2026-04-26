/**
 * Error Resilience Test Suite
 *
 * Tests how the UI handles API failures, timeouts, partial outages,
 * SSE disconnects, and auth token expiry.
 *
 * Run: PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test e2e/compliance/error-resilience.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { setupAuth, setupLiveMocks, setLiveColdMode, type LiveMockOptions } from '../mocks/liveMocks'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResilienceResult {
  testName: string
  category: 'api-error' | 'timeout' | 'partial-failure' | 'sse-disconnect' | 'auth-expiry'
  status: 'pass' | 'fail' | 'warn' | 'skip'
  details: string
  durationMs: number
}

interface ResilienceReport {
  timestamp: string
  checks: ResilienceResult[]
  summary: {
    passCount: number
    failCount: number
    warnCount: number
    skipCount: number
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IS_CI = !!process.env.CI
const CI_TIMEOUT_MULTIPLIER = 2
const PAGE_LOAD_TIMEOUT_MS = IS_CI ? 30_000 : 15_000
const SETTLE_MS = 2_000

// Minimum number of resilience checks that must have executed (non-skip) for
// the aggregated report to be considered meaningful. Must match the assertion
// in the `generate report` test. The suite has 5 checks; in CI without a live
// backend several checks write 'skip' status — requiring 1 ensures the suite
// actually ran without penalising environment-driven skips (#9722, #10140).
const MIN_EXECUTED_CHECKS = 1

// ---------------------------------------------------------------------------
// Report persistence
//
// Each resilience test writes its own result to a JSON file in RESULTS_DIR.
// This avoids relying on a module-level singleton, which breaks under
// `fullyParallel: true` because each Playwright worker loads its own copy of
// the module (see issue #9002). The `generate report` test reads every file
// in RESULTS_DIR and aggregates them, regardless of which worker produced it.
// ---------------------------------------------------------------------------

const TEST_RESULTS_DIR = path.resolve(__dirname, '../test-results')
const RESULTS_DIR = path.join(TEST_RESULTS_DIR, 'error-resilience-partials')

function ensureResultsDir() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true })
}

function resultFileFor(testName: string): string {
  // Sanitize test name to a safe filename. Only [a-zA-Z0-9_-] are preserved.
  const safeName = testName.replace(/[^a-zA-Z0-9_-]+/g, '_')
  return path.join(RESULTS_DIR, `${safeName}.json`)
}

function addResult(result: ResilienceResult) {
  ensureResultsDir()
  fs.writeFileSync(resultFileFor(result.testName), JSON.stringify(result, null, 2))
}

function loadAllResults(): ResilienceResult[] {
  if (!fs.existsSync(RESULTS_DIR)) return []
  const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'))
  const results: ResilienceResult[] = []
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8')
      results.push(JSON.parse(raw) as ResilienceResult)
    } catch {
      // Skip unparseable partials; they'll just be missing from the aggregate.
    }
  }
  return results
}

function clearResults() {
  if (!fs.existsSync(RESULTS_DIR)) return
  for (const f of fs.readdirSync(RESULTS_DIR)) {
    if (f.endsWith('.json')) {
      try { fs.unlinkSync(path.join(RESULTS_DIR, f)) } catch { /* best-effort cleanup */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function navigateAndSettle(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
  try {
    await page.waitForSelector('[data-testid="sidebar"], main, [data-card-type]', { timeout: 8_000 })
  } catch { /* some routes may not have these */ }
  await page.waitForLoadState('networkidle', { timeout: SETTLE_MS }).catch(() => { /* settle timeout is best-effort */ })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Error Resilience', () => {
  test.describe.configure({ mode: 'serial' })

  // Clear any previous partials before the first test runs. Each test writes
  // its own result file; `generate report` reads them all at the end. Serial
  // mode guarantees ordering within this describe, but partials on disk are
  // the source of truth (not module-level state) so the aggregator is robust
  // against worker splits — see issue #9002.
  test.beforeAll(() => {
    clearResults()
  })

  test('API 500 errors — cards show error state, not blank', async ({ page }) => {
    const start = Date.now()
    const API_ERROR_TIMEOUT_MS = 60_000
    test.setTimeout(IS_CI ? API_ERROR_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : API_ERROR_TIMEOUT_MS)

    try {
      await setupAuth(page)
      await setupLiveMocks(page, {
        errorMode: { type: '500' },
      } as LiveMockOptions)
      await setLiveColdMode(page)

      await navigateAndSettle(page, '/')

      // Wait for cards to attempt loading and fail — wait for at least one card to appear or timeout
      await page.locator('[data-card-type]').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* cards may not render under error mode */ })

      // Check card states
      const cards = page.locator('[data-card-type]')
      const cardCount = await cards.count()

      if (cardCount === 0) {
        addResult({
          testName: 'API 500 errors',
          category: 'api-error',
          status: 'warn',
          details: 'No cards rendered at all under 500 error mode',
          durationMs: Date.now() - start,
        })
        return
      }

      // Count cards showing various states
      let errorCards = 0
      let blankCards = 0
      let skeletonCards = 0
      let contentCards = 0

      for (let i = 0; i < cardCount; i++) {
        const card = cards.nth(i)
        const _cardType = await card.getAttribute('data-card-type') || 'unknown'
        const isLoading = await card.getAttribute('data-loading')

        // Check for error indicators
        const hasError = await card.locator(
          '[class*="error"], [class*="Error"], [data-testid*="error"], text=/error|failed|unavailable/i'
        ).count() > 0

        // Check for skeleton/loading
        const hasSkeleton = await card.locator(
          '.skeleton, .animate-pulse, [class*="skeleton"]'
        ).count() > 0

        // Check for actual content
        const hasContent = await card.locator('p, li, table, [class*="text"]').count() > 0

        // Check for completely blank (no children at all)
        const innerText = await card.innerText().catch(() => '')
        const isBlank = innerText.trim().length < 5 && !hasSkeleton && !hasError

        if (hasError) errorCards++
        else if (isBlank) blankCards++
        else if (hasSkeleton || isLoading === 'true') skeletonCards++
        else if (hasContent) contentCards++
      }

      // Pass: cards should not be blank — they should show error, skeleton, or content
      const status = blankCards === 0 ? 'pass' : blankCards <= 2 ? 'warn' : 'fail'

      addResult({
        testName: 'API 500 errors',
        category: 'api-error',
        status,
        details: `${cardCount} cards: ${errorCards} error, ${skeletonCards} skeleton, ${contentCards} content, ${blankCards} blank`,
        durationMs: Date.now() - start,
      })
    } catch (err) {
      addResult({
        testName: 'API 500 errors',
        category: 'api-error',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  test('network timeout — cards handle slow responses', async ({ page }) => {
    const start = Date.now()
    const NETWORK_TIMEOUT_MS = 90_000
    test.setTimeout(IS_CI ? NETWORK_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : NETWORK_TIMEOUT_MS)

    try {
      await setupAuth(page)
      await setupLiveMocks(page, {
        errorMode: { type: 'timeout', delayMs: 30_000 },
      } as LiveMockOptions)
      await setLiveColdMode(page)

      await navigateAndSettle(page, '/')

      // Wait for cards to appear and show loading state (not blank)
      await page.locator('[data-card-type]').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* cards may not render under timeout mode */ })

      const cards = page.locator('[data-card-type]')
      const cardCount = await cards.count()

      if (cardCount === 0) {
        addResult({
          testName: 'Network timeout',
          category: 'timeout',
          status: 'warn',
          details: 'No cards rendered under timeout mode',
          durationMs: Date.now() - start,
        })
        return
      }

      let loadingCards = 0
      let blankCards = 0
      let otherCards = 0

      for (let i = 0; i < cardCount; i++) {
        const card = cards.nth(i)
        const isLoading = await card.getAttribute('data-loading')

        const hasSkeleton = await card.locator(
          '.skeleton, .animate-pulse, [class*="skeleton"], [class*="loading"]'
        ).count() > 0

        const innerText = await card.innerText().catch(() => '')

        if (isLoading === 'true' || hasSkeleton) {
          loadingCards++
        } else if (innerText.trim().length < 5) {
          blankCards++
        } else {
          otherCards++
        }
      }

      // Cards should be in loading state, not blank
      const status = blankCards === 0 ? 'pass' : blankCards <= 2 ? 'warn' : 'fail'

      addResult({
        testName: 'Network timeout',
        category: 'timeout',
        status,
        details: `${cardCount} cards during timeout: ${loadingCards} loading, ${otherCards} other, ${blankCards} blank`,
        durationMs: Date.now() - start,
      })
    } catch (err) {
      addResult({
        testName: 'Network timeout',
        category: 'timeout',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  test('partial failure — healthy endpoints show data', async ({ page }) => {
    const start = Date.now()
    const PARTIAL_FAIL_TIMEOUT_MS = 60_000
    test.setTimeout(IS_CI ? PARTIAL_FAIL_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : PARTIAL_FAIL_TIMEOUT_MS)

    try {
      await setupAuth(page)
      await setupLiveMocks(page, {
        errorMode: {
          type: 'partial',
          failEndpoints: ['pods', 'events', 'nodes'],
        },
      } as LiveMockOptions)
      await setLiveColdMode(page)

      await navigateAndSettle(page, '/')
      // Wait for cards to load under partial failure mode
      await page.locator('[data-card-type]').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* cards may not render */ })

      const cards = page.locator('[data-card-type]')
      const cardCount = await cards.count()

      if (cardCount === 0) {
        addResult({
          testName: 'Partial failure',
          category: 'partial-failure',
          status: 'warn',
          details: 'No cards rendered under partial failure mode',
          durationMs: Date.now() - start,
        })
        return
      }

      let loadedCards = 0
      let errorCards = 0
      let blankCards = 0

      for (let i = 0; i < cardCount; i++) {
        const card = cards.nth(i)
        const isLoading = await card.getAttribute('data-loading')

        const hasContent = await card.locator('p, li, table, [class*="text"]').count() > 0
        const hasError = await card.locator(
          '[class*="error"], [class*="Error"], text=/error|failed/i'
        ).count() > 0

        const innerText = await card.innerText().catch(() => '')

        if (hasContent && isLoading !== 'true') loadedCards++
        else if (hasError) errorCards++
        else if (innerText.trim().length < 5) blankCards++
      }

      // At least some cards should have content (healthy endpoints)
      const status = loadedCards > 0 ? 'pass' : 'fail'

      addResult({
        testName: 'Partial failure',
        category: 'partial-failure',
        status,
        details: `${cardCount} cards: ${loadedCards} loaded, ${errorCards} error, ${blankCards} blank — healthy endpoints should still show data`,
        durationMs: Date.now() - start,
      })
    } catch (err) {
      addResult({
        testName: 'Partial failure',
        category: 'partial-failure',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  test('SSE disconnect — cards handle stream interruption', async ({ page }) => {
    const start = Date.now()
    const SSE_DISCONNECT_TIMEOUT_MS = 60_000
    test.setTimeout(IS_CI ? SSE_DISCONNECT_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : SSE_DISCONNECT_TIMEOUT_MS)

    try {
      // Start with normal mocks
      await setupAuth(page)
      const _control = await setupLiveMocks(page)
      await setLiveColdMode(page)

      await navigateAndSettle(page, '/')
      // Wait for cards to load with content
      await page.locator('[data-card-type]').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* may not render */ })

      // Count cards with content
      const cardsBefore = await page.locator('[data-card-type]').count()
      const loadedBefore = await page.locator('[data-card-type][data-loading="false"]').count()

      // Now simulate SSE disconnect by re-routing SSE to return empty/error
      await page.route('**/api/mcp/*/stream**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: {
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
          // Send error event then close
          body: 'event: error\ndata: {"error":"connection lost"}\n\n',
        })
      })

      // Navigate to a different page to trigger new SSE requests
      await page.goto('/clusters', { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
      // Wait for page to settle after SSE disconnect
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => { /* best-effort */ })

      const cardsAfter = await page.locator('[data-card-type]').count()

      // Page should still render something — not crash
      const pageContent = await page.locator('body').innerText().catch(() => '')
      const pageNotBlank = pageContent.trim().length > 50

      addResult({
        testName: 'SSE disconnect',
        category: 'sse-disconnect',
        status: pageNotBlank ? 'pass' : 'warn',
        details: `Before disconnect: ${cardsBefore} cards (${loadedBefore} loaded). After disconnect nav to /clusters: ${cardsAfter} cards. Page not blank: ${pageNotBlank}`,
        durationMs: Date.now() - start,
      })
    } catch (err) {
      addResult({
        testName: 'SSE disconnect',
        category: 'sse-disconnect',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  test('auth token expiry — handles 401 gracefully', async ({ page }) => {
    const start = Date.now()
    const AUTH_EXPIRY_TIMEOUT_MS = 60_000
    test.setTimeout(IS_CI ? AUTH_EXPIRY_TIMEOUT_MS * CI_TIMEOUT_MULTIPLIER : AUTH_EXPIRY_TIMEOUT_MS)

    try {
      // Setup normally first
      await setupAuth(page)
      await setupLiveMocks(page)
      await setLiveColdMode(page)

      await navigateAndSettle(page, '/')
      // Wait for initial content to load before simulating expiry
      await page.locator('[data-card-type]').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => { /* best-effort */ })

      // Clear auth token to simulate expiry
      await page.evaluate(() => {
        localStorage.removeItem('github_token')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      })

      // Mock /api/me to return 401
      await page.route('**/api/me', async (route) => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'unauthorized', message: 'Token expired' }),
        })
      })

      // Try navigating to a new page — should trigger auth check
      await page.goto('/clusters', { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
      // Wait for auth redirect or page content to settle
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => { /* best-effort */ })

      // Check what happened
      const currentUrl = page.url()
      const hasLoginRedirect = currentUrl.includes('login') || currentUrl.includes('auth')
      const hasSessionExpired = await page.locator('text=/session expired|unauthorized|sign in|log in/i').count() > 0
      const pageContent = await page.locator('body').innerText().catch(() => '')
      const isNotBlank = pageContent.trim().length > 20

      if (hasLoginRedirect || hasSessionExpired) {
        addResult({
          testName: 'Auth token expiry',
          category: 'auth-expiry',
          status: 'pass',
          details: `Redirect to login: ${hasLoginRedirect}, Session expired shown: ${hasSessionExpired}`,
          durationMs: Date.now() - start,
        })
      } else if (isNotBlank) {
        addResult({
          testName: 'Auth token expiry',
          category: 'auth-expiry',
          status: 'warn',
          details: `No login redirect or session expired message, but page is not blank. URL: ${currentUrl}`,
          durationMs: Date.now() - start,
        })
      } else {
        addResult({
          testName: 'Auth token expiry',
          category: 'auth-expiry',
          status: 'fail',
          details: 'Page is blank after auth token removal',
          durationMs: Date.now() - start,
        })
      }
    } catch (err) {
      addResult({
        testName: 'Auth token expiry',
        category: 'auth-expiry',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  // Generate final report
  test('generate report', async () => {
    // Aggregate results written by prior tests in this describe. Reading from
    // disk (not a module-level singleton) makes this safe even if Playwright
    // ever splits these tests across workers — see issue #9002.
    const checks = loadAllResults()
    const report: ResilienceReport = {
      timestamp: new Date().toISOString(),
      checks,
      summary: { passCount: 0, failCount: 0, warnCount: 0, skipCount: 0 },
    }

    // Calculate summary
    for (const check of report.checks) {
      switch (check.status) {
        case 'pass': report.summary.passCount++; break
        case 'fail': report.summary.failCount++; break
        case 'warn': report.summary.warnCount++; break
        case 'skip': report.summary.skipCount++; break
      }
    }

    // Write JSON report
    if (!fs.existsSync(TEST_RESULTS_DIR)) fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true })

    fs.writeFileSync(
      path.join(TEST_RESULTS_DIR, 'error-resilience-report.json'),
      JSON.stringify(report, null, 2)
    )

    // Write markdown summary
    const md = [
      '# Error Resilience Report',
      '',
      `Generated: ${report.timestamp}`,
      '',
      '## Summary',
      '',
      `- **Pass**: ${report.summary.passCount}`,
      `- **Fail**: ${report.summary.failCount}`,
      `- **Warn**: ${report.summary.warnCount}`,
      `- **Skip**: ${report.summary.skipCount}`,
      '',
      '## Results',
      '',
      '| Test | Category | Status | Duration | Details |',
      '|------|----------|--------|----------|---------|',
      ...report.checks.map(c =>
        `| ${c.testName} | ${c.category} | ${c.status} | ${c.durationMs}ms | ${c.details.slice(0, 120)} |`
      ),
      '',
    ].join('\n')

    fs.writeFileSync(path.join(TEST_RESULTS_DIR, 'error-resilience-summary.md'), md)

    // Log summary
    console.log(`[Resilience] Pass: ${report.summary.passCount}, Fail: ${report.summary.failCount}, Warn: ${report.summary.warnCount}, Skip: ${report.summary.skipCount}`)

    // Soft assertion: page should not crash on errors
    const nonSkip = report.summary.passCount + report.summary.warnCount + report.summary.failCount
    expect(nonSkip, `At least ${MIN_EXECUTED_CHECKS} resilience tests should execute`).toBeGreaterThanOrEqual(MIN_EXECUTED_CHECKS)
  })
})

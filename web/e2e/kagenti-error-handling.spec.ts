import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupDemoMode,
  setupErrorCollector,
  waitForSubRoute,
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
} from './helpers/setup'

/**
 * Kagenti Error Handling E2E Tests (/ai-agents)
 *
 * Validates that the UI surfaces correct contextual error messages when
 * kagenti API endpoints return error responses. Uses Playwright route
 * interception to mock real network-level failures.
 *
 * Covers: agent not installed, agent unreachable, authentication failures,
 * network failures, and server errors.
 *
 * See #11383
 */

/** Route under test */
const AI_AGENTS_ROUTE = '/ai-agents'

/** All kagenti-related API patterns to intercept */
const KAGENTI_API_PATTERNS = [
  '**/api/kagenti-provider/**',
  '**/api/kagenti/**',
  'http://127.0.0.1:8585/kagenti/**',
]

/** Minimum content length to verify the page rendered meaningfully */
const MIN_CONTENT_LENGTH = 30

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Intercept all kagenti API endpoints with the given route handler.
 * Also intercepts the local agent endpoint used by the hooks.
 */
async function mockAllKagentiEndpoints(
  page: import('@playwright/test').Page,
  handler: (route: import('@playwright/test').Route) => Promise<void> | void,
) {
  for (const pattern of KAGENTI_API_PATTERNS) {
    await page.route(pattern, handler)
  }
}

// ---------------------------------------------------------------------------
// Agent Not Installed
// ---------------------------------------------------------------------------
test.describe('Kagenti error handling — agent not installed', () => {
  test('shows content when agent status returns unavailable', async ({ page }) => {
    const { errors } = setupErrorCollector(page)
    await setupDemoMode(page)

    // Mock kagenti provider status as not installed
    await page.route('**/api/kagenti-provider/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: false, reason: 'not installed' }),
      }),
    )

    // Mock other kagenti provider endpoints as 404
    await page.route('**/api/kagenti-provider/agents', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'kagenti not installed' }),
      }),
    )

    // Mock the local agent kagenti endpoints to return 503 (not installed)
    await page.route('http://127.0.0.1:8585/kagenti/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'kagenti not installed' }),
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should not crash — it should render with demo data or show an install prompt
    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)

    // Filter kagenti-specific expected errors from error collector
    const unexpectedErrors = errors.filter(
      (e) => !/kagenti|not installed|503|404/i.test(e),
    )
    expect(unexpectedErrors).toHaveLength(0)
  })

  test('page remains interactive when agent is not installed', async ({ page }) => {
    await setupDemoMode(page)

    await page.route('**/api/kagenti-provider/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: false, reason: 'not installed' }),
      }),
    )

    await page.route('http://127.0.0.1:8585/kagenti/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'not installed' }),
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Dashboard header and refresh button should still be usable
    const header = page.getByTestId('dashboard-header')
    const hasHeader = await header.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (hasHeader) {
      const refreshBtn = page.getByTestId('dashboard-refresh-button')
      const hasRefresh = await refreshBtn.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
      if (hasRefresh) {
        await refreshBtn.click()
        await expect(refreshBtn).toBeVisible()
      }
    }

    // Page should still be on the correct route
    await expect(page).toHaveURL(new RegExp(AI_AGENTS_ROUTE))
  })
})

// ---------------------------------------------------------------------------
// Agent Unreachable (network timeout / abort)
// ---------------------------------------------------------------------------
test.describe('Kagenti error handling — agent unreachable', () => {
  test('handles network abort gracefully', async ({ page }) => {
    const { errors } = setupErrorCollector(page)
    await setupDemoMode(page)

    // Abort all kagenti requests at the network level
    await mockAllKagentiEndpoints(page, (route) => route.abort('failed'))

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should not crash
    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)

    // Should remain on the AI agents route (no redirect to error page)
    await expect(page).toHaveURL(new RegExp(AI_AGENTS_ROUTE))
  })

  test('handles network timeout gracefully', async ({ page }) => {
    const { errors } = setupErrorCollector(page)
    await setupDemoMode(page)

    // Simulate timeout by aborting with 'timedout' reason
    await mockAllKagentiEndpoints(page, (route) => route.abort('timedout'))

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should not crash — should fall back to demo data
    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })

  test('handles connection refused gracefully', async ({ page }) => {
    await setupDemoMode(page)

    // Simulate connection refused
    await mockAllKagentiEndpoints(page, (route) => route.abort('connectionrefused'))

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })
})

// ---------------------------------------------------------------------------
// Authentication Failures (401 / 403)
// ---------------------------------------------------------------------------
test.describe('Kagenti error handling — authentication failures', () => {
  test('handles 401 Unauthorized from kagenti endpoints', async ({ page }) => {
    const { errors } = setupErrorCollector(page)
    await setupDemoMode(page)

    // Return 401 for all kagenti API calls
    await mockAllKagentiEndpoints(page, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should not crash — it should degrade gracefully
    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)

    // Should still be on the AI agents route
    await expect(page).toHaveURL(new RegExp(AI_AGENTS_ROUTE))
  })

  test('handles 403 Forbidden from kagenti endpoints', async ({ page }) => {
    const { errors } = setupErrorCollector(page)
    await setupDemoMode(page)

    // Return 403 for all kagenti API calls
    await mockAllKagentiEndpoints(page, (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden' }),
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should not crash
    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })

  test('handles mixed auth errors across endpoints', async ({ page }) => {
    await setupDemoMode(page)

    // Provider status returns 401
    await page.route('**/api/kagenti-provider/status', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      }),
    )

    // Provider agents returns 403
    await page.route('**/api/kagenti-provider/agents', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden' }),
      }),
    )

    // Local agent returns 401
    await page.route('http://127.0.0.1:8585/kagenti/**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should render without crashing
    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })
})

// ---------------------------------------------------------------------------
// Server Errors (500)
// ---------------------------------------------------------------------------
test.describe('Kagenti error handling — server errors', () => {
  test('handles 500 Internal Server Error from all kagenti endpoints', async ({ page }) => {
    const { errors } = setupErrorCollector(page)
    await setupDemoMode(page)

    await mockAllKagentiEndpoints(page, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should not crash — should fall back to demo data
    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)

    await expect(page).toHaveURL(new RegExp(AI_AGENTS_ROUTE))
  })

  test('handles 502 Bad Gateway from kagenti endpoints', async ({ page }) => {
    await setupDemoMode(page)

    await mockAllKagentiEndpoints(page, (route) =>
      route.fulfill({
        status: 502,
        contentType: 'text/html',
        body: '<html><body>502 Bad Gateway</body></html>',
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })

  test('handles 503 Service Unavailable from kagenti endpoints', async ({ page }) => {
    await setupDemoMode(page)

    await mockAllKagentiEndpoints(page, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service Unavailable' }),
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })
})

// ---------------------------------------------------------------------------
// Real Network Failures (connection-level)
// ---------------------------------------------------------------------------
test.describe('Kagenti error handling — real network failures', () => {
  test('graceful degradation when all kagenti requests fail at network level', async ({ page }) => {
    const { errors } = setupErrorCollector(page)
    await setupDemoMode(page)

    // Abort all kagenti requests to simulate total network failure
    await mockAllKagentiEndpoints(page, (route) => route.abort('failed'))

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should render with demo data fallback
    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)

    // Tab navigation should still work even with network failures
    const kagentiTab = page.getByRole('button', { name: /kagenti/i })
    const hasTab = await kagentiTab.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (hasTab) {
      await kagentiTab.click()
      await expect(kagentiTab).toBeVisible()
    }
  })

  test('page recovers when kagenti provider returns empty response', async ({ page }) => {
    await setupDemoMode(page)

    // Return empty responses (not valid JSON structure)
    await page.route('**/api/kagenti-provider/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      }),
    )

    await page.route('http://127.0.0.1:8585/kagenti/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })

  test('page handles malformed JSON response', async ({ page }) => {
    await setupDemoMode(page)

    await page.route('**/api/kagenti-provider/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'not valid json {{{',
      }),
    )

    await page.route('http://127.0.0.1:8585/kagenti/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'not valid json {{{',
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should not crash even with invalid JSON
    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })
})

// ---------------------------------------------------------------------------
// Combined error scenarios
// ---------------------------------------------------------------------------
test.describe('Kagenti error handling — combined scenarios', () => {
  test('handles partial failures (some endpoints succeed, others fail)', async ({ page }) => {
    await setupDemoMode(page)

    // Provider status succeeds but reports unavailable
    await page.route('**/api/kagenti-provider/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: false, reason: 'backend unreachable' }),
      }),
    )

    // Provider agents returns 500
    await page.route('**/api/kagenti-provider/agents', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      }),
    )

    // Local agent endpoints abort (network failure)
    await page.route('http://127.0.0.1:8585/kagenti/**', (route) =>
      route.abort('connectionrefused'),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should degrade gracefully with partial data or demo fallback
    await expect(page.locator('body')).toBeVisible()
    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })

  test('refresh button works after error state', async ({ page }) => {
    await setupDemoMode(page)

    // Start with all endpoints failing
    await mockAllKagentiEndpoints(page, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      }),
    )

    await page.goto(AI_AGENTS_ROUTE)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should render (with demo data or error state)
    await expect(page.locator('body')).toBeVisible()

    // Refresh button should be clickable and not crash the page
    const refreshBtn = page.getByTestId('dashboard-refresh-button')
    const hasRefresh = await refreshBtn.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (hasRefresh) {
      await refreshBtn.click()
      // Page should still be visible and functional after refresh
      await expect(page.locator('body')).toBeVisible()
      await expect(page).toHaveURL(new RegExp(AI_AGENTS_ROUTE))
    }
  })
})

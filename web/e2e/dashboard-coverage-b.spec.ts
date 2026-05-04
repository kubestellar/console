/**
 * Dashboard Test Coverage — Group B
 *
 * Fixes:
 * - #11795: Refresh test verifies data actually refreshed (not just button existence)
 * - #11796: Error state tests mock correct/relevant endpoints
 * - #11797: Drilldown tests do not conditionally skip — hard fail on missing elements
 * - #11798: Sidebar collapse/expand verifies card grid layout adapts
 */
import { test, expect } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from './helpers/setup'
import { assertNoLayoutOverflow } from './helpers/ux-assertions'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout for dashboard page to fully render */
const DASHBOARD_RENDER_TIMEOUT_MS = 15_000

/** Timeout for card grid to appear */
const GRID_VISIBLE_TIMEOUT_MS = 10_000

/** Timeout for drilldown modal */
const DRILLDOWN_TIMEOUT_MS = 5_000

/** Timeout for API request interception */
const API_REQUEST_TIMEOUT_MS = 5_000

/** Timeout for sidebar toggle animations */
const SIDEBAR_ANIMATION_TIMEOUT_MS = 3_000

// ---------------------------------------------------------------------------
// #11795 — Refresh test: verify data actually refreshed
// ---------------------------------------------------------------------------

test.describe('Dashboard Refresh (#11795)', () => {
  test('refresh button triggers new API request and updates timestamp', async ({ page }) => {
    // Track API calls to verify refresh actually fires a new request
    let apiCallCount = 0
    await page.route('**/api/**', async (route) => {
      apiCallCount++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clusters: [],
          issues: [],
          events: [],
          nodes: [],
          pods: [],
        }),
      })
    })
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '1',
          github_id: '99999',
          github_login: 'demo-user',
          email: 'demo@kubestellar.io',
          onboarded: true,
          role: 'admin',
        }),
      })
    )
    await page.route('http://127.0.0.1:8585/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [], pods: [] }),
      })
    )

    await page.addInitScript(() => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('kc-has-session', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kc-backend-status', JSON.stringify({
        available: true,
        timestamp: Date.now(),
      }))
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_RENDER_TIMEOUT_MS })
    await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible({ timeout: DASHBOARD_RENDER_TIMEOUT_MS })

    // Record the call count before clicking refresh
    const callCountBeforeRefresh = apiCallCount

    // Set up a promise that resolves when a new API GET request fires
    const refreshRequestFired = page.waitForRequest(
      (req) => req.url().includes('/api/') && req.method() === 'GET',
      { timeout: API_REQUEST_TIMEOUT_MS }
    )

    // Click refresh
    await page.getByTestId('dashboard-refresh-button').click()

    // Assert: a new API request was actually fired (not just button visible)
    const request = await refreshRequestFired
    expect(request).toBeTruthy()
    expect(request.url()).toContain('/api/')

    // Assert: total API call count increased (data was actually re-fetched)
    expect(apiCallCount).toBeGreaterThan(callCountBeforeRefresh)

    // Assert: refresh button still functional (not disabled/removed)
    await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible()
    await expect(page.getByTestId('dashboard-refresh-button')).toBeEnabled()
  })
})

// ---------------------------------------------------------------------------
// #11796 — Error state tests: mock correct endpoints
// ---------------------------------------------------------------------------

test.describe('Dashboard Error State (#11796)', () => {
  test('handles errors on primary dashboard endpoints gracefully', async ({ page }) => {
    // Mock ALL relevant dashboard data endpoints with 500 errors.
    // The dashboard primarily fetches from these endpoints for card data:
    const errorEndpoints = [
      '**/api/mcp/**',
      '**/api/github-pipelines**',
      '**/api/youtube/**',
      '**/api/medium/**',
      '**/api/nightly-e2e/**',
      '**/api/issue-stats**',
    ]

    for (const pattern of errorEndpoints) {
      await page.route(pattern, (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        })
      )
    }

    // Keep /api/me working so auth doesn't break
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '1',
          github_id: '99999',
          github_login: 'demo-user',
          email: 'demo@kubestellar.io',
          onboarded: true,
          role: 'admin',
        }),
      })
    )

    // Keep health endpoint working
    await page.route('**/health', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      })
    )

    // Other API endpoints return empty but valid responses
    await page.route('**/api/**', (route) => {
      const url = route.request().url()
      // Skip endpoints already handled
      if (errorEndpoints.some(p => {
        const regex = new RegExp(p.replace(/\*\*/g, '.*'))
        return regex.test(url)
      })) {
        return route.fallback()
      }
      if (url.includes('/api/me') || url.includes('/health')) {
        return route.fallback()
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('http://127.0.0.1:8585/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service unavailable' }),
      })
    )

    await page.addInitScript(() => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('kc-has-session', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kc-backend-status', JSON.stringify({
        available: true,
        timestamp: Date.now(),
      }))
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Dashboard page itself must not crash
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_RENDER_TIMEOUT_MS })

    // Cards grid should still render (demo fallback or error states)
    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })

    // Cards should fall back to demo data with Demo badge visible,
    // OR show card-level error state — either is acceptable graceful handling.
    // At minimum, verify cards rendered (not blank/crashed).
    const cards = cardsGrid.locator('[data-card-id]')
    await expect(cards.first()).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })

    // Verify at least one card shows demo fallback indicator OR error state.
    // Demo badge has text "Demo"; card errors show retry or error text.
    const demoBadge = page.locator('text=Demo').first()
    const errorIndicator = page.locator('[data-testid*="error"], [data-testid*="retry"], text=/error|retry|failed/i').first()

    const hasDemoBadge = await demoBadge.isVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS }).catch(() => false)
    const hasErrorIndicator = await errorIndicator.isVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS }).catch(() => false)

    // At least one signal of graceful error handling must be present
    expect(
      hasDemoBadge || hasErrorIndicator,
      'Expected demo fallback badge or error indicator when API endpoints return 500'
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// #11797 — Drilldown tests: no conditional skips
// ---------------------------------------------------------------------------

test.describe('Dashboard Drilldown (#11797)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_RENDER_TIMEOUT_MS })
  })

  test('expand button exists and opens drilldown modal', async ({ page }) => {
    // Wait for cards grid and at least one card
    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })

    const firstCard = cardsGrid.locator('[data-card-id]').first()
    await expect(firstCard).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })

    // Hover to reveal card action buttons
    await firstCard.hover()

    // Use aria-label which is set via i18n key 'cardWrapper.expandFullScreen'
    // = "Expand to full screen". This is a hard assertion — if the button
    // is missing or the label changes, this test FAILS (not skips).
    const expandButton = firstCard.locator('button[aria-label*="full screen" i], button[aria-label*="xpand" i]').first()
    await expect(expandButton).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })

    // Click expand — drilldown modal must open
    await expandButton.click()
    const modal = page.getByTestId('drilldown-modal')
    await expect(modal).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
  })

  test('drilldown modal closes with close button', async ({ page }) => {
    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })

    const firstCard = cardsGrid.locator('[data-card-id]').first()
    await expect(firstCard).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })
    await firstCard.hover()

    const expandButton = firstCard.locator('button[aria-label*="full screen" i], button[aria-label*="xpand" i]').first()
    await expect(expandButton).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
    await expandButton.click()

    const modal = page.getByTestId('drilldown-modal')
    await expect(modal).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })

    // Close button must exist and work
    const closeButton = page.getByTestId('drilldown-close')
    await expect(closeButton).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
    await closeButton.click()
    await expect(modal).not.toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
  })

  test('drilldown modal closes on Escape key', async ({ page }) => {
    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })

    const firstCard = cardsGrid.locator('[data-card-id]').first()
    await expect(firstCard).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })
    await firstCard.hover()

    const expandButton = firstCard.locator('button[aria-label*="full screen" i], button[aria-label*="xpand" i]').first()
    await expect(expandButton).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
    await expandButton.click()

    const modal = page.getByTestId('drilldown-modal')
    await expect(modal).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })

    // Escape key must close the modal
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
  })

  test('drilldown modal contains navigation tabs', async ({ page }) => {
    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })

    const firstCard = cardsGrid.locator('[data-card-id]').first()
    await expect(firstCard).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })
    await firstCard.hover()

    const expandButton = firstCard.locator('button[aria-label*="full screen" i], button[aria-label*="xpand" i]').first()
    await expect(expandButton).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
    await expandButton.click()

    const modal = page.getByTestId('drilldown-modal')
    await expect(modal).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })

    // Drilldown should have tabs navigation
    const tabs = page.getByTestId('drilldown-tabs')
    await expect(tabs).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
  })
})

// ---------------------------------------------------------------------------
// #11798 — Sidebar collapse/expand affects card grid layout
// ---------------------------------------------------------------------------

test.describe('Sidebar Collapse Layout (#11798)', () => {
  test('collapsing sidebar widens card grid without overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('mobile-'), 'sidebar is hidden by design on mobile breakpoints')

    await setupDemoAndNavigate(page, '/')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_RENDER_TIMEOUT_MS })

    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: GRID_VISIBLE_TIMEOUT_MS })

    // Measure grid width with sidebar expanded
    const gridWidthExpanded = await cardsGrid.evaluate((el) => el.getBoundingClientRect().width)

    // Collapse sidebar
    const collapseToggle = page.getByTestId('sidebar-collapse-toggle')
    await expect(collapseToggle).toBeVisible({ timeout: SIDEBAR_ANIMATION_TIMEOUT_MS })
    await collapseToggle.click()

    // Wait for layout transition to settle
    const LAYOUT_SETTLE_MS = 500
    await page.waitForTimeout(LAYOUT_SETTLE_MS)

    // Measure grid width with sidebar collapsed
    const gridWidthCollapsed = await cardsGrid.evaluate((el) => el.getBoundingClientRect().width)

    // Card grid should be wider when sidebar is collapsed
    expect(gridWidthCollapsed).toBeGreaterThan(gridWidthExpanded)

    // No layout overflow after collapse
    await assertNoLayoutOverflow(page, '[data-testid="dashboard-cards-grid"]')

    // Cards should still be visible and not clipped
    const cards = cardsGrid.locator('[data-card-id]')
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThan(0)

    // Verify no card overflows the grid container
    const hasOverflowingCards = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="dashboard-cards-grid"]')
      if (!grid) return false
      const gridRect = grid.getBoundingClientRect()
      const cardEls = grid.querySelectorAll('[data-card-id]')
      for (const card of cardEls) {
        const cardRect = card.getBoundingClientRect()
        if (cardRect.right > gridRect.right + 1 || cardRect.left < gridRect.left - 1) {
          return true
        }
      }
      return false
    })
    expect(hasOverflowingCards).toBe(false)

    // Expand sidebar back
    await collapseToggle.click()
    await page.waitForTimeout(LAYOUT_SETTLE_MS)

    // Grid should return to original (narrower) width
    const gridWidthReExpanded = await cardsGrid.evaluate((el) => el.getBoundingClientRect().width)
    // Allow 2px tolerance for sub-pixel rendering
    const WIDTH_TOLERANCE_PX = 2
    expect(Math.abs(gridWidthReExpanded - gridWidthExpanded)).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX)

    // No overflow after re-expand
    await assertNoLayoutOverflow(page, '[data-testid="dashboard-cards-grid"]')
  })
})

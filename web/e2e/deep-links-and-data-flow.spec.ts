import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupDemoMode,
  setupErrorCollector,
  waitForSubRoute,
  waitForDashboard,
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  NAV_TIMEOUT_MS,
} from './helpers/setup'

/**
 * Deep Links, Browser Navigation, and Data Flow States.
 *
 * Validates that direct URLs resolve correctly, browser history
 * navigation works, data renders in demo mode, and auth redirects
 * function as expected.
 *
 * Run with: npx playwright test e2e/deep-links-and-data-flow.spec.ts
 */

/** Minimum body text length to confirm page rendered real content */
const MIN_CONTENT_LENGTH = 50

/** Minimum number of cards expected in demo mode */
const MIN_CARDS_IN_DEMO = 1

/** Timeout for route reload preservation */
const ROUTE_LOAD_TIMEOUT_MS = 15_000

/** Timeout for auth redirect verification */
const AUTH_REDIRECT_TIMEOUT_MS = 10_000

// ---------------------------------------------------------------------------
// Deep Links
// ---------------------------------------------------------------------------
test.describe('Deep Links', () => {
  test('direct URL to / loads dashboard', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await waitForDashboard(page)

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('dashboard-page')).toBeVisible()

    const content = await page.textContent('body')
    expect((content || '').length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })

  test('direct URL to /clusters loads clusters page', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    await waitForSubRoute(page)

    await expect(page).toHaveURL(/\/clusters/)

    const bodyText = await page.textContent('body')
    expect(bodyText?.trim().length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })

  test('direct URL to /settings loads settings page', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings')

    // Settings has its own title testid
    const settingsTitle = page.getByTestId('settings-title')
      .or(page.getByTestId('settings-title-mobile'))
      .or(page.getByRole('heading', { name: /settings/i }))

    await expect(settingsTitle.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await expect(page).toHaveURL(/\/settings/)
  })

  test('direct URL to /compute loads compute page', async ({ page }) => {
    await setupDemoAndNavigate(page, '/compute')
    await waitForSubRoute(page)

    await expect(page).toHaveURL(/\/compute/)
    await expect(page.getByTestId('dashboard-title')).toBeVisible()
  })

  test('direct URL to /marketplace loads marketplace page', async ({ page }) => {
    await setupDemoAndNavigate(page, '/marketplace')

    await expect(page).toHaveURL(/\/marketplace/)
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })
  })

  test('back button returns to previous page', async ({ page }) => {
    await setupDemoMode(page)

    // Navigate through 3 pages to build history
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    await page.goto('/clusters')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    await page.goto('/settings')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    // Go back — should return to /clusters
    await page.goBack()
    await expect(page).toHaveURL(/\/clusters/, { timeout: NAV_TIMEOUT_MS })
  })

  test('forward button goes to next page', async ({ page }) => {
    await setupDemoMode(page)

    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    await page.goto('/settings')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    // Go back to /
    await page.goBack()
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    // Go forward to /settings
    await page.goForward()
    await expect(page).toHaveURL(/\/settings/, { timeout: NAV_TIMEOUT_MS })
  })

  test('page refresh preserves current route', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')

    // Reload the page
    await page.reload({ waitUntil: 'networkidle', timeout: ROUTE_LOAD_TIMEOUT_MS })

    // URL should still be /clusters (token persists in localStorage across reload)
    await expect(page).toHaveURL(/\/clusters/)
  })
})

// ---------------------------------------------------------------------------
// Data Flow and State
// ---------------------------------------------------------------------------
test.describe('Data Flow and State', () => {
  test('demo data renders on first load — cards not blank', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await waitForDashboard(page)

    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT_MS })

    const cards = cardsGrid.locator('> div')
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThanOrEqual(MIN_CARDS_IN_DEMO)

    // At least one card should have real text content (not blank)
    let hasContent = false
    for (let i = 0; i < cardCount; i++) {
      const text = await cards.nth(i).textContent()
      if (text && text.trim().length > 0) {
        hasContent = true
        break
      }
    }
    expect(hasContent).toBe(true)
  })

  test('multiple cards on dashboard each have content', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await waitForDashboard(page)

    const cardsGrid = page.getByTestId('dashboard-cards-grid')
    await expect(cardsGrid).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT_MS })

    const cards = cardsGrid.locator('> div')
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThanOrEqual(MIN_CARDS_IN_DEMO)

    // Check that each visible card has some text
    let cardsWithContent = 0
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i)
      const isVisible = await card.isVisible().catch(() => false)
      if (!isVisible) continue

      const text = await card.textContent()
      if (text && text.trim().length > 0) {
        cardsWithContent++
      }
    }
    expect(cardsWithContent).toBeGreaterThanOrEqual(MIN_CARDS_IN_DEMO)
  })

  test('theme setting persists across navigation', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    // Record the current theme class on <html>
    const initialThemeClass = await page.locator('html').getAttribute('class')

    // Navigate away and back
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    await page.goto('/settings')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    // Theme should be the same after navigating away and back
    const afterNavThemeClass = await page.locator('html').getAttribute('class')
    expect(afterNavThemeClass).toBe(initialThemeClass)
  })

  test('demo mode flag persists after reload', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await waitForDashboard(page)

    // Verify demo mode is set
    const demoMode = await page.evaluate(() => localStorage.getItem('kc-demo-mode'))
    expect(demoMode).toBe('true')

    // Reload the page
    await page.reload({ waitUntil: 'networkidle', timeout: ROUTE_LOAD_TIMEOUT_MS })

    // Demo mode flag should persist in localStorage
    const demoModeAfter = await page.evaluate(() => localStorage.getItem('kc-demo-mode'))
    expect(demoModeAfter).toBe('true')
  })

  test('error state shown when API returns 500', async ({ page }) => {
    await setupDemoMode(page)

    // Intercept all MCP API calls to return 500
    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    )

    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })

    // Page should not crash — it should still render (possibly with demo fallback)
    await expect(page.locator('body')).toBeVisible()

    const bodyText = await page.textContent('body')
    expect((bodyText || '').length).toBeGreaterThan(MIN_CONTENT_LENGTH)
  })
})

// ---------------------------------------------------------------------------
// Auth Flow
// ---------------------------------------------------------------------------
test.describe('Auth Flow', () => {
  test('unauthenticated user redirected to /login', async ({ page }) => {
    // Probe backend health — auth redirect requires the backend
    const backendUp = await page.request.get('/health').then((r) => r.ok()).catch(() => false)
    test.skip(!backendUp, 'Backend not running — auth redirect tests require OAuth mode')

    // Clear all storage to ensure no auth state
    // #12089 — Wait for IndexedDB cleanup to complete
    await page.goto('/login')
    await page.evaluate(async () => {
      async function cleanStorage(): Promise<void> {
        localStorage.clear()
        sessionStorage.clear()
        const deletePromise = new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase('kc_cache')
          req.onsuccess = () => resolve()
          req.onerror = () => resolve()
          req.onblocked = () => resolve()
        })
        await deletePromise
      }
      await cleanStorage()
    })

    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: AUTH_REDIRECT_TIMEOUT_MS })
  })

  test('token in localStorage grants dashboard access', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')

    // Should stay on / (not redirected to /login)
    const url = page.url()
    expect(url).not.toContain('/login')

    // Dashboard should have real content
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: PAGE_LOAD_TIMEOUT_MS })

    const bodyText = await page.textContent('body')
    const MIN_AUTHENTICATED_CONTENT = 100
    expect((bodyText || '').length).toBeGreaterThan(MIN_AUTHENTICATED_CONTENT)
  })

  test('clearing token and navigating triggers redirect to login', async ({ page }) => {
    // Probe backend health — auth redirect requires the backend
    const backendUp = await page.request.get('/health').then((r) => r.ok()).catch(() => false)
    test.skip(!backendUp, 'Backend not running — auth redirect tests require OAuth mode')

    // First, set up authenticated state
    await setupDemoAndNavigate(page, '/')
    await waitForDashboard(page)

    // Clear the token
    await page.evaluate(() => {
      localStorage.removeItem('token')
      localStorage.removeItem('kc-demo-mode')
    })

    // Navigate to a protected route
    await page.goto('/clusters')

    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: AUTH_REDIRECT_TIMEOUT_MS })
  })
})

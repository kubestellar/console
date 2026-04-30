import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * Sets up authentication and mocks for custom dashboard tests
 */
async function setupCustomDashboardTest(page: Page) {
  // Catch-all API mock prevents unmocked requests hanging in webkit/firefox.
  // Must be registered BEFORE specific mocks (Playwright matches in reverse
  // registration order). Without this, unmocked /health and /api/** requests
  // cause Firefox/WebKit to wait indefinitely or redirect to /login. (#11003)
  await mockApiFallback(page)

  // Mock authentication
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
      }),
    })
  )

  // Mock MCP endpoints
  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [] }),
    })
  )

  // Mock dashboards API
  await page.route('**/api/dashboards', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `dashboard-${Date.now()}`,
          name: 'New Dashboard',
          cards: [],
        }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    }
  })

  // Seed localStorage BEFORE any page script runs so the auth guard sees
  // the token on first execution. page.evaluate() runs after the page has
  // already parsed and executed scripts, which is too late for webkit/Safari
  // where the auth redirect fires synchronously on script evaluation.
  // page.addInitScript() injects the snippet ahead of any page code (#9096).
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
  })

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  // WebKit/Firefox are slower to stabilize the DOM — wait for the root
  // layout to be visible so assertions in beforeEach don't time out. (#11003)
  const ROOT_VISIBLE_TIMEOUT_MS = 15_000
  await page.locator('#root').waitFor({ state: 'visible', timeout: ROOT_VISIBLE_TIMEOUT_MS })
}

test.describe('Custom Dashboard Creation', () => {
  test.beforeEach(async ({ page }) => {
    await setupCustomDashboardTest(page)
  })

  test.describe('Dashboard Display', () => {
    test('displays dashboard page', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('shows sidebar', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 5000 })
    })

    test('shows cards grid', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Sidebar Functionality', () => {
    test('sidebar has customize button', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })
      // WebKit renders sidebar content slightly later than Chromium/Firefox —
      // the "Add more" button depends on navSections being mounted. #10200
      await expect(page.getByTestId('sidebar-customize')).toBeVisible({ timeout: 10000 })
    })

    test('customize button is clickable', async ({ page }) => {
      // WebKit renders sidebar content slower — use a longer timeout. #10200
      await expect(page.getByTestId('sidebar-customize')).toBeVisible({ timeout: 10000 })

      await page.getByTestId('sidebar-customize').click()

      // Should open customizer (modal or panel)
      // The exact UI may vary, but the button should be clickable
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Accessibility', () => {
    test('page is keyboard navigable', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })
  })
})

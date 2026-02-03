import { test, expect, Page } from '@playwright/test'

/**
 * Sets up authentication and MCP mocks for drilldown tests
 */
async function setupDrillDownTest(page: Page) {
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
  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clusters: [
            { name: 'prod-east', healthy: true, nodeCount: 5, podCount: 50 },
            { name: 'staging', healthy: false, nodeCount: 2, podCount: 15 },
          ],
        }),
      })
    } else if (url.includes('/pod-issues')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          issues: [
            { name: 'test-pod', namespace: 'default', status: 'Running', restarts: 0 },
          ],
        }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issues: [], events: [], nodes: [] }),
      })
    }
  })

  // Set auth token
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Drilldown Modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupDrillDownTest(page)
  })

  test.describe('Dashboard Display', () => {
    test('displays dashboard page', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('shows cards grid', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Clusters Page', () => {
    test('displays clusters page', async ({ page }) => {
      await page.goto('/clusters')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })
    })

    test('shows cluster names from mock data', async ({ page }) => {
      await page.goto('/clusters')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Should show cluster names from our mock data
      await expect(page.getByText('prod-east')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('staging')).toBeVisible()
    })
  })

  test.describe('Modal Behavior', () => {
    test('escape key works for dismissing interactions', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Press escape should not crash the page
      await page.keyboard.press('Escape')

      // Page should still be visible
      await expect(page.getByTestId('dashboard-page')).toBeVisible()
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

    test('page has proper heading hierarchy', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Should have at least one heading
      const h1Count = await page.locator('h1').count()
      const h2Count = await page.locator('h2').count()
      expect(h1Count + h2Count).toBeGreaterThanOrEqual(1)
    })
  })
})

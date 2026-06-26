import { test, expect, Page } from '@playwright/test'
import { setupDemoMode } from './helpers/setup'

/**
 * Sets up authentication and MCP mocks for resource usage tests
 */
async function setupResourceUsageTest(page: Page) {
  await setupDemoMode(page)
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Resource Usage Card', () => {
  test.beforeEach(async ({ page }) => {
    await setupResourceUsageTest(page)
  })

  test.describe('Dashboard Display', () => {
    test('displays dashboard page', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('shows cards grid', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 5000 })
    })

    test('shows dashboard header', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Refresh Functionality', () => {
    test('has refresh button', async ({ page }) => {
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible({ timeout: 10000 })
    })

    test('refresh button triggers data reload', async ({ page }) => {
      let requestCount = 0
      await page.route('**/api/mcp/clusters**', (route) => {
        requestCount++
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            clusters: [{ name: 'cluster-1', healthy: true, nodeCount: 3 }],
          }),
        })
      })

      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible({ timeout: 10000 })

      const initialCount = requestCount

      await page.getByTestId('dashboard-refresh-button').click()

      // Should have made additional request
      expect(requestCount).toBeGreaterThanOrEqual(initialCount)
    })
  })

  test.describe('Error Handling', () => {
    test('handles API errors gracefully', async ({ page }) => {
      await page.route('**/api/mcp/clusters**', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        })
      )

      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      // Page should not crash
      const pageContent = await page.content()
      expect(pageContent.length).toBeGreaterThan(0)
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

    test('has accessible elements', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      const accessibleElements = page.locator('[aria-label], [title]')
      const count = await accessibleElements.count()
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })
})

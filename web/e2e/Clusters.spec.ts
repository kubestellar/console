import { test, expect, Page } from '@playwright/test'

/**
 * Sets up authentication and MCP mocks for cluster tests
 */
async function setupClustersTest(page: Page) {
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
            { name: 'prod-east', context: 'ctx-1', healthy: true, reachable: true, nodeCount: 5, podCount: 45, version: '1.28.0' },
            { name: 'prod-west', context: 'ctx-2', healthy: true, reachable: true, nodeCount: 3, podCount: 32, version: '1.27.0' },
            { name: 'staging', context: 'ctx-3', healthy: false, reachable: true, nodeCount: 2, podCount: 15, version: '1.28.0' },
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

  await page.goto('/clusters')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Clusters Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupClustersTest(page)
  })

  test.describe('Cluster List', () => {
    test('displays clusters page', async ({ page }) => {
      // Clusters page should be visible
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })
    })

    test('shows cluster names from mock data', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Should show cluster names from our mock data
      await expect(page.getByText('prod-east')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('prod-west')).toBeVisible()
      await expect(page.getByText('staging')).toBeVisible()
    })

    test('shows cluster health status indicators', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Health status should be displayed - look for healthy/unhealthy text or status dots
      // We have 2 healthy clusters and 1 unhealthy
      const healthyIndicators = page.locator('.bg-green-400, .text-green-400, [class*="green"]')
      const healthyCount = await healthyIndicators.count()
      expect(healthyCount).toBeGreaterThan(0)
    })
  })

  test.describe('Cluster Actions', () => {
    test('has refresh button in header', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible()
    })

    test('refresh button is clickable', async ({ page }) => {
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible({ timeout: 10000 })

      // Click refresh
      await page.getByTestId('dashboard-refresh-button').click()

      // Button should remain visible after click
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible()
    })
  })

  test.describe('Empty States', () => {
    test('handles no clusters gracefully', async ({ page }) => {
      // Override mock to return empty clusters
      await page.route('**/api/mcp/clusters', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [] }),
        })
      )

      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      // Page should still render (not crash)
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })

      // Page should still render at mobile size
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })

      // Content should still be accessible
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Accessibility', () => {
    test('cluster list is keyboard navigable', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('page has heading', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Should have a heading with "Clusters"
      await expect(page.getByRole('heading', { name: /clusters/i })).toBeVisible()
    })
  })
})

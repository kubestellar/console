import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * Sets up authentication and MCP mocks for cluster tests
 */
async function setupClustersTest(page: Page) {
  // Catch-all API mock prevents unmocked requests hanging in webkit/firefox
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

  // Seed localStorage BEFORE any page script runs so the auth guard sees
  // the token on first execution. page.evaluate() runs after the page has
  // already parsed and executed scripts, which is too late for webkit/Safari
  // where the auth redirect fires synchronously on script evaluation.
  // page.addInitScript() injects the snippet ahead of any page code (#9096).
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'false')
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
      // Firefox renders mock data slightly later — use consistent timeouts
      const CLUSTER_NAME_TIMEOUT_MS = 10_000
      await expect(page.getByText('prod-east')).toBeVisible({ timeout: CLUSTER_NAME_TIMEOUT_MS })
      await expect(page.getByText('prod-west')).toBeVisible({ timeout: CLUSTER_NAME_TIMEOUT_MS })
      await expect(page.getByText('staging')).toBeVisible({ timeout: CLUSTER_NAME_TIMEOUT_MS })
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

      // Should have a heading with "Clusters" — use the DashboardHeader testid
      // to avoid strict-mode violations when card titles also match /clusters/i
      await expect(page.getByTestId('dashboard-title')).toBeVisible()
      await expect(page.getByTestId('dashboard-title')).toContainText(/clusters/i)
    })
  })

  test.describe('Stats and Filter consistency', () => {
    test('Healthy stat count matches clusters shown after clicking Healthy tab', async ({ page }) => {
      // Regression test for #3045: cluster with nodeCount>0 and healthy:false was
      // counted in Healthy stats but disappeared when the Healthy filter tab was clicked.
      // Both stats and filter now use the same shared isClusterHealthy helper.
      await page.route('**/api/mcp/**', (route) => {
        const url = route.request().url()
        if (url.includes('/clusters')) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              clusters: [
                // nodeCount>0 + healthy:false → isClusterHealthy returns true (has reporting nodes)
                { name: 'node-healthy-flag-false', context: 'ctx-a', healthy: false, reachable: true, nodeCount: 3, podCount: 10, version: '1.28.0' },
                // nodeCount:0 + healthy:true → isClusterHealthy returns true (healthy flag)
                { name: 'flag-healthy-no-nodes', context: 'ctx-b', healthy: true, reachable: true, nodeCount: 0, podCount: 0, version: '1.28.0' },
                // nodeCount:0 + healthy:false → isClusterHealthy returns false (unhealthy)
                { name: 'truly-unhealthy', context: 'ctx-c', healthy: false, reachable: true, nodeCount: 0, podCount: 0, version: '1.28.0' },
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

      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // The Healthy filter button should show count 2 (both node-healthy-flag-false and flag-healthy-no-nodes)
      // Firefox renders filter tabs slightly later — use generous timeout
      const FILTER_TAB_TIMEOUT_MS = 10_000
      const healthyTab = page.getByRole('button', { name: /Healthy \(2\)/ })
      await expect(healthyTab).toBeVisible({ timeout: FILTER_TAB_TIMEOUT_MS })

      // Click the Healthy filter
      await healthyTab.click()

      // Both healthy clusters must be visible — the one with nodeCount>0 but healthy:false MUST appear
      await expect(page.getByText('node-healthy-flag-false')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('flag-healthy-no-nodes')).toBeVisible({ timeout: 5000 })

      // The unhealthy cluster must NOT appear in the Healthy tab
      await expect(page.getByText('truly-unhealthy')).not.toBeVisible()
    })

    test('Unhealthy stat count matches clusters shown after clicking Unhealthy tab', async ({ page }) => {
      await page.route('**/api/mcp/**', (route) => {
        const url = route.request().url()
        if (url.includes('/clusters')) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              clusters: [
                { name: 'healthy-cluster', context: 'ctx-a', healthy: true, reachable: true, nodeCount: 3, podCount: 10, version: '1.28.0' },
                // nodeCount:0 + healthy:false → isClusterHealthy returns false (unhealthy)
                { name: 'unhealthy-no-nodes', context: 'ctx-b', healthy: false, reachable: true, nodeCount: 0, podCount: 0, version: '1.28.0' },
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

      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // The Unhealthy tab must show count 1
      const FILTER_TAB_TIMEOUT_MS = 10_000
      const unhealthyTab = page.getByRole('button', { name: /Unhealthy \(1\)/ })
      await expect(unhealthyTab).toBeVisible({ timeout: FILTER_TAB_TIMEOUT_MS })

      // Click the Unhealthy filter
      await unhealthyTab.click()

      // Only the truly unhealthy cluster should appear
      await expect(page.getByText('unhealthy-no-nodes')).toBeVisible({ timeout: 5000 })
      await expect(page.getByText('healthy-cluster')).not.toBeVisible()
    })
  })
})

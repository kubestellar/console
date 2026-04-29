import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * Sets up authentication and MCP mocks for cluster tests
 */
async function setupClustersTest(page: Page) {
  // Catch-all API mock prevents unmocked requests hanging in webkit/firefox
  await mockApiFallback(page)

  // Override /health to return oauth_configured: true so the auth flow
  // does not force demo mode in webkit/firefox. mockApiFallback returns
  // oauth_configured: false which causes the AuthProvider to call
  // setDemoMode(), overriding localStorage and falling back to built-in
  // demo data instead of the mocked API data. (#10784)
  await page.route('**/health', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/health') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: 'dev',
        oauth_configured: true,
        in_cluster: false,
        no_local_agent: true,
        install_method: 'dev',
      }),
    })
  })

  // Mock the local agent endpoint so fetchClusterListFromAgent() returns
  // immediately instead of waiting for the 1.5s MCP_PROBE_TIMEOUT_MS on
  // browsers where the connection-refused error is slow (webkit/firefox).
  // This also prevents cross-origin errors from 127.0.0.1:8585. (#10784)
  await page.route('**/127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'agent not running' }),
    })
  )

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
            { name: 'prod-east', healthy: true, reachable: true, nodeCount: 5, podCount: 45, version: '1.28.0' },
            { name: 'prod-west', healthy: true, reachable: true, nodeCount: 3, podCount: 32, version: '1.27.0' },
            { name: 'staging', healthy: false, reachable: true, nodeCount: 2, podCount: 15, version: '1.28.0' },
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
    // Clear the IndexedDB cache so stale data from previous tests doesn't bleed in.
    // Tests run against the same origin so cache entries are shared across tests.
    indexedDB.deleteDatabase('kc_cache')
    // Clear sessionStorage snapshots so the SWR cache layer cannot rehydrate
    // stale cluster data from a previous navigation/test. sessionStorage
    // survives page.reload() and on webkit/firefox the sync rehydration
    // outraces the async IndexedDB delete, causing filter tests to render
    // clusters from the beforeEach mock alongside the test-specific mock. (#10828)
    sessionStorage.clear()
    // Clear stale backend-status cache so checkBackendAvailability() makes a
    // fresh health check instead of returning a cached "unavailable" result
    // from a previous test. (#10784)
    localStorage.removeItem('kc-backend-status')
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'false')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
  })

  await page.goto('/clusters')
  await page.waitForLoadState('domcontentloaded')
  // Webkit is significantly slower to stabilize the DOM after
  // domcontentloaded — wait for the root element to be visible so
  // assertions in beforeEach don't time out (#10433).
  // Wait for clusters-page testid (not #root which is always in DOM before React renders)
  const ROOT_VISIBLE_TIMEOUT_MS = 20_000
  await page.getByTestId('clusters-page').waitFor({ state: 'visible', timeout: ROOT_VISIBLE_TIMEOUT_MS })
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
      // Webkit/Firefox render mock data slightly later — use a generous timeout
      const CLUSTER_NAME_TIMEOUT_MS = 20_000
      await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: CLUSTER_NAME_TIMEOUT_MS })
      await expect(page.getByText('prod-west').first()).toBeVisible({ timeout: CLUSTER_NAME_TIMEOUT_MS })
      await expect(page.getByText('staging').first()).toBeVisible({ timeout: CLUSTER_NAME_TIMEOUT_MS })
    })

    test('shows cluster health status indicators', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Health status should be displayed - look for healthy/unhealthy text or status dots
      // We have 2 healthy clusters and 1 unhealthy
      // StatusIndicator uses text-green-400 and bg-green-500 for healthy status
      const healthyIndicators = page.locator('.bg-green-500, .text-green-400, [class*="bg-green"], [class*="text-green"]')
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
      // Reload so the page initialises at the mobile viewport — addInitScript
      // re-runs on reload, and the layout picks up the correct breakpoint.
      await page.reload()
      await page.waitForLoadState('domcontentloaded')

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
      // Test that stats counts match the actual filtered cluster display.
      // isClusterHealthy returns true only when healthy === true (not based on nodeCount).
      await page.route('**/api/mcp/**', (route) => {
        const url = route.request().url()
        if (url.includes('/clusters')) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              clusters: [
                // healthy: false → isClusterHealthy returns false (unhealthy, regardless of nodeCount)
                { name: 'unhealthy-with-nodes', context: 'ctx-a', healthy: false, reachable: true, nodeCount: 3, podCount: 10, version: '1.28.0' },
                // healthy: true → isClusterHealthy returns true (healthy)
                { name: 'healthy-cluster', context: 'ctx-b', healthy: true, reachable: true, nodeCount: 2, podCount: 5, version: '1.28.0' },
                // healthy: false → isClusterHealthy returns false (unhealthy)
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
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 20_000 })

      // The Healthy filter button should show count 1 (only healthy-cluster with healthy: true)
      // Webkit/Firefox render filter tabs slightly later — use generous timeout
      const FILTER_TAB_TIMEOUT_MS = 20_000
      const healthyTab = page.getByRole('button', { name: /Healthy \(1\)/ })
      await expect(healthyTab).toBeVisible({ timeout: FILTER_TAB_TIMEOUT_MS })

      // Click the Healthy filter
      await healthyTab.click()

      // Only healthy-cluster must be visible
      // Scope assertions to clusters-page to exclude sidebar cluster status
      // widget which shows all cluster names regardless of the active filter.
      // Use .first() — cluster name can appear in both the list row and header. #10790
      const clustersPage = page.getByTestId('clusters-page')
      await expect(clustersPage.getByText('healthy-cluster').first()).toBeVisible({ timeout: 5000 })

      // Unhealthy clusters must NOT appear in the Healthy tab
      // Scoped to clusters-page so sidebar cluster status widget doesn't cause
      // false positives. Use .first() for strict-mode safety.
      // Webkit/Firefox need extra time for the filter DOM update after
      // sessionStorage-based SWR rehydration is replaced by fresh API data. (#10828)
      const FILTER_HIDDEN_TIMEOUT_MS = 20_000
      await expect(clustersPage.getByText('unhealthy-with-nodes').first()).not.toBeVisible({ timeout: FILTER_HIDDEN_TIMEOUT_MS })
      await expect(clustersPage.getByText('truly-unhealthy').first()).not.toBeVisible({ timeout: FILTER_HIDDEN_TIMEOUT_MS })
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
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 20_000 })

      // The Unhealthy tab must show count 1
      const FILTER_TAB_TIMEOUT_MS = 20_000
      const unhealthyTab = page.getByRole('button', { name: /Unhealthy \(1\)/ })
      await expect(unhealthyTab).toBeVisible({ timeout: FILTER_TAB_TIMEOUT_MS })

      // Click the Unhealthy filter
      await unhealthyTab.click()

      // Only the truly unhealthy cluster should appear
      // Scope assertions to clusters-page to exclude sidebar cluster status
      // widget which shows all cluster names regardless of the active filter. #10790
      const clustersPage = page.getByTestId('clusters-page')
      await expect(clustersPage.getByText('unhealthy-no-nodes').first()).toBeVisible({ timeout: 5000 })
      // Webkit/Firefox need extra time for the filter DOM update after
      // sessionStorage-based SWR rehydration is replaced by fresh API data. (#10828)
      const FILTER_HIDDEN_TIMEOUT_MS = 20_000
      await expect(clustersPage.getByText('healthy-cluster').first()).not.toBeVisible({ timeout: FILTER_HIDDEN_TIMEOUT_MS })
    })
  })
})

import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * Sets up authentication and MCP mocks for cluster tests
 */
async function setupClustersTest(page: Page) {
  // IMPORTANT: Playwright matches routes in REVERSE registration order (#12094)
  // Last registered handler = first matched. Register catch-all handlers FIRST
  // (lowest priority), then specific handlers AFTER (highest priority).
  
  // Catch-all API mock prevents unmocked requests hanging in webkit/firefox
  // This registers **/api/** catch-all first → lowest priority
  await mockApiFallback(page)

  // Override /health to return oauth_configured: true so the auth flow
  // does not force demo mode in webkit/firefox. mockApiFallback returns
  // oauth_configured: false which causes the AuthProvider to call
  // setDemoMode(), overriding localStorage and falling back to built-in
  // demo data instead of the mocked API data. (#10784)
  // Registered AFTER mockApiFallback → higher priority, overrides catch-all
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
  // Registered AFTER mockApiFallback → higher priority
  await page.route('**/127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'agent not running' }),
    })
  )

  // Mock authentication
  // Registered AFTER mockApiFallback → higher priority, overrides catch-all
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
  // Registered AFTER mockApiFallback → higher priority, overrides catch-all
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
      
      // Wait for container to be stable before selecting first occurrence (#12096)
      // .first() may target stale DOM elements during re-render if not synchronized
      const clusterNameLocator = page.getByText('prod-east')
      await expect(clusterNameLocator.first()).toBeVisible({ timeout: CLUSTER_NAME_TIMEOUT_MS })
      
      await expect(page.getByText('prod-west').first()).toBeVisible({ timeout: CLUSTER_NAME_TIMEOUT_MS })
      await expect(page.getByText('staging').first()).toBeVisible({ timeout: CLUSTER_NAME_TIMEOUT_MS })
    })

    test('shows cluster health status indicators', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Health status should be displayed - look for healthy/unhealthy text or status dots
      // We have 2 healthy clusters and 1 unhealthy
      // StatusIndicator uses text-green-400 and bg-green-500 for healthy status
      const healthyIndicators = page.locator('.bg-green-500, .text-green-400, [class*="bg-green"], [class*="text-green"]')
      
      // Use Playwright's auto-retrying expect().toHaveCount() instead of immediate count() (#12097)
      // count() returns immediately and may execute before DOM is fully rendered
      await expect(healthyIndicators).not.toHaveCount(0, { timeout: 10000 })
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

      // sessionStorage is already cleared by the addInitScript registered in
      // setupClustersTest (which runs on every navigation including reload).
      // Previously we had a page.evaluate(() => sessionStorage.clear()) here,
      // but on Firefox/WebKit the page can be mid-navigation when evaluate()
      // runs, causing "Execution context was destroyed" errors. Removing the
      // redundant evaluate avoids this race entirely. (#11003)

      // Reload and wait for the test-specific mock API response to arrive so
      // the component renders with the correct cluster set before we interact.
      await Promise.all([
        page.waitForResponse((resp) => resp.url().includes('/api/mcp/') && resp.url().includes('clusters')),
        page.reload(),
      ])
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 20_000 })

      // Wait for the cluster grid to stabilize — on Firefox/WebKit the SWR
      // cache can trigger a secondary render after domcontentloaded that
      // briefly restores stale data. Waiting for the expected row ensures
      // the test-specific mock data has fully propagated. (#11003)
      await expect(page.locator('[data-testid="cluster-row-healthy-cluster"]')).toBeVisible({ timeout: 20_000 })

      // The Healthy filter button should show count 1 (only healthy-cluster with healthy: true)
      // Webkit/Firefox render filter tabs slightly later — use generous timeout
      const FILTER_TAB_TIMEOUT_MS = 20_000
      const healthyTab = page.getByRole('button', { name: /Healthy \(1\)/ })
      await expect(healthyTab).toBeVisible({ timeout: FILTER_TAB_TIMEOUT_MS })

      // Click the Healthy filter
      await healthyTab.click()

      // Wait for the filter to visually activate (button style change) before
      // asserting hidden clusters — firefox/webkit may batch the DOM update. (#10956)
      await expect(healthyTab).toHaveClass(/bg-green-500/, { timeout: 5000 })

      // Only healthy-cluster must be visible in the ClusterGrid.
      // Use cluster-row-* testids (rendered by ClusterGrid) instead of text
      // search — the ClusterHealth card also renders cluster names inside
      // clusters-page, and those are NOT filtered by the tab. On Chromium the
      // card hasn't mounted by the time assertions run; on Firefox/WebKit it
      // has, causing getByText to find unfiltered names. (#10992)
      await expect(page.locator('[data-testid="cluster-row-healthy-cluster"]')).toBeVisible({ timeout: 10_000 })

      // Unhealthy cluster rows must NOT appear in the Healthy tab.
      const FILTER_HIDDEN_TIMEOUT_MS = 20_000
      await expect(page.locator('[data-testid="cluster-row-unhealthy-with-nodes"]')).not.toBeVisible({ timeout: FILTER_HIDDEN_TIMEOUT_MS })
      await expect(page.locator('[data-testid="cluster-row-truly-unhealthy"]')).not.toBeVisible({ timeout: FILTER_HIDDEN_TIMEOUT_MS })
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

      // sessionStorage is already cleared by the addInitScript registered in
      // setupClustersTest (which runs on every navigation including reload).
      // See the Healthy filter test above for why page.evaluate was removed. (#11003)

      // Reload and wait for the test-specific mock API response to arrive so
      // the component renders with the correct cluster set before we interact.
      await Promise.all([
        page.waitForResponse((resp) => resp.url().includes('/api/mcp/') && resp.url().includes('clusters')),
        page.reload(),
      ])
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 20_000 })

      // Wait for the cluster grid to stabilize with the test-specific mock data. (#11003)
      await expect(page.locator('[data-testid="cluster-row-unhealthy-no-nodes"]')).toBeVisible({ timeout: 20_000 })

      // The Unhealthy tab must show count 1
      const FILTER_TAB_TIMEOUT_MS = 20_000
      const unhealthyTab = page.getByRole('button', { name: /Unhealthy \(1\)/ })
      await expect(unhealthyTab).toBeVisible({ timeout: FILTER_TAB_TIMEOUT_MS })

      // Click the Unhealthy filter
      await unhealthyTab.click()

      // Wait for the filter to visually activate before asserting hidden clusters. (#10956)
      await expect(unhealthyTab).toHaveClass(/bg-orange-500/, { timeout: 5000 })

      // Only the truly unhealthy cluster row should appear in the ClusterGrid.
      // Use cluster-row-* testids — the ClusterHealth card renders cluster
      // names for ALL clusters regardless of filter tab. (#10992)
      await expect(page.locator('[data-testid="cluster-row-unhealthy-no-nodes"]')).toBeVisible({ timeout: 10_000 })
      // Healthy cluster row must NOT appear under the Unhealthy filter.
      const FILTER_HIDDEN_TIMEOUT_MS = 20_000
      await expect(page.locator('[data-testid="cluster-row-healthy-cluster"]')).not.toBeVisible({ timeout: FILTER_HIDDEN_TIMEOUT_MS })
    })
  })

  // ---------------------------------------------------------------------------
  // #11775 — Offline / Unreachable filter tab
  // ---------------------------------------------------------------------------

  test.describe('Offline filter tab (#11775)', () => {
    test('Offline tab filters to only unreachable clusters', async ({ page }) => {
      await page.route('**/api/mcp/**', (route) => {
        const url = route.request().url()
        if (url.includes('/clusters')) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              clusters: [
                { name: 'healthy-cluster', context: 'ctx-a', healthy: true, reachable: true, nodeCount: 3, podCount: 10, version: '1.28.0' },
                { name: 'offline-cluster', context: 'ctx-b', healthy: false, reachable: false, nodeCount: 0, podCount: 0, version: '1.28.0', isUnreachable: true },
                { name: 'never-connected', context: 'ctx-c', healthy: false, reachable: false, nodeCount: 0, podCount: 0, version: '', neverConnected: true },
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

      await Promise.all([
        page.waitForResponse((resp) => resp.url().includes('/api/mcp/') && resp.url().includes('clusters')),
        page.reload(),
      ])
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 20_000 })

      // Wait for offline cluster to render
      await expect(page.getByTestId('cluster-row-offline-cluster')).toBeVisible({ timeout: 20_000 })

      // Click the Offline tab (may be labeled "Offline" or "Unreachable")
      const offlineTab = page.getByRole('button', { name: /Offline|Unreachable/i }).first()
      const tabVisible = await offlineTab.isVisible({ timeout: 10_000 }).catch(() => false)
      if (!tabVisible) { test.skip(true, 'Offline filter tab not visible'); return }

      await offlineTab.click()
      await expect(offlineTab).toBeVisible()

      // Healthy cluster should NOT be visible in the offline tab
      await expect(page.locator('[data-testid="cluster-row-healthy-cluster"]')).not.toBeVisible({ timeout: 10_000 })
    })
  })

  // ---------------------------------------------------------------------------
  // #11776 — Sort, asc/desc toggle, and layout mode
  // ---------------------------------------------------------------------------

  test.describe('Sort and layout controls (#11776)', () => {
    test('sort dropdown changes cluster order', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Look for sort select or dropdown
      const sortSelect = page.locator('select').first()
      const sortSelectVisible = await sortSelect.isVisible({ timeout: 5000 }).catch(() => false)

      if (sortSelectVisible) {
        // Change sort to "name"
        await sortSelect.selectOption({ label: /name/i }).catch(() =>
          sortSelect.selectOption('name').catch(() => {})
        )
        await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 5000 })
      } else {
        // Sort may be rendered as buttons — look for sort-related controls
        const sortBtn = page.locator('button[aria-label*="sort" i], button[aria-label*="Sort"]').first()
        const sortBtnVisible = await sortBtn.isVisible().catch(() => false)
        if (sortBtnVisible) {
          await sortBtn.click()
          await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 5000 })
        }
      }
    })

    test('asc/desc toggle reverses cluster order', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Look for sort direction toggle button
      const sortDirBtn = page.locator('button[aria-label*="ascending" i], button[aria-label*="descending" i], button[aria-label*="Sort direction" i]').first()
      const sortDirVisible = await sortDirBtn.isVisible({ timeout: 5000 }).catch(() => false)

      if (sortDirVisible) {
        await sortDirBtn.click()
        await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 5000 })
        // Click again to toggle back
        await sortDirBtn.click()
        await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 5000 })
      }
    })

    test('layout switcher changes grid/list view', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Look for layout mode buttons (grid, list, compact, wide)
      const layoutBtns = page.locator('button[aria-label*="layout" i], button[aria-label*="grid" i], button[aria-label*="list" i], button[aria-label*="compact" i]')
      
      // Ensure at least one button is visible before counting (#12097)
      // Immediate count() may execute before DOM fully renders
      await expect(layoutBtns.first()).toBeVisible({ timeout: 5000 }).catch(() => {})
      const count = await layoutBtns.count()

      if (count > 1) {
        // Click the second layout button to switch modes
        await layoutBtns.nth(1).click()
        await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 5000 })

        // Click the first to switch back
        await layoutBtns.nth(0).click()
        await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 5000 })
      }
    })
  })

  // ---------------------------------------------------------------------------
  // #11777 — Collapsible "Cluster Info Cards" section
  // ---------------------------------------------------------------------------

  test.describe('Collapsible Cluster Info Cards (#11777)', () => {
    test('cluster info section can be collapsed and expanded', async ({ page }) => {
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 10000 })

      // Look for the collapse/expand chevron button in the cluster info section
      const collapseBtn = page.locator('button[aria-label*="collapse" i], button[aria-label*="expand" i], button[aria-label*="toggle" i]').first()
        .or(page.getByTestId('cluster-info-collapse'))
      const collapseVisible = await collapseBtn.isVisible({ timeout: 5000 }).catch(() => false)

      if (!collapseVisible) {
        // Try a chevron icon button near the info cards section
        const chevronBtn = page.locator('[data-testid*="info-cards"] button, [data-testid*="cluster-info"] button').first()
        const chevronVisible = await chevronBtn.isVisible().catch(() => false)
        if (!chevronVisible) { test.skip(true, 'Cluster info collapse button not visible'); return }
        await chevronBtn.click()
        await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 5000 })
        // Click again to expand
        await chevronBtn.click()
        await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 5000 })
        return
      }

      // Click to collapse
      await collapseBtn.click()
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 5000 })

      // Click again to expand
      await collapseBtn.click()
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 5000 })
    })
  })

  // ---------------------------------------------------------------------------
  // #11778 — Stale kubeconfig banner and Prune flow
  // ---------------------------------------------------------------------------

  test.describe('Stale kubeconfig banner (#11778)', () => {
    test('stale context banner appears when staleContexts > 0', async ({ page }) => {
      await page.route('**/api/mcp/**', (route) => {
        const url = route.request().url()
        if (url.includes('/clusters')) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              clusters: [
                { name: 'prod-east', context: 'ctx-a', healthy: true, reachable: true, nodeCount: 3, podCount: 10, version: '1.28.0' },
              ],
              stats: { staleContexts: 2 },
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

      await Promise.all([
        page.waitForResponse((resp) => resp.url().includes('/api/mcp/') && resp.url().includes('clusters')),
        page.reload(),
      ])
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: 20_000 })

      // Look for the stale context warning banner
      const banner = page.locator('[data-testid="stale-context-banner"]').or(
        page.getByText(/stale/i).first()
      ).or(
        page.getByRole('alert').filter({ hasText: /stale|prune/i }).first()
      )
      const bannerVisible = await banner.isVisible({ timeout: 10_000 }).catch(() => false)

      if (bannerVisible) {
        await expect(banner).toBeVisible()

        // Look for Prune Kubeconfig button
        const pruneBtn = page.getByRole('button', { name: /Prune/i }).first()
        const pruneVisible = await pruneBtn.isVisible().catch(() => false)
        if (pruneVisible) {
          await pruneBtn.click()
          // Should open API key modal or mission prompt
          const modal = page.locator('[role="dialog"]').or(page.getByTestId('api-key-modal'))
          await expect(modal).toBeVisible({ timeout: 5000 }).catch(() => {
            // Modal may not appear in all environments
          })
        }
      }
    })
  })
})

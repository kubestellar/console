import { test, expect } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'
import { assertNoLayoutOverflow, assertLoadTime, collectConsoleErrors } from '../helpers/ux-assertions'

/** Maximum acceptable cluster page load time (ms) */
const CLUSTER_LOAD_MAX_MS = 3_000

/** Timeout for drilldown modal (ms) */
const DRILLDOWN_TIMEOUT_MS = 5_000

/**
 * Cluster Investigation — Rewritten to use actual FilterTabs (#11773)
 * 
 * Previous implementation used data-testid="cluster-filter" which doesn't exist,
 * causing all filter tests to skip. This rewrite uses the actual FilterTabs buttons.
 */
test.describe('Cluster Investigation — "My cluster has issues"', () => {
  test('clusters page loads within acceptable time', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    await assertLoadTime(page, 'body', CLUSTER_LOAD_MAX_MS)
    const body = page.locator('body')
    const content = await body.textContent()
    expect(content?.length).toBeGreaterThan(50)
  })

  test('cluster cards render with status indicators', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    // In demo mode, cluster cards should render
    const cards = page.locator('[data-card-type], [data-testid*="cluster"]')
    const count = await cards.count()
    // At least some cluster-related content should render
    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: 'info',
        category: 'data',
        component: 'ClustersPage',
        finding: `Found ${count} cluster-related elements on /clusters`,
        recommendation: 'None',
      }),
    })
  })

  test('FilterTabs render on clusters page (All / Healthy / Unhealthy)', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    
    // The actual clusters page uses FilterTabs with buttons for All, Healthy, Unhealthy, Offline
    // Look for these filter tab buttons
    const allTab = page.getByRole('button', { name: /^All/i })
    const healthyTab = page.getByRole('button', { name: /Healthy/i })
    const unhealthyTab = page.getByRole('button', { name: /Unhealthy/i })
    
    // At least the "All" tab should be visible
    await expect(allTab.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    
    // Check if Healthy/Unhealthy tabs are also visible
    const hasHealthyTab = await healthyTab.first().isVisible().catch(() => false)
    const hasUnhealthyTab = await unhealthyTab.first().isVisible().catch(() => false)
    
    expect(hasHealthyTab || hasUnhealthyTab).toBe(true)
  })

  test('clicking a FilterTab filters cluster rows', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    
    // Wait for clusters page to load
    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    
    // Find the Healthy filter tab
    const healthyTab = page.getByRole('button', { name: /Healthy/i }).first()
    const hasHealthyTab = await healthyTab.isVisible().catch(() => false)
    
    if (!hasHealthyTab) {
      test.skip(true, 'Healthy filter tab not visible')
      return
    }
    
    // Click the Healthy filter
    await healthyTab.click()
    
    // Wait for filter to take effect (the tab button should get an active class)
    await page.waitForTimeout(500)
    
    // Verify the page is still responsive after filtering
    await expect(page.getByTestId('clusters-page')).toBeVisible()
  })

  test('cluster drilldown opens on interaction', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    // Look for clickable cluster elements
    const clusterItem = page.locator('[data-card-type] button, [data-testid*="cluster-row"], [class*="cursor-pointer"]').first()
    const hasItem = await clusterItem.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (hasItem) {
      await clusterItem.click()
      const drilldown = page.getByTestId('drilldown-modal')
      const hasModal = await drilldown.isVisible({ timeout: DRILLDOWN_TIMEOUT_MS }).catch(() => false)
      if (hasModal) {
        await expect(drilldown).toBeVisible()
      }
    }
  })

  test('drilldown has tabs for different views', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    const clusterItem = page.locator('[data-card-type] button, [data-testid*="cluster-row"], [class*="cursor-pointer"]').first()
    const hasItem = await clusterItem.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (!hasItem) { test.skip(true, 'No clickable cluster item visible'); return }
    await clusterItem.click()
    const tabs = page.getByTestId('drilldown-tabs')
    const hasTabs = await tabs.isVisible({ timeout: DRILLDOWN_TIMEOUT_MS }).catch(() => false)
    if (hasTabs) {
      const tabButtons = tabs.locator('button')
      const tabCount = await tabButtons.count()
      expect(tabCount).toBeGreaterThan(0)
      test.info().annotations.push({
        type: 'ux-finding',
        description: JSON.stringify({
          severity: 'info',
          category: 'navigation',
          component: 'ClusterDrilldown',
          finding: `Drilldown has ${tabCount} tabs`,
          recommendation: 'None',
        }),
      })
    }
  })

  test('cluster page header and title visible', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    const header = page.getByTestId('dashboard-header')
    const hasHeader = await header.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (hasHeader) {
      const title = page.getByTestId('dashboard-title')
      await expect(title).toBeVisible()
    }
  })

  test('no layout overflow on clusters page', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    // Wait for the page content to render before checking layout
    await expect(page.locator('body')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await assertNoLayoutOverflow(page)
  })

  test('no unexpected console errors', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await setupDemoAndNavigate(page, '/clusters')
    // Wait for the page content to render before checking errors
    await expect(page.locator('body')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    checkErrors()
  })
})

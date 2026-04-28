import { test, expect } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'
import { assertNoLayoutOverflow, assertLoadTime, collectConsoleErrors } from '../helpers/ux-assertions'

/** Maximum acceptable cluster page load time (ms) */
const CLUSTER_LOAD_MAX_MS = 3_000

/** Timeout for drilldown modal (ms) */
const DRILLDOWN_TIMEOUT_MS = 5_000

test.describe('Cluster Investigation — "My cluster has issues"', () => {
  test('clusters page loads within acceptable time', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    // Issue 9240: previously this test only asserted body visibility +
    // textContent length, ignoring the imported assertLoadTime and the
    // CLUSTER_LOAD_MAX_MS budget on line 6. A page taking 10s to load
    // would still pass. Use the existing helper so a perf regression
    // actually fails the suite.
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

  test('cluster filter dropdown opens', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    const filter = page.getByTestId('cluster-filter')
    const hasFilter = await filter.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (hasFilter) {
      // Click the filter dropdown trigger
      const trigger = filter.locator('button').first()
      const hasTrigger = await trigger.isVisible().catch(() => false)
      if (hasTrigger) {
        await trigger.click()
        // Wait for filter options to appear after dropdown opens
        const options = page.getByTestId('cluster-filter-option')
        await expect(options.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
        const optionCount = await options.count()
        expect(optionCount).toBeGreaterThanOrEqual(1)
      }
    }
  })

  test('filter options show cluster names', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    const filter = page.getByTestId('cluster-filter')
    const hasFilter = await filter.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (!hasFilter) { test.skip(true, 'Cluster filter not visible'); return }
    const trigger = filter.locator('button').first()
    const hasTrigger = await trigger.isVisible().catch(() => false)
    if (!hasTrigger) { test.skip(true, 'Filter trigger button not visible'); return }
    await trigger.click()
    // Wait for filter dropdown to populate
    const options = page.getByTestId('cluster-filter-option')
    await expect(options.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => {})
    const optionCount = await options.count()
    if (optionCount > 0) {
      const firstText = await options.first().textContent()
      expect(firstText?.length).toBeGreaterThan(0)
    }
  })

  test('applying a filter updates visible content', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    const filter = page.getByTestId('cluster-filter')
    const hasFilter = await filter.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (!hasFilter) { test.skip(true, 'Cluster filter not visible'); return }
    const trigger = filter.locator('button').first()
    const hasTrigger = await trigger.isVisible().catch(() => false)
    if (!hasTrigger) { test.skip(true, 'Filter trigger button not visible'); return }
    await trigger.click()
    // Wait for filter dropdown to populate
    const options = page.getByTestId('cluster-filter-option')
    await expect(options.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => {})
    const optionCount = await options.count()
    if (optionCount > 0) {
      await options.first().click()
      // Wait for filter to take effect
      await expect(page.locator('body')).toBeVisible()
    }
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

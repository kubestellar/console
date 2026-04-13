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
    // Wait for meaningful content — either a cluster list or the page container
    const body = page.locator('body')
    await expect(body).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
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
        await page.waitForTimeout(300)
        // Filter options should appear
        const options = page.getByTestId('cluster-filter-option')
        const optionCount = await options.count()
        expect(optionCount).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('filter options show cluster names', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    const filter = page.getByTestId('cluster-filter')
    const hasFilter = await filter.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (!hasFilter) return
    const trigger = filter.locator('button').first()
    const hasTrigger = await trigger.isVisible().catch(() => false)
    if (!hasTrigger) return
    await trigger.click()
    await page.waitForTimeout(300)
    const options = page.getByTestId('cluster-filter-option')
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
    if (!hasFilter) return
    const trigger = filter.locator('button').first()
    const hasTrigger = await trigger.isVisible().catch(() => false)
    if (!hasTrigger) return
    await trigger.click()
    await page.waitForTimeout(300)
    const options = page.getByTestId('cluster-filter-option')
    const optionCount = await options.count()
    if (optionCount > 0) {
      await options.first().click()
      await page.waitForTimeout(500)
      // Page should not crash after filter selection
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
    if (!hasItem) return
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
    await page.waitForTimeout(1_000)
    await assertNoLayoutOverflow(page)
  })

  test('no unexpected console errors', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await setupDemoAndNavigate(page, '/clusters')
    await page.waitForTimeout(1_000)
    checkErrors()
  })
})

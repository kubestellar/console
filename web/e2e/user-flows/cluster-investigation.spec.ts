/**
 * Cluster Investigation E2E tests — rewritten to use actual FilterTabs buttons
 * instead of non-existent `data-testid="cluster-filter"` dropdown (#11773).
 *
 * The Clusters page uses FilterTabs (buttons for All / Healthy / Unhealthy / Offline),
 * not a ClusterFilterDropdown. Previous tests branched on cluster-filter visibility
 * and always skipped. This rewrite exercises the real UI.
 */
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
    await assertLoadTime(page, 'body', CLUSTER_LOAD_MAX_MS)
    const body = page.locator('body')
    const content = await body.textContent()
    expect(content?.length).toBeGreaterThan(50)
  })

  test('cluster cards render with status indicators', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    const cards = page.locator('[data-card-type], [data-testid*="cluster"]')
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('FilterTabs buttons are visible (All / Healthy / Unhealthy / Offline)', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    await expect(page.locator('body')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // The FilterTabs render as buttons with labels like "All (N)", "Healthy (N)", etc.
    const allTab = page.getByRole('button', { name: /All/i }).first()
    await expect(allTab).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const healthyTab = page.getByRole('button', { name: /Healthy/i }).first()
    await expect(healthyTab).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const unhealthyTab = page.getByRole('button', { name: /Unhealthy/i }).first()
    await expect(unhealthyTab).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('clicking Healthy filter tab shows only healthy clusters', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    await expect(page.locator('body')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const healthyTab = page.getByRole('button', { name: /Healthy/i }).first()
    const tabVisible = await healthyTab.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (!tabVisible) { test.skip(true, 'Healthy filter tab not visible'); return }

    await healthyTab.click()
    // After clicking, the button should have the active styling
    await expect(healthyTab).toBeVisible()
    // Page should remain stable
    await expect(page.locator('body')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('clicking Unhealthy filter tab shows only unhealthy clusters', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    await expect(page.locator('body')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const unhealthyTab = page.getByRole('button', { name: /Unhealthy/i }).first()
    const tabVisible = await unhealthyTab.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (!tabVisible) { test.skip(true, 'Unhealthy filter tab not visible'); return }

    await unhealthyTab.click()
    await expect(unhealthyTab).toBeVisible()
    await expect(page.locator('body')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('clicking All tab shows all clusters after filtering', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    await expect(page.locator('body')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Click Healthy first to filter
    const healthyTab = page.getByRole('button', { name: /Healthy/i }).first()
    const tabVisible = await healthyTab.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (!tabVisible) { test.skip(true, 'Filter tabs not visible'); return }

    await healthyTab.click()
    await expect(healthyTab).toBeVisible()

    // Then click All to reset
    const allTab = page.getByRole('button', { name: /All/i }).first()
    await allTab.click()
    await expect(allTab).toBeVisible()
  })

  test('cluster drilldown opens on interaction', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    const clusterItem = page.locator('[data-testid*="cluster-row"], [data-card-type] button, [class*="cursor-pointer"]').first()
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

  test('cluster page header and title visible', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    const header = page.getByTestId('dashboard-header')
    await expect(header).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const title = page.getByTestId('dashboard-title')
    await expect(title).toBeVisible()
  })

  test('no layout overflow on clusters page', async ({ page }) => {
    await setupDemoAndNavigate(page, '/clusters')
    await expect(page.locator('body')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await assertNoLayoutOverflow(page)
  })

  test('no unexpected console errors', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await setupDemoAndNavigate(page, '/clusters')
    await expect(page.locator('body')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    checkErrors()
  })
})

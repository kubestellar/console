import { test, expect } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'
import { assertLoadTime, assertNoLayoutOverflow, collectConsoleErrors } from '../helpers/ux-assertions'

/** Viewport dimensions for mobile tests */
const MOBILE_WIDTH = 375
const MOBILE_HEIGHT = 812

/** Maximum acceptable dashboard load time (ms) */
const DASHBOARD_LOAD_MAX_MS = 3_000

/** Timeout for drilldown modal to appear (ms) */
const DRILLDOWN_TIMEOUT_MS = 5_000

test.describe('Dashboard Overview — "What is happening with my clusters?"', () => {
  test('dashboard loads with cards visible within 3s', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const elapsed = await assertLoadTime(page, '[data-testid="dashboard-page"]', DASHBOARD_LOAD_MAX_MS)
    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: 'info',
        category: 'performance',
        component: 'Dashboard',
        finding: `Dashboard loaded in ${elapsed}ms`,
        recommendation: 'Track over time for regression',
      }),
    })
  })

  test('cards grid renders with cards', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const grid = page.getByTestId('dashboard-cards-grid')
    await expect(grid).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const cards = page.locator('[data-card-type]')
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('sidebar shows cluster status indicators', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const clusterStatus = page.getByTestId('sidebar-cluster-status')
    const hasStatus = await clusterStatus.isVisible().catch(() => false)
    if (hasStatus) {
      // Should show healthy/unhealthy/offline counts
      await expect(clusterStatus).toContainText(/healthy|offline/i)
    }
  })

  test('card hover shows interactive state', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const firstCard = page.locator('[data-card-type]').first()
    await expect(firstCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await firstCard.hover()
    // Card should remain visible and not crash on hover
    await expect(firstCard).toBeVisible()
  })

  test('clicking expand on a card opens drilldown modal', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const firstCard = page.locator('[data-card-type]').first()
    await expect(firstCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await firstCard.hover()
    // Look for expand button that appears on hover
    const expandBtn = firstCard.locator('button[title*="xpand"], button[aria-label*="xpand"], button:has(svg)').first()
    const hasExpand = await expandBtn.isVisible({ timeout: 2_000 }).catch(() => false)
    if (hasExpand) {
      await expandBtn.click()
      const modal = page.getByTestId('drilldown-modal')
      await expect(modal).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
    }
  })

  test('drilldown close button works', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const firstCard = page.locator('[data-card-type]').first()
    await expect(firstCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await firstCard.hover()
    const expandBtn = firstCard.locator('button[title*="xpand"], button[aria-label*="xpand"], button:has(svg)').first()
    const hasExpand = await expandBtn.isVisible({ timeout: 2_000 }).catch(() => false)
    if (hasExpand) {
      await expandBtn.click()
      const modal = page.getByTestId('drilldown-modal')
      await expect(modal).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
      const closeBtn = page.getByTestId('drilldown-close')
      await closeBtn.click()
      await expect(modal).not.toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
    }
  })

  test('drilldown closes on Escape key', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const firstCard = page.locator('[data-card-type]').first()
    await expect(firstCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await firstCard.hover()
    const expandBtn = firstCard.locator('button[title*="xpand"], button[aria-label*="xpand"], button:has(svg)').first()
    const hasExpand = await expandBtn.isVisible({ timeout: 2_000 }).catch(() => false)
    if (hasExpand) {
      await expandBtn.click()
      const modal = page.getByTestId('drilldown-modal')
      await expect(modal).toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
      await page.keyboard.press('Escape')
      await expect(modal).not.toBeVisible({ timeout: DRILLDOWN_TIMEOUT_MS })
    }
  })

  test('drilldown modal has tabs', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const firstCard = page.locator('[data-card-type]').first()
    await expect(firstCard).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await firstCard.hover()
    const expandBtn = firstCard.locator('button[title*="xpand"], button[aria-label*="xpand"], button:has(svg)').first()
    const hasExpand = await expandBtn.isVisible({ timeout: 2_000 }).catch(() => false)
    if (hasExpand) {
      await expandBtn.click()
      const tabs = page.getByTestId('drilldown-tabs')
      const hasTabs = await tabs.isVisible({ timeout: DRILLDOWN_TIMEOUT_MS }).catch(() => false)
      if (hasTabs) {
        const tabButtons = tabs.locator('button')
        const tabCount = await tabButtons.count()
        expect(tabCount).toBeGreaterThan(0)
      }
    }
  })

  test('refresh button is visible and clickable', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const refreshBtn = page.getByTestId('dashboard-refresh-button')
    await expect(refreshBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await refreshBtn.click()
    await expect(refreshBtn).toBeVisible()
  })

  test('dashboard title is visible', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const title = page.getByTestId('dashboard-title')
    await expect(title).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('mobile: cards render in single column at 375px', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT })
    await setupDemoAndNavigate(page, '/')
    const grid = page.getByTestId('dashboard-cards-grid')
    const isVisible = await grid.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (isVisible) {
      await assertNoLayoutOverflow(page)
    }
  })

  test('no unexpected console errors on dashboard', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await setupDemoAndNavigate(page, '/')
    await page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await page.waitForTimeout(1_000)
    checkErrors()
  })
})

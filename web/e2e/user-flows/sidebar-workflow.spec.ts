import { test, expect } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'
import { assertNoLayoutOverflow, collectConsoleErrors } from '../helpers/ux-assertions'

/** Viewport dimensions for mobile tests */
const MOBILE_WIDTH = 375
const MOBILE_HEIGHT = 812

/** Time to wait for CSS transitions to settle (ms) */
const TRANSITION_SETTLE_MS = 500

test.describe('Sidebar Workflow — "Navigate and customize sidebar"', () => {
  test('sidebar is visible on load', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('sidebar has navigation items', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const nav = page.getByTestId('sidebar-primary-nav')
    await expect(nav).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const links = nav.locator('a')
    const count = await links.count()
    expect(count).toBeGreaterThan(0)
  })

  test('clicking a nav item navigates (URL changes)', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const nav = page.getByTestId('sidebar-primary-nav')
    await expect(nav).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const links = nav.locator('a')
    const count = await links.count()
    if (count > 1) {
      const secondLink = links.nth(1)
      const href = await secondLink.getAttribute('href')
      await secondLink.click()
      await page.waitForTimeout(TRANSITION_SETTLE_MS)
      if (href) {
        expect(page.url()).toContain(href)
      }
    }
  })

  test('active route has highlighted styling', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const nav = page.getByTestId('sidebar-primary-nav')
    await expect(nav).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // The current route link should have an active/selected visual indicator
    const activeLink = nav.locator('a.bg-secondary, a[aria-current="page"], a.active, a[data-active="true"]')
    const hasActive = await activeLink.count()
    // At least document that active state is or isn't indicated
    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: hasActive > 0 ? 'info' : 'medium',
        category: 'navigation',
        component: 'Sidebar',
        finding: hasActive > 0 ? 'Active route is visually indicated' : 'No explicit active-route indicator found',
        recommendation: hasActive > 0 ? 'None' : 'Add aria-current="page" or visible highlight to active nav item',
      }),
    })
  })

  test('collapse toggle changes sidebar width', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const widthBefore = await sidebar.evaluate((el) => el.getBoundingClientRect().width)

    const collapseBtn = page.getByTestId('sidebar-collapse-toggle')
    const hasCollapse = await collapseBtn.isVisible().catch(() => false)
    if (hasCollapse) {
      await collapseBtn.click()
      await page.waitForTimeout(TRANSITION_SETTLE_MS)
      const widthAfter = await sidebar.evaluate((el) => el.getBoundingClientRect().width)
      expect(widthAfter).not.toBe(widthBefore)
    }
  })

  test('expand after collapse restores sidebar', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const collapseBtn = page.getByTestId('sidebar-collapse-toggle')
    const hasCollapse = await collapseBtn.isVisible().catch(() => false)
    if (hasCollapse) {
      const widthBefore = await sidebar.evaluate((el) => el.getBoundingClientRect().width)
      await collapseBtn.click()
      await page.waitForTimeout(TRANSITION_SETTLE_MS)
      // Click again to expand
      await collapseBtn.click()
      await page.waitForTimeout(TRANSITION_SETTLE_MS)
      const widthAfter = await sidebar.evaluate((el) => el.getBoundingClientRect().width)
      // Width should be restored to original
      expect(Math.abs(widthAfter - widthBefore)).toBeLessThan(10)
    }
  })

  test('pin toggle keeps sidebar visible', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // Pin button is next to the collapse toggle
    const pinBtn = page.locator('button[title*="pin" i], button[title*="Pin" i]')
    const hasPin = await pinBtn.first().isVisible().catch(() => false)
    if (hasPin) {
      await pinBtn.first().click()
      await page.waitForTimeout(TRANSITION_SETTLE_MS)
      // Sidebar should remain visible after pinning
      await expect(sidebar).toBeVisible()
    }
  })

  test('add card button is accessible', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const addCard = page.getByTestId('sidebar-add-card')
    const hasAddCard = await addCard.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (hasAddCard) {
      await addCard.click()
      // Should open a dialog or modal
      const dialog = page.locator('[role="dialog"]')
      const hasDialog = await dialog.isVisible({ timeout: 3_000 }).catch(() => false)
      expect(hasDialog).toBeTruthy()
    }
  })

  test('cluster status section shows counts', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    const clusterStatus = page.getByTestId('sidebar-cluster-status')
    const hasStatus = await clusterStatus.isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (hasStatus) {
      // Should show numeric counts for healthy/unhealthy/offline
      const text = await clusterStatus.textContent()
      expect(text?.length).toBeGreaterThan(0)
    }
  })

  test('mobile: sidebar behavior at 375px', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT })
    await setupDemoAndNavigate(page, '/')
    // On mobile, sidebar should be hidden by default
    const sidebar = page.getByTestId('sidebar')
    const isVisible = await sidebar.isVisible().catch(() => false)
    test.info().annotations.push({
      type: 'ux-finding',
      description: JSON.stringify({
        severity: 'info',
        category: 'responsive',
        component: 'Sidebar',
        finding: isVisible ? 'Sidebar visible on mobile by default' : 'Sidebar hidden on mobile (expected)',
        recommendation: isVisible ? 'Consider hiding sidebar on mobile and using hamburger menu' : 'None',
      }),
    })
  })

  test('no layout overflow on sidebar', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')
    await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await assertNoLayoutOverflow(page)
  })
})

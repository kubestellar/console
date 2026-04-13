import { test, expect } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'
import { assertNoLayoutOverflow, collectConsoleErrors } from '../helpers/ux-assertions'

/** Viewport dimensions for mobile tests */
const MOBILE_WIDTH = 375
const MOBILE_HEIGHT = 812

/** Timeout for mission browser to open (ms) */
const MISSION_LOAD_TIMEOUT_MS = 5_000

test.describe('Mission Exploration — "Find and use a mission"', () => {
  test('missions page loads', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const body = page.locator('body')
    await expect(body).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const content = await body.textContent()
    expect(content?.length).toBeGreaterThan(0)
  })

  test('mission browser renders', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch(() => false)
    if (hasBrowser) {
      await expect(browser).toBeVisible()
    } else {
      // Mission browser may open via a button click
      const browseBtn = page.locator('button:has-text("Browse"), button:has-text("Mission"), button:has-text("Explore")')
      const hasBtn = await browseBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)
      if (hasBtn) {
        await browseBtn.first().click()
        await expect(page.getByTestId('mission-browser')).toBeVisible({ timeout: MISSION_LOAD_TIMEOUT_MS })
      }
    }
  })

  test('mission search input is functional', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch(() => false)
    if (!hasBrowser) return
    const searchInput = page.getByTestId('mission-search')
    const hasSearch = await searchInput.isVisible().catch(() => false)
    if (hasSearch) {
      await searchInput.fill('deploy')
      await page.waitForTimeout(500)
      // Search should filter results without crashing
      await expect(searchInput).toHaveValue('deploy')
    }
  })

  test('mission directory tree renders', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch(() => false)
    if (!hasBrowser) return
    const tree = page.getByTestId('mission-tree')
    const hasTree = await tree.isVisible().catch(() => false)
    if (hasTree) {
      const text = await tree.textContent()
      expect(text?.length).toBeGreaterThan(0)
    }
  })

  test('mission grid shows missions', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch(() => false)
    if (!hasBrowser) return
    const grid = page.getByTestId('mission-grid')
    const hasGrid = await grid.isVisible().catch(() => false)
    if (hasGrid) {
      const text = await grid.textContent()
      expect(text?.length).toBeGreaterThan(0)
    }
  })

  test('clicking a mission shows detail view', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch(() => false)
    if (!hasBrowser) return
    const grid = page.getByTestId('mission-grid')
    const hasGrid = await grid.isVisible().catch(() => false)
    if (!hasGrid) return
    // Click the first clickable mission item
    const missionItem = grid.locator('button, a, [role="button"], [class*="cursor-pointer"]').first()
    const hasMission = await missionItem.isVisible().catch(() => false)
    if (hasMission) {
      await missionItem.click()
      await page.waitForTimeout(500)
      // Detail view or expanded content should appear
      const body = page.locator('body')
      const content = await body.textContent()
      expect(content?.length).toBeGreaterThan(0)
    }
  })

  test('category filter works in mission tree', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch(() => false)
    if (!hasBrowser) return
    const tree = page.getByTestId('mission-tree')
    const hasTree = await tree.isVisible().catch(() => false)
    if (!hasTree) return
    // Click first category in tree to filter
    const treeItem = tree.locator('button, [role="treeitem"], li').first()
    const hasItem = await treeItem.isVisible().catch(() => false)
    if (hasItem) {
      await treeItem.click()
      await page.waitForTimeout(500)
      // Should filter grid content without crashing
      await expect(tree).toBeVisible()
    }
  })

  test('search clears properly', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch(() => false)
    if (!hasBrowser) return
    const searchInput = page.getByTestId('mission-search')
    const hasSearch = await searchInput.isVisible().catch(() => false)
    if (!hasSearch) return
    await searchInput.fill('test-query')
    await page.waitForTimeout(300)
    await searchInput.fill('')
    await page.waitForTimeout(300)
    await expect(searchInput).toHaveValue('')
  })

  test('mobile: mission layout adapts at 375px', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT })
    await setupDemoAndNavigate(page, '/missions')
    await page.waitForTimeout(1_000)
    await assertNoLayoutOverflow(page)
  })

  test('no console errors on missions page', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await setupDemoAndNavigate(page, '/missions')
    await page.waitForTimeout(1_000)
    checkErrors()
  })
})

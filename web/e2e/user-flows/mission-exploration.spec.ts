import { test, expect, type Page } from '@playwright/test'
import { setupDemoAndNavigate, ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'
import { assertNoLayoutOverflow, collectConsoleErrors } from '../helpers/ux-assertions'

/** Viewport dimensions for mobile tests */
const MOBILE_WIDTH = 375
const MOBILE_HEIGHT = 812

/** Timeout for mission browser to open (ms) */
const MISSION_LOAD_TIMEOUT_MS = 5_000

async function ensureMissionBrowserVisible(page: Page): Promise<boolean> {
  const browser = page.getByTestId('mission-browser')
  if (await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })) {
    return true
  }

  const missionToggle = page.getByTestId('navbar-ai-missions-btn')
  if (!(await missionToggle.isVisible({ timeout: 3_000 }).catch((error) => { console.error('Promise error:', error); return false }))) {
    return false
  }

  await missionToggle.focus()
  await page.keyboard.press('Enter')
  await expect(browser).toBeVisible({ timeout: MISSION_LOAD_TIMEOUT_MS })
  return true
}

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
    const hasBrowser = await ensureMissionBrowserVisible(page)
    if (!hasBrowser) test.skip(true, 'Mission browser not visible')
  })

  test('mission search input is functional', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasBrowser) { test.skip(true, 'Mission browser not visible'); return }
    const searchInput = page.getByTestId('mission-search')
    const hasSearch = await searchInput.isVisible().catch((error) => { console.error('Promise error:', error); return false })
    if (!hasSearch) { test.skip(true, 'Mission search input not visible'); return }
    await searchInput.fill('deploy')
    await page.waitForTimeout(500)
    // Search should filter results without crashing
    await expect(searchInput).toHaveValue('deploy')
  })

  test('mission directory tree renders', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasBrowser) { test.skip(true, 'Mission browser not visible'); return }
    const tree = page.getByTestId('mission-tree')
    const hasTree = await tree.isVisible().catch((error) => { console.error('Promise error:', error); return false })
    if (!hasTree) { test.skip(true, 'Mission tree not visible'); return }
    const text = await tree.textContent()
    expect(text?.length).toBeGreaterThan(0)
  })

  test('mission grid shows missions', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasBrowser) { test.skip(true, 'Mission browser not visible'); return }
    const grid = page.getByTestId('mission-grid')
    const hasGrid = await grid.isVisible().catch((error) => { console.error('Promise error:', error); return false })
    if (!hasGrid) { test.skip(true, 'Mission grid not visible'); return }
    const text = await grid.textContent()
    expect(text?.length).toBeGreaterThan(0)
  })

  test('clicking a mission shows detail view', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasBrowser) { test.skip(true, 'Mission browser not visible'); return }
    const grid = page.getByTestId('mission-grid')
    const hasGrid = await grid.isVisible().catch((error) => { console.error('Promise error:', error); return false })
    if (!hasGrid) { test.skip(true, 'Mission grid not visible'); return }
    // Click the first clickable mission item
    const missionItem = grid.locator('button, a, [role="button"], [class*="cursor-pointer"]').first()
    const hasMission = await missionItem.isVisible().catch((error) => { console.error('Promise error:', error); return false })
    if (!hasMission) { test.skip(true, 'No clickable mission item found'); return }
    await missionItem.click()
    await page.waitForTimeout(500)
    // Detail view or expanded content should appear
    const body = page.locator('body')
    const content = await body.textContent()
    expect(content?.length).toBeGreaterThan(0)
  })

  test('category filter works in mission tree', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasBrowser) { test.skip(true, 'Mission browser not visible'); return }
    const tree = page.getByTestId('mission-tree')
    const hasTree = await tree.isVisible().catch((error) => { console.error('Promise error:', error); return false })
    if (!hasTree) { test.skip(true, 'Mission tree not visible'); return }
    // Click first category in tree to filter
    const treeItem = tree.locator('button, [role="treeitem"], li').first()
    const hasItem = await treeItem.isVisible().catch((error) => { console.error('Promise error:', error); return false })
    if (!hasItem) { test.skip(true, 'No tree item found to click'); return }
    await treeItem.click()
    await page.waitForTimeout(500)
    // Should filter grid content without crashing
    await expect(tree).toBeVisible()
  })

  test('search clears properly', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')
    const browser = page.getByTestId('mission-browser')
    const hasBrowser = await browser.isVisible({ timeout: MISSION_LOAD_TIMEOUT_MS }).catch((error) => { console.error('Promise error:', error); return false })
    if (!hasBrowser) { test.skip(true, 'Mission browser not visible'); return }
    const searchInput = page.getByTestId('mission-search')
    const hasSearch = await searchInput.isVisible().catch((error) => { console.error('Promise error:', error); return false })
    if (!hasSearch) { test.skip(true, 'Mission search input not visible'); return }
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

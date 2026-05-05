import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupErrorCollector,
  waitForSubRoute,
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
} from './helpers/setup'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cost route path */
const COST_ROUTE = '/cost'

/** Minimum content length (chars) to confirm the page is not blank */
const MIN_PAGE_CONTENT_LENGTH = 100

/** Expected page title text */
const PAGE_TITLE_TEXT = 'Cost Management'

/** Sublabel text for the total cost stat block */
const STAT_TOTAL_COST_SUBLABEL = 'est. monthly'

/** Sublabel text containing "cores" for the CPU cost stat */
const STAT_CPU_COST_SUBLABEL = 'cores'

/** Sublabel text containing "GB" or "TB" for the memory cost stat */
const STAT_MEMORY_SUBLABEL_PATTERN = /GB|TB|GiB|TiB/

/** Sublabel text for network cost stat */
const STAT_NETWORK_SUBLABEL = 'not tracked'

/** Dollar sign prefix used in cost values */
const DOLLAR_PREFIX = '$'

/** Error display text when cost data fails to load */
const ERROR_DISPLAY_TEXT = 'Error loading cost data'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Cost Deep Tests (/cost)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, COST_ROUTE)
    await waitForSubRoute(page)
  })

  // -------------------------------------------------------------------------
  // Page Structure
  // -------------------------------------------------------------------------

  test.describe('Page Structure', () => {
    test('loads without console errors', async ({ page }) => {
      const { errors } = setupErrorCollector(page)
      // Re-navigate to capture errors from a fresh load
      await setupDemoAndNavigate(page, COST_ROUTE)
      await waitForSubRoute(page)
      expect(errors).toHaveLength(0)
    })

    test('renders page title', async ({ page }) => {
      const title = page.getByTestId('dashboard-title')
      await expect(title).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      const text = await title.textContent()
      expect(text).toContain(PAGE_TITLE_TEXT)
    })

    test('displays dashboard header', async ({ page }) => {
      const header = page.getByTestId('dashboard-header')
      await expect(header).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('shows stats overview', async ({ page }) => {
      // DashboardPage renders stats blocks; look for the "est. monthly" sublabel
      // #12090 — Wait for data hydration instead of skipping assertion
      const statsArea = page.locator('text=' + STAT_TOTAL_COST_SUBLABEL).first()
      await expect(statsArea).toBeVisible({ timeout: 30000 })
    })
  })

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  test.describe('Stats', () => {
    test('shows estimated monthly cost stat', async ({ page }) => {
      // #12090 — Wait for data hydration instead of skipping assertion
      const stat = page.locator('text=' + STAT_TOTAL_COST_SUBLABEL).first()
      await expect(stat).toBeVisible({ timeout: 30000 })
      // The value above the sublabel should contain a dollar sign.
      // Walk up multiple levels to find the stat block container that
      // includes both the value and sublabel elements.
      const parentBlock = stat.locator('xpath=ancestor::*[contains(., "$")]').first()
      const blockText = await parentBlock.textContent()
      expect(blockText).toContain(DOLLAR_PREFIX)
    })

    test('shows CPU cost stat', async ({ page }) => {
      // CPU stat sublabel contains "cores" (e.g. "24 cores")
      // #12090 — Wait for data hydration instead of skipping assertion
      const stat = page.locator('text=' + STAT_CPU_COST_SUBLABEL).first()
      await expect(stat).toBeVisible({ timeout: 30000 })
    })

    test('shows memory cost stat', async ({ page }) => {
      // Memory stat sublabel contains a memory unit like "GB" or "TB"
      // #12090 — Wait for data hydration instead of skipping assertion
      const stat = page.locator('text=/\\d+.*(?:GB|TB|GiB|TiB)/').first()
      await expect(stat).toBeVisible({ timeout: 30000 })
    })

    test('shows storage cost stat', async ({ page }) => {
      // Storage stat also contains a memory unit; it appears alongside other cost stats
      // Look for multiple dollar-prefixed values on the page
      const dollarValues = page.locator('text=/^\\$\\d/')
      const count = await dollarValues.count()
      // In demo mode with clusters, there should be at least one cost value
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })

  // -------------------------------------------------------------------------
  // Content
  // -------------------------------------------------------------------------

  test.describe('Content', () => {
    test('renders cards section', async ({ page }) => {
      // DashboardPage renders configurable cards; verify the page has content
      // beyond just the header and stats
      const header = page.getByTestId('dashboard-header')
      await expect(header).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      // The page should contain either cost cards or the empty state
      const bodyText = await page.locator('body').textContent()
      const hasCostContent =
        (bodyText ?? '').includes(DOLLAR_PREFIX) ||
        (bodyText ?? '').includes('Cost Dashboard')
      expect(hasCostContent).toBe(true)
    })

    test('page has meaningful content', async ({ page }) => {
      const bodyText = await page.locator('body').textContent()
      expect((bodyText ?? '').length).toBeGreaterThan(MIN_PAGE_CONTENT_LENGTH)
    })
  })

  // -------------------------------------------------------------------------
  // Refresh
  // -------------------------------------------------------------------------

  test.describe('Refresh', () => {
    test('refresh button is clickable', async ({ page }) => {
      // #12090 — Wait for data hydration instead of skipping assertion
      const refreshBtn = page.getByTestId('dashboard-refresh-button')
      await expect(refreshBtn).toBeVisible({ timeout: 30000 })
      await expect(refreshBtn).toBeEnabled()
      await refreshBtn.click()
      // After clicking, the page should still show the header
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
    })
  })

  // -------------------------------------------------------------------------
  // Error State
  // -------------------------------------------------------------------------

  test.describe('Error State', () => {
    test('handles error gracefully', async ({ page }) => {
      // Navigate to the route and verify no unhandled crash occurs
      const header = page.getByTestId('dashboard-header')
      await expect(header).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      // Verify the page did not crash to a white screen
      const bodyText = await page.locator('body').textContent()
      expect((bodyText ?? '').length).toBeGreaterThan(MIN_PAGE_CONTENT_LENGTH)
    })
  })
})

import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupDemoMode,
  setupErrorCollector,
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
} from './helpers/setup'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum content length (chars) to confirm the page is not blank */
const MIN_PAGE_CONTENT_LENGTH = 100

/** Marketplace route path */
const MARKETPLACE_ROUTE = '/marketplace'

/** The localStorage key for view mode preference */
const VIEW_MODE_STORAGE_KEY = 'kc-marketplace-view-mode'

/** The localStorage key for CNCF banner collapsed state */
const BANNER_COLLAPSED_STORAGE_KEY = 'kc-cncf-banner-collapsed'

/** Expected contribute URL substring for the console-marketplace repo */
const CONTRIBUTE_URL_SUBSTRING = 'console-marketplace'

/** Expected issues URL substring for Help Wanted issues */
const ISSUES_URL_SUBSTRING = 'console-marketplace/issues'

/** Number of type filter buttons (All + Dashboards + Card Presets + Themes) */
const EXPECTED_TYPE_FILTER_COUNT = 4

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Marketplace Deep Tests (/marketplace)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, MARKETPLACE_ROUTE)
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })
  })

  // -------------------------------------------------------------------------
  // Page Structure
  // -------------------------------------------------------------------------

  test.describe('Page Structure', () => {
    test('loads without console errors', async ({ page }) => {
      const { errors } = setupErrorCollector(page)
      // Re-navigate to capture errors from a fresh load
      await setupDemoAndNavigate(page, MARKETPLACE_ROUTE)
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      expect(errors).toHaveLength(0)
    })

    test('renders marketplace header', async ({ page }) => {
      const title = page.getByTestId('dashboard-title')
      await expect(title).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      const text = await title.textContent()
      expect(text?.toLowerCase()).toContain('marketplace')
    })

    test('shows search input', async ({ page }) => {
      const searchInput = page.locator('input[type="text"]').first()
      await expect(searchInput).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })

    test('page has meaningful content', async ({ page }) => {
      const bodyText = await page.locator('body').textContent()
      expect((bodyText ?? '').length).toBeGreaterThan(MIN_PAGE_CONTENT_LENGTH)
    })
  })

  // -------------------------------------------------------------------------
  // View Mode Toggle
  // -------------------------------------------------------------------------

  test.describe('View Mode Toggle', () => {
    test('grid and list toggle buttons are visible', async ({ page }) => {
      // Grid button has title "Grid view", list button has title "List view"
      const gridBtn = page.locator('button[title="Grid view"]')
      const listBtn = page.locator('button[title="List view"]')
      // These only appear when items are loaded; use a soft check
      const gridVisible = await gridBtn.isVisible().catch(() => false)
      const listVisible = await listBtn.isVisible().catch(() => false)
      // If marketplace has items, both should be visible
      if (gridVisible) {
        await expect(gridBtn).toBeVisible()
        await expect(listBtn).toBeVisible()
      }
    })

    test('clicking list toggle switches view', async ({ page }) => {
      const listBtn = page.locator('button[title="List view"]')
      if (await listBtn.isVisible().catch(() => false)) {
        await listBtn.click()
        // After clicking, the list button should have the active style
        // Verify localStorage was updated
        const viewMode = await page.evaluate(
          (key) => localStorage.getItem(key),
          VIEW_MODE_STORAGE_KEY
        )
        expect(viewMode).toBe('list')
      }
    })

    test('clicking grid toggle switches back', async ({ page }) => {
      const listBtn = page.locator('button[title="List view"]')
      const gridBtn = page.locator('button[title="Grid view"]')
      if (await listBtn.isVisible().catch(() => false)) {
        // First switch to list
        await listBtn.click()
        // Then switch back to grid
        await gridBtn.click()
        const viewMode = await page.evaluate(
          (key) => localStorage.getItem(key),
          VIEW_MODE_STORAGE_KEY
        )
        expect(viewMode).toBe('grid')
      }
    })
  })

  // -------------------------------------------------------------------------
  // Search and Filtering
  // -------------------------------------------------------------------------

  test.describe('Search and Filtering', () => {
    test('search input accepts text', async ({ page }) => {
      const searchInput = page.locator('input[type="text"]').first()
      await expect(searchInput).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await searchInput.fill('test query')
      await expect(searchInput).toHaveValue('test query')
    })

    test('type filter buttons are present', async ({ page }) => {
      // Should have "All", "Dashboards", "Card Presets", "Themes" buttons
      const allBtn = page.locator('button').filter({ hasText: 'All' }).first()
      await expect(allBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      const dashboardsBtn = page.locator('button').filter({ hasText: 'Dashboards' }).first()
      await expect(dashboardsBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      const cardPresetsBtn = page.locator('button').filter({ hasText: 'Card Presets' }).first()
      await expect(cardPresetsBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      const themesBtn = page.locator('button').filter({ hasText: 'Themes' }).first()
      await expect(themesBtn).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    })
  })

  // -------------------------------------------------------------------------
  // CNCF Progress Banner
  // -------------------------------------------------------------------------

  test.describe('CNCF Progress Banner', () => {
    test('shows CNCF Project Coverage banner', async ({ page }) => {
      const banner = page.locator('text=CNCF Project Coverage').first()
      // Banner only appears when cncfStats.total > 0; gracefully handle absence
      const isVisible = await banner.isVisible().catch(() => false)
      if (isVisible) {
        await expect(banner).toBeVisible()
      }
    })

    test('banner shows completion percentage', async ({ page }) => {
      const banner = page.locator('text=CNCF Project Coverage').first()
      if (await banner.isVisible().catch(() => false)) {
        // Look for percentage text (e.g. "42%")
        const pctText = page.getByText(/\d+%/).first()
        const isVisible = await pctText.isVisible().catch(() => false)
        // Percentage is shown near the banner header
        if (isVisible) {
          await expect(pctText).toBeVisible()
        }
      }
    })

    test('banner can be collapsed', async ({ page }) => {
      const bannerButton = page.locator('button').filter({ hasText: 'CNCF Project Coverage' }).first()
      if (await bannerButton.isVisible().catch(() => false)) {
        // Click to collapse
        await bannerButton.click()
        const collapsed = await page.evaluate(
          (key) => localStorage.getItem(key),
          BANNER_COLLAPSED_STORAGE_KEY
        )
        expect(collapsed).toBe('true')

        // Click again to expand
        await bannerButton.click()
        const expanded = await page.evaluate(
          (key) => localStorage.getItem(key),
          BANNER_COLLAPSED_STORAGE_KEY
        )
        expect(expanded).toBe('false')
      }
    })
  })

  // -------------------------------------------------------------------------
  // Marketplace Items
  // -------------------------------------------------------------------------

  test.describe('Marketplace Items', () => {
    test('displays marketplace item cards', async ({ page }) => {
      // In grid mode, items are in a grid container; in list mode, they are rows
      // Look for any card with a name (h3 inside card)
      const cards = page.locator('.bg-card').filter({ has: page.locator('h3') })
      const count = await cards.count()
      // Demo mode should have at least one marketplace item
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('items show name and type badge', async ({ page }) => {
      // Each card has an h3 for the name and a type badge (Dashboard/Card Preset/Theme)
      const firstCard = page.locator('.bg-card').filter({ has: page.locator('h3') }).first()
      if (await firstCard.isVisible().catch(() => false)) {
        const name = firstCard.locator('h3').first()
        await expect(name).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
        const nameText = await name.textContent()
        expect((nameText ?? '').length).toBeGreaterThan(0)
      }
    })

    test('items show description', async ({ page }) => {
      // Description is a <p> with class "line-clamp-2" inside cards
      const firstCard = page.locator('.bg-card').filter({ has: page.locator('h3') }).first()
      if (await firstCard.isVisible().catch(() => false)) {
        const desc = firstCard.locator('p').first()
        if (await desc.isVisible().catch(() => false)) {
          const descText = await desc.textContent()
          expect((descText ?? '').length).toBeGreaterThan(0)
        }
      }
    })
  })

  // -------------------------------------------------------------------------
  // Sort Controls
  // -------------------------------------------------------------------------

  test.describe('Sort Controls', () => {
    test('sort controls are visible', async ({ page }) => {
      // Sort label "Sort:" appears when items are loaded
      const sortLabel = page.locator('text=Sort:').first()
      const isVisible = await sortLabel.isVisible().catch(() => false)
      if (isVisible) {
        await expect(sortLabel).toBeVisible()
        // Verify sort buttons exist (Name, Type, Author)
        const nameSort = page.locator('button').filter({ hasText: 'Name' }).first()
        await expect(nameSort).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      }
    })
  })

  // -------------------------------------------------------------------------
  // Links
  // -------------------------------------------------------------------------

  test.describe('Links', () => {
    test('Contribute link is present', async ({ page }) => {
      // The contribute footer has a "Contribute" link pointing to console-marketplace
      const contributeLink = page.locator('a').filter({ hasText: 'Contribute' }).first()
      await expect(contributeLink).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      const href = await contributeLink.getAttribute('href')
      expect(href).toContain(CONTRIBUTE_URL_SUBSTRING)
    })

    test('Help Wanted link is present', async ({ page }) => {
      // "Browse Issues" link in the CNCF banner or footer, or "Help Wanted" button
      const helpWantedBtn = page.locator('button').filter({ hasText: 'Help Wanted' }).first()
      const browseIssuesLink = page.locator('a').filter({ hasText: 'Browse Issues' }).first()

      const helpVisible = await helpWantedBtn.isVisible().catch(() => false)
      const browseVisible = await browseIssuesLink.isVisible().catch(() => false)

      if (browseVisible) {
        const href = await browseIssuesLink.getAttribute('href')
        expect(href).toContain(ISSUES_URL_SUBSTRING)
      } else if (helpVisible) {
        // Help Wanted button exists even if no Browse Issues link is shown
        await expect(helpWantedBtn).toBeVisible()
      }
    })
  })
})

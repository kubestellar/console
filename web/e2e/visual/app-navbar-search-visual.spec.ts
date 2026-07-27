import { test, expect } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

/**
 * Visual regression tests for the navbar global search results panel.
 *
 * Guards the SearchResultsPanel category icons (lucide components) after the
 * SearchDropdown → SearchResultsPanel extraction regressed them (#21525).
 *
 * Run with:
 *   cd web && npm run test:visual
 *
 * Update baselines after intentional layout changes:
 *   cd web && npm run test:visual:update
 */

const ROOT_VISIBLE_TIMEOUT_MS = 15_000
const RESULTS_VISIBLE_TIMEOUT_MS = 15_000
const DASHBOARD_SETTLE_TIMEOUT_MS = 15_000
const SEARCH_PANEL_FIXED_WIDTH_PX = 600
const SEARCH_PANEL_FIXED_LEFT_PX = 100
const SEARCH_PANEL_FIXED_TOP_PX = 8

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }

test.describe('Navbar global search — desktop (1440×900)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('search results panel with category headers and icons', async ({ page }) => {
    await setupDemoMode(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: ROOT_VISIBLE_TIMEOUT_MS })

    // Wait for the dashboard grid so the page's vertical scrollbar is settled —
    // its appearance resizes the navbar and would shift the panel between runs.
    await page.getByTestId('dashboard-cards-grid').waitFor({
      state: 'visible',
      timeout: DASHBOARD_SETTLE_TIMEOUT_MS,
    })

    // The search container is flex-1, so its size and position depend on which
    // navbar widgets (active users, token usage, …) have loaded and on
    // fractional flex widths — nondeterministic between runs, which shifts and
    // resizes the results panel screenshot. Pin the container to fixed integer
    // coordinates so the panel baseline has stable geometry.
    await page.addStyleTag({
      content: `[data-testid="global-search"] {
        position: fixed !important;
        left: ${SEARCH_PANEL_FIXED_LEFT_PX}px !important;
        top: ${SEARCH_PANEL_FIXED_TOP_PX}px !important;
        width: ${SEARCH_PANEL_FIXED_WIDTH_PX}px !important;
        flex: none !important;
      }`,
    })

    const input = page.getByTestId('global-search-input')
    await input.click()
    await input.fill('cluster')

    const resultsPanel = page.getByTestId('global-search-results')
    await resultsPanel.waitFor({
      state: 'visible',
      timeout: RESULTS_VISIBLE_TIMEOUT_MS,
    })
    await page.getByTestId('global-search-result-item').first().waitFor({
      state: 'visible',
      timeout: RESULTS_VISIBLE_TIMEOUT_MS,
    })

    // Webfonts swap in asynchronously; capturing before they settle produces
    // ghosted-text diffs.
    await page.evaluate(() => document.fonts.ready)

    // Screenshot only the results panel — full-page shots include toasts and
    // live counters that make baselines flaky. The panel is what guards the
    // category icons (#21525).
    await expect(resultsPanel).toHaveScreenshot('app-navbar-search-results-desktop-1440.png')
  })
})
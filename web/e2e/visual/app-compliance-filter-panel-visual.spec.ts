import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const ROOT_VISIBLE_TIMEOUT_MS = 15_000
const PANEL_VISIBLE_TIMEOUT_MS = 15_000
const STATS_VISIBLE_TIMEOUT_MS = 15_000

async function setupAndNavigateToCompliance(page: Page) {
  await setupDemoMode(page)
  await page.goto('/compliance')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: ROOT_VISIBLE_TIMEOUT_MS })
  await expect(page.getByTestId('stat-block-score')).toBeVisible({ timeout: STATS_VISIBLE_TIMEOUT_MS })
}

test.describe('Compliance filter panel layout — desktop', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('global filter panel overlays compliance page without layout shift', async ({ page }) => {
    await setupAndNavigateToCompliance(page)

    await page.getByTestId('navbar-cluster-filter-btn').click()

    const panel = page.getByTestId('navbar-cluster-filter-dropdown')

    await expect(panel).toBeVisible({ timeout: PANEL_VISIBLE_TIMEOUT_MS })
    await expect(panel).toHaveClass(/absolute/)

    await expect(page).toHaveScreenshot('app-compliance-filter-panel-open-desktop-1440.png', {
      fullPage: false,
    })
  })
})

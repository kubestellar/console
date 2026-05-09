import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const ROOT_VISIBLE_TIMEOUT_MS = 15_000
const PANEL_VISIBLE_TIMEOUT_MS = 15_000
const STATS_VISIBLE_TIMEOUT_MS = 15_000
const FILTER_PANEL_BOTTOM_GAP_PX = 8

async function setupAndNavigateToCompliance(page: Page) {
  await setupDemoMode(page)
  await page.goto('/compliance')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: ROOT_VISIBLE_TIMEOUT_MS })
  await expect(page.getByTestId('stat-block-score')).toBeVisible({ timeout: STATS_VISIBLE_TIMEOUT_MS })
}

test.describe('Compliance filter panel layout — desktop', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('global filter panel stays clear of compliance stats', async ({ page }) => {
    await setupAndNavigateToCompliance(page)

    await page.getByTestId('navbar-cluster-filter-btn').click()

    const panel = page.getByTestId('navbar-cluster-filter-dropdown')
    const scoreBlock = page.getByTestId('stat-block-score')

    await expect(panel).toBeVisible({ timeout: PANEL_VISIBLE_TIMEOUT_MS })
    await expect(scoreBlock).toBeVisible({ timeout: STATS_VISIBLE_TIMEOUT_MS })

    const panelBox = await panel.boundingBox()
    const scoreBox = await scoreBlock.boundingBox()

    expect(panelBox, 'cluster filter panel should be measurable').not.toBeNull()
    expect(scoreBox, 'score stat block should be measurable').not.toBeNull()

    if (panelBox && scoreBox) {
      expect(
        scoreBox.y,
        'compliance stats should render below the open filter panel'
      ).toBeGreaterThanOrEqual(panelBox.y + panelBox.height + FILTER_PANEL_BOTTOM_GAP_PX)
    }

    await expect(page).toHaveScreenshot('app-compliance-filter-panel-open-desktop-1440.png', {
      fullPage: false,
    })
  })
})

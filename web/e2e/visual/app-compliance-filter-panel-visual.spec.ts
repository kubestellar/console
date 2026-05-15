import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const ROOT_VISIBLE_TIMEOUT_MS = 15_000
const PANEL_VISIBLE_TIMEOUT_MS = 15_000
const STATS_VISIBLE_TIMEOUT_MS = 15_000
const PANEL_LAYOUT_SETTLE_TIMEOUT_MS = 5_000
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

  test('global filter panel overlays dashboard content instead of pushing it down', async ({ page }) => {
    await setupAndNavigateToCompliance(page)

    const scoreBlock = page.getByTestId('stat-block-score')
    // Get initial position before opening panel
    const initialScoreBox = await scoreBlock.boundingBox()
    expect(initialScoreBox, 'score stat block should be measurable').not.toBeNull()

    await page.getByTestId('navbar-cluster-filter-btn').click()

    const panel = page.getByTestId('navbar-cluster-filter-dropdown')
    await expect(panel).toBeVisible({ timeout: PANEL_VISIBLE_TIMEOUT_MS })

    await expect
      .poll(async () => {
        const panelBox = await panel.boundingBox()
        const newScoreBox = await scoreBlock.boundingBox()

        expect(panelBox, 'cluster filter panel should be measurable').not.toBeNull()
        expect(newScoreBox, 'score stat block should be measurable').not.toBeNull()

        if (!panelBox || !newScoreBox) {
          return false
        }

        // Verify the score block didn't move down (not pushed)
        // Allowing a 1px variance for sub-pixel rendering differences
        const isPositionStable = Math.abs(newScoreBox.y - initialScoreBox!.y) <= 1
        
        // Verify the panel overlaps/reaches below the score block's top edge
        const doesOverlay = (panelBox.y + panelBox.height) > newScoreBox.y

        return isPositionStable && doesOverlay
      }, {
        message: 'filter panel should overlay content without pushing it down',
        timeout: PANEL_LAYOUT_SETTLE_TIMEOUT_MS,
      })
      .toBe(true)
  })
})

import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const ROOT_VISIBLE_TIMEOUT_MS = 15_000
const PANEL_VISIBLE_TIMEOUT_MS = 15_000
const DASHBOARD_VISIBLE_TIMEOUT_MS = 15_000
const LAYOUT_SETTLE_TIMEOUT_MS = 5_000
const INITIAL_LAYOUT_SETTLE_TIMEOUT_MS = 15_000
const LAYOUT_STABILITY_POLL_INTERVAL_MS = 250
const REQUIRED_STABLE_LAYOUT_SAMPLES = 8
const LAYOUT_SHIFT_TOLERANCE_PX = 1
const MAIN_CONTENT_SELECTOR = '#main-content'
const DASHBOARD_STAT_BLOCK_TEST_ID = 'stat-block-clusters'
const DASHBOARD_CARDS_GRID_TEST_ID = 'dashboard-cards-grid'

type DashboardLayoutMetrics = {
  statY: number
  scrollHeight: number
}

async function setupAndNavigateToDashboard(page: Page) {
  await setupDemoMode(page)
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: ROOT_VISIBLE_TIMEOUT_MS })
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: DASHBOARD_VISIBLE_TIMEOUT_MS })
  await expect(page.getByTestId(DASHBOARD_STAT_BLOCK_TEST_ID)).toBeVisible({ timeout: DASHBOARD_VISIBLE_TIMEOUT_MS })
  await expect(page.getByTestId(DASHBOARD_CARDS_GRID_TEST_ID)).toBeVisible({ timeout: DASHBOARD_VISIBLE_TIMEOUT_MS })
}

async function measureDashboardLayout(page: Page): Promise<DashboardLayoutMetrics> {
  return page.evaluate(({ mainContentSelector, statBlockTestId }) => {
    const mainContent = document.querySelector<HTMLElement>(mainContentSelector)
    const statBlock = document.querySelector<HTMLElement>(`[data-testid="${statBlockTestId}"]`)

    if (!mainContent || !statBlock) {
      throw new Error('Dashboard layout elements were not measurable')
    }

    return {
      statY: statBlock.getBoundingClientRect().y,
      scrollHeight: mainContent.scrollHeight,
    }
  }, {
    mainContentSelector: MAIN_CONTENT_SELECTOR,
    statBlockTestId: DASHBOARD_STAT_BLOCK_TEST_ID,
  })
}

async function waitForStableDashboardLayout(page: Page) {
  let previous: DashboardLayoutMetrics | null = null
  let stableSamples = 0

  await expect
    .poll(async () => {
      const current = await measureDashboardLayout(page)
      const isStable = previous !== null &&
        Math.abs(current.statY - previous.statY) <= LAYOUT_SHIFT_TOLERANCE_PX &&
        Math.abs(current.scrollHeight - previous.scrollHeight) <= LAYOUT_SHIFT_TOLERANCE_PX

      stableSamples = isStable ? stableSamples + 1 : 0
      previous = current
      return stableSamples >= REQUIRED_STABLE_LAYOUT_SAMPLES
    }, {
      message: 'dashboard layout should settle before measuring filter-panel shift',
      timeout: INITIAL_LAYOUT_SETTLE_TIMEOUT_MS,
      intervals: [LAYOUT_STABILITY_POLL_INTERVAL_MS],
    })
    .toBe(true)
}

test.describe('Dashboard filter panel layout — desktop', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('global filter panel opens without shifting dashboard stats', async ({ page }, testInfo) => {
    await setupAndNavigateToDashboard(page)
    await waitForStableDashboardLayout(page)

    const before = await measureDashboardLayout(page)

    await page.getByTestId('navbar-cluster-filter-btn').click()

    const panel = page.getByTestId('navbar-cluster-filter-dropdown')
    await expect(panel).toBeVisible({ timeout: PANEL_VISIBLE_TIMEOUT_MS })

    await testInfo.attach('dashboard-filter-panel-open', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    })

    await expect
      .poll(async () => {
        const after = await measureDashboardLayout(page)
        const statShift = Math.abs(after.statY - before.statY)
        const scrollHeightDelta = Math.abs(after.scrollHeight - before.scrollHeight)

        return statShift <= LAYOUT_SHIFT_TOLERANCE_PX && scrollHeightDelta <= LAYOUT_SHIFT_TOLERANCE_PX
      }, {
        message: 'dashboard stats should not move or change scroll height when the filter panel opens',
        timeout: LAYOUT_SETTLE_TIMEOUT_MS,
      })
      .toBe(true)
  })
})

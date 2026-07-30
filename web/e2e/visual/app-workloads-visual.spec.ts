import { test, expect, type Page } from '@playwright/test'
import { setupWorkloadsDemoPage, waitForWorkloadsReady } from '../helpers/setup'

/**
 * Visual regression test for the Workloads page.
 *
 * Captures screenshots of the /workloads route in demo mode across viewports.
 * Covers: namespace-grouped view, clusters overview section, action buttons.
 *
 * Run with:
 *   cd web && npm run test:visual
 *
 * Update baselines:
 *   cd web && npm run test:visual:update
 */

const DASHBOARD_SETTLE_TIMEOUT_MS = 15_000

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const TABLET_VIEWPORT = { width: 768, height: 1024 }

async function setupAndNavigate(page: Page) {
  await setupWorkloadsDemoPage(page)
  await waitForWorkloadsReady(page, DASHBOARD_SETTLE_TIMEOUT_MS)
}

test.describe.serial('Workloads page visual regression (#12484)', () => {
  test.describe('Desktop (1440×900)', () => {
    test.use({ viewport: DESKTOP_VIEWPORT })

    test('workloads page — full view with namespace groups', async ({ page }) => {
      await setupAndNavigate(page)

      await expect(page).toHaveScreenshot('workloads-desktop-1440.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      })
    })

    test('workloads page — clusters overview section', async ({ page }) => {
      await setupAndNavigate(page)

      const clustersHeading = page.getByTestId('clusters-overview-heading')
      await clustersHeading.scrollIntoViewIfNeeded()

      await expect(page).toHaveScreenshot('workloads-clusters-overview-desktop.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      })
    })
  })

  test.describe('Tablet (768×1024)', () => {
    test.use({ viewport: TABLET_VIEWPORT })

    test('workloads page — tablet responsive layout', async ({ page }) => {
      await setupAndNavigate(page)

      await expect(page).toHaveScreenshot('workloads-tablet-768.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      })
    })
  })
})

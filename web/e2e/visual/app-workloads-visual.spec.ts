import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

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
const ROOT_VISIBLE_TIMEOUT_MS = 15_000

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const TABLET_VIEWPORT = { width: 768, height: 1024 }

async function setupAndNavigate(page: Page, path: string) {
  await setupDemoMode(page)
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
  await page.getByTestId('dashboard-header').waitFor({ state: 'visible', timeout: ROOT_VISIBLE_TIMEOUT_MS }).catch(() => {
    // Header may not appear if demo data is slow; proceed with screenshot anyway
  })
}

test.describe('Workloads page visual regression (#12484)', () => {
  test.describe('Desktop (1440×900)', () => {
    test.use({ viewport: DESKTOP_VIEWPORT })

    test('workloads page — full view with namespace groups', async ({ page }) => {
      await setupAndNavigate(page, '/workloads')

      // Wait for workload rows or empty state to render
      const content = page.locator('.border-l-4, [data-testid="dashboard-empty-state"]').first()
      await content.waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch(() => {
        // May timeout if demo data is minimal; screenshot captures current state
      })

      await expect(page).toHaveScreenshot('workloads-desktop-1440.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      })
    })

    test('workloads page — clusters overview section', async ({ page }) => {
      await setupAndNavigate(page, '/workloads')

      // Scroll to clusters overview section
      const clustersHeading = page.locator('h2', { hasText: 'Clusters Overview' })
      await clustersHeading.scrollIntoViewIfNeeded().catch(() => {})

      await expect(page).toHaveScreenshot('workloads-clusters-overview-desktop.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      })
    })
  })

  test.describe('Tablet (768×1024)', () => {
    test.use({ viewport: TABLET_VIEWPORT })

    test('workloads page — tablet responsive layout', async ({ page }) => {
      await setupAndNavigate(page, '/workloads')

      const content = page.locator('.border-l-4, [data-testid="dashboard-empty-state"]').first()
      await content.waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch(() => {})

      await expect(page).toHaveScreenshot('workloads-tablet-768.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      })
    })
  })
})

import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

/**
 * Visual regression tests for /cluster-admin route.
 *
 * Covers desktop (1440×900), full-page scroll, and tablet (768×1024) layouts.
 *
 * Run with:
 *   cd web && npm run test:visual
 *
 * Update baselines after intentional layout changes:
 *   cd web && npm run test:visual:update
 */

const DASHBOARD_SETTLE_TIMEOUT_MS = 15_000
const ROOT_VISIBLE_TIMEOUT_MS = 15_000

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const TABLET_VIEWPORT = { width: 768, height: 1024 }

async function setupAndNavigate(page: Page) {
  await setupDemoMode(page)
  await page.goto('/cluster-admin')
  await page.waitForLoadState('domcontentloaded')
  await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: ROOT_VISIBLE_TIMEOUT_MS })
}

test.describe('Cluster Admin — desktop (1440×900)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('cluster-admin page with sidebar and card grid', async ({ page }) => {
    await setupAndNavigate(page)

    // Wait for cards to render
    const cards = page.locator('[data-card-type]')
    await cards.first().waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch((e: Error) => {
      console.warn('[visual] cluster-admin cards not visible before screenshot:', e)
    })

    await expect(page).toHaveScreenshot('app-cluster-admin-desktop-1440.png', {
      fullPage: false,
    })
  })

  test('cluster-admin full-page scroll captures below-fold cards', async ({ page }) => {
    await setupAndNavigate(page)

    const cards = page.locator('[data-card-type]')
    await cards.first().waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch((e: Error) => {
      console.warn('[visual] cluster-admin cards not visible before screenshot:', e)
    })

    await expect(page).toHaveScreenshot('app-cluster-admin-fullpage-1440.png', {
      fullPage: true,
    })
  })
})

test.describe('Cluster Admin — tablet (768×1024)', () => {
  test.use({ viewport: TABLET_VIEWPORT })

  test('cluster-admin page at tablet resolution', async ({ page }) => {
    await setupAndNavigate(page)

    const cards = page.locator('[data-card-type]')
    await cards.first().waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch((e: Error) => {
      console.warn('[visual] cluster-admin cards not visible before screenshot:', e)
    })

    await expect(page).toHaveScreenshot('app-cluster-admin-tablet-768.png', {
      fullPage: false,
    })
  })
})

import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

/**
 * Visual regression tests for the CI/CD dashboard (/ci-cd).
 *
 * Run with:
 *   cd web && npx playwright test --config e2e/visual/app-visual.config.ts app-cicd-visual
 *
 * Update baselines after intentional layout changes:
 *   cd web && npx playwright test --config e2e/visual/app-visual.config.ts app-cicd-visual --update-snapshots
 */

const DASHBOARD_SETTLE_TIMEOUT_MS = 15_000
const ROOT_VISIBLE_TIMEOUT_MS = 15_000

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const TABLET_VIEWPORT = { width: 768, height: 1024 }

async function setupAndNavigate(page: Page, path = '/ci-cd') {
  await setupDemoMode(page)
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('sidebar')).toBeVisible({
    timeout: ROOT_VISIBLE_TIMEOUT_MS,
  })
}

// ── Desktop (1440×900) ─────────────────────────────────────────────────────

test.describe('CI/CD page — desktop (1440×900)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('CI/CD dashboard initial load', async ({ page }) => {
    await setupAndNavigate(page)

    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: DASHBOARD_SETTLE_TIMEOUT_MS,
    })

    await expect(page).toHaveScreenshot('app-cicd-desktop-1440.png', {
      fullPage: false,
    })
  })

  test('CI/CD dashboard with cards rendered', async ({ page }) => {
    await setupAndNavigate(page)

    const grid = page.getByTestId('dashboard-cards-grid')
    await expect(grid).toBeVisible({ timeout: DASHBOARD_SETTLE_TIMEOUT_MS })

    await expect(page).toHaveScreenshot('app-cicd-cards-desktop-1440.png', {
      fullPage: false,
    })
  })

  test('CI/CD dashboard full-page scroll', async ({ page }) => {
    await setupAndNavigate(page)

    const grid = page.getByTestId('dashboard-cards-grid')
    await expect(grid).toBeVisible({ timeout: DASHBOARD_SETTLE_TIMEOUT_MS })

    await expect(page).toHaveScreenshot('app-cicd-fullpage-1440.png', {
      fullPage: true,
    })
  })
})

// ── Tablet (768×1024) ──────────────────────────────────────────────────────

test.describe('CI/CD page — tablet (768×1024)', () => {
  test.use({ viewport: TABLET_VIEWPORT })

  test('CI/CD dashboard at tablet resolution', async ({ page }) => {
    await setupAndNavigate(page)

    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: DASHBOARD_SETTLE_TIMEOUT_MS,
    })

    await expect(page).toHaveScreenshot('app-cicd-tablet-768.png', {
      fullPage: false,
    })
  })
})

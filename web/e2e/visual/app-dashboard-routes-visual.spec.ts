import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

/**
 * Visual regression tests for additional dashboard routes (#11791).
 *
 * Covers routes beyond home, clusters, and settings that previously had
 * no screenshot baselines. Each route is tested at desktop (1440×900).
 *
 * Run with:
 *   cd web && npx playwright test --config e2e/visual/app-visual.config.ts app-dashboard-routes-visual
 *
 * Update baselines after intentional layout changes:
 *   cd web && npx playwright test --config e2e/visual/app-visual.config.ts app-dashboard-routes-visual --update-snapshots
 */

const DASHBOARD_SETTLE_TIMEOUT_MS = 15_000
const ROOT_VISIBLE_TIMEOUT_MS = 15_000

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }

async function setupAndNavigate(page: Page, path: string) {
  await setupDemoMode(page)
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('sidebar')).toBeVisible({
    timeout: ROOT_VISIBLE_TIMEOUT_MS,
  })
}

/**
 * Dashboard routes that should have visual baselines.
 * Each entry: [route path, screenshot filename prefix, page testid or fallback locator]
 */
const DASHBOARD_ROUTES: Array<[string, string, string]> = [
  ['/ci-cd', 'app-cicd', 'dashboard-page'],
  ['/ai-ml', 'app-aiml', 'dashboard-page'],
  ['/workloads', 'app-workloads', 'dashboard-page'],
  ['/alerts', 'app-alerts', 'dashboard-page'],
  ['/gitops', 'app-gitops', 'dashboard-page'],
  ['/pods', 'app-pods', 'dashboard-page'],
  ['/nodes', 'app-nodes', 'dashboard-page'],
  ['/deploy', 'app-deploy', 'dashboard-page'],
  ['/security', 'app-security', 'dashboard-page'],
  ['/cost', 'app-cost', 'dashboard-page'],
  ['/network', 'app-network', 'dashboard-page'],
  ['/storage', 'app-storage', 'dashboard-page'],
  ['/events', 'app-events', 'dashboard-page'],
  ['/compliance', 'app-compliance', 'dashboard-page'],
  ['/helm', 'app-helm', 'dashboard-page'],
  ['/compute', 'app-compute', 'dashboard-page'],
  ['/deployments', 'app-deployments', 'dashboard-page'],
  ['/services', 'app-services', 'dashboard-page'],
]

test.describe('Dashboard routes — desktop (1440×900)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  for (const [route, prefix, testId] of DASHBOARD_ROUTES) {
    test(`${route} page has visual baseline`, async ({ page }) => {
      await setupAndNavigate(page, route)

      // Wait for dashboard page or main content to render
      const pageLocator = page.getByTestId(testId)
      await pageLocator.waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch(() => {
        // Some routes may use #main-content instead of dashboard-page testid
      })

      // Wait for card grid if present (most dashboard routes render cards)
      const grid = page.getByTestId('dashboard-cards-grid')
      await grid.waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch(() => {
        // Not all routes have a cards grid — that's OK
      })

      await expect(page).toHaveScreenshot(`${prefix}-desktop-1440.png`, {
        fullPage: false,
      })
    })

    test(`${route} page full-page scroll`, async ({ page }) => {
      await setupAndNavigate(page, route)

      const pageLocator = page.getByTestId(testId)
      await pageLocator.waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch(() => {
        // Fallback — main content may render differently
      })

      await expect(page).toHaveScreenshot(`${prefix}-fullpage-1440.png`, {
        fullPage: true,
      })
    })
  }
})

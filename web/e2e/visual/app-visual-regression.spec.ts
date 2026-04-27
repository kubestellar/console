import { test, expect, type Page } from '@playwright/test'

/**
 * Full-app visual regression tests.
 *
 * These complement the Storybook component screenshots in
 * visual-regression.spec.ts by capturing the full application layout —
 * sidebar, navbar, card grid, and their interactions at different viewport
 * sizes. Layout regressions such as card grid overflow, sidebar
 * misalignment, and navbar clipping only manifest in the assembled app.
 *
 * Run with:
 *   cd web && npx playwright test --config e2e/visual/app-visual.config.ts
 *
 * Update baselines after intentional layout changes:
 *   cd web && npx playwright test --config e2e/visual/app-visual.config.ts --update-snapshots
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Time to wait for the dashboard grid to stabilise after navigation. */
const DASHBOARD_SETTLE_TIMEOUT_MS = 15_000

/** Time to wait for the root element to appear after navigation. */
const ROOT_VISIBLE_TIMEOUT_MS = 15_000

/** Desktop viewport: common widescreen monitor. */
const DESKTOP_VIEWPORT = { width: 1440, height: 900 }

/** Laptop viewport: standard 13″ laptop. */
const LAPTOP_VIEWPORT = { width: 1280, height: 720 }

/** Tablet viewport: portrait iPad. */
const TABLET_VIEWPORT = { width: 768, height: 1024 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up demo mode and navigate to the dashboard.
 *
 * Seeds localStorage before any page script runs so the auth guard sees a
 * token on first execution (mirrors setupDashboardTest from helpers/setup.ts
 * without pulling in the full helper to keep this config-independent).
 */
async function setupAndNavigate(page: Page, path = '/') {
  // Mock /api/me so AuthProvider resolves without a real backend.
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '99999',
        github_login: 'demo-user',
        email: 'demo@kubestellar.io',
        onboarded: true,
        role: 'admin',
      }),
    }),
  )

  // Mock /api/dashboards to prevent timeout waiting for backend.
  await page.route('**/api/dashboards', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  )

  // Fallback: fulfill any unhandled /api/* requests with an empty 200 so the
  // app doesn't stall on network requests that will never resolve.
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  )

  // Seed demo-mode flags before the page scripts execute.
  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#root').waitFor({ state: 'visible', timeout: ROOT_VISIBLE_TIMEOUT_MS })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Full-app layout — desktop (1440×900)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('dashboard with sidebar and card grid', async ({ page }) => {
    await setupAndNavigate(page)

    // Wait for the card grid to render so the screenshot captures real content.
    const grid = page.getByTestId('dashboard-cards-grid')
    await grid.waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch(() => {
      // Grid may not appear in minimal demo mode — still capture the layout.
    })

    await expect(page).toHaveScreenshot('app-dashboard-desktop-1440.png', {
      fullPage: false,
    })
  })

  test('dashboard header and controls', async ({ page }) => {
    await setupAndNavigate(page)

    // Ensure the header is rendered before capturing.
    await page.getByTestId('dashboard-header').waitFor({
      state: 'visible',
      timeout: DASHBOARD_SETTLE_TIMEOUT_MS,
    }).catch(() => {
      // Proceed even if header test-id is absent — screenshot still valuable.
    })

    await expect(page).toHaveScreenshot('app-header-controls-desktop-1440.png', {
      fullPage: false,
    })
  })
})

test.describe('Full-app layout — laptop (1280×720)', () => {
  test.use({ viewport: LAPTOP_VIEWPORT })

  test('dashboard at laptop resolution', async ({ page }) => {
    await setupAndNavigate(page)

    const grid = page.getByTestId('dashboard-cards-grid')
    await grid.waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch(() => {
      // Grid may not appear in minimal demo mode.
    })

    await expect(page).toHaveScreenshot('app-dashboard-laptop-1280.png', {
      fullPage: false,
    })
  })
})

test.describe('Full-app layout — tablet (768×1024)', () => {
  test.use({ viewport: TABLET_VIEWPORT })

  test('dashboard at tablet resolution', async ({ page }) => {
    await setupAndNavigate(page)

    // On tablet the sidebar may be collapsed — that's the layout we want to
    // capture to detect overflow / misalignment at this breakpoint.
    const grid = page.getByTestId('dashboard-cards-grid')
    await grid.waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch(() => {
      // Grid may not appear in minimal demo mode.
    })

    await expect(page).toHaveScreenshot('app-dashboard-tablet-768.png', {
      fullPage: false,
    })
  })
})

test.describe('Full-app layout — full page scroll', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('full page screenshot captures below-fold cards', async ({ page }) => {
    await setupAndNavigate(page)

    const grid = page.getByTestId('dashboard-cards-grid')
    await grid.waitFor({ state: 'visible', timeout: DASHBOARD_SETTLE_TIMEOUT_MS }).catch(() => {
      // Grid may not appear in minimal demo mode.
    })

    await expect(page).toHaveScreenshot('app-dashboard-fullpage-1440.png', {
      fullPage: true,
    })
  })
})

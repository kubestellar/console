import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * Missions.spec.ts — E2E coverage for the AI Missions (Mission Control) feature.
 *
 * History: This file previously contained only dashboard-UI smoke tests
 * (page title, cards grid, refresh button, viewport sizing) that matched the
 * coverage already in Dashboard.spec.ts. Despite the "AI Missions" describe
 * block, NONE of the old tests exercised any mission-related behavior, so
 * #6451 flagged the file as dead coverage.
 *
 * This version replaces the dashboard smoke tests with real mission checks:
 *   1. Mission Control dialog can be opened via the ?mission-control=open URL param
 *      and renders with the correct role/label.
 *   2. The dialog has a working close control (verifies the dialog is interactive,
 *      not just painted into the DOM).
 *   3. At least one mission project card renders when the missions browser is opened
 *      via the ?browse=missions URL param (Phase 1 project cards).
 *
 * TODO(#6450): Once wave6b lands the `data-testid="mission-control-*"` attributes
 * on MissionControlDialog and project cards, switch the role/name queries below
 * to getByTestId() for stability. Tracking: https://github.com/kubestellar/console/issues/6450
 */

// Test timing constants — Playwright defaults shadowed here so the intent is explicit.
const DIALOG_VISIBLE_TIMEOUT_MS = 10_000 // dialogs open async after route hydration
const CONTROL_VISIBLE_TIMEOUT_MS = 5_000 // interactive controls render after dialog open

async function setupMissionsTest(page: Page) {
  // Catch-all API mock prevents unmocked requests hanging in webkit/firefox.
  // Must be registered FIRST (lowest priority) — specific mocks below override it.
  await mockApiFallback(page)

  // Mock authentication — ProtectedRoute checks /api/me to decide whether to
  // render Layout (which contains MissionSidebar). Without a valid response the
  // app redirects to /login and the dialog never mounts.
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
        role: 'admin',
      }),
    })
  )

  // Mock MCP endpoints — return empty-ish data so mission-control panels don't
  // error out trying to load cluster/pod state.
  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clusters: [],
        issues: [],
        events: [],
        nodes: [],
        pods: [],
        deployments: [],
        services: [],
        namespaces: [],
      }),
    })
  )

  // Mock GitHub mission listings used by the missions browser.
  await page.route('**/api/missions/list**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    })
  )

  // Mock local agent — return 503 so fetchClusterListFromAgent() returns null
  // and the demo-data fallback path activates (same as mockApiFallback).
  await page.route('**/127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Service unavailable (test mock)' }),
    })
  )

  // ---------------------------------------------------------------------------
  // Explicit mocks for endpoints that would otherwise hit the catch-all and
  // return {} — which can cause components to error or block render (#11896).
  // ---------------------------------------------------------------------------

  await page.route('**/api/kagent/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connected: false, status: 'unavailable' }),
    })
  )

  await page.route('**/api/kagent-provider/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connected: false, status: 'unavailable' }),
    })
  )

  await page.route('**/api/feedback/queue*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )

  await page.route('**/api/rewards/bonus*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ points: 0, badges: [] }),
    })
  )

  await page.route('**/api/agent/auto-update/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false, current_version: 'dev', latest_version: 'dev' }),
    })
  )

  // Dashboard/settings endpoints needed for Layout rendering
  await page.route('**/api/dashboards*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )

  await page.route('**/api/cards*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )

  await page.route('**/api/settings*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  )

  await page.route('**/api/missions/browse*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )

  await page.route('**/api/missions/scores*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ topScores: [], userScore: null }),
    })
  )

  // Seed auth token + onboarded flag BEFORE any page script runs.
  // These localStorage values satisfy ProtectedRoute, demo-mode guards,
  // and onboarding checks so Layout + MissionSidebar render without redirects.
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
  })
}

test.describe('AI Missions', () => {
  test.beforeEach(async ({ page }) => {
    await setupMissionsTest(page)
  })

  test('Mission Control dialog opens via ?mission-control=open URL param', async ({ page }) => {
    // Use the deep-link URL param the dialog listens for (MissionSidebar reads
    // searchParams.get('mission-control') and sets showMissionControl=true).
    await page.goto('/?mission-control=open')
    await page.waitForLoadState('domcontentloaded')

    // MissionControlDialog renders with role="dialog" and aria-label matching
    // DEFAULT_DIALOG_ARIA_LABEL = 'Mission control dialog' (or the current
    // mission title if one is loaded). The regex /mission control/i matches both.
    const dialog = page.getByRole('dialog', { name: /mission control/i })
    await expect(dialog).toBeVisible({ timeout: DIALOG_VISIBLE_TIMEOUT_MS })
  })

  test('Mission Control dialog exposes a close control', async ({ page }) => {
    await page.goto('/?mission-control=open')
    await page.waitForLoadState('domcontentloaded')

    const dialog = page.getByRole('dialog', { name: /mission control/i })
    await expect(dialog).toBeVisible({ timeout: DIALOG_VISIBLE_TIMEOUT_MS })

    // The dialog exposes an accessible close button with
    // aria-label="Close Mission Control" (MissionControlDialog.tsx line 439).
    const closeButton = dialog.getByRole('button', { name: /close mission control/i })
    await expect(closeButton).toBeVisible({ timeout: CONTROL_VISIBLE_TIMEOUT_MS })
    await expect(closeButton).toBeEnabled()
  })

  test('missions browser renders at least one project card', async ({ page }) => {
    // Override the listing mock to return one known project. Must unroute()
    // the default handler first — Playwright stacks handlers and the first
    // registration wins when multiple match the same glob.
    await page.unroute('**/api/missions/list**')
    await page.route('**/api/missions/list**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              name: 'sample-mission',
              path: 'missions/sample-mission.yaml',
              sha: 'abc123',
              type: 'file',
            },
          ],
        }),
      })
    )

    await page.goto('/?browse=missions')
    await page.waitForLoadState('domcontentloaded')

    // The missions browser renders entries inside a dialog.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: DIALOG_VISIBLE_TIMEOUT_MS })

    const missionGrid = dialog.locator('[data-testid="mission-grid"]')
    const hasGrid = await missionGrid.isVisible({ timeout: DIALOG_VISIBLE_TIMEOUT_MS }).catch(() => false)

    if (hasGrid) {
      // Prefer structural assertion: at least one card in the grid
      const cards = missionGrid.locator('.group')
      await expect(cards.first()).toBeVisible({ timeout: DIALOG_VISIBLE_TIMEOUT_MS })
      expect(await cards.count()).toBeGreaterThanOrEqual(1)
    } else {
      // Fallback: the dialog must contain at least one heading with the mission name
      const missionEntry = dialog.getByRole('heading', { name: /sample-mission/i })
        .or(dialog.locator('h4:has-text("sample-mission")'))
        .first()
      await expect(missionEntry).toBeVisible({ timeout: DIALOG_VISIBLE_TIMEOUT_MS })
    }
  })
})

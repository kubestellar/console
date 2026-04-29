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
  // Catch-all API mock prevents unmocked requests hanging in webkit/firefox
  await mockApiFallback(page)

  // Mock authentication
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
      }),
    })
  )

  // Mock MCP endpoints — return empty-ish data so mission-control panels don't
  // error out trying to load cluster/pod state.
  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clusters: [
            { name: 'prod-cluster', healthy: true, nodeCount: 5, podCount: 50 },
          ],
        }),
      })
    } else if (url.includes('/pod-issues')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          issues: [
            { name: 'pod-1', namespace: 'default', status: 'CrashLoopBackOff', restarts: 5 },
          ],
        }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issues: [], events: [], nodes: [] }),
      })
    }
  })

  // Mock GitHub mission listings used by the missions browser. An empty list
  // is fine for the dialog-renders test. Tests that need specific mission data
  // must override this AFTER setupMissionsTest() runs by calling
  // page.unroute('**/api/missions/list**') to drop this default handler, then
  // registering a fresh page.route() with the desired response — see the
  // "project card" test below.
  //
  // #6474 / PR #6518 item E — Previously we registered a second route handler
  // inline in the specific test without unroute(); the second registration
  // does NOT override the first — Playwright stacks handlers and matches in
  // order, so the empty-list handler won that race and the project-card test
  // was dead. Earlier comment incorrectly said "override BEFORE
  // setupMissionsTest()" which was impossible (setupMissionsTest runs in
  // beforeEach, before any test body).
  await page.route('**/api/missions/list**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    })
  )

  // Mock local agent so it does not block the dialog mount.
  await page.route('**/127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [], health: { hasClaude: true, hasBob: false } }),
    })
  )

  // Seed auth token + onboarded flag BEFORE any page script runs
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
    // Use the deep-link URL param the dialog listens for (see useMissionControl.ts).
    await page.goto('/?mission-control=open')
    await page.waitForLoadState('domcontentloaded')

    // The dialog renders with role="dialog" and an aria-label of "Mission Control"
    // (or the current mission title if one is already loaded). See
    // MissionControlDialog.tsx:170-172.
    const dialog = page.getByRole('dialog', { name: /mission control/i })
    await expect(dialog).toBeVisible({ timeout: DIALOG_VISIBLE_TIMEOUT_MS })
  })

  test('Mission Control dialog exposes a close control', async ({ page }) => {
    await page.goto('/?mission-control=open')
    await page.waitForLoadState('domcontentloaded')

    const dialog = page.getByRole('dialog', { name: /mission control/i })
    await expect(dialog).toBeVisible({ timeout: DIALOG_VISIBLE_TIMEOUT_MS })

    // The dialog must expose an accessible close button (aria-label="Close Mission Control"
    // on MissionControlDialog.tsx:280). This asserts the dialog is interactive,
    // not merely mounted — a regression that painted an empty shell would fail here.
    const closeButton = dialog.getByRole('button', { name: /close mission control/i })
    await expect(closeButton).toBeVisible({ timeout: CONTROL_VISIBLE_TIMEOUT_MS })
    await expect(closeButton).toBeEnabled()
  })

  test('missions browser renders at least one project card', async ({ page }) => {
    // Override the listing mock to return one known project. The missions
    // browser opens in Phase 1 (project picker) and must surface this entry.
    //
    // #6474 — Must unroute() the default handler from setupMissionsTest()
    // before registering a replacement. A second page.route() for the same
    // glob does NOT override — it stacks, and the first registration wins
    // because Playwright matches routes in order.
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

    // The missions browser renders entries inside the mission grid. Query by
    // the grid test-id first (structural), then fall back to text content.
    // This avoids brittle getByText that breaks when the UI transforms the
    // file name (strips .yaml, title-cases, etc.). See #9526.
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

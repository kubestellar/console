import { test, expect, Page } from '@playwright/test'
import { mockApiFallback, waitForNetworkIdleBestEffort } from './helpers/setup'

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
 *   1. Mission Control panel can be opened via the ?mission-control=open URL param
 *      and renders with the correct data-testid (inline full-page view, not a
 *      floating modal dialog).
 *   2. The panel has a working close control (verifies it is interactive,
 *      not just painted into the DOM).
 *   3. At least one mission project card renders when the missions browser is opened
 *      via the ?browse=missions URL param (Phase 1 project cards).
 *
 * #11891 — The Mission Control UI renders as a full-page inline panel (fixed
 * position with insets), NOT a floating modal dialog. Tests previously expected
 * `getByRole('dialog')` which fails because the component renders as an inline
 * view occupying most of the viewport. We now locate the panel via its stable
 * data-testid="mission-control-dialog" attribute.
 *
 * #11895 — The URL param ?mission-control=open is processed by MissionSidebar
 * which is lazily loaded. Tests should wait for the Mission Control panel
 * itself (and only use best-effort networkidle when a deterministic element
 * wait is not enough).
 *
 * #11896 — Comprehensive API mocking added to prevent unmocked calls to
 * /api/kagent/status, /api/kagent-provider/status, /api/feedback/queue,
 * /api/rewards/bonus, /api/agent/auto-update/status from reaching real backends.
 */

// Test timing constants — Playwright defaults shadowed here so the intent is explicit.
const PANEL_VISIBLE_TIMEOUT_MS = 15_000 // panel opens async after lazy sidebar hydration
const CONTROL_VISIBLE_TIMEOUT_MS = 5_000 // interactive controls render after panel open

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

  // #12929 — Mock GitHub SHA polling to stabilize networkidle timing
  // (versionUtils.ts polls this route when developer channel is selected)
  await page.route('**/api/github/repos/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ref: 'refs/heads/main',
        object: { sha: 'mock-sha-12345' },
      }),
    })
  )

  // #11896 — Mock API endpoints that were previously unmocked and caused real
  // backend calls. These endpoints are probed by various hooks on app startup.
  await page.route('**/api/kagent/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ running: false, version: null }),
    })
  )
  await page.route('**/api/kagent-provider/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, providers: [] }),
    })
  )
  await page.route('**/api/feedback/queue', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], count: 0 }),
    })
  )
  await page.route('**/api/rewards/bonus', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, rewards: [] }),
    })
  )
  await page.route('**/api/agent/auto-update/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false, lastCheck: null }),
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

  // The shared mockApiFallback() helper already mocks local-agent failures and
  // mission browsing. Keep setupMissionsTest aligned with those shared mocks so
  // route precedence is deterministic across browsers.

  // Seed auth token + onboarded flag BEFORE any page script runs
  await page.addInitScript(() => {
    // #12930 — Clear OAuth session state to prevent hidden polling
    localStorage.removeItem('kc-has-session')
    localStorage.removeItem('kc_mission_control_state')
    // #12929 — Clear update channel to prevent GitHub SHA polling
    localStorage.removeItem('kc-update-channel')
    
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
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

  test('Mission Control panel opens via ?mission-control=open URL param', async ({ page }) => {
    const panel = page.locator('[data-testid="mission-control-dialog"]')

    // Start from a clean route first so this test proves the URL param opens
    // the panel instead of accidentally passing due to stale state.
    await page.goto('/')
    await waitForNetworkIdleBestEffort(page)
    await expect(panel).toBeHidden()

    await page.goto('/?mission-control=open')

    // #11891 — MissionControlDialog renders as a fixed-position inline panel
    // (not a floating modal). It has role="dialog" but depending on browser
    // accessibility tree timing, getByRole may not find it reliably. Use the
    // stable data-testid instead, which is always present when the component
    // mounts.
    await expect(panel).toBeVisible({ timeout: PANEL_VISIBLE_TIMEOUT_MS })
    await expect(panel.getByRole('heading', { name: /define your mission/i })).toBeVisible({
      timeout: PANEL_VISIBLE_TIMEOUT_MS,
    })
  })

  test('Mission Control panel exposes a close control', async ({ page }) => {
    await page.goto('/?mission-control=open')

    const panel = page.locator('[data-testid="mission-control-dialog"]')
    await expect(panel).toBeVisible({ timeout: PANEL_VISIBLE_TIMEOUT_MS })

    // The panel must expose an accessible close button (aria-label="Close Mission Control"
    // on MissionControlDialog.tsx). This asserts the panel is interactive,
    // not merely mounted — a regression that painted an empty shell would fail here.
    const closeButton = panel.getByRole('button', { name: /close mission control/i })
    await expect(closeButton).toBeVisible({ timeout: CONTROL_VISIBLE_TIMEOUT_MS })
    await expect(closeButton).toBeEnabled()
  })

  test('missions browser renders at least one project card', async ({ page }) => {
    // Override the shared browse mock with one concrete community mission entry.
    // MissionBrowser fetches /api/missions/browse?path=... and expects a plain
    // BrowseEntry[] response, not an { items: [...] } wrapper.
    await page.unroute('**/api/missions/browse*')
    await page.route('**/api/missions/browse*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            name: 'sample-mission.yaml',
            path: 'fixes/sample-mission.yaml',
            type: 'file',
            size: 1234,
            description: 'Sample community mission',
          },
        ]),
      })
    )

    await page.goto('/?browse=missions')
    await waitForNetworkIdleBestEffort(page, PANEL_VISIBLE_TIMEOUT_MS, 'missions browser')

    const browser = page.getByTestId('mission-browser')
    await expect(browser).toBeVisible({ timeout: PANEL_VISIBLE_TIMEOUT_MS })

    await browser.getByRole('button', { name: /kube.?stellar community/i }).click()

    const missionGrid = browser.getByTestId('mission-grid')
    await expect(missionGrid).toBeVisible({ timeout: PANEL_VISIBLE_TIMEOUT_MS })
    await expect(missionGrid.getByRole('button', { name: /sample-mission\.yaml/i })).toBeVisible({
      timeout: PANEL_VISIBLE_TIMEOUT_MS,
    })
  })
})

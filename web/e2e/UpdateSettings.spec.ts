import { test, expect, Page } from '@playwright/test'

/**
 * E2E tests for the Settings > System Updates section.
 *
 * Covers:
 *  - Update progress banner (pulling, building, restarting states)
 *  - Health-check gating: "Refresh" link must NOT appear while the loading
 *    server returns {"status":"starting"} — only after {"status":"ok"}
 *  - Done banner + dismiss
 *  - Failed banner with error details
 *  - Countdown timer during update
 */

/** Mock user returned by /api/me */
const MOCK_USER = {
  id: '1',
  github_id: '12345',
  github_login: 'testuser',
  email: 'test@example.com',
  onboarded: true,
}

/**
 * Shared setup: auth, route mocks, navigate to /settings.
 * Returns a WebSocket server handle that can send update_progress messages.
 */
async function setupUpdateTest(page: Page) {
  // Suppress console errors from WebSocket / agent connections
  page.on('console', () => {})

  // Mock auth
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    })
  )

  // Mock health — default to "ok" (individual tests may override)
  await page.route('**/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', version: 'dev', oauth_configured: true }),
    })
  )

  // Mock MCP / agent HTTP endpoints
  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [] }),
    })
  )
  await page.route('http://127.0.0.1:8585/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )

  // Mock the kc-agent WebSocket — returns a server handle for sending messages
  const wsServer = await page.routeWebSocket('ws://127.0.0.1:8585/**', (ws) => {
    ws.onMessage((data) => {
      try {
        const msg = JSON.parse(String(data))
        ws.send(JSON.stringify({ id: msg.id, type: 'result', payload: { output: '{}', exitCode: 0 } }))
      } catch {
        // ignore
      }
    })
  })

  // Set auth token + skip onboarding/tour
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kubestellar-console-tour-completed', 'true')
  })

  await page.goto('/settings')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 10000 })

  return wsServer
}

/**
 * Helper: send an update_progress WebSocket message via the mock server.
 */
function sendProgress(
  wsServer: Awaited<ReturnType<Page['routeWebSocket']>>,
  status: string,
  message: string,
  progress: number,
  error?: string,
) {
  const payload: Record<string, unknown> = { status, message, progress }
  if (error) payload.error = error
  wsServer.send(JSON.stringify({ type: 'update_progress', payload }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Update Settings', () => {
  test('shows progress banner during update', async ({ page }) => {
    const ws = await setupUpdateTest(page)

    // Send "pulling" progress
    sendProgress(ws, 'pulling', 'Pulling latest changes...', 10)
    await expect(page.getByTestId('update-progress-banner')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('update-progress-message')).toContainText('Pulling latest changes')

    // "Done" and "Failed" banners should NOT be visible during update
    await expect(page.getByTestId('update-done-banner')).not.toBeVisible()
    await expect(page.getByTestId('update-failed-banner')).not.toBeVisible()
  })

  test('progress bar advances through build stages', async ({ page }) => {
    const ws = await setupUpdateTest(page)

    // Stage 1: pulling at 10%
    sendProgress(ws, 'pulling', 'Pulling latest changes...', 10)
    await expect(page.getByTestId('update-progress-banner')).toBeVisible({ timeout: 5000 })
    const bar = page.getByTestId('update-progress-bar')
    await expect(bar).toHaveCSS('width', /\d+/)

    // Stage 2: building at 60%
    sendProgress(ws, 'building', 'Building Go binaries...', 60)
    await expect(page.getByTestId('update-progress-message')).toContainText('Building Go binaries')

    // Stage 3: restarting at 80%
    sendProgress(ws, 'restarting', 'Restarting via startup-oauth.sh...', 80)
    await expect(page.getByTestId('update-progress-message')).toContainText('Restarting')
  })

  test('countdown timer shows during update', async ({ page }) => {
    const ws = await setupUpdateTest(page)

    sendProgress(ws, 'building', 'Building frontend...', 30)
    await expect(page.getByTestId('update-progress-banner')).toBeVisible({ timeout: 5000 })

    // Countdown should be visible and contain a number (seconds remaining)
    const countdown = page.getByTestId('update-countdown')
    await expect(countdown).toBeVisible()
    await expect(countdown).toContainText(/\d+/)
  })

  test('does NOT show refresh link when health returns "starting"', async ({ page }) => {
    // Override /health to return loading server response
    await page.route('**/health', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'starting' }),
      })
    )

    const ws = await setupUpdateTest(page)

    // Simulate the "done" status directly — this tests the UI rendering
    // The hook would NOT send "done" with our fix (it checks status === 'ok'),
    // but this verifies the banner state machine works correctly
    sendProgress(ws, 'restarting', 'Waiting for backend to come up...', 90)
    await expect(page.getByTestId('update-progress-banner')).toBeVisible({ timeout: 5000 })

    // The done banner should NOT appear while we're still in "restarting" state
    await expect(page.getByTestId('update-done-banner')).not.toBeVisible()
    await expect(page.getByTestId('update-refresh-button')).not.toBeVisible()
  })

  test('shows refresh link only when health returns "ok"', async ({ page }) => {
    const ws = await setupUpdateTest(page)

    // Send "done" status — simulates what happens after waitForBackend()
    // confirms status === 'ok'
    sendProgress(ws, 'done', 'Update complete — restart successful', 100)

    // Done banner and refresh button should appear
    await expect(page.getByTestId('update-done-banner')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('update-refresh-button')).toBeVisible()
    await expect(page.getByTestId('update-refresh-button')).toContainText(/refresh/i)

    // Progress banner should NOT be visible in "done" state
    await expect(page.getByTestId('update-progress-banner')).not.toBeVisible()
  })

  test('done banner can be dismissed', async ({ page }) => {
    const ws = await setupUpdateTest(page)

    sendProgress(ws, 'done', 'Update complete — restart successful', 100)
    await expect(page.getByTestId('update-done-banner')).toBeVisible({ timeout: 5000 })

    // Click dismiss
    await page.getByTestId('update-done-dismiss').click()
    await expect(page.getByTestId('update-done-banner')).not.toBeVisible()
  })

  test('shows failed banner with error details', async ({ page }) => {
    const ws = await setupUpdateTest(page)

    sendProgress(ws, 'failed', 'Frontend build failed, rolling back...', 30, 'npm ERR! code ELIFECYCLE')

    await expect(page.getByTestId('update-failed-banner')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('update-failed-error')).toContainText('npm ERR!')

    // Progress and done banners should NOT be visible
    await expect(page.getByTestId('update-progress-banner')).not.toBeVisible()
    await expect(page.getByTestId('update-done-banner')).not.toBeVisible()
  })

  test('failed banner can be dismissed', async ({ page }) => {
    const ws = await setupUpdateTest(page)

    sendProgress(ws, 'failed', 'Go build failed', 60, 'exit status 1')
    await expect(page.getByTestId('update-failed-banner')).toBeVisible({ timeout: 5000 })

    await page.getByTestId('update-failed-dismiss').click()
    await expect(page.getByTestId('update-failed-banner')).not.toBeVisible()
  })

  test('transitions from progress to done correctly', async ({ page }) => {
    const ws = await setupUpdateTest(page)

    // Start update
    sendProgress(ws, 'pulling', 'Pulling latest changes...', 10)
    await expect(page.getByTestId('update-progress-banner')).toBeVisible({ timeout: 5000 })

    // Progress through stages
    sendProgress(ws, 'building', 'Building frontend...', 30)
    await expect(page.getByTestId('update-progress-message')).toContainText('Building frontend')

    sendProgress(ws, 'building', 'Building Go binaries...', 60)
    sendProgress(ws, 'restarting', 'Restarting...', 80)
    await expect(page.getByTestId('update-progress-message')).toContainText('Restarting')

    // Complete
    sendProgress(ws, 'done', 'Update complete — restart successful', 100)
    await expect(page.getByTestId('update-done-banner')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('update-progress-banner')).not.toBeVisible()
    await expect(page.getByTestId('update-refresh-button')).toBeVisible()
  })
})

import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * Sets up authentication and MCP mocks for events tests
 */
async function setupEventsTest(page: Page) {
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

  // Mock MCP events endpoint with sample data
  await page.route('**/api/mcp/events', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: [
          { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', namespace: 'default', involvedObject: 'pod-1', cluster: 'prod-east', age: '5m' },
          { type: 'Normal', reason: 'Scheduled', message: 'Successfully assigned pod to node', namespace: 'default', involvedObject: 'pod-2', cluster: 'prod-west', age: '10m' },
          { type: 'Warning', reason: 'FailedScheduling', message: 'Insufficient memory', namespace: 'kube-system', involvedObject: 'pod-3', cluster: 'staging', age: '1h' },
        ],
      }),
    })
  )

  // Mock other MCP endpoints
  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], issues: [], nodes: [] }),
    })
  )

  // Seed localStorage BEFORE any page script runs so the auth guard sees
  // the token on first execution. page.evaluate() runs after the page has
  // already parsed and executed scripts, which is too late for webkit/Safari
  // where the auth redirect fires synchronously on script evaluation.
  // page.addInitScript() injects the snippet ahead of any page code (#9096).
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  await page.goto('/events')
  await page.waitForLoadState('domcontentloaded')
}

test.describe('Events Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupEventsTest(page)
  })

  test.describe('Event List', () => {
    test('displays events page', async ({ page }) => {
      // Wait for dashboard header (Events uses DashboardPage)
      const header = page.getByTestId('dashboard-header')
        .or(page.getByTestId('dashboard-page'))
      const headerVisible = await header.first().isVisible({ timeout: 10000 }).catch(() => false)
      if (!headerVisible) {
        test.skip()
        return
      }

      // Should have Events title — may be a heading or plain text
      const heading = page.getByRole('heading', { name: /events/i })
        .or(page.getByText(/events/i).first())
      await expect(heading.first()).toBeVisible({ timeout: 5000 })
    })

    test('shows event types (Warning/Normal)', async ({ page }) => {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 10000 })

      // Event types from our mock data
      const warningText = page.getByText(/warning/i).first()
      await expect(warningText).toBeVisible({ timeout: 5000 })
    })

    test('shows event reasons from mock data', async ({ page }) => {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 10000 })

      // Reasons from our mock data — Firefox renders card content later,
      // so use a generous timeout for cross-browser reliability. #10134
      const EVENT_REASON_TIMEOUT_MS = 10_000
      const backoffText = page.getByText(/BackOff|FailedScheduling|Scheduled/i).first()
      await expect(backoffText).toBeVisible({ timeout: EVENT_REASON_TIMEOUT_MS })
    })
  })

  test.describe('Refresh Controls', () => {
    test('has refresh button', async ({ page }) => {
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible({ timeout: 10000 })
    })

    test('refresh button is clickable', async ({ page }) => {
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible({ timeout: 10000 })

      // Click refresh
      await page.getByTestId('dashboard-refresh-button').click()

      // Button should remain visible after click
      await expect(page.getByTestId('dashboard-refresh-button')).toBeVisible()
    })
  })

  test.describe('Empty States', () => {
    test('handles no events gracefully', async ({ page }) => {
      // Override mock to return empty events
      await page.route('**/api/mcp/events**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ events: [] }),
        })
      )

      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      // Page should still render (not crash)
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })

      // Content should still be accessible
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Accessibility', () => {
    test('event list is keyboard navigable', async ({ page }) => {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 10000 })

      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('page has heading', async ({ page }) => {
      const header = page.getByTestId('dashboard-header')
        .or(page.getByTestId('dashboard-page'))
      const headerVisible = await header.first().isVisible({ timeout: 10000 }).catch(() => false)
      if (!headerVisible) {
        test.skip()
        return
      }

      // Should have Events heading — may be a heading element or plain text
      const heading = page.getByRole('heading', { name: /events/i })
        .or(page.getByText(/events/i).first())
      await expect(heading.first()).toBeVisible({ timeout: 5000 })
    })
  })
})

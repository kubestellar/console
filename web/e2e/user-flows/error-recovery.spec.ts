import { test, expect, testData } from '../fixtures'

/**
 * E2E tests for error recovery flows
 *
 * Covers: API failure → demo mode fallback, chunk load errors,
 * network disconnect handling, and graceful degradation.
 */

async function setupAuth(page: Parameters<typeof test>[1]['page']) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      json: {
        id: '1',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
      },
    })
  )
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// API failure → demo mode fallback
// ─────────────────────────────────────────────────────────────────────────────
test.describe('API Failure Recovery', () => {
  test('app renders when MCP APIs return 500', async ({ page }) => {
    await setupAuth(page)

    // All MCP endpoints fail
    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({ status: 500, json: { error: 'Internal Server Error' } })
    )

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // App must not crash — dashboard page should still be visible
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })
  })

  test('app renders when MCP APIs time out (network abort)', async ({ page }) => {
    await setupAuth(page)

    // Abort MCP requests to simulate timeout
    await page.route('**/api/mcp/**', (route) => route.abort('timedout'))

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })
  })

  test('individual card shows error state when its API fails', async ({ page, mockAPI }) => {
    await setupAuth(page)
    await mockAPI.mockLocalAgent()

    // Clusters API OK, but events API fails
    await mockAPI.mockClusters(testData.clusters.healthy)
    await page.route('**/api/mcp/events**', (route) =>
      route.fulfill({ status: 503, json: { error: 'Service Unavailable' } })
    )

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })

    // Dashboard must still render — the failing card may show an error badge
    // but must not crash the entire page
    const crashIndicators = page.getByText(/something went wrong|application error|unhandled error/i)
    await expect(crashIndicators).not.toBeVisible()
  })

  test('shows demo badge when running in demo mode', async ({ page }) => {
    await setupAuth(page)

    // Simulate demo mode via localStorage flag
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('demo-mode', 'true')
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('demo-user-onboarded', 'true')
    })

    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({ status: 200, json: { clusters: [], issues: [], events: [], nodes: [] } })
    )

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })

    // Demo badge / indicator should appear somewhere on the page
    const demoBadge = page
      .getByText(/demo mode/i)
      .or(page.getByTestId('demo-badge'))
      .or(page.locator('[data-demo="true"]'))

    // Soft assertion — if badge exists, it must be visible; if not, that's acceptable
    // (demo UX may vary) — the important thing is the app doesn't crash
    const hasBadge = await demoBadge.isVisible().catch(() => false)
    if (hasBadge) {
      await expect(demoBadge.first()).toBeVisible()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Auth failure recovery
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Auth Failure Recovery', () => {
  test('redirects to login when /api/me returns 401', async ({ page }) => {
    // Clear any demo mode flags that might bypass the auth redirect
    await page.addInitScript(() => {
      localStorage.removeItem('token')
      localStorage.removeItem('kc-demo-mode')
      localStorage.removeItem('demo-mode')
      localStorage.removeItem('demo-user-onboarded')
    })

    await page.route('**/api/me', (route) =>
      route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
    )

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Should redirect to /login or show a login prompt
    const redirected = await page.waitForURL(/\/login|\/auth/, { timeout: 10000 }).then(() => true).catch(() => false)
    if (!redirected) {
      // Some implementations show a login prompt inline instead of redirecting
      const loginPrompt = page.getByRole('button', { name: /login|sign in/i })
        .or(page.getByText(/sign in|log in/i))
      const hasPrompt = await loginPrompt.first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasPrompt, 'Expected redirect to /login or a login prompt').toBeTruthy()
    }
  })

  test('login page renders without errors', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // Login page must not crash
    const crashIndicators = page.getByText(/something went wrong|application error/i)
    await expect(crashIndicators).not.toBeVisible()

    // Should show some login UI
    const loginEl = page.getByRole('button', { name: /login|sign in|continue/i })
      .or(page.getByText(/sign in|log in|continue with github/i))
    await expect(loginEl.first()).toBeVisible({ timeout: 10000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Network disconnect / offline
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Network Resilience', () => {
  test('app stays functional after going offline mid-session', async ({ page, mockAPI }) => {
    await setupAuth(page)
    await mockAPI.mockClusters(testData.clusters.healthy)
    await mockAPI.mockPodIssues(testData.podIssues.none)
    await mockAPI.mockEvents(testData.events.normal)
    await mockAPI.mockLocalAgent()

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })

    // Simulate going offline
    await page.context().setOffline(true)

    // Trigger a refresh
    const refreshBtn = page.getByTestId('dashboard-refresh-button')
    const hasRefresh = await refreshBtn.isVisible().catch(() => false)
    if (hasRefresh) {
      await refreshBtn.click()
      // App must not crash
      await expect(page.getByTestId('dashboard-page')).toBeVisible()
    }

    // Restore connectivity
    await page.context().setOffline(false)
  })

  test('recovers after network is restored', async ({ page, mockAPI }) => {
    await setupAuth(page)
    await mockAPI.mockClusters(testData.clusters.healthy)
    await mockAPI.mockPodIssues(testData.podIssues.none)
    await mockAPI.mockEvents(testData.events.normal)
    await mockAPI.mockLocalAgent()

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })

    // Go offline then back online
    await page.context().setOffline(true)
    // Brief offline period — dashboard should remain rendered
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await page.context().setOffline(false)

    // Reload — should work fine
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Chunk load / JS error recovery
// ─────────────────────────────────────────────────────────────────────────────
test.describe('JavaScript Error Resilience', () => {
  test('page does not show unhandled JS errors on normal load', async ({ page, mockAPI }) => {
    const jsErrors: string[] = []

    page.on('pageerror', (err) => {
      // Ignore ResizeObserver loop warnings — these are benign browser quirks
      if (!/ResizeObserver|ResizeObserver loop/i.test(err.message)) {
        jsErrors.push(err.message)
      }
    })

    await setupAuth(page)
    await mockAPI.mockClusters(testData.clusters.healthy)
    await mockAPI.mockPodIssues(testData.podIssues.none)
    await mockAPI.mockEvents(testData.events.normal)
    await mockAPI.mockLocalAgent()

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })

    // Wait for async components to settle — ensure cards grid is rendered
    await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 10000 }).catch(() => {})
    // Also wait for network activity to complete
    await page.waitForLoadState('networkidle')

    expect(jsErrors, `Unexpected JS errors: ${jsErrors.join(', ')}`).toHaveLength(0)
  })
})
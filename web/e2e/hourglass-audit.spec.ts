import { test, expect } from '@playwright/test'

// Dashboards that should have refresh controls (hourglass, auto checkbox, refresh button)
const DASHBOARDS_WITH_REFRESH = [
  { name: 'Dashboard', route: '/' },
  { name: 'Workloads', route: '/workloads' },
  { name: 'Pods', route: '/pods' },
  { name: 'Compute', route: '/compute' },
  { name: 'Storage', route: '/storage' },
  { name: 'Network', route: '/network' },
  { name: 'Events', route: '/events' },
  { name: 'Deploy', route: '/deploy' },
  { name: 'Security', route: '/security' },
  { name: 'Compliance', route: '/security-posture' },
  { name: 'DataCompliance', route: '/data-compliance' },
  { name: 'GitOps', route: '/gitops' },
  { name: 'Alerts', route: '/alerts' },
  { name: 'Cost', route: '/cost' },
  { name: 'Operators', route: '/operators' },
  { name: 'Clusters', route: '/clusters' },
  { name: 'Deployments', route: '/deployments' },
  { name: 'Services', route: '/services' },
  { name: 'Nodes', route: '/nodes' },
  { name: 'Logs', route: '/logs' },
  { name: 'HelmReleases', route: '/helm' },
]

test.describe('Hourglass & Refresh Controls Audit', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          id: '1',
          github_id: '12345',
          github_login: 'testuser',
          email: 'test@example.com',
          onboarded: true,
        },
      })
    )

    // Mock MCP data with slow response to catch the hourglass
    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({
        status: 200,
        json: { clusters: [], issues: [], events: [], nodes: [], deployments: [], services: [], pvcs: [], releases: [], operators: [], subscriptions: [] },
      })
    )

    // Mock other APIs
    await page.route('**/api/dashboards/**', (route) =>
      route.fulfill({ status: 200, json: { dashboards: [] } })
    )

    // Set auth token
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('demo-user-onboarded', 'true')
    })
    await page.waitForTimeout(300)
  })

  for (const dashboard of DASHBOARDS_WITH_REFRESH) {
    test(`${dashboard.name} (${dashboard.route}) has refresh button`, async ({ page }) => {
      await page.goto(dashboard.route)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Check for refresh button — look for title="Refresh data" or title="Refresh"
      const refreshButton = page.locator('button[title="Refresh data"], button[title="Refresh"]')
      await expect(refreshButton.first()).toBeVisible({ timeout: 5000 })
    })

    test(`${dashboard.name} (${dashboard.route}) has auto-refresh checkbox`, async ({ page }) => {
      await page.goto(dashboard.route)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Check for auto-refresh checkbox
      const autoCheckbox = page.locator('label:has-text("Auto") input[type="checkbox"]')
      await expect(autoCheckbox.first()).toBeVisible({ timeout: 5000 })
    })

    test(`${dashboard.name} (${dashboard.route}) shows hourglass on refresh`, async ({ page }) => {
      // Use a slow mock to ensure isRefreshing stays true long enough
      await page.route('**/api/mcp/**', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 2000))
        await route.fulfill({
          status: 200,
          json: { clusters: [], issues: [], events: [], nodes: [], deployments: [], services: [], pvcs: [], releases: [], operators: [], subscriptions: [] },
        })
      })

      await page.goto(dashboard.route)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1500)

      // Click refresh
      const refreshButton = page.locator('button[title="Refresh data"], button[title="Refresh"]')
      if (await refreshButton.first().isVisible()) {
        await refreshButton.first().click()

        // Check for hourglass "Updating" text
        const updatingText = page.locator('text=Updating')
        const isVisible = await updatingText.isVisible({ timeout: 3000 }).catch(() => false)

        if (!isVisible) {
          // Also check for the spinning refresh icon as an alternative indicator
          const spinningIcon = page.locator('.animate-spin')
          const spinVisible = await spinningIcon.isVisible({ timeout: 1000 }).catch(() => false)
          expect(isVisible || spinVisible).toBeTruthy()
        }
      }
    })
  }
})

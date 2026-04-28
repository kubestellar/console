import { test, expect } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

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
    // Catch-all API mock prevents unmocked requests hanging in webkit/firefox
    await mockApiFallback(page)

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

    // Mock MCP data
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

    // Seed localStorage BEFORE any page script runs
    await page.addInitScript(() => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
    })
  })

  for (const dashboard of DASHBOARDS_WITH_REFRESH) {
    test(`${dashboard.name} (${dashboard.route}) has refresh button`, async ({ page }) => {
      await page.goto(dashboard.route)
      await page.waitForLoadState('networkidle').catch(() => {})

      // Check for refresh button — look for title="Refresh data" or title="Refresh"
      const refreshButton = page.locator('button[title="Refresh data"], button[title="Refresh"]')
      await expect(refreshButton.first()).toBeVisible({ timeout: 5000 })
    })

    test(`${dashboard.name} (${dashboard.route}) has auto-refresh checkbox`, async ({ page }) => {
      await page.goto(dashboard.route)
      await page.waitForLoadState('networkidle').catch(() => {})

      // Check for auto-refresh checkbox
      const autoCheckbox = page.locator('label:has-text("Auto") input[type="checkbox"]')
      await expect(autoCheckbox.first()).toBeVisible({ timeout: 5000 })
    })

    test(`${dashboard.name} (${dashboard.route}) refresh button is functional`, async ({ page }) => {
      await page.goto(dashboard.route)
      await page.waitForLoadState('networkidle').catch(() => {})

      // Find and click refresh button — verify it doesn't crash the page
      const refreshButton = page.locator('button[title="Refresh data"], button[title="Refresh"]')
      await expect(refreshButton.first()).toBeVisible({ timeout: 5000 })
      await refreshButton.first().click()

      // Verify the page is still functional after clicking refresh
      await expect(page.locator('body')).toBeVisible()

      // The refresh button should still be present after the refresh cycle
      await expect(refreshButton.first()).toBeVisible({ timeout: 5000 })
    })
  }
})

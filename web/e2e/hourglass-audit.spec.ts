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
      route.fulfill({ status: 200, json: [] })
    )

    // Seed localStorage BEFORE any page script runs
    await page.addInitScript(() => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.setItem('kc-has-session', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kc-agent-setup-dismissed', 'true')
      localStorage.setItem('kc-backend-status', JSON.stringify({
        available: true,
        timestamp: Date.now(),
      }))
    })
  })

  for (const dashboard of DASHBOARDS_WITH_REFRESH) {
    test(`${dashboard.name} (${dashboard.route}) has refresh button`, async ({ page }) => {
      await page.goto(dashboard.route)
      await page.waitForLoadState('networkidle').catch(() => {})

      const refreshButton = page.locator('button[data-testid="dashboard-refresh-button"]')
      await expect(refreshButton.first()).toBeVisible({ timeout: 10000 })
    })

    test(`${dashboard.name} (${dashboard.route}) has auto-refresh checkbox`, async ({ page }) => {
      await page.goto(dashboard.route)
      await page.waitForLoadState('networkidle').catch(() => {})

      const autoCheckbox = page.locator('label:has-text("Auto") input[type="checkbox"]')
      await expect(autoCheckbox.first()).toBeVisible({ timeout: 10000 })
    })

    test(`${dashboard.name} (${dashboard.route}) refresh button is functional`, async ({ page }) => {
      await page.goto(dashboard.route)
      await page.waitForLoadState('networkidle').catch(() => {})

      const refreshButton = page.locator('button[data-testid="dashboard-refresh-button"]')
      await expect(refreshButton.first()).toBeVisible({ timeout: 10000 })
      await refreshButton.first().click()

      await expect(page.locator('body')).toBeVisible()
      await expect(refreshButton.first()).toBeVisible({ timeout: 10000 })
    })
  }
})

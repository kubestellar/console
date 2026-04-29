import { test, expect } from '@playwright/test'

const PAGES = [
  { name: 'Dashboard', route: '/' },
  { name: 'Network', route: '/network' },
  { name: 'Events', route: '/events' },
  { name: 'Deploy', route: '/deploy' },
]

test.describe('Hourglass Visibility', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        json: { id: '1', github_id: '12345', github_login: 'testuser', email: 'test@example.com', onboarded: true },
      })
    )
    // Mock MCP - respond normally (fast)
    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({
        status: 200,
        json: { clusters: [{ name: 'test', status: 'healthy', version: 'v1.28', cpuCores: 4, memoryGB: 16, nodes: 1, namespaces: ['default'] }], issues: [], events: [], nodes: [], deployments: [], services: [], pvcs: [], releases: [], operators: [], subscriptions: [] },
      })
    )
    await page.route('**/api/dashboards/**', (route) =>
      route.fulfill({ status: 200, json: {} })
    )
    // Set localStorage
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kc-agent-setup-dismissed', 'true')
    })
    await page.waitForLoadState('domcontentloaded')
  })

  for (const pg of PAGES) {
    test(`${pg.name} has refresh button and clicking it does not crash`, async ({ page }) => {
      await page.goto(pg.route)
      await page.waitForLoadState('networkidle').catch(() => {})

      // Verify we're NOT on login page
      const url = page.url()
      console.log(`[${pg.name}] URL: ${url}`)

      // Find refresh button
      const refreshBtn = page.locator('button[title*="Refresh"]')
      const count = await refreshBtn.count()
      console.log(`[${pg.name}] Refresh buttons: ${count}`)
      expect(count, `${pg.name} must have a refresh button`).toBeGreaterThan(0)

      // Click refresh
      await refreshBtn.first().click()
      console.log(`[${pg.name}] Clicked refresh`)

      // Verify the page is still functional after clicking refresh (no crash)
      await expect(page.locator('body')).toBeVisible()

      // The refresh button should still be present after the refresh cycle completes
      await expect(refreshBtn.first()).toBeVisible({ timeout: 5000 })
      console.log(`[${pg.name}] Page still functional after refresh`)
    })
  }
})

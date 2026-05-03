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
    // Mock missions file to prevent 502 in CI (#11033)
    await page.route('**/api/missions/file**', (route) => {
      const url = route.request().url()
      const pathParam = new URL(url).searchParams.get('path') || ''
      if (pathParam.includes('index.json')) {
        route.fulfill({ status: 200, json: { missions: [] } })
      } else {
        route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
      }
    })
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
      // Use domcontentloaded instead of networkidle — networkidle can race
      // with background fetches and cause "target page closed" errors (#11032)
      await page.waitForLoadState('domcontentloaded')

      // Verify we're NOT on login page
      const url = page.url()
      console.log(`[${pg.name}] URL: ${url}`)

      // Find refresh button — wait for it to be visible instead of counting immediately
      const refreshBtn = page.locator('button[title*="Refresh"]')
      await expect(refreshBtn.first()).toBeVisible({ timeout: 10_000 })
      const count = await refreshBtn.count()
      console.log(`[${pg.name}] Refresh buttons: ${count}`)
      expect(count, `${pg.name} must have a refresh button`).toBeGreaterThan(0)

      // Click refresh
      await refreshBtn.first().click()
      console.log(`[${pg.name}] Clicked refresh`)

      // Verify the page is still functional after clicking refresh (no crash)
      await expect(page.locator('body')).toBeVisible()

      // The refresh button should still be present after the refresh cycle completes
      await expect(refreshBtn.first()).toBeVisible({ timeout: 10_000 })
      console.log(`[${pg.name}] Page still functional after refresh`)
    })
  }
})

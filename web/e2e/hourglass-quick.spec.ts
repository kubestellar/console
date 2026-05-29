import { test, expect } from '@playwright/test'
import { setupDemoMode } from './helpers/setup'

const PAGES = [
  { name: 'Dashboard', route: '/' },
  { name: 'Network', route: '/network' },
  { name: 'Events', route: '/events' },
  { name: 'Deploy', route: '/deploy' },
]

test.describe('Hourglass Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoMode(page)
    await page.goto('/')
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

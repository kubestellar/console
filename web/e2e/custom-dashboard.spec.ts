import { test, expect } from '@playwright/test'
import { setupDemoMode } from './helpers/setup'

/**
 * Sets up authentication and mocks for custom dashboard tests
 * Uses canonical setupDemoMode helper from helpers/setup.ts
 */
async function setupCustomDashboardTest(page) {
  // Use canonical setupDemoMode helper for consistent demo-mode setup
  // across all E2E tests. This handles:
  // - localStorage seeding (demo mode, auth token, onboarding state)
  // - /api/me mock with fallback behavior
  // - Catch-all /api/** mock to prevent hanging on unmocked requests
  // - Page navigation to /
  // - DOM readiness verification (WebKit/Firefox compatibility)
  await setupDemoMode(page)

  // Mock dashboards API (custom dashboard test-specific mock)
  await page.route('**/api/dashboards', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `dashboard-${Date.now()}`,
          name: 'New Dashboard',
          cards: [],
        }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    }
  })
}

test.describe('Custom Dashboard Creation', () => {
  test.beforeEach(async ({ page }) => {
    await setupCustomDashboardTest(page)
  })

  test.describe('Dashboard Display', () => {
    test('displays dashboard page', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('shows sidebar', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 5000 })
    })

    test('shows cards grid', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Sidebar Functionality', () => {
    test('sidebar has customize button', async ({ page }) => {
      await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 })
      // WebKit renders sidebar content slightly later than Chromium/Firefox —
      // the "Add more" button depends on navSections being mounted. #10200
      await expect(page.getByTestId('sidebar-customize')).toBeVisible({ timeout: 10000 })
    })

    test('customize button is clickable', async ({ page }) => {
      // WebKit renders sidebar content slower — use a longer timeout. #10200
      await expect(page.getByTestId('sidebar-customize')).toBeVisible({ timeout: 10000 })

      await page.getByTestId('sidebar-customize').click()

      // Should open customizer (modal or panel)
      // The exact UI may vary, but the button should be clickable
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })

      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Accessibility', () => {
    test('page is keyboard navigable', async ({ page }) => {
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })
  })
})

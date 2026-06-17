import { test, expect } from '@playwright/test'
import {
  setupDemoMode,
  setupDemoAndNavigate,
  waitForNetworkIdleBestEffort,
  NETWORK_IDLE_TIMEOUT_MS,
} from './helpers/setup'

/**
 * Smoke Tests
 *
 * Verifies that the most critical user flows work correctly:
 * - App loads and renders without crashing
 * - Navigation between key pages works
 * - Core UI elements are present and functional
 * - No console errors during normal usage
 *
 * These tests are designed to be fast and reliable — they catch
 * regressions that would prevent basic usage of the console.
 */
test.describe('Smoke Tests', () => {
  test.describe('App Loading', () => {
    test('app loads and renders without crashing', async ({ page }) => {
      await setupDemoMode(page)

      // Verify the app loaded successfully
      await expect(page).toHaveURL(/.*/, { timeout: 15000 })

      // App should have a body element (basic render check)
      await expect(page.locator('body')).toBeVisible()

      // Should not show a blank white page
      const bodyContent = await page.locator('body').textContent()
      expect(bodyContent?.trim().length).toBeGreaterThan(0)
    })

    test('main navigation elements are present', async ({ page }) => {
      await setupDemoMode(page)

      // Check for key UI elements that should be present on load
      // At least one of these should be visible
      const navElement = page
        .getByTestId('sidebar')
        .or(page.getByTestId('navbar'))
        .or(page.locator('nav'))
        .first()

      await expect(navElement).toBeVisible({ timeout: 15000 })
    })

    test('page title is set correctly', async ({ page }) => {
      await setupDemoMode(page)

      const title = await page.title()
      // Title should not be empty or just 'localhost'
      expect(title.length).toBeGreaterThan(0)
    })
  })

  test.describe('Core Navigation', () => {
    test('dashboard page loads', async ({ page }) => {
      await setupDemoAndNavigate(page, '/')

      // Should be on the dashboard or redirect to it
      await expect(page).toHaveURL(/\/$|\/dashboard$/, { timeout: 15000 })
    })

    test('can navigate to all key routes without 404', async ({ page }) => {
      const routes = [
        { path: '/', name: 'Dashboard' },
        { path: '/clusters', name: 'Clusters' },
        { path: '/settings', name: 'Settings' },
      ]

      for (const route of routes) {
        await setupDemoMode(page)
        await page.goto(route.path)
        await waitForNetworkIdleBestEffort(page)

        // Should not show a 404 or error page
        const bodyText = (await page.locator('body').textContent()) || ''
        expect(bodyText).not.toMatch(/404|not found|error/i)
      }
    })

    test('SPA routing works without full page reload', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await waitForNetworkIdleBestEffort(page)

      // Navigate to clusters via URL (SPA routing)
      await page.goto('/clusters')
      await waitForNetworkIdleBestEffort(page)

      const url = page.url()
      expect(url).toContain('/clusters')
    })

    test('all primary nav routes return expected paths', async ({ page }) => {
      const routes = [
        { href: '/', expectedPath: '/' },
        { href: '/clusters', expectedPath: '/clusters' },
        { href: '/settings', expectedPath: '/settings' },
      ]

      for (const route of routes) {
        await setupDemoMode(page)
        await page.goto(route.href)
        await waitForNetworkIdleBestEffort(page)

        const url = new URL(page.url())
        expect(url.pathname).toContain(expectedPath)
      }
    })
  })

  test.describe('Navigation Consistency', () => {
    test('sidebar navigation works', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await waitForNetworkIdleBestEffort(page)

      // Check sidebar is visible
      const sidebar = page.getByTestId('sidebar')
      if (await sidebar.isVisible()) {
        // Click through sidebar items
        const sidebarItems = await page.locator('[data-testid="sidebar"] a').all()
        expect(sidebarItems.length).toBeGreaterThan(0)
      }
    })

    test('clicking navbar logo navigates to home from non-home route', async ({ page }) => {
      await setupDemoMode(page)

      // Navigate to a non-home route
      await page.goto('/settings')
      
      // Firefox-specific: Wait for /settings route before asserting page content.
      // In Firefox, there's a race where ProtectedRoute hasn't finished auth init yet,
      // causing a redirect to home. Using waitForURL() ensures the route is fully loaded
      // before we assert on page content. (#18304, #18396)
      await page.waitForURL('**/settings', { timeout: 10000 })
      await expect(page.locator('h1:has-text("Settings")')).toBeVisible({ timeout: 10000 })

      // Click the logo button (has aria-label "Go to home dashboard").
      // The navbar renders two such buttons — the logo and the wordmark —
      // so use .first() to avoid a strict-mode violation. #9877
      const logoButton = page.locator('nav button[aria-label*="home"]').first()
      await expect(logoButton).toBeVisible()
      await logoButton.click()

      // Wait for navigation and verify we're at home
      await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'logo click')
      expect(page.url()).toMatch(/\/$|\/dashboard$/)
    })
  })

  test.describe('Key User Interactions', () => {
    test('add card modal opens and closes', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/dashboard')
      await waitForNetworkIdleBestEffort(page)

      // Try to find add card button
      const addButton = page.getByTestId('add-card-button')
        .or(page.locator('button:has-text("Add Card")'))
        .or(page.locator('button:has-text("Add")'))
        .first()

      if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addButton.click()
        await waitForNetworkIdleBestEffort(page)

        // Modal or panel should open
        const modal = page.getByRole('dialog')
          .or(page.locator('[data-testid*="modal"]'))
          .or(page.locator('[data-testid*="panel"]'))
          .first()

        if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Try to close it
          const closeButton = page.locator('button[aria-label*="close" i], button[aria-label*="cancel" i]').first()
          if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await closeButton.click()
          } else {
            await page.keyboard.press('Escape')
          }
        }
      }
      // Test passes if no errors thrown
    })

    test('settings page interactions work', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/settings')
      await waitForNetworkIdleBestEffort(page)

      // Settings page should load without errors
      const bodyContent = await page.locator('body').textContent()
      expect(bodyContent?.length).toBeGreaterThan(0)
    })
  })

  test.describe('Error Handling', () => {
    test('no unhandled JavaScript errors on dashboard load', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      await setupDemoMode(page)
      await page.goto('/')
      await waitForNetworkIdleBestEffort(page)

      // Filter out known non-critical errors
      const criticalErrors = errors.filter((e) => {
        const lower = e.toLowerCase()
        return !lower.includes('resize observer') && !lower.includes('non-error promise rejection')
      })

      expect(criticalErrors).toHaveLength(0)
    })

    test('404 route shows appropriate fallback', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/this-route-definitely-does-not-exist-12345')
      await waitForNetworkIdleBestEffort(page)

      // Should either redirect to home or show a 404 page, not crash
      const bodyContent = await page.locator('body').textContent()
      expect(bodyContent?.trim().length).toBeGreaterThan(0)
    })
  })
})

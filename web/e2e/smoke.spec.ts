import { test, expect } from '@playwright/test'
import {
  setupErrorCollector,
  setupDemoMode,
  waitForNetworkIdleBestEffort,
  NETWORK_IDLE_TIMEOUT_MS,
  MODAL_TIMEOUT_MS,
} from './helpers/setup'

/** Mobile viewport used by the mobile-specific smoke tests. */
const MOBILE_VIEWPORT = { width: 393, height: 852 } as const

/** Minimum body length we consider "real content" (catches blank pages). */
const MIN_BODY_TEXT_LEN = 50
/** Minimum body length after a full dashboard render. */
const MIN_DASHBOARD_TEXT_LEN = 100
/** Short timeout for optional UI probes (theme toggle, demo badge, etc.). */
const OPTIONAL_PROBE_TIMEOUT_MS = 3_000

/**
 * Smoke Tests for KubeStellar Console
 *
 * These tests validate that critical routes load without console errors,
 * navigation is consistent, and key user interactions work correctly.
 *
 * Run with: npx playwright test e2e/smoke.spec.ts
 *
 * Note: `setupDemoMode` is imported from `./helpers/setup` — it uses
 * `page.addInitScript` + mocks `/api/me` so smoke tests are self-contained
 * and do not depend on the Go backend being reachable (see #9075, #9081).
 */

test.describe('Smoke Tests', () => {
  test.describe('Route Loading', () => {
    const routes = [
      { path: '/', name: 'Home/Dashboard' },
      { path: '/dashboard', name: 'Dashboard' },
      { path: '/clusters', name: 'Clusters' },
      { path: '/deploy', name: 'Deploy' },
      { path: '/settings', name: 'Settings' },
      { path: '/security', name: 'Security' },
      { path: '/namespaces', name: 'Namespaces' },
    ]

    for (const { path, name } of routes) {
      test(`${name} page (${path}) loads without console errors`, async ({ page }) => {
        await setupDemoMode(page)
        const { errors } = setupErrorCollector(page)

        await page.goto(path)
        await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, `route ${path}`)

        await expect(page.locator('body')).toBeVisible()

        if (errors.length > 0) {
          console.log(`Console errors on ${path}:`, errors)
        }
        expect(errors, `Unexpected console errors on ${path}`).toHaveLength(0)
      })
    }
  })

  test.describe('Navigation Consistency', () => {
    test('navbar links navigate correctly', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await waitForNetworkIdleBestEffort(page)

      const navLinks = [
        { text: 'Clusters', expectedPath: '/clusters' },
        { text: 'Deploy', expectedPath: '/deploy' },
        { text: 'Settings', expectedPath: '/settings' },
      ]

      // Scope to the sidebar (data-testid="sidebar") because the main <nav>
      // navbar does not contain these route links — they live in the sidebar.
      // Using a bare `nav` locator matched multiple <nav> elements (navbar +
      // sidebar section navs) and violated strict mode. #9877
      const sidebar = page.getByTestId('sidebar')

      // On mobile viewports (<md) the sidebar is rendered off-canvas and must
      // be opened via the hamburger button before its links are clickable.
      // #9877
      const hamburger = page
        .locator('[data-testid="mobile-menu-toggle"]')
        .or(page.locator('button[aria-label*="menu" i]'))
        .first()
      const viewportSize = page.viewportSize()
      const MOBILE_SIDEBAR_MAX_WIDTH_PX = 768
      const HAMBURGER_PROBE_TIMEOUT_MS = 2_000
      if (viewportSize && viewportSize.width < MOBILE_SIDEBAR_MAX_WIDTH_PX) {
        const hamburgerVisible = await hamburger
          .isVisible({ timeout: HAMBURGER_PROBE_TIMEOUT_MS })
          .catch(() => false)
        if (hamburgerVisible) {
          await hamburger.click()
        }
      }

      for (const { text, expectedPath } of navLinks) {
        // Use `.first()` to guard against duplicate renderings (e.g., when a
        // responsive variant renders both a mobile and desktop label).
        await sidebar.getByText(text, { exact: true }).first().click()
        await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, `nav to ${expectedPath}`)
        expect(page.url()).toContain(expectedPath)
        // Re-open mobile sidebar if navigation closed it.
        if (viewportSize && viewportSize.width < MOBILE_SIDEBAR_MAX_WIDTH_PX) {
          const stillVisible = await sidebar
            .getByText(text, { exact: true })
            .first()
            .isVisible({ timeout: HAMBURGER_PROBE_TIMEOUT_MS })
            .catch(() => false)
          if (!stillVisible) {
            const hamburgerVisible = await hamburger
              .isVisible({ timeout: HAMBURGER_PROBE_TIMEOUT_MS })
              .catch(() => false)
            if (hamburgerVisible) {
              await hamburger.click()
            }
          }
        }
      }
    })

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
      await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, '/settings')
      expect(page.url()).toContain('/settings')

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
        .or(page.locator('[aria-label*="add"]'))

      if (await addButton.first().isVisible({ timeout: MODAL_TIMEOUT_MS })) {
        await addButton.first().click()

        // Verify modal opened
        const modal = page.locator('[role="dialog"]')
        await expect(modal).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

        // Close with Escape
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({ timeout: MODAL_TIMEOUT_MS })
      }
    })

    test('settings page interactions work', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/settings')
      await waitForNetworkIdleBestEffort(page)

      // Check for theme toggle
      const themeToggle = page.getByTestId('theme-toggle')
        .or(page.locator('button:has-text("Theme")'))
        .or(page.locator('[aria-label*="theme"]'))

      if (await themeToggle.first().isVisible({ timeout: OPTIONAL_PROBE_TIMEOUT_MS })) {
        const htmlBefore = await page.locator('html').getAttribute('class')
        await themeToggle.first().click()

        await expect
          .poll(async () => page.locator('html').getAttribute('class'))
          .not.toBe(htmlBefore)
      }
    })
  })

  test.describe('Error Handling', () => {
    test('404 page shows error message', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/this-page-does-not-exist-12345')
      await waitForNetworkIdleBestEffort(page)

      // Should show some error indication, not blank page
      const pageContent = await page.textContent('body')
      expect(pageContent?.length).toBeGreaterThan(MIN_BODY_TEXT_LEN)
    })

    test('page handles missing data gracefully', async ({ page }) => {
      await setupDemoMode(page)
      const { errors } = setupErrorCollector(page)

      // Visit a data-heavy page
      await page.goto('/clusters')
      await waitForNetworkIdleBestEffort(page)

      // Should not crash, should show loading or empty state
      const pageContent = await page.textContent('body')
      expect(pageContent?.length).toBeGreaterThan(MIN_BODY_TEXT_LEN)
      expect(errors).toHaveLength(0)
    })
  })

  test.describe('Mobile Viewport', () => {
    test('dashboard loads without error on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT)
      await setupDemoMode(page)
      const { errors } = setupErrorCollector(page)

      await page.goto('/')
      await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'mobile /')

      // Check no error boundary rendered (React #185 crash)
      const errorBoundary = page.locator('text=This page encountered an error')
      await expect(errorBoundary).not.toBeVisible({ timeout: MODAL_TIMEOUT_MS })

      // Page should have real content, not just an error
      await expect(page.locator('body')).toBeVisible()
      const bodyText = await page.textContent('body')
      expect(bodyText?.length).toBeGreaterThan(MIN_DASHBOARD_TEXT_LEN)

      if (errors.length > 0) {
        console.log('Mobile console errors:', errors)
      }
      expect(errors, 'Unexpected console errors on mobile dashboard').toHaveLength(0)
    })

    test('clusters page loads without error on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT)
      await setupDemoMode(page)

      await page.goto('/clusters')
      await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'mobile /clusters')

      const errorBoundary = page.locator('text=This page encountered an error')
      await expect(errorBoundary).not.toBeVisible({ timeout: MODAL_TIMEOUT_MS })
    })
  })

  test.describe('Demo Mode', () => {
    test('demo mode indicator is visible', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await waitForNetworkIdleBestEffort(page)

      // Check for demo mode badge/indicator. The AgentStatusIndicator also
      // renders a "Demo Mode" <span> that is hidden on <sm viewports (mobile)
      // via `hidden sm:inline`; filter to visible matches so the first hit
      // isn't a hidden element. #9877
      const demoIndicator = page.locator(':visible').filter({
        hasText: /demo/i,
      })

      // Assert the demo indicator is visible — a missing indicator is a regression. #9524
      await expect(demoIndicator.first()).toBeVisible({ timeout: OPTIONAL_PROBE_TIMEOUT_MS })
    })
  })
})

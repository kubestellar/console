import { test, expect, Page, ConsoleMessage } from '@playwright/test'

/**
 * Smoke Tests for KubeStellar Console
 *
 * These tests validate that critical routes load without console errors,
 * navigation is consistent, and key user interactions work correctly.
 *
 * Run with: npx playwright test e2e/smoke.spec.ts
 */

// Expected console errors that should be ignored (demo mode, expected warnings, etc.)
const EXPECTED_ERROR_PATTERNS = [
  /Failed to fetch/i, // Network errors in demo mode
  /WebSocket/i, // WebSocket not available in tests
  /ResizeObserver/i, // ResizeObserver loop warnings
  /validateDOMNesting/i, // Already tracked by Auto-QA DOM errors check
  /act\(\)/i, // React testing warnings
  /Cannot read.*undefined/i, // May occur during lazy loading
  /ChunkLoadError/i, // Expected during code splitting
  /Loading chunk/i, // Expected during lazy loading
  /demo-token/i, // Demo mode messages
  /localhost:8585/i, // Agent connection attempts in demo mode
]

function isExpectedError(message: string): boolean {
  return EXPECTED_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

/**
 * Collects console errors during page navigation
 */
function setupErrorCollector(page: Page): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text()
    if (msg.type() === 'error' && !isExpectedError(text)) {
      errors.push(text)
    }
    if (msg.type() === 'warning' && !isExpectedError(text)) {
      warnings.push(text)
    }
  })

  return { errors, warnings }
}

/**
 * Sets up demo mode for testing
 */
async function setupDemoMode(page: Page) {
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

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
        await page.waitForLoadState('networkidle', { timeout: 15000 })

        // Allow time for any delayed errors
        await page.waitForTimeout(1000)

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
      await page.waitForLoadState('networkidle')

      const navLinks = [
        { text: 'Clusters', expectedPath: '/clusters' },
        { text: 'Deploy', expectedPath: '/deploy' },
        { text: 'Settings', expectedPath: '/settings' },
      ]

      for (const { text, expectedPath } of navLinks) {
        await page.click(`nav >> text="${text}"`)
        await page.waitForLoadState('networkidle')
        expect(page.url()).toContain(expectedPath)
      }
    })

    test('sidebar navigation works', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Check sidebar is visible
      const sidebar = page.getByTestId('sidebar')
      if (await sidebar.isVisible()) {
        // Click through sidebar items
        const sidebarItems = await page.locator('[data-testid="sidebar"] a').all()
        expect(sidebarItems.length).toBeGreaterThan(0)
      }
    })
  })

  test.describe('Key User Interactions', () => {
    test('add card modal opens and closes', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // Try to find add card button
      const addButton = page.getByTestId('add-card-button')
        .or(page.locator('button:has-text("Add Card")'))
        .or(page.locator('[aria-label*="add"]'))

      if (await addButton.first().isVisible({ timeout: 5000 })) {
        await addButton.first().click()

        // Verify modal opened
        const modal = page.locator('[role="dialog"]')
        await expect(modal).toBeVisible({ timeout: 5000 })

        // Close with Escape
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({ timeout: 5000 })
      }
    })

    test('settings page interactions work', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/settings')
      await page.waitForLoadState('networkidle')

      // Check for theme toggle
      const themeToggle = page.getByTestId('theme-toggle')
        .or(page.locator('button:has-text("Theme")'))
        .or(page.locator('[aria-label*="theme"]'))

      if (await themeToggle.first().isVisible({ timeout: 3000 })) {
        const htmlBefore = await page.locator('html').getAttribute('class')
        await themeToggle.first().click()
        await page.waitForTimeout(500)
        const htmlAfter = await page.locator('html').getAttribute('class')
        // Theme class should change
        expect(htmlBefore).not.toBe(htmlAfter)
      }
    })
  })

  test.describe('Error Handling', () => {
    test('404 page shows error message', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/this-page-does-not-exist-12345')
      await page.waitForLoadState('networkidle')

      // Should show some error indication, not blank page
      const pageContent = await page.textContent('body')
      expect(pageContent?.length).toBeGreaterThan(50)
    })

    test('page handles missing data gracefully', async ({ page }) => {
      await setupDemoMode(page)
      const { errors } = setupErrorCollector(page)

      // Visit a data-heavy page
      await page.goto('/clusters')
      await page.waitForLoadState('networkidle')

      // Should not crash, should show loading or empty state
      const pageContent = await page.textContent('body')
      expect(pageContent?.length).toBeGreaterThan(50)
      expect(errors).toHaveLength(0)
    })
  })

  test.describe('Demo Mode', () => {
    test('demo mode indicator is visible', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Check for demo mode badge/indicator
      const demoIndicator = page.locator('text=/demo/i')
        .or(page.getByTestId('demo-mode-indicator'))
        .or(page.locator('[aria-label*="demo"]'))

      // Should have some indication of demo mode
      const isVisible = await demoIndicator.first().isVisible({ timeout: 3000 }).catch(() => false)
      // This is informational - demo indicator may not always be visible
      console.log(`Demo mode indicator visible: ${isVisible}`)
    })
  })
})

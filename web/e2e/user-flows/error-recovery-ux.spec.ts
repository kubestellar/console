import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
} from '../helpers/setup'
import { collectConsoleErrors } from '../helpers/ux-assertions'

/**
 * Error recovery UX tests.
 *
 * Validates graceful handling of invalid routes, console errors in
 * demo mode, and page navigability after expected failures.
 */

/** Maximum wait for redirect or fallback content after navigating to a bad route */
const NOT_FOUND_TIMEOUT_MS = 10_000

test.describe('Error Recovery', () => {
  test('valid route shows no error boundary', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')

    const errorBoundary = page.getByText(/something went wrong|application error|unhandled error/i)
    await expect(errorBoundary).not.toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    const body = page.locator('body')
    await expect(body).toBeVisible()
  })

  test('/nonexistent route shows 404 content instead of a blank page', async ({ page }) => {
    await setupDemoAndNavigate(page, '/nonexistent-route-abc123')

    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible({
      timeout: NOT_FOUND_TIMEOUT_MS,
    })

    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Page should not be blank on unknown route').toBeGreaterThan(0)
    await expect(page.getByText(/doesn.t exist yet|404/i)).toBeVisible()
  })

  test('console errors in demo mode are expected (filtered)', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)

    await setupDemoAndNavigate(page, '/')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
    await expect(page.locator('[data-card-type]').first()).toBeVisible({
      timeout: NETWORK_IDLE_TIMEOUT_MS,
    })

    // Should have zero unexpected console errors
    checkErrors()
  })

  test('page remains navigable after expected errors', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')

    // Navigate to a sub-route
    const sidebarLink = page.locator('nav a, [data-testid*="sidebar"] a').first()
    const hasLink = await sidebarLink.isVisible().catch(() => false)
    if (!hasLink) {
      test.skip()
      return
    }

    await sidebarLink.click()
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Page should not show an error boundary
    const errorBoundary = page.getByText(/something went wrong|application error|unhandled error/i)
    await expect(errorBoundary).not.toBeVisible()

    // Body must have content
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Page body should not be empty after navigation').toBeGreaterThan(0)
  })

  test('refresh button on dashboard works', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')

    const refreshBtn = page.getByTestId('dashboard-refresh-button')
      .or(page.getByRole('button', { name: /refresh|reload/i }))

    const hasRefresh = await refreshBtn.first().isVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS }).catch(() => false)
    if (!hasRefresh) { test.skip(true, 'No refresh button found on dashboard'); return }

    await refreshBtn.first().click()

    // Page should not crash after refresh
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
    const errorBoundary = page.getByText(/something went wrong|application error/i)
    await expect(errorBoundary).not.toBeVisible()
  })

  test('browser back/forward navigation does not break the app', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')

    // Navigate to settings
    await page.goto('/settings')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Go back
    await page.goBack()
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    const errorBoundary = page.getByText(/something went wrong|application error/i)
    await expect(errorBoundary).not.toBeVisible()

    // Go forward
    await page.goForward()
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    await expect(errorBoundary).not.toBeVisible()
  })
})

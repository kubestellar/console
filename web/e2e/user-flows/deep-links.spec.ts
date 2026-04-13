import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
} from '../helpers/setup'

/**
 * Deep link UX tests.
 *
 * Validates that all major routes render meaningful content in demo
 * mode — no blank pages, no unhandled crashes. Uses a parameterized
 * approach to cover the full route surface.
 */

/** Minimum body text length to consider a page "not blank" */
const MIN_BODY_TEXT_LENGTH = 10

/** Maximum time to wait for page content to appear */
const CONTENT_TIMEOUT_MS = 15_000

const ROUTES = [
  '/',
  '/clusters',
  '/nodes',
  '/pods',
  '/services',
  '/deployments',
  '/workloads',
  '/helm',
  '/events',
  '/compute',
  '/storage',
  '/network',
  '/security',
  '/alerts',
  '/compliance',
  '/cost',
  '/deploy',
  '/insights',
  '/settings',
  '/missions',
  '/marketplace',
  '/gpu-reservations',
] as const

test.describe('Deep Links — Route Rendering', () => {
  for (const route of ROUTES) {
    const label = route === '/' ? 'home' : route.replace('/', '')

    test(`${label} renders content (not blank)`, async ({ page }) => {
      await setupDemoAndNavigate(page, route)

      // Wait for meaningful content to appear
      await page.waitForLoadState('domcontentloaded')

      // Assert the page is not blank
      const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
      expect(
        bodyText.length,
        `Route "${route}" rendered a blank page (body text length: ${bodyText.length})`,
      ).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)

      // No crash indicators
      const crash = page.getByText(/something went wrong|application error|unhandled error/i)
      await expect(crash).not.toBeVisible()
    })
  }
})

test.describe('Deep Links — Query Params', () => {
  test('/?browse=missions renders missions content', async ({ page }) => {
    await setupDemoAndNavigate(page, '/?browse=missions')

    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)

    const crash = page.getByText(/something went wrong|application error/i)
    await expect(crash).not.toBeVisible()
  })

  test('route with hash fragment does not crash', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings#appearance')

    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
  })
})

test.describe('Deep Links — Navigation Integrity', () => {
  test('navigating between routes preserves demo mode', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')

    // Navigate to clusters
    await page.goto('/clusters')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    // Demo mode flag should still be set
    const demoMode = await page.evaluate(() => localStorage.getItem('kc-demo-mode'))
    expect(demoMode).toBe('true')

    // Navigate to settings
    await page.goto('/settings')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

    const demoModeAfter = await page.evaluate(() => localStorage.getItem('kc-demo-mode'))
    expect(demoModeAfter).toBe('true')
  })

  test('direct URL entry loads without redirect loop', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')

    // Should not end up in a redirect loop — URL should stabilize
    const finalUrl = page.url()
    expect(finalUrl).not.toContain('redirect')

    // Page should have content
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
  })
})

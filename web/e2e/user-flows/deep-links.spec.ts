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

/** Dashboard and feature routes */
const DASHBOARD_ROUTES = [
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
  '/ai-agents',
  '/ci-cd',
  '/logs',
  '/namespaces',
  '/history',
] as const

/** Landing / marketing pages (lightweight shell, no auth) */
const LANDING_ROUTES = [
  '/welcome',
  '/from-lens',
  '/from-headlamp',
  '/from-holmesgpt',
  '/feature-inspektorgadget',
  '/feature-kagent',
  '/white-label',
] as const

/** Mission deep links — specific missions that should render a
 *  MissionLandingPage with the mission title and steps */
const MISSION_DEEP_LINKS = [
  '/missions/install-prometheus',
  '/missions/install-falco',
  '/missions/install-submariner',
  '/missions/install-drasi',
  '/missions/install-cert-manager',
  '/missions/install-istio',
  '/missions/install-opencost',
  '/missions/install-open-cluster-management',
] as const

const ALL_ROUTES = [...DASHBOARD_ROUTES, ...LANDING_ROUTES] as const

test.describe('Deep Links — Dashboard Routes', () => {
  for (const route of DASHBOARD_ROUTES) {
    const label = route === '/' ? 'home' : route.replace('/', '')

    test(`${label} renders content (not blank)`, async ({ page }) => {
      await setupDemoAndNavigate(page, route)
      await page.waitForLoadState('domcontentloaded')

      const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
      expect(
        bodyText.length,
        `Route "${route}" rendered a blank page (body text length: ${bodyText.length})`,
      ).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)

      const crash = page.getByText(/something went wrong|application error|unhandled error/i)
      await expect(crash).not.toBeVisible()
    })
  }
})

test.describe('Deep Links — Landing Pages', () => {
  for (const route of LANDING_ROUTES) {
    const label = route.replace('/', '')

    test(`${label} renders content (not blank)`, async ({ page }) => {
      // Landing pages use LightweightShell — navigate directly, no demo setup needed
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')

      const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
      expect(
        bodyText.length,
        `Landing page "${route}" rendered a blank page`,
      ).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)

      const crash = page.getByText(/something went wrong|application error|unhandled error/i)
      await expect(crash).not.toBeVisible()
    })
  }
})

test.describe('Deep Links — Mission Deep Links', () => {
  for (const route of MISSION_DEEP_LINKS) {
    const missionName = route.replace('/missions/', '')

    test(`mission "${missionName}" renders landing page`, async ({ page }) => {
      // Mission landing pages are standalone (LightweightShell) — no demo setup
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')

      const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
      expect(
        bodyText.length,
        `Mission "${missionName}" rendered a blank page`,
      ).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)

      const crash = page.getByText(/something went wrong|application error|unhandled error/i)
      await expect(crash).not.toBeVisible()
    })
  }
})

test.describe('Deep Links — Query Params & Special Routes', () => {
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

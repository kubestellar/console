import { test, expect, type Page } from '@playwright/test'
import {
  setupDemoAndNavigate,
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

test.describe.configure({ mode: 'serial' })

async function expectRenderedContent(page: Page, label: string): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  await expect.poll(
    () => page.evaluate(() => (document.body.textContent || '').trim().length),
    {
      timeout: CONTENT_TIMEOUT_MS,
      message: `${label} rendered a blank page`,
    },
  ).toBeGreaterThan(MIN_BODY_TEXT_LENGTH)

  const crash = page.getByText(/something went wrong|application error|unhandled error/i)
  await expect(crash).not.toBeVisible()
}

test.describe('Deep Links — Dashboard Routes', () => {
  for (const route of DASHBOARD_ROUTES) {
    const label = route === '/' ? 'home' : route.replace('/', '')

    test(`${label} renders content (not blank)`, async ({ page }) => {
      await setupDemoAndNavigate(page, route)
      await expectRenderedContent(page, `Route "${route}"`)
    })
  }
})

test.describe('Deep Links — Landing Pages', () => {
  for (const route of LANDING_ROUTES) {
    const label = route.replace('/', '')

    test(`${label} renders content (not blank)`, async ({ page }) => {
      await setupDemoAndNavigate(page, route)
      await expectRenderedContent(page, `Landing page "${route}"`)
    })
  }
})

test.describe('Deep Links — Mission Deep Links', () => {
  for (const route of MISSION_DEEP_LINKS) {
    const missionName = route.replace('/missions/', '')

    test(`mission "${missionName}" renders landing page`, async ({ page }) => {
      await setupDemoAndNavigate(page, route)
      await expectRenderedContent(page, `Mission "${missionName}"`)
    })
  }
})

test.describe('Deep Links — Query Params & Special Routes', () => {
  test('/?browse=missions renders missions content', async ({ page }) => {
    await setupDemoAndNavigate(page, '/?browse=missions')
    await expectRenderedContent(page, '/?browse=missions')
  })

  test('route with hash fragment does not crash', async ({ page }) => {
    await setupDemoAndNavigate(page, '/settings#appearance')
    await expectRenderedContent(page, '/settings#appearance')
  })
})

test.describe('Deep Links — Navigation Integrity', () => {
  test('navigating between routes preserves demo mode', async ({ page }) => {
    await setupDemoAndNavigate(page, '/')

    // Navigate to clusters
    await page.goto('/clusters')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch((error) => { console.error(\'Promise catch:\', error) })

    // Demo mode flag should still be set
    const demoMode = await page.evaluate(() => localStorage.getItem('kc-demo-mode'))
    expect(demoMode).toBe('true')

    // Navigate to settings
    await page.goto('/settings')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch((error) => { console.error(\'Promise catch:\', error) })

    const demoModeAfter = await page.evaluate(() => localStorage.getItem('kc-demo-mode'))
    expect(demoModeAfter).toBe('true')
  })

  test('direct URL entry loads without redirect loop', async ({ page }) => {
    await setupDemoAndNavigate(page, '/missions')

    // Should not end up in a redirect loop — URL should stabilize
    const finalUrl = page.url()
    expect(finalUrl).not.toContain('redirect')

    // Page should have content
    await expectRenderedContent(page, '/missions')
  })
})

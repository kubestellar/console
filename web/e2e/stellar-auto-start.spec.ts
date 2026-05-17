import { test, expect } from '@playwright/test'
import {
  setupDemoMode,
  waitForNetworkIdleBestEffort,
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
} from './helpers/setup'

/**
 * Stellar Auto-Start E2E Tests — kubestellar/console#14310
 *
 * Verifies that Stellar automatically initiates its API requests and SSE
 * connection when the console loads, without requiring any user interaction.
 *
 * The StellarProvider (hooks/useStellar.tsx) mounts with the authenticated
 * app shell and immediately polls for auth credentials then calls refreshState()
 * (hitting /api/stellar/state, /api/stellar/notifications, etc.) and opens
 * an SSE connection to /api/stellar/stream.
 *
 * Run with:
 *   npx playwright test e2e/stellar-auto-start.spec.ts
 */

/** How long to wait for stellar API calls to arrive after page load. */
const STELLAR_API_TIMEOUT_MS = 15_000

/** How long to wait for a UI element that reflects stellar state. */
const STELLAR_UI_TIMEOUT_MS = 10_000

test.describe('Stellar auto-start on console load', () => {
  test('stellar state API is called automatically on page load', async ({ page }) => {
    // Track whether /api/stellar/state was requested without user interaction.
    let stellarStateCalled = false

    await setupDemoMode(page)

    // Intercept the stellar state endpoint BEFORE navigation so we capture
    // the call that fires immediately after StellarProvider mounts.
    await page.route('**/api/stellar/state', (route) => {
      stellarStateCalled = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          clustersWatching: [],
          eventCounts: { critical: 0, warning: 0, info: 0 },
          recentEvents: [],
          unreadAlerts: 0,
          activeMissionIds: [],
          pendingActionIds: [],
        }),
      })
    })

    await page.goto('/')
    await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'stellar auto-start')

    // Give Stellar time to initialize (it polls for auth token first)
    await page.waitForFunction(() => window.__stellarStateCalled === true, { timeout: STELLAR_API_TIMEOUT_MS }).catch(() => {
      // page.waitForFunction is a secondary check — the route intercept is
      // the primary assertion below.
    })

    expect(stellarStateCalled, 'Expected /api/stellar/state to be called automatically on page load').toBe(true)
  })

  test('stellar notifications API is called automatically on page load', async ({ page }) => {
    let stellarNotificationsCalled = false

    await setupDemoMode(page)

    await page.route('**/api/stellar/notifications*', (route) => {
      stellarNotificationsCalled = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      })
    })

    await page.goto('/')
    await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'stellar notifications auto-start')

    expect(stellarNotificationsCalled, 'Expected /api/stellar/notifications to be called automatically on page load').toBe(true)
  })

  test('stellar initiates multiple API calls on page load without user interaction', async ({ page }) => {
    const calledEndpoints = new Set<string>()

    await setupDemoMode(page)

    // Intercept the full set of endpoints that refreshState() calls in parallel.
    const stellarEndpoints = [
      { pattern: '**/api/stellar/state', key: 'state', body: JSON.stringify({ generatedAt: new Date().toISOString(), clustersWatching: [], eventCounts: { critical: 0, warning: 0, info: 0 }, recentEvents: [], unreadAlerts: 0, activeMissionIds: [], pendingActionIds: [] }) },
      { pattern: '**/api/stellar/notifications*', key: 'notifications', body: JSON.stringify({ items: [] }) },
      { pattern: '**/api/stellar/actions*', key: 'actions', body: JSON.stringify({ items: [] }) },
      { pattern: '**/api/stellar/tasks*', key: 'tasks', body: JSON.stringify({ items: [] }) },
      { pattern: '**/api/stellar/watches*', key: 'watches', body: JSON.stringify({ items: [] }) },
      { pattern: '**/api/stellar/solves*', key: 'solves', body: JSON.stringify({ items: [] }) },
      { pattern: '**/api/stellar/activity*', key: 'activity', body: JSON.stringify({ items: [] }) },
    ]

    for (const ep of stellarEndpoints) {
      await page.route(ep.pattern, (route) => {
        calledEndpoints.add(ep.key)
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: ep.body,
        })
      })
    }

    await page.goto('/')
    await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'stellar multi-endpoint auto-start')

    // All refreshState() calls should fire automatically.
    const requiredEndpoints = ['state', 'notifications', 'actions', 'tasks', 'watches']
    for (const key of requiredEndpoints) {
      expect(calledEndpoints.has(key), `Expected /api/stellar/${key} to be called automatically on page load`).toBe(true)
    }
  })

  test('stellar SSE stream is opened automatically on page load', async ({ page }) => {
    let stellarStreamOpened = false

    await setupDemoMode(page)

    // Capture the SSE stream request — connectSSE() opens this after refreshState().
    await page.route('**/api/stellar/stream*', (route) => {
      stellarStreamOpened = true
      // Return a minimal SSE response so the EventSource does not error.
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body: ': ping\n\n',
      })
    })

    await page.goto('/')
    await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'stellar SSE auto-start')

    expect(stellarStreamOpened, 'Expected /api/stellar/stream SSE connection to be opened automatically on page load').toBe(true)
  })

  test('stellar status indicator is visible in the sidebar on page load', async ({ page }) => {
    await setupDemoMode(page)

    // Stub all stellar endpoints so the StellarProvider initializes cleanly.
    await page.route('**/api/stellar/state', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          clustersWatching: [],
          eventCounts: { critical: 0, warning: 0, info: 0 },
          recentEvents: [],
          unreadAlerts: 0,
          activeMissionIds: [],
          pendingActionIds: [],
        }),
      })
    )
    await page.route('**/api/stellar/notifications*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
    )
    await page.route('**/api/stellar/actions*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
    )
    await page.route('**/api/stellar/tasks*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
    )
    await page.route('**/api/stellar/watches*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
    )
    await page.route('**/api/stellar/solves*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
    )
    await page.route('**/api/stellar/activity*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
    )
    await page.route('**/api/stellar/stream*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: ': ping\n\n',
      })
    )

    await page.goto('/')
    await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'stellar UI auto-start')

    // The StellarSidebar renders a status dot with title "Stellar connected" or
    // "Stellar disconnected" — either proves the component mounted automatically.
    const stellarStatusDot = page.locator('[title^="Stellar"]')
    await expect(stellarStatusDot.first()).toBeVisible({ timeout: STELLAR_UI_TIMEOUT_MS })
  })

  test('stellar API calls fire before any user interaction', async ({ page }) => {
    const callLog: Array<{ url: string; timestamp: number }> = []
    const pageLoadTime = { value: 0 }

    await setupDemoMode(page)

    await page.route('**/api/stellar/**', (route) => {
      callLog.push({ url: route.request().url(), timestamp: Date.now() })
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], generatedAt: new Date().toISOString(), clustersWatching: [], eventCounts: { critical: 0, warning: 0, info: 0 }, recentEvents: [], unreadAlerts: 0, activeMissionIds: [], pendingActionIds: [] }),
      })
    })

    const response = await page.goto('/')
    pageLoadTime.value = Date.now()

    // Record the actual response timestamp (page.goto() returns once navigation completes)
    expect(response?.ok() ?? response?.status() === 200).toBeTruthy()

    await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS, 'stellar no-interaction check')

    // Stellar calls must exist — they fired automatically without any clicks or keypresses.
    expect(callLog.length, 'Expected stellar API calls to fire automatically without user interaction').toBeGreaterThan(0)

    // Verify that at least one call was to the state endpoint
    const stateCall = callLog.find(entry => entry.url.includes('/api/stellar/state'))
    expect(stateCall, 'Expected /api/stellar/state to be called automatically').toBeDefined()
  })
})

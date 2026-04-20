import { test as base, expect } from '@playwright/test'

/**
 * Custom fixtures for KubeStellar Console (kc) E2E tests
 *
 * Provides common setup, utilities, and page objects for testing.
 */

// Extend the test with custom fixtures
export const test = base.extend<{
  // Login state management
  authenticatedPage: ReturnType<typeof base.extend>

  // AI mode utilities
  aiMode: {
    setLow: () => Promise<void>
    setMedium: () => Promise<void>
    setHigh: () => Promise<void>
  }

  // API mocking helpers
  mockAPI: {
    mockClusters: (clusters: unknown[]) => Promise<void>
    mockPodIssues: (issues: unknown[]) => Promise<void>
    mockEvents: (events: unknown[]) => Promise<void>
    mockGPUNodes: (nodes: unknown[]) => Promise<void>
    mockLocalAgent: () => Promise<void>
    /**
     * Unroute every handler registered through this fixture. Useful when a
     * test wants to start from a clean slate after a beforeEach() set up
     * defaults. Per-test cleanup also runs automatically when the fixture
     * tears down.
     */
    unrouteAll: () => Promise<void>
  }
}>({
  // AI mode fixture
  aiMode: async ({ page }, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture, not a React hook
    await use({
      setLow: async () => {
        await page.evaluate(() => {
          localStorage.setItem('kubestellar-ai-mode', 'low')
        })
      },
      setMedium: async () => {
        await page.evaluate(() => {
          localStorage.setItem('kubestellar-ai-mode', 'medium')
        })
      },
      setHigh: async () => {
        await page.evaluate(() => {
          localStorage.setItem('kubestellar-ai-mode', 'high')
        })
      },
    })
  },

  // API mocking fixture
  //
  // #9085 — Playwright stacks `page.route()` handlers and matches them in
  // registration order. If a `beforeEach` registers `mockClusters([A])` and
  // the test body registers `mockClusters([B])`, the first handler wins and
  // the test sees A. To make the fixture do the obvious thing — "the most
  // recent call wins" — every helper here records the URL pattern + handler
  // in `routePatterns`, then unroutes any prior handlers for the same URL
  // before registering a new one. The fixture also unroutes everything it
  // registered when the test tears down, so handlers cannot leak across
  // tests that share state (e.g. via `test.describe.configure({ mode: 'serial' })`).
  mockAPI: async ({ page }, use) => {
    // Map of URL pattern -> list of handlers we registered for that pattern.
    // We track handlers (not just URLs) because Playwright's page.unroute(url)
    // requires the same handler reference if it was registered with one;
    // calling page.unroute(url) without a handler removes ALL handlers for
    // that URL, which is exactly the override semantics we want here.
    const routePatterns = new Map<string, Array<(route: unknown) => unknown>>()

    /**
     * Register a route handler, unrouting any prior handlers we registered
     * for the same URL pattern so the most recent call wins.
     */
    const setRoute = async (
      urlPattern: string,
      handler: Parameters<typeof page.route>[1]
    ): Promise<void> => {
      // Drop any previously registered handlers for this pattern so the new
      // one wins. We pass no handler ref to unroute() — that removes ALL
      // handlers for the URL, including any registered via raw page.route()
      // earlier in the same test. Callers that want to preserve external
      // handlers should call mockAPI helpers BEFORE registering raw routes.
      const prior = routePatterns.get(urlPattern)
      if (prior && prior.length > 0) {
        await page.unroute(urlPattern)
      }
      await page.route(urlPattern, handler)
      routePatterns.set(urlPattern, [handler as (route: unknown) => unknown])
    }

    /** URL patterns used by the fixture. Centralized so unrouteAll() and
     * setRoute() agree on the exact strings. */
    const URL_CLUSTERS = '**/api/mcp/clusters'
    const URL_POD_ISSUES = '**/api/mcp/pod-issues'
    const URL_EVENTS = '**/api/mcp/events**'
    const URL_GPU_NODES = '**/api/mcp/gpu-nodes'
    const URL_LOCAL_AGENT = '**/127.0.0.1:8585/**'

    /** HTTP status returned by every mock in this fixture. */
    const MOCK_STATUS_OK = 200

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture, not a React hook
    await use({
      mockClusters: async (clusters) => {
        await setRoute(URL_CLUSTERS, (route) =>
          route.fulfill({
            status: MOCK_STATUS_OK,
            json: { clusters },
          })
        )
      },
      mockPodIssues: async (issues) => {
        await setRoute(URL_POD_ISSUES, (route) =>
          route.fulfill({
            status: MOCK_STATUS_OK,
            json: { issues },
          })
        )
      },
      mockEvents: async (events) => {
        await setRoute(URL_EVENTS, (route) =>
          route.fulfill({
            status: MOCK_STATUS_OK,
            json: { events },
          })
        )
      },
      mockGPUNodes: async (nodes) => {
        await setRoute(URL_GPU_NODES, (route) =>
          route.fulfill({
            status: MOCK_STATUS_OK,
            json: { nodes },
          })
        )
      },
      mockLocalAgent: async () => {
        // Mock local agent endpoints (used by drilldown components)
        await setRoute(URL_LOCAL_AGENT, (route) =>
          route.fulfill({
            status: MOCK_STATUS_OK,
            json: { events: [], clusters: [], health: { hasClaude: false, hasBob: false } },
          })
        )
      },
      unrouteAll: async () => {
        for (const pattern of routePatterns.keys()) {
          // Tolerate races where the page is already closing — unroute can
          // throw if the target context is gone, and we don't want fixture
          // teardown to mask the real test failure.
          try {
            await page.unroute(pattern)
          } catch {
            // page already closed or context torn down — nothing to clean up
          }
        }
        routePatterns.clear()
      },
    })

    // Teardown: drop every handler we registered so they cannot leak into
    // the next test if Playwright reuses the page (serial mode, manual
    // page reuse, etc.). Each test normally gets a fresh page so this is
    // belt-and-suspenders, but the cost is one unroute() per pattern.
    for (const pattern of routePatterns.keys()) {
      try {
        await page.unroute(pattern)
      } catch {
        // page already closed — nothing to do
      }
    }
    routePatterns.clear()
  },
})

// Export expect for convenience
export { expect }

// Common test data
export const testData = {
  clusters: {
    healthy: [
      { name: 'cluster-1', context: 'ctx-1', healthy: true, nodeCount: 5, podCount: 45 },
      { name: 'cluster-2', context: 'ctx-2', healthy: true, nodeCount: 3, podCount: 32 },
    ],
    withUnhealthy: [
      { name: 'healthy-cluster', context: 'ctx-1', healthy: true, nodeCount: 5, podCount: 45 },
      { name: 'unhealthy-cluster', context: 'ctx-2', healthy: false, nodeCount: 3, podCount: 12 },
    ],
    empty: [],
  },

  podIssues: {
    none: [],
    few: [
      { name: 'pod-1', namespace: 'default', status: 'CrashLoopBackOff', issues: ['Error'], restarts: 5 },
      { name: 'pod-2', namespace: 'kube-system', status: 'Pending', issues: ['Unschedulable'], restarts: 0 },
    ],
    many: Array(15).fill(null).map((_, i) => ({
      name: `pod-${i}`,
      namespace: 'production',
      status: 'CrashLoopBackOff',
      issues: ['Container restarting'],
      restarts: i * 2,
    })),
  },

  events: {
    normal: [
      { type: 'Normal', reason: 'Scheduled', message: 'Pod scheduled', object: 'Pod/test', namespace: 'default', count: 1 },
    ],
    warnings: [
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting', object: 'Pod/test', namespace: 'default', count: 5 },
      { type: 'Warning', reason: 'FailedScheduling', message: 'Insufficient memory', object: 'Pod/test2', namespace: 'default', count: 3 },
    ],
    mixed: [
      { type: 'Normal', reason: 'Scheduled', message: 'Pod scheduled', object: 'Pod/test', namespace: 'default', count: 1 },
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting', object: 'Pod/error', namespace: 'default', count: 5 },
    ],
    empty: [],
  },

  gpuNodes: {
    available: [
      { name: 'gpu-1', cluster: 'ml', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4 },
      { name: 'gpu-2', cluster: 'ml', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 2 },
    ],
    fullyAllocated: [
      { name: 'gpu-1', cluster: 'ml', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8 },
      { name: 'gpu-2', cluster: 'ml', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8 },
    ],
    none: [],
  },

  securityIssues: {
    none: [],
    critical: [
      { name: 'pod-1', namespace: 'prod', issue: 'Privileged container', severity: 'high' },
      { name: 'pod-2', namespace: 'prod', issue: 'Running as root', severity: 'high' },
    ],
  },
}

// Helper functions

/** Timeout for login to complete (ms). */
const LOGIN_TIMEOUT_MS = 15_000

/**
 * URL regex that matches a SUCCESSFUL post-login landing page.
 *
 * #9084 — The previous regex `/\/$|\/onboarding/` had a subtle bug: `\/$`
 * matches any URL ending in `/`, including `/login/` itself. If the dev
 * login button was missing OR the login flow redirected back to the login
 * page, the helper reported success even though auth had clearly failed.
 *
 * The new regex:
 *   - Matches the exact bare-root `/` (e.g. `http://host/`) — the dashboard
 *   - Matches `/dashboard` and `/onboarding` with optional trailing `/`
 *   - Explicitly REJECTS any URL containing `/login`
 */
const LOGIN_SUCCESS_URL = (url: URL): boolean => {
  if (/\/login(\/|$)/i.test(url.pathname)) return false
  return url.pathname === '/' || /^\/(dashboard|onboarding)\/?$/i.test(url.pathname)
}

export async function login(page: ReturnType<typeof base.extend>['page']) {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  const devLoginButton = page.getByRole('button', { name: /dev.*login|continue.*demo/i }).first()
  const hasDevLogin = await devLoginButton.isVisible().catch(() => false)

  if (!hasDevLogin) {
    throw new Error(
      'login(): dev-login button is not present on /login. Cannot proceed with login. ' +
      'If this test does not need a real auth flow, call setupDemoMode() from helpers/setup.ts instead.'
    )
  }

  await devLoginButton.click()

  // Accept any non-/login URL as success. Reject explicit /login URLs so
  // we don't report success when the app redirected back to the login page.
  await page.waitForURL(LOGIN_SUCCESS_URL, { timeout: LOGIN_TIMEOUT_MS })
}

export async function waitForDashboard(page: ReturnType<typeof base.extend>['page']) {
  await page.waitForURL('/', { timeout: 10000 })
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })
}

export async function openCardMenu(page: ReturnType<typeof base.extend>['page'], cardIndex = 0) {
  const cardMenu = page.locator('[data-testid*="card-menu"]').nth(cardIndex)
  await cardMenu.click()
}

export async function closeModal(page: ReturnType<typeof base.extend>['page']) {
  const closeButton = page.locator('button[aria-label*="close"], [data-testid="close-modal"]').first()
  const hasClose = await closeButton.isVisible().catch(() => false)

  if (hasClose) {
    await closeButton.click()
  } else {
    await page.keyboard.press('Escape')
  }
}

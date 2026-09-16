import { type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Mock user returned from /api/me in demo/test mode
// See #9075 — smoke tests must mock /api/me so AuthProvider does not try
// to contact a real backend (which is not running in frontend-only CI).
// ---------------------------------------------------------------------------

export const MOCK_DEMO_USER = {
  id: '1',
  github_id: '99999',
  github_login: 'demo-user',
  email: 'demo@kubestellar.io',
  onboarded: true,
  role: 'admin',
} as const

const LOCAL_AGENT_HTTP_PATTERNS = [
  'http://127.0.0.1:8585/**',
  'http://localhost:8585/**',
  'https://127.0.0.1:8585/**',
  'https://localhost:8585/**',
] as const
const LOCAL_AGENT_WS_PATTERNS = [
  'ws://127.0.0.1:8585/**',
  'ws://localhost:8585/**',
  'wss://127.0.0.1:8585/**',
  'wss://localhost:8585/**',
] as const
const LOCAL_AGENT_UNAVAILABLE_STATUS = 503
const LOCAL_AGENT_UNAVAILABLE_MESSAGE = 'agent not running'

// ---------------------------------------------------------------------------
// Demo mode setup — sets localStorage flags + mocks /api/me so tests are
// self-contained and do NOT depend on the Go backend being reachable.
//
// Uses `page.addInitScript` so localStorage is set BEFORE any app code runs
// (including the AuthProvider's first /api/me call). This is the canonical
// demo-mode setup — all tests should import it from here rather than define
// their own copy (see #9075, #9081).
// ---------------------------------------------------------------------------

/**
 * Install a mock for `/api/me` that returns a demo user. Safe to call
 * multiple times — Playwright will overwrite the handler. Tests that need
 * to simulate an unauthenticated state should NOT call this helper.
 */
export async function mockApiMe(page: Page) {
  await page.route('**/api/**', (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname !== '/api/me') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DEMO_USER),
    })
  })
}

export async function mockLocalAgentUnavailable(page: Page) {
  for (const pattern of LOCAL_AGENT_HTTP_PATTERNS) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: LOCAL_AGENT_UNAVAILABLE_STATUS,
        contentType: 'application/json',
        body: JSON.stringify({ error: LOCAL_AGENT_UNAVAILABLE_MESSAGE }),
      })
    )
  }

  for (const pattern of LOCAL_AGENT_WS_PATTERNS) {
    await page.routeWebSocket(pattern, (ws) => {
      ws.onMessage((data) => {
        try {
          const message = JSON.parse(String(data)) as { id?: string | number }
          if (typeof message.id !== 'undefined') {
            ws.send(JSON.stringify({
              id: message.id,
              type: 'error',
              payload: { error: LOCAL_AGENT_UNAVAILABLE_MESSAGE },
            }))
          }
        } catch (error) { console.error('Error:', error)
          // Ignore malformed test traffic.
         }
      })
    })
  }
}

/**
 * Catch-all mock for /api/** requests and the root /health endpoint.
 * Returns empty JSON 200 for API calls, and a minimal health payload for
 * /health — omitting `enabled_dashboards` so all sidebar routes remain visible.
 *
 * Without mocking /health, useSidebarConfig.fetchEnabledDashboards() can
 * receive an enabled_dashboards list from the CI Go backend that filters out
 * sidebar routes like /deploy, breaking navigation-dependent tests.
 *
 * Register BEFORE specific mocks (Playwright matches in reverse order).
 */
export async function mockApiFallback(page: Page) {
  // Mock the root /health endpoint. Omitting enabled_dashboards means all
  // dashboards are shown (applyDashboardFilter only filters when the array
  // is present and non-empty). Only matches the root-level path.
  await page.route('**/health', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/health') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: 'dev',
        oauth_configured: false,
        in_cluster: false,
        no_local_agent: true,
        install_method: 'dev',
      }),
    })
  })

  // IMPORTANT: Playwright matches routes in REVERSE registration order (last registered = first matched).
  // Register the catch-all FIRST (lowest priority) so the active-users specific mock below
  // overrides it. Previously the catch-all was registered last and intercepted /api/active-users
  // before the specific mock, returning {} → Number.isFinite(undefined)=false → error/retry
  // re-render cycles in Firefox/webkit causing DOM instability.
  //
  // STRICT MOCKING: Log unmocked API calls to help detect missing endpoints (#11225)
  await page.route('**/api/**', (route) => {
    const url = route.request().url()
    console.error(`[mockApiFallback] Unmocked API call: ${url}`)
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })

  // Registered AFTER the catch-all → higher priority. Keep SSE responses on
  // text/event-stream so EventSource connections do not abort in demo mode.
  await page.route('**/api/stellar/stream*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: ': keep-alive\n\n',
    })
  )

  // Registered AFTER the catch-all → higher priority. Trailing * matches query params too.
  // Returns valid data so useActiveUsers stays stable (no error state / re-renders).
  await page.route('**/api/active-users*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ activeUsers: 1, totalConnections: 1 }),
    })
  )

  // /api/dashboards expects an array — the catch-all returns {} which is
  // truthy but not an array, causing (data || []).filter crashes (#10818).
  await page.route('**/api/dashboards*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )

  // Explicit mocks for endpoints that MSW marks as passthrough (#11660).
  // Without these, requests reach vite preview (which returns 404) or the Go
  // backend (which may return 503 when external services are unreachable).
  // Registered AFTER the catch-all so they take priority.
  await page.route('**/api/youtube/playlist*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    })
  )
  await page.route('**/api/youtube/thumbnail/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: '' })
  )
  await page.route('**/api/medium/blog*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    })
  )
  await page.route('**/api/missions/browse*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )
  await page.route('**/api/missions/scores*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ topScores: [], userScore: null }),
    })
  )
  await page.route('**/api/missions/file*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  )
  await page.route('**/api/rewards/github*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ topContributors: [], recentActivity: [] }),
    })
  )
  await page.route('**/api/rewards/badge/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '' })
  )
  await page.route('**/api/issue-stats*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ open: 0, closed: 0, totalComments: 0 }),
    })
  )
  await page.route('**/api/github-pipelines*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ workflows: [] }),
    })
  )
  await page.route('**/api/nightly-e2e/runs*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )
  await page.route('**/api/public/nightly-e2e/runs*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )
  await page.route('**/api/nps*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  )
  await page.route('**/api/feedback-app*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  )
  await page.route('**/api/analytics-dashboard*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  )
  await page.route('**/api/acmm/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  )
  // Analytics collection endpoints — return 204 No Content
  await page.route('**/api/gtag*', (route) =>
    route.fulfill({ status: 204, body: '' })
  )
  await page.route('**/api/m*', (route) => {
    // Only intercept the analytics /api/m endpoint, not other /api/m* routes
    const url = new URL(route.request().url())
    if (url.pathname === '/api/m') {
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fallback()
  })
  await page.route('**/api/send*', (route) =>
    route.fulfill({ status: 204, body: '' })
  )
  await page.route('**/api/ksc*', (route) =>
    route.fulfill({ status: 204, body: '' })
  )

  // #11896 — Explicitly mock API endpoints that were falling through to real
  // backends. These are probed by various hooks on app startup and must return
  // deterministic responses for test isolation.
  await page.route('**/api/kagent/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ running: false, version: null }),
    })
  )
  await page.route('**/api/kagenti-provider/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, reason: 'not configured in demo mode' }),
    })
  )
  await page.route('**/api/kubara/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        repo: 'kubara-io/kubara',
        path: 'go-binary/templates/embedded/managed-service-catalog/helm',
      }),
    })
  )
  await page.route('**/api/github/repos/kubestellar/console/git/ref/heads/main', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ref: 'refs/heads/main',
        object: {
          sha: 'abc123def456789abc123def456789abc123def4',
          type: 'commit',
          url: 'https://api.github.com/repos/kubestellar/console/git/commits/abc123def456789abc123def456789abc123def4',
        },
      }),
    })
  )
  await page.route('**/api/github/repos/kubestellar/console/compare/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ commits: [] }),
    })
  )
  await page.route('**/api/github/token/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasToken: false, source: 'none' }),
    })
  )
  await page.route('**/api/self-upgrade/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, reason: 'not configured in demo mode' }),
    })
  )
  await page.route('**/api/feedback/queue', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], count: 0 }),
    })
  )
  await page.route('**/api/rewards/bonus', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, rewards: [] }),
    })
  )
  await page.route('**/api/agent/auto-update/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false, lastCheck: null }),
    })
  )

  // Mock the local kc-agent HTTP endpoint. Even in demo mode, the cluster
  // cache probes http://127.0.0.1:8585/clusters before falling back to demo
  // data. Without this mock the probe hangs in CI (nobody on port 8585),
  // keeping isLoading=true and blocking page render.
  //
  // Return 503 (not 200 with empty data) so fetchClusterListFromAgent()
  // returns null and fullFetchClusters() falls through to the demo-data
  // fallback path. A 200 with { clusters: [] } is truthy and short-circuits
  // the demo fallback, leaving stats/sublabels empty (#compute-deep failures).
  await page.route('http://127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Service unavailable (test mock)' }),
    })
  )

  // Mock external console.kubestellar.io API requests (#11520). Hooks like
  // useGitHubRewards and useMediumBlog fetch from https://console.kubestellar.io
  // which is a different origin — not caught by the same-origin **/api/** pattern.
  // In CI (vite preview on localhost:4173), these requests escape route mocking
  // and hit the real server, which may return 503, generating console errors.
  await page.route('https://console.kubestellar.io/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  )
}

/**
 * Strict variant of mockApiFallback for suites that must detect missing endpoint mocks.
 *
 * #11295 — The permissive mockApiFallback returns HTTP 200/{} for any unmocked
 * /api/** endpoint. This silently passes tests when components receive {} instead
 * of the expected array/object shape, masking missing mocks.
 *
 * mockApiFallbackStrict returns HTTP 404 for unmocked endpoints instead.
 * Components that handle errors gracefully will show error state (correct behaviour
 * in test); components that don't guard against error responses will surface
 * crashes — which is the intent.
 *
 * Use for: smoke.spec.ts, fullstack-smoke.spec.ts, route-coverage.spec.ts,
 * console-error-scan tests. These suites benefit from strict mock coverage.
 *
 * Keep using mockApiFallback for: visual regression, perf, and tests that
 * intentionally exercise degraded states.
 *
 * Register BEFORE specific mocks (Playwright matches in reverse order).
 */
export async function mockApiFallbackStrict(page: Page) {
  // Register /health, active-users, dashboards, and kc-agent mocks identically
  // to mockApiFallback so the app shell loads correctly.
  await page.route('**/health', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/health') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: 'dev',
        oauth_configured: false,
        in_cluster: false,
        no_local_agent: true,
        install_method: 'dev',
      }),
    })
  })

  // Catch-all: return 404 for unmocked endpoints. 404 is a real HTTP error
  // that components should handle — it surfaces missing mocks as test failures
  // rather than silent empty-state renders.
  await page.route('**/api/**', (route) => {
    const url = route.request().url()
    console.error(`[mockApiFallbackStrict] Unmocked API call (returning 404): ${url}`)
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `No mock registered for ${url}` }),
    })
  })

  await page.route('**/api/active-users*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ activeUsers: 1, totalConnections: 1 }),
    })
  )

  await page.route('**/api/dashboards*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )

  await page.route('**/api/stellar/stream*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: ': keep-alive\n\n',
    })
  )

  await page.route('http://127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Service unavailable (test mock)' }),
    })
  )
}

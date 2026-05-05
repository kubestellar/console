import { type Page, type ConsoleMessage, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Timeout constants — named values for all numeric literals
// ---------------------------------------------------------------------------

/** Maximum wait for page to reach networkidle state */
export const NETWORK_IDLE_TIMEOUT_MS = 15_000

/** Maximum wait for a single element to become visible */
export const ELEMENT_VISIBLE_TIMEOUT_MS = 10_000

/** Maximum wait for page initial load (domcontentloaded + first paint) */
export const PAGE_LOAD_TIMEOUT_MS = 10_000

/** Timeout for modal/dialog appearance */
export const MODAL_TIMEOUT_MS = 5_000

/** Timeout for navigation to complete */
export const NAV_TIMEOUT_MS = 15_000

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

// ---------------------------------------------------------------------------
// Expected console errors — shared across all test files
// ---------------------------------------------------------------------------

// Expected console error patterns. Each entry should be as NARROW as possible
// so we don't accidentally suppress a real production crash (see #9083).
// If you need to add a broad suppression, tie it to a tracking issue with a
// comment linking the issue number — so the suppression can be removed once
// the root cause is fixed.
export const EXPECTED_ERROR_PATTERNS = [
  /Failed to fetch/i, // Network errors in demo mode
  /WebSocket/i, // WebSocket not available in tests
  /can[\u2018\u2019']t establish a connection/i, // Firefox WebSocket connection errors (Firefox uses curly apostrophes)
  /ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i, // Benign ResizeObserver loop warning
  /validateDOMNesting/i, // Already tracked by Auto-QA DOM errors check
  /act\(\)/i, // React testing warnings
  /ChunkLoadError/i, // Expected during code splitting
  /Loading chunk \d+ failed/i, // Code-split chunk load failure (retried automatically)
  /demo-token/i, // Demo mode messages
  /localhost:8585/i, // Agent connection attempts in demo mode
  /127\.0\.0\.1:8585/i, // Agent connection attempts (IP form)
  /Cross-Origin Request Blocked/i, // CORS errors when backend/agent not running
  /blocked by CORS policy/i, // Chromium CORS wording (Firefox uses pattern above)
  /Access to fetch.*has been blocked by CORS/i, // Chromium-specific phrasing; Medium blog public fallback is cross-origin from vite preview (localhost:4173 → console.kubestellar.io)
  /Origin .* is not allowed by Access-Control-Allow-Origin/i, // WebKit/Safari CORS wording (distinct from Chromium/Firefox patterns above)
  /Access-Control-Allow-Origin.*localhost/i, // WebKit CORS variant referencing localhost origin
  /Access-Control-Allow-Origin.*127\.0\.0\.1/i, // WebKit CORS variant referencing loopback IP
  /Notification permission/i, // Firefox blocks notification requests outside user gestures
  /Notification prompting can only be done from a user gesture/i, // WebKit/Safari wording for notification gesture block
  /ERR_CONNECTION_REFUSED/i, // Backend/agent not running in CI
  /net::ERR_CONNECTION_REFUSED.*(:8585|:8080|localhost)/i, // Agent/backend ports only in demo mode (#11294)
  /Could not connect to [0-9.]+/i, // WebKit wording for connection refused (no net:: prefix)
  /Connection refused.*(:8585|:8080|127\.0\.0\.1|localhost)/i, // Backend/agent connection only (#11294)
  /502.*Bad Gateway/i, // Reverse proxy errors when backend not running
  /Failed to load resource.*(:8585|:8080|:4173|\/api\/)/i, // Backend/preview API resource failures (#11294, #11660)
  /the server responded with a status of [45]\d{2}/i, // 4xx/5xx status errors in demo/CI mode (#11520, #11660)
  /console\.kubestellar\.io/i, // External origin fetch failures when hosted site is unavailable from CI (#11520)
  // SQLite WASM cache worker — webkit/Safari can't streaming-compile the
  // sqlite3 wasm, and the worker has a documented IndexedDB fallback path
  // (see lib/cache/worker.ts). These errors emit from the sqlite-wasm loader
  // before our catch block runs, so they must be filtered here. Scoped to
  // the SQLite module specifically (#9083) so unrelated IndexedDB/WASM
  // failures are NOT suppressed.
  /wasm streaming compile failed.*sqlite/i,
  /failed to asynchronously prepare wasm.*sqlite/i,
  /Aborted\(NetworkError.*sqlite/i,
  /Exception loading sqlite3 module/i,
  /\[kc\.cache\] sqlite/i,
  // Firefox aborts in-flight requests when page.goto() is called again before
  // previous navigation settles. These NS_BINDING_ABORTED errors do not
  // indicate a real page failure — they're test harness cleanup noise.
  /NS_BINDING_ABORTED/i,
  /NS_ERROR_FAILURE/i,
  /Fetch failed: Invalid JSON response/i,
  /\[Cache\] Failed to/i, // Cache persistence errors in CI (no OPFS/IndexedDB support) (#11660)
  /\[IndexedData\] Failed to/i, // IndexedDB fallback errors in CI (#11660)
  /\[CacheWorkerRpc\] Worker error/i, // Cache worker failures in CI (#11660)
  /\[mockApiFallback\]/i, // Test mock logging that leaks to browser console (#11660)
  /Error fetching from cluster/i, // Cluster fetch errors when backend is unavailable (#11660)
]

function isExpectedError(message: string): boolean {
  return EXPECTED_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

// ---------------------------------------------------------------------------
// Error collector — tracks unexpected console errors during test
// ---------------------------------------------------------------------------

export function setupErrorCollector(page: Page): { errors: string[]; warnings: string[] } {
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
 * Clean all persistent storage (IndexedDB + sessionStorage + localStorage caches).
 * Returns a promise that resolves when cleanup is complete. Must be called in
 * page.evaluate() or page.addInitScript() so it runs in the browser context.
 *
 * #12089 — sessionStorage.clear() is synchronous but indexedDB.deleteDatabase()
 * is async. On webkit/firefox, sessionStorage hydration can outrace the async
 * IndexedDB delete, causing stale data to reappear. This helper ensures both
 * are cleaned before proceeding.
 */
async function cleanPersistentStorage(): Promise<void> {
  sessionStorage.clear()
  localStorage.removeItem('kc-backend-status')
  const deletePromise = new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('kc_cache')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
  await deletePromise
}

/**
 * Install a mock for `/api/me` that returns a demo user. Safe to call
 * multiple times — Playwright will overwrite the handler. Tests that need
 * to simulate an unauthenticated state should NOT call this helper.
 */
export async function mockApiMe(page: Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DEMO_USER),
    })
  )
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
    // eslint-disable-next-line no-console
    console.error(`[mockApiFallback] Unmocked API call: ${url}`)
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })

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
  await page.route('**/api/kagent-provider/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, providers: [] }),
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
    // eslint-disable-next-line no-console
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

  await page.route('http://127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Service unavailable (test mock)' }),
    })
  )
}

export async function setupDemoMode(page: Page) {
  await mockApiFallback(page)
  // Seed localStorage before page scripts execute — prevents the app from
  // briefly rendering the /login screen before the demo flag is picked up.
  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
  })
  // Mock /api/me so AuthProvider has a deterministic user without a backend.
  await mockApiMe(page)
}

// ---------------------------------------------------------------------------
// Combined setup + navigate — demo mode then goto route
// ---------------------------------------------------------------------------

export async function setupDemoAndNavigate(page: Page, path: string) {
  await setupDemoMode(page)
  await page.goto(path)
  // `networkidle` is unreliable in a dashboard with WebSockets + SSE +
  // periodic polling (#9082). Log when it times out so we can diagnose
  // slow loads instead of silently swallowing the error.
  await waitForNetworkIdleBestEffort(page, NETWORK_IDLE_TIMEOUT_MS)
}

// ---------------------------------------------------------------------------
// Best-effort networkidle wait — logs a warning on timeout instead of
// silently swallowing the error. The dashboard has long-lived WebSocket/SSE
// connections so `networkidle` almost never settles; callers should prefer
// `domcontentloaded` + waiting on a specific UI element when possible.
// See #9082.
// ---------------------------------------------------------------------------

export async function waitForNetworkIdleBestEffort(
  page: Page,
  timeoutMs: number = NETWORK_IDLE_TIMEOUT_MS,
  label?: string
) {
  try {
    await page.waitForLoadState('networkidle', { timeout: timeoutMs })
  } catch {
    if (process.env.E2E_VERBOSE_WAITS) {
      // eslint-disable-next-line no-console -- Opt-in debug logging for tests
      console.warn(
        `[e2e] networkidle timed out after ${timeoutMs}ms${label ? ` (${label})` : ''} — page may have long-lived WebSocket/SSE connections`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Wait for sub-route page — DashboardPage routes use dashboard-header testid
// ---------------------------------------------------------------------------

export async function waitForSubRoute(page: Page) {
  await expect(page.getByTestId('dashboard-header')).toBeVisible({
    timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
  })
}

// ---------------------------------------------------------------------------
// Wait for main dashboard — the / route uses dashboard-page testid
// ---------------------------------------------------------------------------

export async function waitForDashboard(page: Page) {
  await expect(page.getByTestId('dashboard-page')).toBeVisible({
    timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
  })
}

// ---------------------------------------------------------------------------
// Shared auth / MCP / dashboard setup helpers (#9233)
//
// These consolidate the copy-pasted setupAuth / setupDashboardTest / setupMCP
// patterns that were duplicated across 10+ spec files. Each spec was defining
// a local copy with subtly different user shapes / localStorage keys, so the
// helpers below accept options that preserve the exact behavior of the
// original local helpers.
//
// There are two distinct flavors of "auth setup" in the codebase:
//   1. API-route mock: stub `/api/me` with a mock user (setupAuth)
//   2. localStorage init: seed token + demo flags via addInitScript
//      (setupAuthLocalStorage)
//
// Both are provided as separate helpers so callers pick the flavor that
// matches their test's expectations.
// ---------------------------------------------------------------------------

/** Default user shape returned from a mocked `/api/me` call */
export interface MockApiUser {
  id: string
  github_id: string
  github_login: string
  email: string
  onboarded: boolean
  role?: string
}

/** Default mock user for shared `setupAuth` (matches the legacy local copies) */
export const DEFAULT_AUTH_USER: MockApiUser = {
  id: '1',
  github_id: '12345',
  github_login: 'testuser',
  email: 'test@example.com',
  onboarded: true,
}

/**
 * Mock the `/api/me` endpoint so the AuthProvider sees a valid user without
 * contacting a real backend. Accepts an optional user override for specs
 * that need a specific github_login / role.
 *
 * This is the API-route-mock flavor of auth setup. If your test wants to
 * seed `localStorage` tokens + demo-mode flags, use `setupAuthLocalStorage`
 * instead (or both, depending on what the app under test expects).
 */
export async function setupAuth(page: Page, user?: Partial<MockApiUser>): Promise<void> {
  await mockApiFallback(page)
  const u: MockApiUser = { ...DEFAULT_AUTH_USER, ...(user || {}) }
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(u),
    })
  )
}

/** Options for seeding auth state via localStorage */
export interface AuthLocalStorageOptions {
  /** Token value (default: 'test-jwt-token') */
  token?: string
  /** Whether to seed `kc-demo-mode` and, if so, its value (default: not set) */
  demoMode?: boolean
  /** Seed `demo-user-onboarded=true` (default: false) */
  demoUserOnboarded?: boolean
  /** Seed `kc-onboarding-complete=true` (default: false) */
  onboardingComplete?: boolean
  /** Seed `kc-tour-complete=true` (default: false) */
  tourComplete?: boolean
  /** Seed `kc-setup-complete=true` (default: false) */
  setupComplete?: boolean
}

/**
 * Seed `localStorage` with an auth token + onboarding/demo flags BEFORE any
 * page script runs. This is the localStorage-init flavor of auth setup
 * (see also `setupAuth` for the API-route-mock flavor).
 *
 * Uses `page.addInitScript` so the values are present on first script
 * evaluation — avoiding a flash of the /login route on webkit/Safari where
 * the auth redirect can fire synchronously (#9096).
 */
export async function setupAuthLocalStorage(
  page: Page,
  options?: AuthLocalStorageOptions
): Promise<void> {
  const opts = {
    token: options?.token ?? 'test-jwt-token',
    demoMode: options?.demoMode,
    demoUserOnboarded: options?.demoUserOnboarded ?? false,
    onboardingComplete: options?.onboardingComplete ?? false,
    tourComplete: options?.tourComplete ?? false,
    setupComplete: options?.setupComplete ?? false,
  }
  await page.addInitScript((o: typeof opts) => {
    localStorage.setItem('token', o.token)
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
    if (o.demoMode !== undefined) {
      localStorage.setItem('kc-demo-mode', String(o.demoMode))
    }
    if (o.demoUserOnboarded) {
      localStorage.setItem('demo-user-onboarded', 'true')
    }
    if (o.onboardingComplete) {
      localStorage.setItem('kc-onboarding-complete', 'true')
    }
    if (o.tourComplete) {
      localStorage.setItem('kubestellar-console-tour-completed', 'true')
    }
    if (o.setupComplete) {
      localStorage.setItem('kc-setup-complete', 'true')
    }
  }, opts)
}

/** Default clusters returned from a mocked MCP `**\/api/mcp/**` call */
export const DEFAULT_MCP_CLUSTERS = [
  { name: 'cluster-1', healthy: true, nodeCount: 5, podCount: 45 },
  { name: 'cluster-2', healthy: true, nodeCount: 3, podCount: 32 },
]

/** Options for `setupMCP` — override cluster/issue/event/node payloads */
export interface SetupMCPOptions {
  clusters?: unknown[]
  issues?: unknown[]
  events?: unknown[]
  nodes?: unknown[]
}

/**
 * Mock the generic MCP endpoints (`**\/api/mcp/**`) with a default payload
 * shape that matches what the dashboard cards expect. Accepts optional
 * overrides for clusters / issues / events / nodes so specs can tailor the
 * response without re-implementing the route handler.
 */
export async function setupMCP(page: Page, options?: SetupMCPOptions): Promise<void> {
  const clusters = options?.clusters ?? DEFAULT_MCP_CLUSTERS
  const issues = options?.issues ?? []
  const events = options?.events ?? []
  const nodes = options?.nodes ?? []

  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clusters,
        issues,
        events,
        nodes,
      }),
    })
  )
}

/**
 * Combined dashboard test setup: auth mock + MCP mock + localStorage seed +
 * navigation to `/`. Replaces the local `setupDashboardTest` helper that
 * was defined in Dashboard.spec.ts (#9233).
 *
 * Behavior mirrors the original local implementation exactly — it seeds
 * localStorage BEFORE any page script runs (via addInitScript) so the auth
 * guard sees the token on first execution (#9096).
 */
export async function setupDashboardTest(page: Page): Promise<void> {
  await setupAuth(page)
  await setupMCP(page)
  // Mock /api/dashboards so the dashboard component doesn't wait for a
  // backend response before falling back to demo cards. Without this mock,
  // the unmocked request can time out on slower mobile-emulation runtimes,
  // causing card-rendering assertions to fail.
  await page.route('**/api/dashboards', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  )
  // Seed localStorage BEFORE any page script runs — page.evaluate() runs
  // after the page has already parsed and executed scripts, which is too
  // late for webkit/Safari where the auth redirect fires synchronously.
  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
  })
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  // Webkit mobile emulation (mobile-safari) is significantly slower to
  // stabilize the DOM after domcontentloaded — wait for the main layout
  // element to be visible so assertions in beforeEach don't time out
  // (#nightly-playwright).
  await page.locator('#root').waitFor({ state: 'visible', timeout: 15000 })
}

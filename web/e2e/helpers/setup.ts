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
  /can't establish a connection/i, // Firefox WebSocket connection errors
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
  /Notification permission/i, // Firefox blocks notification requests outside user gestures
  /ERR_CONNECTION_REFUSED/i, // Backend/agent not running in CI
  /net::ERR_/i, // Any network-level Chrome error in demo mode
  /502.*Bad Gateway/i, // Reverse proxy errors when backend not running
  /Failed to load resource/i, // Generic resource load failures in demo mode
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

export async function setupDemoMode(page: Page) {
  // Seed localStorage before page scripts execute — prevents the app from
  // briefly rendering the /login screen before the demo flag is picked up.
  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
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

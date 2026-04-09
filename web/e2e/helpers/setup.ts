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
// Expected console errors — shared across all test files
// ---------------------------------------------------------------------------

export const EXPECTED_ERROR_PATTERNS = [
  /Failed to fetch/i, // Network errors in demo mode
  /WebSocket/i, // WebSocket not available in tests
  /can't establish a connection/i, // Firefox WebSocket connection errors
  /ResizeObserver/i, // ResizeObserver loop warnings
  /validateDOMNesting/i, // Already tracked by Auto-QA DOM errors check
  /act\(\)/i, // React testing warnings
  /Cannot read.*undefined/i, // May occur during lazy loading
  /ChunkLoadError/i, // Expected during code splitting
  /Loading chunk/i, // Expected during lazy loading
  /demo-token/i, // Demo mode messages
  /localhost:8585/i, // Agent connection attempts in demo mode
  /127\.0\.0\.1:8585/i, // Agent connection attempts (IP form)
  /Cross-Origin Request Blocked/i, // CORS errors when backend/agent not running
  /Notification permission/i, // Firefox blocks notification requests outside user gestures
  /ERR_CONNECTION_REFUSED/i, // Backend/agent not running in CI
  /net::ERR_/i, // Any network-level Chrome error in demo mode
  /502.*Bad Gateway/i, // Reverse proxy errors when backend not running
  /Failed to load resource/i, // Generic resource load failures in demo mode
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
// Demo mode setup — sets localStorage flags for demo/test mode
// ---------------------------------------------------------------------------

export async function setupDemoMode(page: Page) {
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

// ---------------------------------------------------------------------------
// Combined setup + navigate — demo mode then goto route
// ---------------------------------------------------------------------------

export async function setupDemoAndNavigate(page: Page, path: string) {
  await setupDemoMode(page)
  await page.goto(path)
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
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

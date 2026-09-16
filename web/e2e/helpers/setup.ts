import { type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// setup.ts is now a re-export barrel. The helpers that used to live here were
// split into focused modules (see #23117) so no single file mixes unrelated
// concerns. All exports below are re-exported so existing spec imports keep
// working without changes.
// ---------------------------------------------------------------------------

export {
  EXPECTED_ERROR_PATTERNS,
  setupErrorCollector,
} from './error-collector'

export {
  MOCK_DEMO_USER,
  mockApiMe,
  mockLocalAgentUnavailable,
  mockApiFallback,
  mockApiFallbackStrict,
} from './demo-api-mocks'

export {
  type MockApiUser,
  DEFAULT_AUTH_USER,
  setupAuth,
  type AuthLocalStorageOptions,
  setupAuthLocalStorage,
} from './auth'

export {
  DEFAULT_MCP_CLUSTERS,
  type SetupMCPOptions,
  setupMCP,
} from './mcp-mocks'

export {
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  PAGE_LOAD_TIMEOUT_MS,
  MODAL_TIMEOUT_MS,
  NAV_TIMEOUT_MS,
  waitForAppContent,
  waitForNetworkIdleBestEffort,
  waitForSubRoute,
  waitForWorkloadsReady,
  waitForDashboard,
  reloadPageSafely,
} from './waits'

import { mockApiFallback, mockApiMe, mockLocalAgentUnavailable } from './demo-api-mocks'
import { setupAuth } from './auth'
import { setupMCP } from './mcp-mocks'
import { waitForWorkloadsReady } from './waits'

// ---------------------------------------------------------------------------
// Combined setup helpers that compose the modules above. These stay in
// setup.ts because they tie multiple concerns together and are the primary
// entry points most specs import.
// ---------------------------------------------------------------------------

export async function setupDemoMode(page: Page) {
  await mockApiFallback(page)
  // #17406 — Mock local agent as unavailable so usePersistedSettings cannot
  // restore settings from the agent and overwrite test-set localStorage values.
  await mockLocalAgentUnavailable(page)
  // Seed localStorage before page scripts execute — prevents the app from
  // briefly rendering the /login screen before the demo flag is picked up.
  // NOTE: The init script must be synchronous to guarantee all setItem calls
  // complete before page scripts execute. IndexedDB delete is fire-and-forget.
  await page.addInitScript(() => {
    // Only clear storage if demo mode is not already set up — prevents wiping
    // user settings (like toggle states) on internal navigation (#16177).
    if (!localStorage.getItem('kc-demo-mode')) {
      sessionStorage.clear()
      localStorage.clear()
      // Fire-and-forget IndexedDB delete — must not block localStorage seeding
      try {
        indexedDB.deleteDatabase('kc_cache')
      } catch (error) { console.error('Error:', error)
        // IndexedDB may not be available in all test contexts
       }
    }
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
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
  await page.goto(path, { waitUntil: 'domcontentloaded' })
}

export async function setupWorkloadsDemoPage(page: Page) {
  await setupDemoAndNavigate(page, '/workloads')
  await waitForWorkloadsReady(page)
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

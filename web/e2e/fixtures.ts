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
  mockAPI: async ({ page }, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture, not a React hook
    await use({
      mockClusters: async (clusters) => {
        await page.route('**/api/mcp/clusters', (route) =>
          route.fulfill({
            status: 200,
            json: { clusters },
          })
        )
      },
      mockPodIssues: async (issues) => {
        await page.route('**/api/mcp/pod-issues', (route) =>
          route.fulfill({
            status: 200,
            json: { issues },
          })
        )
      },
      mockEvents: async (events) => {
        await page.route('**/api/mcp/events**', (route) =>
          route.fulfill({
            status: 200,
            json: { events },
          })
        )
      },
      mockGPUNodes: async (nodes) => {
        await page.route('**/api/mcp/gpu-nodes', (route) =>
          route.fulfill({
            status: 200,
            json: { nodes },
          })
        )
      },
      mockLocalAgent: async () => {
        // Mock local agent endpoints (used by drilldown components)
        await page.route('**/127.0.0.1:8585/**', (route) =>
          route.fulfill({
            status: 200,
            json: { events: [], clusters: [], health: { hasClaude: false, hasBob: false } },
          })
        )
      },
    })
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

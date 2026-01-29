import { test as base, expect } from '@playwright/test'

/**
 * Custom fixtures for KubeStellar Console (ksc) E2E tests
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
export async function login(page: ReturnType<typeof base.extend>['page']) {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  const devLoginButton = page.getByRole('button', { name: /dev.*login|continue.*demo/i }).first()
  const hasDevLogin = await devLoginButton.isVisible().catch(() => false)

  if (hasDevLogin) {
    await devLoginButton.click()
  }

  await page.waitForURL(/\/$|\/onboarding/, { timeout: 15000 })
}

export async function waitForDashboard(page: ReturnType<typeof base.extend>['page']) {
  await page.waitForURL('/', { timeout: 10000 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)
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

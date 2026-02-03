import { Page, expect } from '@playwright/test'

/**
 * Test utilities for KubeStellar Console E2E tests
 *
 * These utilities provide:
 * - Proper authentication mocking (no flaky waits)
 * - Standard API mocking patterns
 * - Robust element waiting strategies
 */

// Mock user data
export const mockUser = {
  id: '1',
  github_id: '12345',
  github_login: 'testuser',
  email: 'test@example.com',
  onboarded: true,
}

// Standard mock cluster data
export const mockClusters = [
  {
    name: 'cluster-1',
    context: 'ctx-1',
    healthy: true,
    reachable: true,
    nodeCount: 5,
    podCount: 45,
    cpuCores: 20,
    memoryGB: 64,
  },
  {
    name: 'cluster-2',
    context: 'ctx-2',
    healthy: true,
    reachable: true,
    nodeCount: 3,
    podCount: 32,
    cpuCores: 12,
    memoryGB: 48,
  },
]

/**
 * Sets up standard authentication mocks for tests.
 * Call this BEFORE navigating to any page.
 */
export async function setupAuthMocks(page: Page) {
  // Mock the /api/me endpoint for authentication
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockUser),
    })
  )
}

/**
 * Sets up standard MCP API mocks for dashboard data.
 * Call this BEFORE navigating to any page.
 */
export async function setupMCPMocks(page: Page, options?: {
  clusters?: unknown[]
  events?: unknown[]
  issues?: unknown[]
  nodes?: unknown[]
}) {
  const clusters = options?.clusters ?? mockClusters
  const events = options?.events ?? []
  const issues = options?.issues ?? []
  const nodes = options?.nodes ?? []

  // Mock MCP endpoints with provided data
  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()

    if (url.includes('/clusters')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clusters }),
      })
    }
    if (url.includes('/events')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events }),
      })
    }
    if (url.includes('/pod-issues')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issues }),
      })
    }
    if (url.includes('/gpu-nodes')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ nodes }),
      })
    }

    // Default response for other MCP endpoints
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })
}

/**
 * Authenticates and navigates to a page with all necessary mocks.
 * This is the recommended way to set up tests.
 */
export async function authenticateAndNavigate(page: Page, path: string, options?: {
  clusters?: unknown[]
  events?: unknown[]
  issues?: unknown[]
  nodes?: unknown[]
}) {
  // Set up all mocks before navigating
  await setupAuthMocks(page)
  await setupMCPMocks(page, options)

  // Navigate to login first to set localStorage
  await page.goto('/login')

  // Set authentication token in localStorage
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  // Navigate to target path
  await page.goto(path)

  // Wait for page to be fully loaded
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Waits for the dashboard to be fully loaded.
 * Uses proper element detection instead of arbitrary timeouts.
 */
export async function waitForDashboardLoad(page: Page) {
  // Wait for the dashboard page container
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 })

  // Wait for the header to appear
  await expect(page.getByTestId('dashboard-header')).toBeVisible({ timeout: 5000 })
}

/**
 * Waits for sidebar to be visible
 */
export async function waitForSidebar(page: Page) {
  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 5000 })
}

/**
 * Waits for any element with data-testid to be visible
 */
export async function waitForTestId(page: Page, testId: string, timeout = 5000) {
  await expect(page.getByTestId(testId)).toBeVisible({ timeout })
}

/**
 * Clicks an element by test ID and waits for it to be visible first
 */
export async function clickByTestId(page: Page, testId: string) {
  const element = page.getByTestId(testId)
  await expect(element).toBeVisible({ timeout: 5000 })
  await element.click()
}

/**
 * Asserts that an element with test ID is visible
 */
export async function assertVisible(page: Page, testId: string, timeout = 5000) {
  await expect(page.getByTestId(testId)).toBeVisible({ timeout })
}

/**
 * Asserts that an element with test ID is NOT visible
 */
export async function assertNotVisible(page: Page, testId: string, timeout = 5000) {
  await expect(page.getByTestId(testId)).not.toBeVisible({ timeout })
}

/**
 * Gets the count of elements matching a test ID pattern
 */
export async function countByTestId(page: Page, testIdPattern: string) {
  return await page.locator(`[data-testid*="${testIdPattern}"]`).count()
}

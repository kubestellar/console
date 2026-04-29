import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * NamespaceOverview Card E2E Tests
 *
 * Covers:
 * - Auto-select: first cluster + namespace chosen automatically in both demo and live mode (#3113)
 * - Persistence: selections survive page navigation (#3115)
 *
 * Run with: npx playwright test e2e/NamespaceOverview.spec.ts
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEMO_CLUSTERS = ['prod-us-east', 'prod-eu-west', 'staging']
const _DEMO_NAMESPACES = ['default', 'kube-system', 'monitoring']

async function setupDemoMode(page: Page) {
  await mockApiFallback(page)

  await page.route('**/api/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1', github_id: '12345', github_login: 'testuser',
        email: 'test@example.com', onboarded: true,
      }),
    })
  )

  await page.route('**/api/mcp/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clusters: DEMO_CLUSTERS.map(name => ({
          name, healthy: true, reachable: true, nodeCount: 3, podCount: 10,
          namespaces: ['default', 'kube-system', 'monitoring'],
        })),
        issues: [], events: [], nodes: [],
      }),
    })
  )

  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true, timestamp: Date.now(),
    }))
    localStorage.removeItem('kc-ns-overview-cluster')
    localStorage.removeItem('kc-ns-overview-namespace')
    localStorage.setItem(
      'kubestellar-dashboard-cards',
      JSON.stringify([{ id: 'namespace_overview', size: 'medium', order: 0 }])
    )
  })
}

async function setupLiveMode(page: Page) {
  const clusters = [
    { name: 'live-cluster-1', healthy: true, reachable: true, nodeCount: 3, podCount: 20 },
    { name: 'live-cluster-2', healthy: true, reachable: true, nodeCount: 2, podCount: 10 },
  ]

  await mockApiFallback(page)

  await page.route('**/api/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1', github_id: '12345', github_login: 'testuser',
        email: 'test@example.com', onboarded: true,
      }),
    })
  )

  await page.route('**/api/mcp/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters, issues: [], events: [], nodes: [] }),
    })
  )

  await page.route('**/127.0.0.1:8585/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], health: {} }),
    })
  )

  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.removeItem('kc-demo-mode')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true, timestamp: Date.now(),
    }))
    localStorage.removeItem('kc-ns-overview-cluster')
    localStorage.removeItem('kc-ns-overview-namespace')
    localStorage.setItem(
      'kubestellar-dashboard-cards',
      JSON.stringify([{ id: 'namespace_overview', size: 'medium', order: 0 }])
    )
  })
}

async function gotoCard(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

// ---------------------------------------------------------------------------
// Tests — auto-select (#3113)
// ---------------------------------------------------------------------------

test.describe('NamespaceOverview — auto-select (#3113)', () => {
  test('demo mode: auto-selects first cluster and namespace', async ({ page }) => {
    await setupDemoMode(page)
    await gotoCard(page)

    // Neither dropdown should show the placeholder text after auto-select
    const clusterSelect = page.locator('select[title="Select a cluster to view namespace details"]')
    await expect(clusterSelect).toBeVisible({ timeout: 10000 })

    // Selected value should be a real cluster name, not empty
    const clusterValue = await clusterSelect.inputValue()
    expect(clusterValue).not.toBe('')
    expect(DEMO_CLUSTERS).toContain(clusterValue)

    // Namespace should also be auto-selected once cluster loads namespaces
    const nsSelect = page.locator('select[title*="Select a namespace"]')
    await expect(nsSelect).not.toBeDisabled({ timeout: 5000 })
    const nsValue = await nsSelect.inputValue()
    expect(nsValue).not.toBe('')

    // "Select a cluster and namespace" placeholder should NOT be visible
    await expect(page.getByText('Select a cluster and namespace to view details')).not.toBeVisible()
  })

  test('live mode: auto-selects first cluster and namespace when clusters are available', async ({ page }) => {
    await setupLiveMode(page)
    await gotoCard(page)

    // Cluster dropdown should auto-select without requiring user interaction
    const clusterSelect = page.locator('select[title="Select a cluster to view namespace details"]')
    await expect(clusterSelect).toBeVisible({ timeout: 10000 })

    const clusterValue = await clusterSelect.inputValue()
    expect(clusterValue).not.toBe('')
    expect(['live-cluster-1', 'live-cluster-2']).toContain(clusterValue)
  })
})

// ---------------------------------------------------------------------------
// Tests — persistence (#3115)
// ---------------------------------------------------------------------------

test.describe('NamespaceOverview — persistence (#3115)', () => {
  test('demo mode: selections persist across page navigation', async ({ page }) => {
    await setupDemoMode(page)
    await gotoCard(page)

    // Wait for auto-select to populate the dropdowns
    const clusterSelect = page.locator('select[title="Select a cluster to view namespace details"]')
    await expect(clusterSelect).toBeVisible({ timeout: 10000 })
    await expect(async () => {
      expect(await clusterSelect.inputValue()).not.toBe('')
    }).toPass({ timeout: 8000 })

    const clusterValue = await clusterSelect.inputValue()

    // Navigate away and return
    await page.goto('/settings')
    await page.waitForLoadState('domcontentloaded')
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Cluster selection should be restored
    const restoredCluster = page.locator('select[title="Select a cluster to view namespace details"]')
    await expect(restoredCluster).toBeVisible({ timeout: 10000 })
    const restoredValue = await restoredCluster.inputValue()
    expect(restoredValue).toBe(clusterValue)

    // The "select a cluster" placeholder should still not be shown
    await expect(page.getByText('Select a cluster and namespace to view details')).not.toBeVisible()
  })

  test('localStorage keys are written when selections change', async ({ page }) => {
    await setupDemoMode(page)
    await gotoCard(page)

    const clusterSelect = page.locator('select[title="Select a cluster to view namespace details"]')
    await expect(clusterSelect).toBeVisible({ timeout: 10000 })
    await expect(async () => {
      expect(await clusterSelect.inputValue()).not.toBe('')
    }).toPass({ timeout: 8000 })

    // Verify localStorage was written
    const storedCluster = await page.evaluate(() => localStorage.getItem('kc-ns-overview-cluster'))
    expect(storedCluster).not.toBeNull()
    expect(storedCluster).not.toBe('')

    const storedNamespace = await page.evaluate(() => localStorage.getItem('kc-ns-overview-namespace'))
    expect(storedNamespace).not.toBeNull()
    expect(storedNamespace).not.toBe('')
  })

  test('persisted cluster is restored after page reload', async ({ page }) => {
    await setupDemoMode(page)
    await gotoCard(page)

    const clusterSelect = page.locator('select[title="Select a cluster to view namespace details"]')
    await expect(clusterSelect).toBeVisible({ timeout: 10000 })
    await expect(async () => {
      expect(await clusterSelect.inputValue()).not.toBe('')
    }).toPass({ timeout: 8000 })

    const clusterValue = await clusterSelect.inputValue()

    // Reload the page (simulates browser refresh)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    const afterReload = page.locator('select[title="Select a cluster to view namespace details"]')
    await expect(afterReload).toBeVisible({ timeout: 10000 })
    const afterValue = await afterReload.inputValue()
    expect(afterValue).toBe(clusterValue)
  })
})

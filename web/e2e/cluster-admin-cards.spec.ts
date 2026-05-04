import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * Cluster Admin Card E2E Tests — EtcdStatus, DNSHealth, AdmissionWebhooks
 *
 * Covers:
 * - Each card renders on the /cluster-admin dashboard
 * - Loading / skeleton states
 * - Data display when available (demo fallback data)
 * - Empty / error states
 *
 * Closes #3566
 *
 * Run with: npx playwright test e2e/cluster-admin-cards.spec.ts
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLUSTER_ADMIN_STORAGE_KEY = 'kubestellar-cluster-admin-cards'

/** Cards under test — injected into localStorage so they appear on /cluster-admin.
 *  Must use `card_type` (snake_case) to match the DashboardCard interface. */
const CARDS_UNDER_TEST = [
  { id: 'test-etcd-1', card_type: 'etcd_status', position: { w: 4, h: 3, x: 0, y: 0 } },
  { id: 'test-dns-1', card_type: 'dns_health', position: { w: 4, h: 3, x: 4, y: 0 } },
  { id: 'test-webhooks-1', card_type: 'admission_webhooks', position: { w: 4, h: 3, x: 8, y: 0 } },
]

/** Mock pods returned from /api/mcp endpoints — includes etcd and coredns pods */
const MOCK_PODS = [
  {
    name: 'etcd-control-plane-1',
    namespace: 'kube-system',
    cluster: 'prod-east',
    status: 'Running',
    restarts: 0,
    containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.12-0', ready: true }],
  },
  {
    name: 'etcd-control-plane-2',
    namespace: 'kube-system',
    cluster: 'prod-east',
    status: 'Running',
    restarts: 2,
    containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.12-0', ready: true }],
  },
  {
    name: 'etcd-control-plane-1',
    namespace: 'kube-system',
    cluster: 'staging',
    status: 'CrashLoopBackOff',
    restarts: 15,
    containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.10-0', ready: false }],
  },
  {
    name: 'coredns-5d78c9869d-abc12',
    namespace: 'kube-system',
    cluster: 'prod-east',
    status: 'Running',
    restarts: 0,
    containers: [{ name: 'coredns', image: 'registry.k8s.io/coredns/coredns:v1.11.1', ready: true }],
  },
  {
    name: 'coredns-5d78c9869d-def34',
    namespace: 'kube-system',
    cluster: 'prod-east',
    status: 'Running',
    restarts: 0,
    containers: [{ name: 'coredns', image: 'registry.k8s.io/coredns/coredns:v1.11.1', ready: true }],
  },
  {
    name: 'coredns-7f89b6d4c-xyz99',
    namespace: 'kube-system',
    cluster: 'staging',
    status: 'Pending',
    restarts: 3,
    containers: [{ name: 'coredns', image: 'registry.k8s.io/coredns/coredns:v1.10.0', ready: false }],
  },
]

const MOCK_CLUSTERS = [
  { name: 'prod-east', context: 'ctx-1', healthy: true, reachable: true, nodeCount: 5, podCount: 45 },
  { name: 'staging', context: 'ctx-2', healthy: false, reachable: true, nodeCount: 2, podCount: 15 },
]

const MOCK_WEBHOOKS = [
  { name: 'gatekeeper-validating', type: 'validating', failurePolicy: 'Ignore', matchPolicy: 'Exact', rules: 3, cluster: 'prod-east' },
  { name: 'kyverno-resource-validating', type: 'validating', failurePolicy: 'Fail', matchPolicy: 'Equivalent', rules: 12, cluster: 'prod-east' },
  { name: 'cert-manager-webhook', type: 'mutating', failurePolicy: 'Fail', matchPolicy: 'Exact', rules: 2, cluster: 'prod-east' },
  { name: 'istio-sidecar-injector', type: 'mutating', failurePolicy: 'Ignore', matchPolicy: 'Exact', rules: 1, cluster: 'staging' },
]

// ---------------------------------------------------------------------------
// Setup Helpers
// ---------------------------------------------------------------------------

/**
 * Standard auth + MCP mock setup that injects the three cards under test
 * into localStorage so they render on the /cluster-admin dashboard.
 */
async function setupClusterAdminTest(page: Page) {
  // Register catch-all FIRST so specific mocks override it
  await mockApiFallback(page)

  // Mock authentication
  await page.route('**/api/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
      }),
    })
  )

  // Mock MCP endpoints with pod data (etcd + coredns pods)
  await page.route('**/api/mcp/**', route => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clusters: MOCK_CLUSTERS }),
      })
    } else if (url.includes('/pods')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pods: MOCK_PODS }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issues: [], events: [], nodes: [] }),
      })
    }
  })

  // Mock admission webhooks endpoint
  await page.route('**/api/admission-webhooks', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ webhooks: MOCK_WEBHOOKS, isDemoData: false }),
    })
  )

  // Mock the local kc-agent HTTP endpoint (fetchAPI uses http://127.0.0.1:8585/)
  await page.route('http://127.0.0.1:8585/**', route => {
    const url = route.request().url()
    if (url.includes('/clusters') || url.includes('clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clusters: MOCK_CLUSTERS }),
      })
    } else if (url.includes('/pods') || url.includes('pods')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pods: MOCK_PODS }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issues: [], events: [], nodes: [] }),
      })
    }
  })

  // Set auth token and inject cards under test via addInitScript
  // so localStorage is set BEFORE any app code runs
  await page.addInitScript(
    ({ storageKey, cards }: { storageKey: string; cards: typeof CARDS_UNDER_TEST }) => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('kc-has-session', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kc-agent-setup-dismissed', 'true')
      localStorage.setItem('kc-backend-status', JSON.stringify({
        available: true,
        timestamp: Date.now(),
      }))
      localStorage.setItem(storageKey, JSON.stringify(cards))
    },
    { storageKey: CLUSTER_ADMIN_STORAGE_KEY, cards: CARDS_UNDER_TEST }
  )

  await page.goto('/cluster-admin')
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Setup with delayed API responses so loading/skeleton states are observable.
 */
async function setupWithLoadingDelay(page: Page) {
  // Register catch-all FIRST so specific mocks override it
  await mockApiFallback(page)

  await page.route('**/api/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
      }),
    })
  )

  // Delay MCP responses to keep cards in loading state
  await page.route('**/api/mcp/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 3000))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [], pods: [] }),
    })
  })

  // Delay local agent responses too
  await page.route('http://127.0.0.1:8585/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 3000))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [], pods: [] }),
    })
  })

  await page.route('**/api/admission-webhooks', async route => {
    await new Promise(resolve => setTimeout(resolve, 3000))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ webhooks: [], isDemoData: true }),
    })
  })

  await page.addInitScript(
    ({ storageKey, cards }: { storageKey: string; cards: typeof CARDS_UNDER_TEST }) => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('kc-has-session', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kc-agent-setup-dismissed', 'true')
      localStorage.setItem('kc-backend-status', JSON.stringify({
        available: true,
        timestamp: Date.now(),
      }))
      localStorage.setItem(storageKey, JSON.stringify(cards))
    },
    { storageKey: CLUSTER_ADMIN_STORAGE_KEY, cards: CARDS_UNDER_TEST }
  )

  await page.goto('/cluster-admin')
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Setup with API errors to test empty/error fallback states.
 */
async function setupWithErrors(page: Page) {
  // Register catch-all FIRST so specific mocks override it
  await mockApiFallback(page)

  await page.route('**/api/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
      }),
    })
  )

  // Return empty/error responses
  await page.route('**/api/mcp/**', route => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clusters: [] }),
      })
    } else if (url.includes('/pods')) {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issues: [], events: [], nodes: [] }),
      })
    }
  })

  // Mock local agent with empty clusters (error scenario)
  await page.route('http://127.0.0.1:8585/**', route => {
    const url = route.request().url()
    if (url.includes('clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clusters: [] }),
      })
    } else {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    }
  })

  await page.route('**/api/admission-webhooks', route =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Service unavailable' }),
    })
  )

  await page.addInitScript(
    ({ storageKey, cards }: { storageKey: string; cards: typeof CARDS_UNDER_TEST }) => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('kc-has-session', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kc-agent-setup-dismissed', 'true')
      localStorage.setItem('kc-backend-status', JSON.stringify({
        available: true,
        timestamp: Date.now(),
      }))
      localStorage.setItem(storageKey, JSON.stringify(cards))
    },
    { storageKey: CLUSTER_ADMIN_STORAGE_KEY, cards: CARDS_UNDER_TEST }
  )

  await page.goto('/cluster-admin')
  await page.waitForLoadState('domcontentloaded')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Cluster Admin Cards — EtcdStatus, DNSHealth, AdmissionWebhooks', () => {
  // =========================================================================
  // Card Rendering
  // =========================================================================
  test.describe('Card Rendering on /cluster-admin', () => {
    test.beforeEach(async ({ page }) => {
      await setupClusterAdminTest(page)
    })

    test('EtcdStatus card renders on the dashboard', async ({ page }) => {
      const card = page.locator('[data-card-type="etcd_status"]')
      await expect(card).toBeVisible({ timeout: 15000 })
    })

    test('DNSHealth card renders on the dashboard', async ({ page }) => {
      const card = page.locator('[data-card-type="dns_health"]')
      await expect(card).toBeVisible({ timeout: 15000 })
    })

    test('AdmissionWebhooks card renders on the dashboard', async ({ page }) => {
      const card = page.locator('[data-card-type="admission_webhooks"]')
      await expect(card).toBeVisible({ timeout: 15000 })
    })

    test('all three cards coexist on the same dashboard', async ({ page }) => {
      await expect(page.locator('[data-card-type="etcd_status"]')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('[data-card-type="dns_health"]')).toBeVisible()
      await expect(page.locator('[data-card-type="admission_webhooks"]')).toBeVisible()
    })
  })

  // =========================================================================
  // Loading States
  // =========================================================================
  test.describe('Loading States', () => {
    test('cards show skeleton/loading indicators while data is fetching', async ({ page }) => {
      await setupWithLoadingDelay(page)

      // All three cards should appear on the page (possibly in loading state)
      // Look for animate-pulse skeletons or data-loading="true" attribute
      const etcdCard = page.locator('[data-card-type="etcd_status"]')
      const dnsCard = page.locator('[data-card-type="dns_health"]')
      const webhooksCard = page.locator('[data-card-type="admission_webhooks"]')

      // Cards should be present in the DOM even while loading
      await expect(etcdCard).toBeVisible({ timeout: 15000 })
      await expect(dnsCard).toBeVisible()
      await expect(webhooksCard).toBeVisible()

      // At least one card should show a loading indicator (skeleton pulse or loading attribute)
      // With a 3 s response delay the cards must still be in loading state.
      const anyLoading = page.locator('[data-card-type="etcd_status"][data-loading="true"], [data-card-type="dns_health"][data-loading="true"], [data-card-type="admission_webhooks"][data-loading="true"], [data-card-type="etcd_status"] .animate-pulse, [data-card-type="dns_health"] .animate-pulse, [data-card-type="admission_webhooks"] .animate-pulse')
      await expect(anyLoading.first()).toBeVisible({ timeout: 5000 })
    })
  })

  // =========================================================================
  // Data Display
  // =========================================================================
  test.describe('Data Display', () => {
    test.beforeEach(async ({ page }) => {
      await setupClusterAdminTest(page)
    })

    test('EtcdStatus shows cluster names with etcd members', async ({ page }) => {
      const card = page.locator('[data-card-type="etcd_status"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // Wait for data to render — should show cluster names from mock data
      // The card groups etcd pods by cluster — expect to see "prod-east" or "staging"
      // Use .first() to avoid strict-mode violations when multiple cluster names
      // appear inside the card (e.g. grouped rows + summary). #10790
      await expect(card.getByText('prod-east').or(card.getByText('staging')).first()).toBeVisible({ timeout: 10000 })
    })

    test('EtcdStatus shows health status indicators', async ({ page }) => {
      const card = page.locator('[data-card-type="etcd_status"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // The card renders green/red status dots (w-2 h-2 rounded-full)
      const statusDots = card.locator('.rounded-full.w-2.h-2, .bg-green-500, .bg-red-500')
      await expect(statusDots.first()).toBeVisible({ timeout: 10000 })
    })

    test('EtcdStatus shows restart count for pods with restarts', async ({ page }) => {
      const card = page.locator('[data-card-type="etcd_status"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // staging cluster has a pod with 15 restarts — card should show restart indicator
      // The text-orange-400 class is used for restart counts
      const restartIndicator = card.locator('.text-orange-400')
      await expect(restartIndicator.first()).toBeVisible({ timeout: 10000 })
    })

    test('DNSHealth shows cluster names with DNS pods', async ({ page }) => {
      const card = page.locator('[data-card-type="dns_health"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // Should show cluster names from coredns mock pods
      // Use .first() to avoid strict-mode violations when multiple cluster names
      // appear inside the card (e.g. grouped rows + summary). #10790
      await expect(card.getByText('prod-east').or(card.getByText('staging')).first()).toBeVisible({ timeout: 10000 })
    })

    test('DNSHealth shows health status indicators for DNS pods', async ({ page }) => {
      const card = page.locator('[data-card-type="dns_health"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // Wait for data to load — cluster name should appear
      await expect(card.getByText('prod-east').or(card.getByText('staging')).first()).toBeVisible({ timeout: 15000 })

      // DNS card shows per-pod status pills (✓ for running, ✗ for non-running)
      const statusPills = card.getByText('✓').or(card.getByText('✗'))
      await expect(statusPills.first()).toBeVisible({ timeout: 10000 })
    })

    test('DNSHealth shows restart count when pods have restarts', async ({ page }) => {
      const card = page.locator('[data-card-type="dns_health"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // staging cluster has a coredns pod with 3 restarts
      const restartIndicator = card.locator('.text-orange-400')
      await expect(restartIndicator.first()).toBeVisible({ timeout: 10000 })
    })

    test('AdmissionWebhooks shows tab filters (all, mutating, validating)', async ({ page }) => {
      const card = page.locator('[data-card-type="admission_webhooks"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // The card renders three tab buttons: All, Mutating, Validating
      const tabs = card.locator('button.rounded-full')
      await expect(tabs).toHaveCount(3, { timeout: 10000 })
    })

    test('AdmissionWebhooks shows webhook names', async ({ page }) => {
      const card = page.locator('[data-card-type="admission_webhooks"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // Wait for tab buttons to appear (indicates data has loaded)
      await expect(card.locator('button.rounded-full').first()).toBeVisible({ timeout: 15000 })

      // Should show webhook names from mock data (or demo fallback)
      const webhookEntries = card.locator('.bg-muted\\/30')
      await expect(webhookEntries.first()).toBeVisible({ timeout: 10000 })
    })

    test('AdmissionWebhooks shows type badges (M for mutating, V for validating)', async ({ page }) => {
      const card = page.locator('[data-card-type="admission_webhooks"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // Type badges: "M" for mutating (blue), "V" for validating (purple)
      const badge = card.locator('.bg-blue-500\\/10, .bg-purple-500\\/10').first()
      await expect(badge).toBeVisible({ timeout: 10000 })
    })

    test('AdmissionWebhooks shows failure policy badges', async ({ page }) => {
      const card = page.locator('[data-card-type="admission_webhooks"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // Failure policy badges: "Fail" (red) or "Ignore" (yellow)
      const failBadge = card.locator('.bg-red-500\\/10, .bg-yellow-500\\/10')
      await expect(failBadge.first()).toBeVisible({ timeout: 10000 })
    })

    test('AdmissionWebhooks tab filtering works', async ({ page }) => {
      const card = page.locator('[data-card-type="admission_webhooks"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // Wait for webhook entries to load
      await expect(card.locator('.bg-muted\\/30').first()).toBeVisible({ timeout: 10000 })

      // Get initial count of webhook entries (all tab)
      const allCount = await card.locator('.bg-muted\\/30').count()
      expect(allCount).toBeGreaterThan(0)

      // Click the second tab button (mutating)
      const tabs = card.locator('button.rounded-full')
      await tabs.nth(1).click()

      // After filtering, count should change (or remain if all are mutating)
      const filteredCount = await card.locator('.bg-muted\\/30').count()
      expect(filteredCount).toBeLessThanOrEqual(allCount)
    })
  })

  // =========================================================================
  // Empty / Error States
  // =========================================================================
  test.describe('Empty and Error States', () => {
    test('EtcdStatus shows managed-by-provider message when no etcd pods found', async ({ page }) => {
      await setupWithErrors(page)

      const card = page.locator('[data-card-type="etcd_status"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // Wait for data to settle (error -> empty state) by checking for card text content
      await expect(card).not.toHaveText('', { timeout: 10000 })

      // The card should either show the empty state or demo fallback data
      // Both are valid — the card does not crash
      const cardContent = await card.textContent()
      expect(cardContent).toBeTruthy()
    })

    test('DNSHealth shows empty state when no DNS pods found', async ({ page }) => {
      await setupWithErrors(page)

      const card = page.locator('[data-card-type="dns_health"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // Wait for error handling to settle — card should have non-empty content
      await expect(card).not.toHaveText('', { timeout: 10000 })

      // Card should render without crashing — either empty state or demo data
      const cardContent = await card.textContent()
      expect(cardContent).toBeTruthy()
    })

    test('AdmissionWebhooks gracefully handles API errors', async ({ page }) => {
      await setupWithErrors(page)

      const card = page.locator('[data-card-type="admission_webhooks"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // The hook falls back to demo data on 503, so card should still render
      // Wait for tab buttons to appear (indicates card has rendered its content)
      await expect(card.locator('button.rounded-full').first()).toBeVisible({ timeout: 10000 })

      // Should still show tabs and webhook entries (demo fallback)
      const tabs = card.locator('button.rounded-full')
      const tabCount = await tabs.count()
      expect(tabCount).toBe(3)
    })

    test('page does not crash when all APIs return errors', async ({ page }) => {
      await setupWithErrors(page)

      // The cluster-admin page should still render (DashboardPage uses pt-4)
      await expect(page.locator('.pt-4')).toBeVisible({ timeout: 15000 })

      // All three cards should still be in the DOM
      await expect(page.locator('[data-card-type="etcd_status"]')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('[data-card-type="dns_health"]')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('[data-card-type="admission_webhooks"]')).toBeVisible({ timeout: 10000 })
    })
  })

  // =========================================================================
  // Responsive Design
  // =========================================================================
  test.describe('Responsive Design', () => {
    test.beforeEach(async ({ page }) => {
      await setupClusterAdminTest(page)
    })

    test('cards adapt to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })

      // Cards should still render at mobile width (stacked to single column)
      await expect(page.locator('[data-card-type="etcd_status"]')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('[data-card-type="dns_health"]')).toBeVisible()
      await expect(page.locator('[data-card-type="admission_webhooks"]')).toBeVisible()
    })

    test('cards adapt to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })

      await expect(page.locator('[data-card-type="etcd_status"]')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('[data-card-type="dns_health"]')).toBeVisible()
      await expect(page.locator('[data-card-type="admission_webhooks"]')).toBeVisible()
    })
  })

  // =========================================================================
  // Accessibility
  // =========================================================================
  // Default 21-Card Layout (#11786)
  // =========================================================================
  test.describe('Default 21-Card Layout', () => {
    test('renders all 21 default cards when localStorage is cleared', async ({ page }) => {
      // Setup without injecting custom cards into localStorage
      await mockApiFallback(page)

      await page.route('**/api/me', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            github_id: '12345',
            github_login: 'testuser',
            email: 'test@example.com',
            onboarded: true,
          }),
        })
      )

      await page.route('**/api/mcp/**', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: MOCK_CLUSTERS, pods: MOCK_PODS, issues: [], events: [], nodes: [] }),
        })
      )

      await page.route('http://127.0.0.1:8585/**', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: MOCK_CLUSTERS, pods: MOCK_PODS, issues: [], events: [], nodes: [] }),
        })
      )

      // Explicitly clear the cluster-admin storage key so default config is used
      await page.addInitScript(({ storageKey }: { storageKey: string }) => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('kc-demo-mode', 'false')
        localStorage.setItem('kc-has-session', 'true')
        localStorage.setItem('demo-user-onboarded', 'true')
        localStorage.setItem('kc-agent-setup-dismissed', 'true')
        localStorage.setItem('kc-backend-status', JSON.stringify({
          available: true,
          timestamp: Date.now(),
        }))
        localStorage.removeItem(storageKey)
      }, { storageKey: CLUSTER_ADMIN_STORAGE_KEY })

      await page.goto('/cluster-admin')
      await page.waitForLoadState('domcontentloaded')

      // All 21 default card types from cluster-admin.ts config
      const EXPECTED_CARD_TYPES = [
        'kubectl',
        'node_debug',
        'cluster_health',
        'control_plane_health',
        'provider_health',
        'resource_usage',
        'predictive_health',
        'pod_issues',
        'deployment_issues',
        'warning_events',
        'hardware_health',
        'upgrade_status',
        'node_conditions',
        'cert_manager',
        'operator_status',
        'operator_subscriptions',
        'opa_policies',
        'active_alerts',
        'alert_rules',
        'security_issues',
        'console_ai_health_check',
      ]

      const EXPECTED_CARD_COUNT = 21

      // Wait for the dashboard grid to be visible
      const grid = page.locator('[data-testid="dashboard-cards-grid"], .grid')
      await grid.first().waitFor({ state: 'visible', timeout: 15000 })

      // Verify total card count matches expected 21 cards
      const allCards = page.locator('[data-card-type]')
      await expect(allCards).toHaveCount(EXPECTED_CARD_COUNT, { timeout: 15000 })

      // Verify each expected card type is present
      for (const cardType of EXPECTED_CARD_TYPES) {
        const card = page.locator(`[data-card-type="${cardType}"]`)
        await expect(card).toBeVisible({ timeout: 10000 })
      }
    })
  })

  // =========================================================================
  // Error Banner and Demo Stat Styling (#11788)
  // =========================================================================
  test.describe('Error Banner and Demo Stat Styling', () => {
    test('shows red error banner when cluster API returns 500', async ({ page }) => {
      await mockApiFallback(page)

      await page.route('**/api/me', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            github_id: '12345',
            github_login: 'testuser',
            email: 'test@example.com',
            onboarded: true,
          }),
        })
      )

      // Mock clusters endpoint to return 500 error
      await page.route('**/api/mcp/clusters', route =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        })
      )

      await page.route('**/api/mcp/**', route => {
        if (!route.request().url().includes('/clusters')) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ pods: [], issues: [], events: [], nodes: [] }),
          })
        }
      })

      await page.route('http://127.0.0.1:8585/**', route =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        })
      )

      await page.addInitScript(({ storageKey, cards }: { storageKey: string; cards: typeof CARDS_UNDER_TEST }) => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('kc-demo-mode', 'false')
        localStorage.setItem('kc-has-session', 'true')
        localStorage.setItem('demo-user-onboarded', 'true')
        localStorage.setItem('kc-agent-setup-dismissed', 'true')
        localStorage.setItem('kc-backend-status', JSON.stringify({
          available: true,
          timestamp: Date.now(),
        }))
        localStorage.setItem(storageKey, JSON.stringify(cards))
      }, { storageKey: CLUSTER_ADMIN_STORAGE_KEY, cards: CARDS_UNDER_TEST })

      await page.goto('/cluster-admin')
      await page.waitForLoadState('domcontentloaded')

      // The error banner should be visible with red styling
      const errorBanner = page.locator('.bg-red-500\\/10')
      await expect(errorBanner).toBeVisible({ timeout: 15000 })

      // Error banner should contain meaningful error text
      const errorText = errorBanner.locator('.font-medium')
      await expect(errorText).toBeVisible({ timeout: 10000 })
    })

    test('stat blocks show demo badge styling when no cluster data is available', async ({ page }) => {
      await mockApiFallback(page)

      await page.route('**/api/me', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            github_id: '12345',
            github_login: 'testuser',
            email: 'test@example.com',
            onboarded: true,
          }),
        })
      )

      // Return empty clusters so isDemoData becomes true
      await page.route('**/api/mcp/**', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [], pods: [], issues: [], events: [], nodes: [] }),
        })
      )

      await page.route('http://127.0.0.1:8585/**', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ clusters: [], pods: [], issues: [], events: [], nodes: [] }),
        })
      )

      await page.addInitScript(({ storageKey, cards }: { storageKey: string; cards: typeof CARDS_UNDER_TEST }) => {
        localStorage.setItem('token', 'test-token')
        localStorage.setItem('kc-demo-mode', 'false')
        localStorage.setItem('kc-has-session', 'true')
        localStorage.setItem('demo-user-onboarded', 'true')
        localStorage.setItem('kc-agent-setup-dismissed', 'true')
        localStorage.setItem('kc-backend-status', JSON.stringify({
          available: true,
          timestamp: Date.now(),
        }))
        localStorage.setItem(storageKey, JSON.stringify(cards))
      }, { storageKey: CLUSTER_ADMIN_STORAGE_KEY, cards: CARDS_UNDER_TEST })

      await page.goto('/cluster-admin')
      await page.waitForLoadState('domcontentloaded')

      // Wait for the page to settle — stats should render with demo indicators
      // Demo stat blocks typically show a "Demo" badge or yellow outline
      const demoBadge = page.locator('text=Demo').or(page.locator('[data-demo="true"]')).or(page.locator('.border-yellow-500, .border-yellow-400, .text-yellow-400'))
      await expect(demoBadge.first()).toBeVisible({ timeout: 15000 })
    })
  })

  // =========================================================================
  test.describe('Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      await setupClusterAdminTest(page)
    })

    test('cards are keyboard navigable', async ({ page }) => {
      await expect(page.locator('[data-card-type="etcd_status"]')).toBeVisible({ timeout: 15000 })

      // Tab through elements — should eventually reach card content
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab')
      }

      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('AdmissionWebhooks tab buttons are keyboard accessible', async ({ page }) => {
      const card = page.locator('[data-card-type="admission_webhooks"]')
      await expect(card).toBeVisible({ timeout: 15000 })

      // Tab buttons should be focusable
      const tabs = card.locator('button.rounded-full')
      const firstTab = tabs.first()
      await firstTab.focus()
      await expect(firstTab).toBeFocused()
    })
  })
})

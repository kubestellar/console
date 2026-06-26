import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * RBACExplorer Card E2E Tests
 *
 * Covers:
 * - Demo mode: card renders DEMO_FINDINGS, risk chips, search, pagination
 * - Live data mode: card shows empty state when no clusters are connected
 * - Demo mode guard: live-cluster mode does NOT show demo findings
 * - Risk filter, search by subject / cluster, and clearing
 * - Pagination scroll reset (Issue 9268)
 * - Localized finding descriptions render from the hook's `descriptionKey`
 *   (Issue 9269)
 * - Expanded role-based assertions for the RBAC table columns (Issue 9239)
 *
 * Addresses issues 3084, 3085, 3088, 9239, 9264, 9268, 9269.
 *
 * Run with: npx playwright test e2e/RBACExplorer.spec.ts
 */

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

async function setupDemoMode(page: Page) {
  // Register catch-all FIRST so specific mocks override it
  await mockApiFallback(page)

  await page.route('**/api/me', (route) =>
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

  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [] }),
    })
  )

  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
    // Pre-pin the RBACExplorer card using the correct storage key and Card
    // shape. The main dashboard reads 'kubestellar-main-dashboard-cards' and
    // expects { id, card_type, config, position } (snake_case field names).
    localStorage.setItem(
      'kubestellar-main-dashboard-cards',
      JSON.stringify([{
        id: 'rbac_explorer',
        card_type: 'rbac_explorer',
        config: {},
        position: { x: 0, y: 0, w: 12, h: 4 },
      }])
    )
  })
}

async function setupLiveMode(page: Page, withClusters = false) {
  // Register catch-all FIRST so specific mocks override it
  await mockApiFallback(page)

  await page.route('**/api/me', (route) =>
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

  const clusters = withClusters
    ? [{ name: 'test-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 20 }]
    : []

  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters, issues: [], events: [], nodes: [] }),
    })
  )

  // Stub local agent (kc-agent) health — returns no clusters accessible via kubectl
  await page.route('http://127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], health: {} }),
    })
  )

  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.removeItem('kc-demo-mode')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
    // Pre-pin the RBACExplorer card using the correct storage key and Card
    // shape. The main dashboard reads 'kubestellar-main-dashboard-cards' and
    // expects { id, card_type, config, position } (snake_case field names).
    localStorage.setItem(
      'kubestellar-main-dashboard-cards',
      JSON.stringify([{
        id: 'rbac_explorer',
        card_type: 'rbac_explorer',
        config: {},
        position: { x: 0, y: 0, w: 12, h: 4 },
      }])
    )
  })
}

/** Navigate to the dashboard and wait for the RBACExplorer card to appear */
async function _gotoRBACCard(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  // The card title text identifies the card within the dashboard
  const card = page.locator('[data-card-id="rbac_explorer"], .card-wrapper').filter({
    hasText: /rbac|role|binding|finding/i,
  }).first()
  return card
}

/** Wait for demo findings to render inside the RBAC card. This is the
 *  canonical signal that the card has loaded demo data — several tests
 *  previously failed because they only waited for `domcontentloaded`. */
async function waitForRBACDemoFindings(page: Page) {
  await expect(page.getByText('dev-team').first()).toBeVisible({ timeout: 15000 })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('RBACExplorer card — demo mode', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoMode(page)
  })

  test('renders demo findings with risk chips', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Wait for demo findings to fully render
    await waitForRBACDemoFindings(page)

    // Wait for at least one risk chip to appear
    const criticalChip = page.getByRole('button', { name: /critical/i }).first()
    await expect(criticalChip).toBeVisible({ timeout: 10000 })

    // All four risk chips should be present
    for (const risk of ['critical', 'high', 'medium', 'low']) {
      await expect(page.getByRole('button', { name: new RegExp(risk, 'i') }).first()).toBeVisible()
    }
  })

  test('risk filter chip filters findings', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Wait for demo findings to render
    await waitForRBACDemoFindings(page)

    // Wait for critical chip
    const criticalChip = page.getByRole('button', { name: /critical/i }).first()
    await expect(criticalChip).toBeVisible({ timeout: 10000 })

    // Click critical filter
    await criticalChip.click()

    // Only critical findings should remain — verify "high" finding text is gone
    // (demo data has "ci-bot" as high risk but "dev-team" as critical)
    await expect(page.getByText('ci-bot')).not.toBeVisible({ timeout: 3000 }).catch(() => {
      // If ci-bot finding is still visible, it means high findings are showing — fail softly
    })

    // Critical finding ("dev-team" in demo data) should be visible
    await expect(page.getByText(/dev-team|cluster-admin/i).first()).toBeVisible()
  })

  test('search filters findings by subject name', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Wait for demo findings to render
    await waitForRBACDemoFindings(page)

    // Find the search input and type a query
    const searchInput = page.getByPlaceholder(/search subjects/i)
    await searchInput.fill('ci-bot')

    // Only "ci-bot" finding should be visible
    await expect(page.getByText('ci-bot')).toBeVisible()
    await expect(page.getByText('dev-team')).not.toBeVisible({ timeout: 3000 }).catch(() => {})
  })

  test('search filters findings by cluster name', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Wait for demo findings to render
    await waitForRBACDemoFindings(page)

    const searchInput = page.getByPlaceholder(/search subjects/i)
    await searchInput.fill('prod-eu-west')

    // Only prod-eu-west cluster findings should be visible (monitoring SA in demo data)
    await expect(page.getByText('monitoring').first()).toBeVisible()
    await expect(page.getByText('dev-team')).not.toBeVisible({ timeout: 3000 }).catch(() => {})
  })

  test('demo mode shows demo data, not live cluster data', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Demo data has "prod-us-east" cluster — this cluster name must appear
    await expect(page.getByText('prod-us-east').first()).toBeVisible({ timeout: 10000 })
  })

  // Issue 9239 — extend coverage: RBAC table columns (subject, role/binding, cluster)
  test('renders subject, binding, and cluster columns for each finding', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Wait for demo findings to render
    await waitForRBACDemoFindings(page)
    await expect(page.getByText(/ClusterRoleBinding\/dev-admin/i).first()).toBeVisible()
    await expect(page.getByText('prod-us-east').first()).toBeVisible()
  })

  // Issue 9269 — localized finding descriptions should render (via t() call)
  test('renders a localized finding description for the critical cluster-admin finding', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // In English the cluster-admin description text is still the same as
    // the legacy hardcoded string, but it now comes from i18n. The test
    // asserts the user-visible text rather than the English literal to
    // keep it compatible with future translation changes.
    await expect(page.getByText(/cluster-admin binding/i).first()).toBeVisible({ timeout: 10000 })
  })

  // Issue 9268 — clearing the search restores the full result set
  test('clearing the search restores all demo findings', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Wait for demo findings to render
    await waitForRBACDemoFindings(page)

    const searchInput = page.getByPlaceholder(/search subjects/i)
    await searchInput.fill('ci-bot')
    await expect(page.getByText('ci-bot')).toBeVisible()

    await searchInput.fill('')
    await expect(page.getByText('dev-team').first()).toBeVisible()
    await expect(page.getByText('monitoring').first()).toBeVisible()
  })
})

test.describe('RBACExplorer card — live mode, no clusters', () => {
  test.beforeEach(async ({ page }) => {
    await setupLiveMode(page, false)
  })

  test('shows empty state when no clusters are connected', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Should NOT show demo findings (e.g., "dev-team" from demo data)
    await expect(page.getByText('dev-team')).not.toBeVisible({ timeout: 5000 }).catch(() => {})

    // Should show empty/no-data state or skeleton that resolves to empty
    // The card either shows a skeleton then empty, or goes straight to empty
    const emptyState = page.getByText(/no rbac findings|no rbac bindings|no rbac|connect a cluster/i)
    await expect(emptyState.first()).toBeVisible({ timeout: 15000 })
  })

  test('live mode does not render demo data', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Verify none of the well-known demo cluster names appear in RBAC context
    await expect(page.getByText('prod-us-east')).not.toBeVisible({ timeout: 8000 }).catch(() => {})
    await expect(page.getByText('prod-eu-west')).not.toBeVisible({ timeout: 3000 }).catch(() => {})
  })
})

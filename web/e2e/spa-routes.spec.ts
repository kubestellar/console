import { test, expect, Page } from '@playwright/test'

/**
 * SPA Route Regression Tests
 *
 * Validates that every route defined in routes.ts actually loads
 * without returning a 404 or blank page. Catches regressions like:
 * - #3046: Backend dev server returns 404 for SPA routes
 * - #3008: chunk_load errors on routes
 *
 * Run with: npx playwright test e2e/spa-routes.spec.ts
 */

// All routes from web/src/config/routes.ts (excluding parameterized routes
// that need dynamic IDs like /custom-dashboard/:id and /missions/:missionId)
const ALL_ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/login', name: 'Login' },
  { path: '/settings', name: 'Settings' },
  { path: '/users', name: 'Users' },
  { path: '/clusters', name: 'Clusters' },
  { path: '/nodes', name: 'Nodes' },
  { path: '/namespaces', name: 'Namespaces' },
  { path: '/deployments', name: 'Deployments' },
  { path: '/pods', name: 'Pods' },
  { path: '/services', name: 'Services' },
  { path: '/workloads', name: 'Workloads' },
  { path: '/operators', name: 'Operators' },
  { path: '/helm', name: 'Helm' },
  { path: '/logs', name: 'Logs' },
  { path: '/events', name: 'Events' },
  { path: '/compute', name: 'Compute' },
  { path: '/storage', name: 'Storage' },
  { path: '/network', name: 'Network' },
  { path: '/alerts', name: 'Alerts' },
  { path: '/history', name: 'History' },
  { path: '/security', name: 'Security' },
  { path: '/security-posture', name: 'Security Posture' },
  { path: '/compliance', name: 'Compliance' },
  { path: '/data-compliance', name: 'Data Compliance' },
  { path: '/gitops', name: 'GitOps' },
  { path: '/cost', name: 'Cost' },
  { path: '/gpu-reservations', name: 'GPU Reservations' },
  { path: '/arcade', name: 'Arcade' },
  { path: '/deploy', name: 'Deploy' },
  { path: '/ai-ml', name: 'AI/ML' },
  { path: '/ai-agents', name: 'AI Agents' },
  { path: '/ci-cd', name: 'CI/CD' },
  { path: '/llm-d-benchmarks', name: 'LLM-D Benchmarks' },
  { path: '/insights', name: 'Insights' },
  { path: '/cluster-admin', name: 'Cluster Admin' },
  { path: '/marketplace', name: 'Marketplace' },
  { path: '/missions', name: 'Missions' },
  { path: '/widget', name: 'Widget' },
  { path: '/issue', name: 'Issue' },
  { path: '/feedback', name: 'Feedback' },
  { path: '/feature', name: 'Feature' },
  { path: '/multi-tenancy', name: 'Multi-Tenancy' },
  { path: '/from-lens', name: 'From Lens' },
  { path: '/from-headlamp', name: 'From Headlamp' },
  { path: '/white-label', name: 'White Label' },
]

async function setupDemoMode(page: Page) {
  // Seed localStorage BEFORE any page script runs so the auth guard sees
  // the token on first execution. page.evaluate() runs after the page has
  // already parsed and executed scripts, which is too late for webkit/Safari
  // where the auth redirect fires synchronously on script evaluation.
  // page.addInitScript() injects the snippet ahead of any page code (#9096).
  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

test.describe('SPA Route Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoMode(page)
  })

  for (const { path, name } of ALL_ROUTES) {
    test(`${name} (${path}) loads without blank page or crash`, async ({ page }) => {
      // Navigate to the route
      const response = await page.goto(path)

      // Should not get a server-side 404 (regression #3046)
      if (response) {
        expect(
          response.status(),
          `${path} returned HTTP ${response.status()}`
        ).toBeLessThan(400)
      }

      await page.waitForLoadState('domcontentloaded')

      // Page should have meaningful content (not blank)
      const bodyText = await page.textContent('body')
      expect(
        bodyText?.length,
        `${path} rendered a blank or near-empty page`
      ).toBeGreaterThan(20)

      // Should have the root React mount point (not a raw 404 page)
      const rootDiv = page.locator('#root')
      await expect(rootDiv).toBeVisible({ timeout: 10000 })
    })
  }

  test('unknown route shows 404 page, not a crash', async ({ page }) => {
    await page.goto('/this-route-definitely-does-not-exist-xyz')
    await page.waitForLoadState('domcontentloaded')

    // Should still render the React app (SPA handles 404 in-app)
    const rootDiv = page.locator('#root')
    await expect(rootDiv).toBeVisible({ timeout: 10000 })

    const bodyText = await page.textContent('body')
    expect(bodyText?.length).toBeGreaterThan(20)
  })
})

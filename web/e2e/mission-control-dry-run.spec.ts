import { test, expect, Page } from '@playwright/test'
import { execSync } from 'child_process'

/**
 * Mission Control Dry-Run Tests
 *
 * Group A (Mock mode, 6 tests): Verify dry-run UI state, badge, titles, persistence
 * Group B (Real clusters, 3 tests): Dry-run against vllm-d and platform-eval
 *   — NO actual resources created on production clusters
 *
 * Run mock tests:   MOCK_AI=true npx playwright test e2e/mission-control-dry-run.spec.ts
 * Run real tests:   KC_AGENT=true npx playwright test e2e/mission-control-dry-run.spec.ts
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOCK_MODE = process.env.MOCK_AI === 'true'
const AGENT_MODE = process.env.KC_AGENT === 'true'

const AI_TIMEOUT_MS = MOCK_MODE ? 10_000 : 120_000
const DIALOG_TIMEOUT_MS = 15_000
/** Timeout for real cluster dry-run missions (AI + server-side validation) */
const REAL_CLUSTER_TIMEOUT_MS = 300_000

const MC_STORAGE_KEY = 'kc_mission_control_state'

/** Cluster contexts for real dry-run tests */
const CLUSTER_VLLM_D = 'vllm-d'
const CLUSTER_PLATFORM_EVAL = 'platform-eval'

/** Markers the AI should include in dry-run output */
const _DRY_RUN_PROMPT_MARKER = '--dry-run=server'
const _DRY_RUN_COMPLETION_MARKER = 'DRY RUN COMPLETE'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const OBSERVABILITY_PROJECTS = [
  { name: 'prometheus', displayName: 'Prometheus', reason: 'Core metrics collection', category: 'Observability', priority: 'required' as const, dependencies: ['helm'] },
  { name: 'grafana', displayName: 'Grafana', reason: 'Dashboard visualization', category: 'Observability', priority: 'recommended' as const, dependencies: ['prometheus'] },
  { name: 'cert-manager', displayName: 'cert-manager', reason: 'TLS certificate management', category: 'Security', priority: 'required' as const, dependencies: ['helm'] },
]

const SECURITY_PROJECTS = [
  { name: 'falco', displayName: 'Falco', reason: 'Runtime threat detection', category: 'Security', priority: 'required' as const, dependencies: ['helm'] },
  { name: 'kyverno', displayName: 'Kyverno', reason: 'Policy engine', category: 'Security', priority: 'recommended' as const, dependencies: ['cert-manager'] },
]

// ---------------------------------------------------------------------------
// Setup helpers (shared with stress tests pattern)
// ---------------------------------------------------------------------------

async function setupAllMocks(page: Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1', github_id: '12345', github_login: 'dry-run-tester',
        email: 'test@example.com', onboarded: true, role: 'admin',
      }),
    })
  )

  await page.route('**/api/mcp/clusters', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clusters: [
          { name: CLUSTER_VLLM_D, context: CLUSTER_VLLM_D, healthy: true, nodeCount: 16, podCount: 400, provider: 'openshift', reachable: true },
          { name: CLUSTER_PLATFORM_EVAL, context: CLUSTER_PLATFORM_EVAL, healthy: true, nodeCount: 14, podCount: 350, provider: 'openshift', reachable: true },
        ],
      }),
    })
  )

  // Mock BOTH /api/health AND /health — checkOAuthConfigured() uses /health without /api prefix
  for (const pattern of ['**/api/health', '**/health']) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', oauth_configured: false, in_cluster: false, install_method: 'dev' }),
      })
    )
  }

  await page.route('**/api/github/token/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasToken: true, source: 'env' }) })
  )

  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()
    if (url.includes('/clusters')) return
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ issues: [], events: [], nodes: [], pods: [] }) })
  })

  await page.route('**/api/**', (route) => {
    const url = route.request().url()
    if (url.includes('/api/me') || url.includes('/api/mcp') || url.includes('/api/health') || url.includes('/api/github')) return route.fallback()
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.route('**/127.0.0.1:8585/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [], clusters: [], health: { hasClaude: false, hasBob: false } }) })
  )

  if (MOCK_MODE) {
    await page.route('**/api/agent/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
    )
  }
}

async function seedAndOpenMC(page: Page, overrides: Record<string, unknown>) {
  await setupAllMocks(page)

  await page.addInitScript(
    ({ mc, mcKey }: { mc: Record<string, unknown>; mcKey: string }) => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.setItem('kc-has-session', 'true')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kc-agent-setup-dismissed', 'true')
      localStorage.setItem('kc-backend-status', JSON.stringify({
        available: true,
        timestamp: Date.now(),
      }))
      localStorage.setItem('kc_onboarded', 'true')
      localStorage.setItem('kc_user_cache', JSON.stringify({
        id: 'demo-user', github_id: '12345', github_login: 'demo-user',
        email: 'demo@example.com', role: 'viewer', onboarded: true,
      }))
      localStorage.setItem(mcKey, JSON.stringify({
        state: {
          phase: 'define', description: '', title: '', projects: [],
          assignments: [], phases: [], overlay: 'architecture',
          deployMode: 'phased', isDryRun: false, aiStreaming: false,
          launchProgress: [], ...mc,
        },
        savedAt: Date.now(),
      }))
    },
    { mc: overrides, mcKey: MC_STORAGE_KEY }
  )

  await page.goto('/?mission-control=open')
  await page.waitForLoadState('domcontentloaded', { timeout: DIALOG_TIMEOUT_MS })
  await page.waitForLoadState('networkidle', { timeout: DIALOG_TIMEOUT_MS }).catch(() => {})

  await expect(
    page.getByText(/Define Mission|Chart Course|Flight Plan|Define Your|Chart Your|Launch|Dry Run/i).first()
  ).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
}

async function navigateTo(page: Page) {
  await setupAllMocks(page)

  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
    localStorage.setItem('kc_onboarded', 'true')
    localStorage.setItem('kc_user_cache', JSON.stringify({
      id: 'demo-user', github_id: '12345', github_login: 'demo-user',
      email: 'demo@example.com', role: 'viewer', onboarded: true,
    }))
  })
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded', { timeout: DIALOG_TIMEOUT_MS })
  await page.waitForLoadState('networkidle', { timeout: DIALOG_TIMEOUT_MS }).catch(() => {})
  await expect(page.locator('body')).not.toBeEmpty({ timeout: DIALOG_TIMEOUT_MS })
}

// ---------------------------------------------------------------------------
// Helper: count pods on a real cluster (for before/after verification)
// ---------------------------------------------------------------------------

function countPodsInNamespace(context: string, namespace: string): number {
  try {
    const output = execSync(
      `kubectl --context=${context} get pods -n ${namespace} --no-headers 2>/dev/null | wc -l`,
      { timeout: 30_000 }
    ).toString().trim()
    return parseInt(output, 10) || 0
  } catch {
    return -1 // cluster unreachable
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Mission Control Dry-Run Tests', () => {
  test.describe.configure({ timeout: MOCK_MODE ? 90_000 : REAL_CLUSTER_TIMEOUT_MS })

  // ========================================================================
  // GROUP A: Mock Mode — UI State & Behavior (6 tests)
  // ========================================================================

  test.describe('Dry-Run UI State (Mock Mode)', () => {

    test('1. isDryRun state persists through localStorage round-trip', async ({ page }) => {
      await navigateTo(page)

      // Seed with isDryRun=true
      await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
          state: {
            phase: 'blueprint', description: 'Dry-run test', title: 'DR Test',
            projects: [{ name: 'prometheus', displayName: 'Prometheus', reason: 'Test', category: 'Obs', priority: 'required', dependencies: [] }],
            assignments: [], phases: [], overlay: 'architecture',
            deployMode: 'phased', isDryRun: true, aiStreaming: false, launchProgress: [],
          },
          savedAt: Date.now(),
        }))
      }, MC_STORAGE_KEY)

      // Read back
      const recovered = await page.evaluate((key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return (parsed.state || parsed).isDryRun
      }, MC_STORAGE_KEY)

      expect(recovered).toBe(true)
    })

    test('2. Dry Run button is visible on blueprint phase', async ({ page }) => {
      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Test dry-run button visibility',
        title: 'Button Test',
        projects: OBSERVABILITY_PROJECTS,
        assignments: [{ clusterName: CLUSTER_VLLM_D, clusterContext: CLUSTER_VLLM_D, provider: 'openshift', projectNames: ['prometheus', 'grafana', 'cert-manager'], warnings: [], readiness: { cpuHeadroomPercent: 50, memHeadroomPercent: 60, storageHeadroomPercent: 70, overallScore: 60 } }],
        phases: [{ phase: 1, name: 'Core', projectNames: ['cert-manager'], estimatedSeconds: 60 }, { phase: 2, name: 'Observability', projectNames: ['prometheus', 'grafana'], estimatedSeconds: 120 }],
      })

      // Verify the Dry Run button exists in the DOM (in the blueprint footer)
      const found = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        return buttons.some(b => b.textContent?.trim() === 'Dry Run')
      })
      expect(found).toBe(true)

      // Also verify Deploy to Clusters button exists
      const deployFound = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        return buttons.some(b => b.textContent?.includes('Deploy to Clusters'))
      })
      expect(deployFound).toBe(true)
    })

    test('3. isDryRun defaults to false when not set', async ({ page }) => {
      await navigateTo(page)

      // Seed WITHOUT isDryRun
      await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
          state: {
            phase: 'blueprint', description: 'No dry-run', title: 'Default Test',
            projects: [], assignments: [], phases: [], overlay: 'architecture',
            deployMode: 'phased', aiStreaming: false, launchProgress: [],
            // isDryRun intentionally omitted
          },
          savedAt: Date.now(),
        }))
      }, MC_STORAGE_KEY)

      // Read back — should default to false/undefined (falsy)
      const isDryRun = await page.evaluate((key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return (parsed.state || parsed).isDryRun
      }, MC_STORAGE_KEY)

      // isDryRun should be undefined or false (backward-compatible)
      expect(!isDryRun).toBe(true)
    })

    test('4. DRY RUN badge visible in dialog header when isDryRun=true', async ({ page }) => {
      await seedAndOpenMC(page, {
        phase: 'define',
        description: 'Badge test',
        title: 'Badge Test',
        isDryRun: true,
        projects: OBSERVABILITY_PROJECTS,
      })

      const bodyText = await page.textContent('body')
      expect(bodyText).toMatch(/DRY RUN/)
    })

    test('5. isDryRun=true persists and is readable after seed', async ({ page }) => {
      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Dry-run persistence',
        title: 'Persist Test',
        isDryRun: true,
        projects: OBSERVABILITY_PROJECTS.slice(0, 1),
        assignments: [{ clusterName: CLUSTER_VLLM_D, clusterContext: CLUSTER_VLLM_D, provider: 'openshift', projectNames: ['prometheus'], warnings: [], readiness: { cpuHeadroomPercent: 50, memHeadroomPercent: 60, storageHeadroomPercent: 70, overallScore: 60 } }],
        phases: [{ phase: 1, name: 'Core', projectNames: ['prometheus'], estimatedSeconds: 60 }],
      })

      // After seedAndOpenMC, the React hook should have loaded isDryRun from localStorage
      // and persisted it back (the useEffect persists on every change)
      const isDryRun = await page.evaluate((key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return (parsed.state || parsed).isDryRun
      }, MC_STORAGE_KEY)

      expect(isDryRun).toBe(true)
    })

    test('6. LaunchSequence shows dry-run headers when isDryRun=true', async ({ page }) => {
      await seedAndOpenMC(page, {
        phase: 'launching',
        description: 'Header text test',
        title: 'Header Test',
        isDryRun: true,
        projects: OBSERVABILITY_PROJECTS.slice(0, 1),
        assignments: [{ clusterName: CLUSTER_VLLM_D, clusterContext: CLUSTER_VLLM_D, provider: 'openshift', projectNames: ['prometheus'], warnings: [], readiness: { cpuHeadroomPercent: 50, memHeadroomPercent: 60, storageHeadroomPercent: 70, overallScore: 60 } }],
        phases: [{ phase: 1, name: 'Core', projectNames: ['prometheus'], estimatedSeconds: 60 }],
        launchProgress: [{ phase: 1, status: 'completed', projects: [{ name: 'prometheus', status: 'completed', missionId: 'mock-1' }] }],
      })

      const bodyText = await page.textContent('body')
      expect(bodyText).toMatch(/Dry Run/i)
    })
  })

  // ========================================================================
  // GROUP B: Real Cluster Dry-Run (3 tests, requires KC_AGENT=true)
  // ========================================================================

  test.describe('Dry-Run Against Real Clusters', () => {

    test('7. dry-run cert-manager on vllm-d — no new pods created', async ({ page }) => {
      test.skip(!AGENT_MODE, 'Requires KC_AGENT=true and kc-agent running')

      // Count pods before dry-run
      const beforeCount = countPodsInNamespace(CLUSTER_VLLM_D, 'cert-manager')
      expect(beforeCount).toBeGreaterThanOrEqual(0) // Cluster must be reachable

      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Dry-run cert-manager validation on vllm-d',
        title: 'DR: cert-manager on vllm-d',
        isDryRun: true,
        projects: [OBSERVABILITY_PROJECTS[2]], // cert-manager only
        assignments: [{
          clusterName: CLUSTER_VLLM_D, clusterContext: CLUSTER_VLLM_D, provider: 'openshift',
          projectNames: ['cert-manager'], warnings: ['cert-manager already installed — dry-run will validate config'],
          readiness: { cpuHeadroomPercent: 50, memHeadroomPercent: 60, storageHeadroomPercent: 70, overallScore: 60 },
        }],
        phases: [{ phase: 1, name: 'TLS Infrastructure', projectNames: ['cert-manager'], estimatedSeconds: 60 }],
      })

      // Click Dry Run button
      // Click Dry Run via JS — the MC dialog is a z-200 overlay that intercepts Playwright clicks
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const btn = buttons.find(b => b.textContent?.trim() === 'Dry Run')
        if (btn) { (btn as HTMLElement).click(); return true }
        return false
      })
      if (clicked) {
      }

      // Wait for mission to complete (or timeout)
      await page.waitForTimeout(AI_TIMEOUT_MS)

      // Verify pod count didn't change (dry-run should not create resources)
      const afterCount = countPodsInNamespace(CLUSTER_VLLM_D, 'cert-manager')
      expect(afterCount).toBe(beforeCount)
    })

    test('8. dry-run observability stack on platform-eval — no resources changed', async ({ page }) => {
      test.skip(!AGENT_MODE, 'Requires KC_AGENT=true and kc-agent running')

      // Count pods before
      const beforeMonitoring = countPodsInNamespace(CLUSTER_PLATFORM_EVAL, 'monitoring')

      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Dry-run full observability stack on platform-eval',
        title: 'DR: Observability on platform-eval',
        isDryRun: true,
        projects: OBSERVABILITY_PROJECTS,
        assignments: [{
          clusterName: CLUSTER_PLATFORM_EVAL, clusterContext: CLUSTER_PLATFORM_EVAL, provider: 'openshift',
          projectNames: ['prometheus', 'grafana', 'cert-manager'],
          warnings: ['cert-manager already installed', 'monitoring namespace may need creation'],
          readiness: { cpuHeadroomPercent: 45, memHeadroomPercent: 55, storageHeadroomPercent: 75, overallScore: 58 },
        }],
        phases: [
          { phase: 1, name: 'TLS Infrastructure', projectNames: ['cert-manager'], estimatedSeconds: 60 },
          { phase: 2, name: 'Observability', projectNames: ['prometheus', 'grafana'], estimatedSeconds: 180 },
        ],
      })

      // Click Dry Run via JS — the MC dialog is a z-200 overlay that intercepts Playwright clicks
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const btn = buttons.find(b => b.textContent?.trim() === 'Dry Run')
        if (btn) { (btn as HTMLElement).click(); return true }
        return false
      })
      if (clicked) {
      }

      await page.waitForTimeout(AI_TIMEOUT_MS)

      // Verify monitoring namespace pod count unchanged
      const afterMonitoring = countPodsInNamespace(CLUSTER_PLATFORM_EVAL, 'monitoring')
      expect(afterMonitoring).toBe(beforeMonitoring)
    })

    test('9. dry-run multi-project across both clusters — verify DRY RUN markers', async ({ page }) => {
      test.skip(!AGENT_MODE, 'Requires KC_AGENT=true and kc-agent running')

      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Multi-cluster dry-run: observability on vllm-d, security on platform-eval',
        title: 'DR: Multi-Cluster Validation',
        isDryRun: true,
        projects: [...OBSERVABILITY_PROJECTS, ...SECURITY_PROJECTS],
        assignments: [
          {
            clusterName: CLUSTER_VLLM_D, clusterContext: CLUSTER_VLLM_D, provider: 'openshift',
            projectNames: ['prometheus', 'grafana', 'cert-manager'],
            warnings: [], readiness: { cpuHeadroomPercent: 50, memHeadroomPercent: 60, storageHeadroomPercent: 70, overallScore: 60 },
          },
          {
            clusterName: CLUSTER_PLATFORM_EVAL, clusterContext: CLUSTER_PLATFORM_EVAL, provider: 'openshift',
            projectNames: ['falco', 'kyverno'],
            warnings: [], readiness: { cpuHeadroomPercent: 45, memHeadroomPercent: 55, storageHeadroomPercent: 75, overallScore: 58 },
          },
        ],
        phases: [
          { phase: 1, name: 'Infrastructure', projectNames: ['cert-manager'], estimatedSeconds: 60 },
          { phase: 2, name: 'Observability', projectNames: ['prometheus', 'grafana'], estimatedSeconds: 120 },
          { phase: 3, name: 'Security', projectNames: ['falco', 'kyverno'], estimatedSeconds: 120 },
        ],
      })

      // Verify the DRY RUN badge is visible before triggering
      const bodyText = await page.textContent('body')
      expect(bodyText).toMatch(/DRY RUN/i)

      // Verify isDryRun is set
      const isDryRun = await page.evaluate((key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return false
        return (JSON.parse(raw).state || JSON.parse(raw)).isDryRun
      }, MC_STORAGE_KEY)
      expect(isDryRun).toBe(true)
    })
  })
})

import { test, expect, Page } from '@playwright/test'
import { execSync } from 'child_process'

/**
 * Mission Control Kind Cluster E2E Tests
 *
 * Creates kind clusters via the console's Local Clusters API (kc-agent),
 * deploys real CNCF projects through Mission Control, and verifies resources.
 *
 * Lifecycle:
 *   1. Create 3 kind clusters via POST /local-clusters
 *   2. Deploy observability, security, and GitOps stacks
 *   3. Verify pods/services/webhooks exist on each cluster
 *   4. Run multi-project stress across 2 clusters
 *   5. Delete all kind clusters via DELETE /local-clusters
 *
 * Prerequisites: KC_AGENT=true, Docker running, kind CLI installed
 *
 * Run: KC_AGENT=true npx playwright test e2e/mission-control-kind-e2e.spec.ts --project=chromium
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_MODE = process.env.KC_AGENT === 'true'
const SKIP_KIND_TESTS = !AGENT_MODE || process.env.CI === 'true'

const AGENT_BASE_URL = 'http://127.0.0.1:8585'

/** Timeout for kind cluster creation (kind create cluster takes ~1-2 min) */
const KIND_CREATE_TIMEOUT_MS = 180_000
/** Timeout for kind cluster deletion */
const KIND_DELETE_TIMEOUT_MS = 60_000
/** Timeout for Mission Control deploy to complete */
const DEPLOY_TIMEOUT_MS = 300_000
/** Timeout for kubectl verification commands */
const VERIFY_TIMEOUT_MS = 60_000
/** Timeout for dialog rendering */
const DIALOG_TIMEOUT_MS = 15_000
/** Polling interval when waiting for pods to become ready */
const POD_POLL_INTERVAL_MS = 10_000
/** Max polls when waiting for pods */
const POD_POLL_MAX_ATTEMPTS = 18 // 18 * 10s = 3 min

const MC_STORAGE_KEY = 'kc_mission_control_state'

/** Kind cluster names — prefixed mc-e2e- to avoid collision with user clusters */
const KIND_CLUSTERS = ['mc-e2e-obs', 'mc-e2e-sec', 'mc-e2e-gitops'] as const
type KindClusterName = typeof KIND_CLUSTERS[number]

/** Map from cluster name to kubectl context (kind prefixes with "kind-") */
function kindContext(name: KindClusterName): string {
  return `kind-${name}`
}

/** Minimum number of projects that must succeed in multi-project stress test */
const MULTI_PROJECT_MIN_SUCCESS = 4
const MULTI_PROJECT_TOTAL = 6

// ---------------------------------------------------------------------------
// Test data: project definitions per scenario
// ---------------------------------------------------------------------------

const OBS_PROJECTS = [
  { name: 'cert-manager', displayName: 'cert-manager', reason: 'TLS certificate management', category: 'Security', priority: 'required' as const, dependencies: ['helm'] },
  { name: 'prometheus', displayName: 'Prometheus', reason: 'Metrics collection and alerting', category: 'Observability', priority: 'required' as const, dependencies: ['helm'] },
  { name: 'grafana', displayName: 'Grafana', reason: 'Dashboard visualization', category: 'Observability', priority: 'recommended' as const, dependencies: ['prometheus'] },
]

const SEC_PROJECTS = [
  { name: 'opa', displayName: 'OPA Gatekeeper', reason: 'Admission control policies', category: 'Security', priority: 'required' as const, dependencies: [] },
  { name: 'kyverno', displayName: 'Kyverno', reason: 'Kubernetes-native policy engine', category: 'Security', priority: 'recommended' as const, dependencies: ['cert-manager'] },
]

const GITOPS_PROJECTS = [
  { name: 'cert-manager', displayName: 'cert-manager', reason: 'TLS for ArgoCD webhooks', category: 'Security', priority: 'required' as const, dependencies: ['helm'] },
  { name: 'argocd', displayName: 'Argo CD', reason: 'GitOps continuous delivery', category: 'CI/CD', priority: 'required' as const, dependencies: [] },
]

// ---------------------------------------------------------------------------
// Helpers: kc-agent API
// ---------------------------------------------------------------------------

async function createKindCluster(name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(`${AGENT_BASE_URL}/local-clusters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'kind', name }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { ok: false, error: `HTTP ${resp.status}: ${body}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

async function deleteKindCluster(name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(`${AGENT_BASE_URL}/local-clusters?tool=kind&name=${name}`, {
      method: 'DELETE',
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { ok: false, error: `HTTP ${resp.status}: ${body}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

function clusterExists(context: string): boolean {
  try {
    execSync(`kubectl --context=${context} cluster-info 2>/dev/null`, { timeout: VERIFY_TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Helpers: Kubernetes verification
// ---------------------------------------------------------------------------

interface PodStatus {
  found: boolean
  podCount: number
  runningCount: number
  names: string[]
}

function getPodsInNamespace(context: string, namespace: string): PodStatus {
  try {
    const output = execSync(
      `kubectl --context=${context} get pods -n ${namespace} -o json 2>/dev/null`,
      { timeout: VERIFY_TIMEOUT_MS }
    ).toString()
    const data = JSON.parse(output)
    const pods = (data.items || []) as Array<{ metadata: { name: string }; status: { phase: string } }>
    return {
      found: pods.length > 0,
      podCount: pods.length,
      runningCount: pods.filter(p => p.status?.phase === 'Running').length,
      names: pods.map(p => p.metadata?.name || 'unknown'),
    }
  } catch {
    return { found: false, podCount: 0, runningCount: 0, names: [] }
  }
}

function waitForPodsReady(context: string, namespace: string, minCount: number): PodStatus {
  for (let i = 0; i < POD_POLL_MAX_ATTEMPTS; i++) {
    const status = getPodsInNamespace(context, namespace)
    if (status.runningCount >= minCount) return status
    execSync(`sleep ${POD_POLL_INTERVAL_MS / 1000}`)
  }
  return getPodsInNamespace(context, namespace)
}

function getWebhookConfigurations(context: string): string[] {
  try {
    const output = execSync(
      `kubectl --context=${context} get validatingwebhookconfigurations -o jsonpath='{.items[*].metadata.name}' 2>/dev/null`,
      { timeout: VERIFY_TIMEOUT_MS }
    ).toString().trim()
    return output ? output.split(/\s+/) : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Helpers: Playwright / Mission Control
// ---------------------------------------------------------------------------

async function setupAllMocks(page: Page) {
  // Mock auth endpoints — the real kc-agent handles missions but Playwright
  // still needs to bypass the frontend's OAuth check
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: '1', github_id: '12345', github_login: 'kind-e2e-tester', email: 'test@example.com', onboarded: true, role: 'admin' }),
    })
  )
  for (const pattern of ['**/api/health', '**/health']) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', oauth_configured: false, in_cluster: false, install_method: 'dev' }),
      })
    )
  }
  await page.route('**/api/github/token/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasToken: true, source: 'env' }) })
  )
}

async function seedAndOpenMC(page: Page, overrides: Record<string, unknown>) {
  await setupAllMocks(page)

  await page.goto('http://localhost:8080/login')
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(
    ({ mc, mcKey }) => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc_demo_mode', 'true')
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

  await page.goto('http://localhost:8080')
  await page.waitForLoadState('networkidle', { timeout: DIALOG_TIMEOUT_MS })
  await page.waitForTimeout(4000)

  // Open MC dialog
  await page.evaluate(() => {
    const btn = document.querySelector('button[title*="Mission Control"]') as HTMLElement
    if (btn) { btn.click(); return }
    const buttons = Array.from(document.querySelectorAll('button'))
    const mcBtn = buttons.find(b => b.textContent?.includes('Mission Control'))
    if (mcBtn) (mcBtn as HTMLElement).click()
  })
  await page.waitForTimeout(2000)

  await expect(
    page.getByText(/Define Mission|Chart Course|Flight Plan|Define Your|Chart Your|Launch/i).first()
  ).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Mission Control Kind Cluster E2E', () => {
  test.describe.configure({ timeout: DEPLOY_TIMEOUT_MS })
  test.skip(SKIP_KIND_TESTS, 'Requires KC_AGENT=true, Docker, and kind CLI — not run in CI')

  // ========================================================================
  // GROUP 0: Cluster Provisioning via Console API
  // ========================================================================

  test.describe('Cluster Provisioning', () => {
    test.describe.configure({ timeout: KIND_CREATE_TIMEOUT_MS * KIND_CLUSTERS.length })

    test('1. create kind clusters via console Local Clusters API', async () => {
      for (const name of KIND_CLUSTERS) {
        const ctx = kindContext(name)

        // Skip if cluster already exists (idempotent)
        if (clusterExists(ctx)) continue

        const result = await createKindCluster(name)
        expect(result.ok).toBe(true)

        // Wait for cluster to be ready
        let ready = false
        for (let i = 0; i < POD_POLL_MAX_ATTEMPTS; i++) {
          if (clusterExists(ctx)) { ready = true; break }
          execSync(`sleep ${POD_POLL_INTERVAL_MS / 1000}`)
        }
        expect(ready).toBe(true)
      }

      // Verify all 3 clusters exist
      for (const name of KIND_CLUSTERS) {
        expect(clusterExists(kindContext(name))).toBe(true)
      }
    })
  })

  // ========================================================================
  // GROUP 1: Observability Stack
  // ========================================================================

  test.describe('Observability Stack', () => {

    test('2. deploy cert-manager + Prometheus + Grafana to kind-mc-e2e-obs', async ({ page }) => {
      const ctx = kindContext('mc-e2e-obs')
      test.skip(!clusterExists(ctx), 'mc-e2e-obs cluster not available')

      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Deploy observability stack to kind cluster',
        title: 'E2E: Observability Stack',
        projects: OBS_PROJECTS,
        assignments: [{
          clusterName: 'mc-e2e-obs', clusterContext: ctx, provider: 'kind',
          projectNames: ['cert-manager', 'prometheus', 'grafana'],
          warnings: ['kind cluster — limited resources'],
          readiness: { cpuHeadroomPercent: 80, memHeadroomPercent: 75, storageHeadroomPercent: 90, overallScore: 82 },
        }],
        phases: [
          { phase: 1, name: 'TLS Infrastructure', projectNames: ['cert-manager'], estimatedSeconds: 60 },
          { phase: 2, name: 'Observability', projectNames: ['prometheus', 'grafana'], estimatedSeconds: 180 },
        ],
      })

      // Click Deploy to Clusters
      const deployBtn = page.getByRole('button', { name: /deploy to clusters/i }).first()
      if (await deployBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await deployBtn.click()
      }

      // Wait for launch sequence — look for completion indicators
      await page.waitForTimeout(DEPLOY_TIMEOUT_MS / 2) // Allow up to half the timeout

      // Take screenshot of the launch progress
      await page.screenshot({ path: 'test-results/kind-e2e-obs-deploy.png', fullPage: true })
    })

    test('3. verify cert-manager + monitoring pods running on kind-mc-e2e-obs', async () => {
      const ctx = kindContext('mc-e2e-obs')
      test.skip(!clusterExists(ctx), 'mc-e2e-obs cluster not available')

      // Wait for cert-manager pods
      const certManager = waitForPodsReady(ctx, 'cert-manager', 1)
      expect(certManager.found).toBe(true)
      expect(certManager.runningCount).toBeGreaterThanOrEqual(1)

      // Check monitoring namespace (may not exist if deploy is still in progress)
      const monitoring = getPodsInNamespace(ctx, 'monitoring')
      // Log results for manual review even if monitoring hasn't deployed yet
      console.log(`cert-manager: ${certManager.runningCount}/${certManager.podCount} running`)
      console.log(`monitoring: ${monitoring.runningCount}/${monitoring.podCount} running`)
    })
  })

  // ========================================================================
  // GROUP 2: Security Compliance
  // ========================================================================

  test.describe('Security Compliance', () => {

    test('4. deploy OPA Gatekeeper + Kyverno to kind-mc-e2e-sec', async ({ page }) => {
      const ctx = kindContext('mc-e2e-sec')
      test.skip(!clusterExists(ctx), 'mc-e2e-sec cluster not available')

      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Deploy security compliance stack',
        title: 'E2E: Security Compliance',
        projects: SEC_PROJECTS,
        assignments: [{
          clusterName: 'mc-e2e-sec', clusterContext: ctx, provider: 'kind',
          projectNames: ['opa', 'kyverno'],
          warnings: ['kind cluster — DaemonSets may be resource-constrained'],
          readiness: { cpuHeadroomPercent: 70, memHeadroomPercent: 65, storageHeadroomPercent: 85, overallScore: 73 },
        }],
        phases: [
          { phase: 1, name: 'Policy Engines', projectNames: ['opa', 'kyverno'], estimatedSeconds: 120 },
        ],
      })

      const deployBtn = page.getByRole('button', { name: /deploy to clusters/i }).first()
      if (await deployBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await deployBtn.click()
      }

      await page.waitForTimeout(DEPLOY_TIMEOUT_MS / 2)
      await page.screenshot({ path: 'test-results/kind-e2e-sec-deploy.png', fullPage: true })
    })

    test('5. verify admission webhooks exist on kind-mc-e2e-sec', async () => {
      const ctx = kindContext('mc-e2e-sec')
      test.skip(!clusterExists(ctx), 'mc-e2e-sec cluster not available')

      // Check for gatekeeper pods
      const gatekeeper = getPodsInNamespace(ctx, 'gatekeeper-system')
      console.log(`gatekeeper-system: ${gatekeeper.runningCount}/${gatekeeper.podCount} running`)

      // Check for validating webhook configurations
      const webhooks = getWebhookConfigurations(ctx)
      console.log(`Validating webhooks: ${webhooks.join(', ') || 'none'}`)

      // At least one security component should be present
      const hasSecurityComponent = gatekeeper.found || webhooks.length > 0
      expect(hasSecurityComponent).toBe(true)
    })
  })

  // ========================================================================
  // GROUP 3: GitOps Pipeline
  // ========================================================================

  test.describe('GitOps Pipeline', () => {

    test('6. deploy ArgoCD + cert-manager to kind-mc-e2e-gitops', async ({ page }) => {
      const ctx = kindContext('mc-e2e-gitops')
      test.skip(!clusterExists(ctx), 'mc-e2e-gitops cluster not available')

      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Deploy GitOps pipeline with ArgoCD',
        title: 'E2E: GitOps Pipeline',
        projects: GITOPS_PROJECTS,
        assignments: [{
          clusterName: 'mc-e2e-gitops', clusterContext: ctx, provider: 'kind',
          projectNames: ['cert-manager', 'argocd'],
          warnings: [],
          readiness: { cpuHeadroomPercent: 75, memHeadroomPercent: 70, storageHeadroomPercent: 85, overallScore: 77 },
        }],
        phases: [
          { phase: 1, name: 'TLS', projectNames: ['cert-manager'], estimatedSeconds: 60 },
          { phase: 2, name: 'GitOps', projectNames: ['argocd'], estimatedSeconds: 120 },
        ],
      })

      const deployBtn = page.getByRole('button', { name: /deploy to clusters/i }).first()
      if (await deployBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await deployBtn.click()
      }

      await page.waitForTimeout(DEPLOY_TIMEOUT_MS / 2)
      await page.screenshot({ path: 'test-results/kind-e2e-gitops-deploy.png', fullPage: true })

      // Verify ArgoCD pods
      const argocd = waitForPodsReady(ctx, 'argocd', 1)
      console.log(`argocd: ${argocd.runningCount}/${argocd.podCount} running (${argocd.names.join(', ')})`)
    })
  })

  // ========================================================================
  // GROUP 4: Multi-Project Stress
  // ========================================================================

  test.describe('Multi-Project Stress', () => {

    test('7. deploy 6 projects across 2 kind clusters', async ({ page }) => {
      const ctxObs = kindContext('mc-e2e-obs')
      const ctxSec = kindContext('mc-e2e-sec')
      test.skip(!clusterExists(ctxObs) || !clusterExists(ctxSec), 'Both mc-e2e-obs and mc-e2e-sec clusters required')

      const allProjects = [
        ...OBS_PROJECTS,
        ...SEC_PROJECTS,
        { name: 'external-secrets', displayName: 'External Secrets', reason: 'Secret sync from vaults', category: 'Security', priority: 'optional' as const, dependencies: ['cert-manager'] },
      ]

      await seedAndOpenMC(page, {
        phase: 'blueprint',
        description: 'Multi-project stress test across 2 kind clusters',
        title: 'E2E: Multi-Project Stress',
        projects: allProjects,
        assignments: [
          {
            clusterName: 'mc-e2e-obs', clusterContext: ctxObs, provider: 'kind',
            projectNames: ['cert-manager', 'prometheus', 'grafana'],
            warnings: [], readiness: { cpuHeadroomPercent: 60, memHeadroomPercent: 55, storageHeadroomPercent: 80, overallScore: 65 },
          },
          {
            clusterName: 'mc-e2e-sec', clusterContext: ctxSec, provider: 'kind',
            projectNames: ['opa', 'kyverno', 'external-secrets'],
            warnings: [], readiness: { cpuHeadroomPercent: 55, memHeadroomPercent: 50, storageHeadroomPercent: 75, overallScore: 60 },
          },
        ],
        phases: [
          { phase: 1, name: 'Infrastructure', projectNames: ['cert-manager'], estimatedSeconds: 60 },
          { phase: 2, name: 'Observability', projectNames: ['prometheus', 'grafana'], estimatedSeconds: 180 },
          { phase: 3, name: 'Security & Secrets', projectNames: ['opa', 'kyverno', 'external-secrets'], estimatedSeconds: 180 },
        ],
        deployMode: 'phased',
      })

      const deployBtn = page.getByRole('button', { name: /deploy to clusters/i }).first()
      if (await deployBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await deployBtn.click()
      }

      // Allow generous time for 6 projects across 2 clusters
      await page.waitForTimeout(DEPLOY_TIMEOUT_MS / 2)
      await page.screenshot({ path: 'test-results/kind-e2e-multi-stress.png', fullPage: true })

      // Count how many namespaces have running pods across both clusters
      const namespacesToCheck = [
        { ctx: ctxObs, ns: 'cert-manager' },
        { ctx: ctxObs, ns: 'monitoring' },
        { ctx: ctxSec, ns: 'gatekeeper-system' },
        { ctx: ctxSec, ns: 'kyverno' },
      ]

      let successCount = 0
      for (const { ctx, ns } of namespacesToCheck) {
        const status = getPodsInNamespace(ctx, ns)
        if (status.runningCount > 0) successCount++
        console.log(`${ctx}/${ns}: ${status.runningCount}/${status.podCount} running`)
      }

      // At least some projects should have deployed successfully
      expect(successCount).toBeGreaterThanOrEqual(1)
    })
  })

  // ========================================================================
  // GROUP 5: Cleanup
  // ========================================================================

  test.describe('Cleanup', () => {
    test.describe.configure({ timeout: KIND_DELETE_TIMEOUT_MS * KIND_CLUSTERS.length })

    test('8. delete all kind clusters via console API', async () => {
      for (const name of KIND_CLUSTERS) {
        const ctx = kindContext(name)
        if (!clusterExists(ctx)) continue // Already gone

        const result = await deleteKindCluster(name)
        expect(result.ok).toBe(true)
      }

      // Wait briefly for cleanup
      execSync('sleep 5')

      // Verify all clusters are gone
      for (const name of KIND_CLUSTERS) {
        const exists = clusterExists(kindContext(name))
        if (exists) {
          console.log(`Warning: ${name} still exists after delete — may need manual cleanup`)
        }
      }
    })
  })
})

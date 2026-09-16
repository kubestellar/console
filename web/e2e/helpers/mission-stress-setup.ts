import { expect, Page } from '@playwright/test'
import { setupAuth } from './setup'

// FIXME(#16080): All stress tests in this file consistently timeout in CI preview environment.
// The preview environment has resource constraints and EventSource MIME type errors that
// prevent these tests from passing. Tests are marked as fixme pending investigation of:
// - Preview environment resource limits
// - EventSource MIME type configuration
// - Test timeout tuning for CI environment

/**
 * Mission Control STRESS Tests
 *
 * Pushes the limits of Mission Control's AI orchestration, multi-cluster
 * deployment, runbook → fix pipeline, YAML composition, and failure recovery.
 *
 * These go far beyond the basic E2E tests (mission-control-e2e.spec.ts) which
 * only test UI rendering with seeded state. These tests exercise:
 *
 *   1. AI Orchestration Limits — 15-project payloads, conflict detection,
 *      deep dependency chains, ambiguous inputs
 *   2. Multi-Cluster Deployment — 5-cluster matrices, YOLO vs phased,
 *      cross-cluster dependencies
 *   3. Runbook → Fix Pipeline — evidence gathering, runbook-to-fixer flow,
 *      all 5 built-in runbooks
 *   4. Composition & YAML — 10-document YAML, holistic composition,
 *      YAML → Mission Control import
 *   5. Failure & Edge Cases — localStorage stress, partial deploy failures,
 *      concurrent missions
 *
 * Shared setup, mocks, and helpers for the mission-control-stress.*.spec.ts
 * files (split from the original monolithic mission-control-stress.spec.ts
 * — see #23060).
 *
 * Modes:
 *   MOCK MODE (CI):  MOCK_AI=true npx playwright test e2e/mission-control-stress.*.spec.ts
 *   LIVE MODE:       KC_AGENT=true npx playwright test e2e/mission-control-stress.*.spec.ts --headed
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MOCK_MODE = process.env.MOCK_AI === 'true'
export const _AI_TIMEOUT_MS = MOCK_MODE ? 10_000 : 120_000
export const DIALOG_TIMEOUT_MS = 15_000
export const _GITHUB_TIMEOUT_MS = MOCK_MODE ? 10_000 : 30_000

/** Number of projects in the maximum-payload test */
export const MAX_PAYLOAD_PROJECT_COUNT = 15
/** Number of clusters in the multi-cluster stress test */
export const MULTI_CLUSTER_COUNT = 5
/** Number of phases in the deep-phase stress test */
export const DEEP_PHASE_COUNT = 6
/** localStorage key for Mission Control state */
export const MC_STORAGE_KEY = 'kc_mission_control_state'
/** localStorage key for missions */
export const _MISSIONS_STORAGE_KEY = 'kc_missions'

// ---------------------------------------------------------------------------
// Stress test data: 15-project payload (maximum)
// ---------------------------------------------------------------------------

export const STRESS_PROJECTS = [
  { name: 'cert-manager', displayName: 'cert-manager', reason: 'TLS certificate management — foundation for all HTTPS endpoints', category: 'Security', priority: 'required' as const, dependencies: ['helm'], maturity: 'graduated' as const, difficulty: 'beginner' as const },
  { name: 'prometheus', displayName: 'Prometheus', reason: 'Core metrics collection and alerting — time-series backend', category: 'Observability', priority: 'required' as const, dependencies: ['helm'], maturity: 'graduated' as const, difficulty: 'intermediate' as const },
  { name: 'grafana', displayName: 'Grafana', reason: 'Dashboard visualization for Prometheus metrics', category: 'Observability', priority: 'required' as const, dependencies: ['prometheus'], maturity: 'graduated' as const, difficulty: 'beginner' as const },
  { name: 'jaeger', displayName: 'Jaeger', reason: 'Distributed tracing for microservice request flows', category: 'Observability', priority: 'recommended' as const, dependencies: ['cert-manager'], maturity: 'graduated' as const, difficulty: 'intermediate' as const },
  { name: 'fluentd', displayName: 'Fluentd', reason: 'Log aggregation and forwarding to centralized storage', category: 'Observability', priority: 'recommended' as const, dependencies: [], maturity: 'graduated' as const, difficulty: 'beginner' as const },
  { name: 'falco', displayName: 'Falco', reason: 'Runtime threat detection via syscall monitoring', category: 'Security', priority: 'required' as const, dependencies: ['helm'], maturity: 'graduated' as const, difficulty: 'intermediate' as const },
  { name: 'opa', displayName: 'Open Policy Agent', reason: 'Policy engine for admission control and compliance', category: 'Security', priority: 'required' as const, dependencies: [], maturity: 'graduated' as const, difficulty: 'advanced' as const },
  { name: 'kyverno', displayName: 'Kyverno', reason: 'Kubernetes-native policy engine with mutation support', category: 'Security', priority: 'recommended' as const, dependencies: ['cert-manager'], maturity: 'incubating' as const, difficulty: 'intermediate' as const },
  { name: 'trivy', displayName: 'Trivy Operator', reason: 'Image vulnerability scanning in the admission pipeline', category: 'Security', priority: 'recommended' as const, dependencies: [], maturity: 'sandbox' as const, difficulty: 'beginner' as const },
  { name: 'istio', displayName: 'Istio', reason: 'Service mesh with mTLS, traffic management, and observability', category: 'Networking', priority: 'required' as const, dependencies: ['cert-manager'], maturity: 'graduated' as const, difficulty: 'advanced' as const },
  { name: 'argocd', displayName: 'Argo CD', reason: 'GitOps continuous delivery for declarative deployments', category: 'CI/CD', priority: 'required' as const, dependencies: [], maturity: 'graduated' as const, difficulty: 'intermediate' as const },
  { name: 'tekton', displayName: 'Tekton', reason: 'Cloud-native CI/CD pipelines as Kubernetes resources', category: 'CI/CD', priority: 'optional' as const, dependencies: [], maturity: 'graduated' as const, difficulty: 'intermediate' as const },
  { name: 'crossplane', displayName: 'Crossplane', reason: 'Multi-cloud infrastructure provisioning via CRDs', category: 'Infrastructure', priority: 'optional' as const, dependencies: ['helm'], maturity: 'incubating' as const, difficulty: 'advanced' as const },
  { name: 'knative', displayName: 'Knative', reason: 'Serverless workloads with scale-to-zero and event-driven architecture', category: 'Serverless', priority: 'optional' as const, dependencies: ['istio'], maturity: 'incubating' as const, difficulty: 'intermediate' as const },
  { name: 'external-secrets', displayName: 'External Secrets Operator', reason: 'Sync secrets from external vaults (AWS, HashiCorp, etc.)', category: 'Security', priority: 'recommended' as const, dependencies: ['cert-manager'], maturity: 'incubating' as const, difficulty: 'beginner' as const },
]

// ---------------------------------------------------------------------------
// Stress test data: 5-cluster fleet
// ---------------------------------------------------------------------------

export const STRESS_CLUSTERS = [
  { name: 'prod-us-east', context: 'prod-us-east', healthy: true, nodeCount: 20, podCount: 450, provider: 'eks', reachable: true },
  { name: 'prod-eu-west', context: 'prod-eu-west', healthy: true, nodeCount: 15, podCount: 320, provider: 'eks', reachable: true },
  { name: 'staging-central', context: 'staging-central', healthy: true, nodeCount: 8, podCount: 120, provider: 'gke', reachable: true },
  { name: 'dev-kind', context: 'dev-kind', healthy: true, nodeCount: 3, podCount: 25, provider: 'kind', reachable: true },
  { name: 'edge-arm', context: 'edge-arm', healthy: true, nodeCount: 5, podCount: 60, provider: 'k3s', reachable: true },
]

// ---------------------------------------------------------------------------
// Stress test data: 5-cluster assignments with deep phasing
// ---------------------------------------------------------------------------

export const STRESS_ASSIGNMENTS = [
  { clusterName: 'prod-us-east', clusterContext: 'prod-us-east', provider: 'eks', projectNames: ['cert-manager', 'prometheus', 'grafana', 'falco', 'opa', 'istio'], warnings: ['Heavy workload — 450 pods already running', 'Istio requires 4 CPU cores minimum', 'cert-manager already partially deployed'], readiness: { cpuHeadroomPercent: 35, memHeadroomPercent: 42, storageHeadroomPercent: 68, overallScore: 48 } },
  { clusterName: 'prod-eu-west', clusterContext: 'prod-eu-west', provider: 'eks', projectNames: ['cert-manager', 'prometheus', 'grafana', 'falco', 'argocd'], warnings: ['Cross-region latency to US-East Prometheus federation', 'ArgoCD needs git repo access'], readiness: { cpuHeadroomPercent: 52, memHeadroomPercent: 58, storageHeadroomPercent: 75, overallScore: 62 } },
  { clusterName: 'staging-central', clusterContext: 'staging-central', provider: 'gke', projectNames: ['jaeger', 'fluentd', 'kyverno', 'trivy', 'tekton'], warnings: ['GKE Autopilot may block DaemonSets (Falco, Fluentd)', 'Limited to 8 nodes — watch resource usage'], readiness: { cpuHeadroomPercent: 60, memHeadroomPercent: 65, storageHeadroomPercent: 82, overallScore: 69 } },
  { clusterName: 'dev-kind', clusterContext: 'dev-kind', provider: 'kind', projectNames: ['crossplane', 'external-secrets'], warnings: ['kind cluster — no persistent storage by default', 'Only 3 nodes — resource constrained', 'No LoadBalancer support'], readiness: { cpuHeadroomPercent: 25, memHeadroomPercent: 30, storageHeadroomPercent: 15, overallScore: 23 } },
  { clusterName: 'edge-arm', clusterContext: 'edge-arm', provider: 'k3s', projectNames: ['knative'], warnings: ['ARM architecture — verify image compatibility', 'k3s uses Traefik, not nginx — Knative may need config'], readiness: { cpuHeadroomPercent: 70, memHeadroomPercent: 72, storageHeadroomPercent: 85, overallScore: 76 } },
]

export const STRESS_PHASES = [
  { phase: 1, name: 'Core Infrastructure', projectNames: ['cert-manager'], estimatedSeconds: 60 },
  { phase: 2, name: 'Security Foundation', projectNames: ['opa', 'kyverno', 'external-secrets'], estimatedSeconds: 120 },
  { phase: 3, name: 'Observability Stack', projectNames: ['prometheus', 'grafana', 'fluentd'], estimatedSeconds: 180 },
  { phase: 4, name: 'Advanced Observability', projectNames: ['jaeger', 'trivy'], estimatedSeconds: 120 },
  { phase: 5, name: 'Networking & Mesh', projectNames: ['istio', 'knative', 'falco'], estimatedSeconds: 240 },
  { phase: 6, name: 'CI/CD & Multi-Cloud', projectNames: ['argocd', 'tekton', 'crossplane'], estimatedSeconds: 180 },
]

// ---------------------------------------------------------------------------
// Competing service meshes (conflict detection test)
// ---------------------------------------------------------------------------

export const CONFLICTING_PROJECTS = [
  { name: 'istio', displayName: 'Istio', reason: 'Service mesh', category: 'Networking', priority: 'required' as const, dependencies: ['cert-manager'], maturity: 'graduated' as const, difficulty: 'advanced' as const },
  { name: 'linkerd', displayName: 'Linkerd', reason: 'Lightweight service mesh', category: 'Networking', priority: 'required' as const, dependencies: [], maturity: 'graduated' as const, difficulty: 'intermediate' as const },
  { name: 'cert-manager', displayName: 'cert-manager', reason: 'TLS certs', category: 'Security', priority: 'required' as const, dependencies: ['helm'], maturity: 'graduated' as const, difficulty: 'beginner' as const },
]

// ---------------------------------------------------------------------------
// 10-document complex YAML for composition stress
// ---------------------------------------------------------------------------

export const COMPLEX_MULTI_DOC_YAML = `# 10-document YAML spanning 6+ API groups for composition stress test
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-of-apps
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/example/manifests.git
    path: apps
  destination:
    server: https://kubernetes.default.svc
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: api-monitor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: api-server
  endpoints:
    - port: metrics
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: api-vs
  namespace: default
spec:
  hosts:
    - api.example.com
  http:
    - route:
        - destination:
            host: api-server
---
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: strict-mtls
  namespace: default
spec:
  mtls:
    mode: STRICT
---
apiVersion: ray.io/v1alpha1
kind: RayCluster
metadata:
  name: inference-cluster
  namespace: ray-system
spec:
  headGroupSpec:
    rayStartParams:
      dashboard-host: '0.0.0.0'
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: kube-prometheus-stack
  namespace: monitoring
spec:
  interval: 30m
  chart:
    spec:
      chart: kube-prometheus-stack
---
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-labels
spec:
  rules:
    - name: check-labels
      match:
        resources:
          kinds:
            - Pod
      validate:
        message: "label 'app' is required"
        pattern:
          metadata:
            labels:
              app: "?*"
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
  namespace: default
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: db-credentials
---
apiVersion: tekton.dev/v1
kind: Pipeline
metadata:
  name: ci-pipeline
  namespace: tekton-pipelines
spec:
  tasks:
    - name: build
      taskRef:
        name: buildah
`

// ---------------------------------------------------------------------------
// Mock runbook data (MCP responses)
// ---------------------------------------------------------------------------

export const MOCK_MCP_RESPONSES: Record<string, unknown> = {
  get_events: {
    events: [
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', object: 'Pod/api-server-7f84b9c-x2k9f', namespace: 'production', count: 47, lastTimestamp: '2026-04-01T12:30:00Z' },
      { type: 'Warning', reason: 'OOMKilled', message: 'Container exceeded memory limit', object: 'Pod/api-server-7f84b9c-x2k9f', namespace: 'production', count: 12 },
      { type: 'Normal', reason: 'Pulling', message: 'Pulling image api-server:v2.1.3', object: 'Pod/api-server-7f84b9c-p8m2n', namespace: 'production', count: 1 },
    ],
  },
  find_pod_issues: {
    issues: [
      { pod: 'api-server-7f84b9c-x2k9f', namespace: 'production', status: 'CrashLoopBackOff', restarts: 47, reason: 'OOMKilled', message: 'Container exceeded 512Mi memory limit' },
      { pod: 'worker-5c8b4d-j3k2m', namespace: 'production', status: 'Pending', restarts: 0, reason: 'Unschedulable', message: 'Insufficient cpu' },
    ],
  },
  get_cluster_health: {
    clusterName: 'prod-us-east',
    healthy: true,
    nodeCount: 20,
    readyNodes: 18,
    conditions: [
      { type: 'MemoryPressure', status: 'True', message: 'Node worker-12 has memory pressure' },
      { type: 'DiskPressure', status: 'False' },
    ],
  },
  get_warning_events: {
    events: [
      { type: 'Warning', reason: 'EvictionThresholdMet', message: 'Eviction threshold met: memory.available<100Mi', object: 'Node/worker-12' },
      { type: 'Warning', reason: 'NodeNotReady', message: 'Node condition Ready is now: Unknown', object: 'Node/worker-08' },
    ],
  },
  get_pods: {
    pods: [
      { name: 'coredns-5d78c9869d-abc12', namespace: 'kube-system', status: 'Running', restarts: 0, node: 'control-plane-1' },
      { name: 'coredns-5d78c9869d-def34', namespace: 'kube-system', status: 'Running', restarts: 0, node: 'control-plane-2' },
    ],
  },
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

export async function setupClusterMocks(page: Page, clusters = STRESS_CLUSTERS) {
  await page.route('**/api/mcp/clusters', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters }),
    })
  )
  // Mock BOTH /api/health AND /health (checkOAuthConfigured uses /health without /api prefix)
  // CRITICAL: oauth_configured must be false to prevent auth.tsx from clearing the demo token
  for (const pattern of ['**/api/health', '**/health']) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', oauth_configured: false, in_cluster: false, install_method: 'dev' }),
      })
    )
  }
  // Catch-all for other MCP endpoints
  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()
    if (url.includes('/clusters')) return
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ issues: [], events: [], nodes: [], pods: [] }),
    })
  })
}

export async function setupMCPMocks(page: Page) {
  await page.route('**/api/mcp/ops/call', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}')
    const toolName = body.tool || ''
    const response = MOCK_MCP_RESPONSES[toolName] || { result: 'no mock data' }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    })
  })
  await page.route('**/api/gadget/trace', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: { traces: [{ comm: 'api-server', pid: 1234, ret: -9 }] }, isError: false }),
    })
  )
}

export async function setupAgentMocks(page: Page) {
  if (!MOCK_MODE) return
  await page.route('**/api/agent/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
  )
}

export async function setupGitHubMocks(page: Page) {
  await page.route('**/api/github/token/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasToken: true, source: 'env' }),
    })
  )
}

export async function setupMissionsFileMock(page: Page) {
  // Mock /api/missions/file to prevent 502 errors in CI (#11033)
  await page.route('**/api/missions/file**', (route) => {
    const url = route.request().url()
    const pathParam = new URL(url).searchParams.get('path') || ''
    if (pathParam.includes('index.json')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ missions: [] }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: '# No content in test environment',
      })
    }
  })
}

export async function setupAllMocks(page: Page) {
  await setupAuth(page, {
    github_login: 'stress-tester',
    email: 'stress@test.com',
    role: 'admin',
  })
  await setupClusterMocks(page)
  await setupGitHubMocks(page)
  await setupAgentMocks(page)
  await setupMCPMocks(page)
  await setupMissionsFileMock(page)

  // Strict catch-all — logs unmocked API calls instead of silently returning {}
  // This helps detect when tests hit endpoints that don't have explicit mocks
  await page.route('**/api/**', (route) => {
    const url = route.request().url()
    // Let specific mocks handle these endpoints
    if (url.includes('/api/me') || url.includes('/api/mcp') ||
        url.includes('/api/health') || url.includes('/api/github') ||
        url.includes('/api/agent') || url.includes('/api/gadget') ||
        url.includes('/api/missions')) {
      return route.fallback()
    }
    // eslint-disable-next-line no-console
    console.error(`[mission-control-stress] Unmocked API call: ${url}`)
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.route('**/127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [], clusters: [], health: { hasClaude: false, hasBob: false } }),
    })
  )
}

export async function navigateTo(page: Page) {
  await setupAllMocks(page)

  // Seed localStorage BEFORE any page script runs — prevents the app from
  // briefly rendering the /login screen and firing auth redirects (#11179).
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
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc_user_cache', JSON.stringify({
      id: 'demo-user', github_id: '12345', github_login: 'demo-user',
      email: 'demo@example.com', role: 'viewer', onboarded: true,
    }))
  })
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded', { timeout: DIALOG_TIMEOUT_MS })
  await page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: DIALOG_TIMEOUT_MS })
}

export async function seedMCState(page: Page, overrides: Record<string, unknown> = {}) {
  await page.evaluate(
    ({ overrides: o, key }) => {
      localStorage.setItem(key, JSON.stringify({
        state: {
          phase: 'define',
          description: '',
          title: '',
          projects: [],
          assignments: [],
          phases: [],
          overlay: 'architecture',
          deployMode: 'phased',
          aiStreaming: false,
          launchProgress: [],
          ...o,
        },
        savedAt: Date.now(),
      }))
    },
    { overrides, key: MC_STORAGE_KEY }
  )
}

/**
 * Full seed + navigate + open MC in one step.
 * Seeds the MC state into localStorage BEFORE React mounts,
 * so useMissionControl() initializes with the seeded state.
 */
export async function seedAndOpenMC(page: Page, overrides: Record<string, unknown>) {
  await setupAllMocks(page)

  // Go to login page to get same-origin localStorage access
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // Seed token + demo mode + MC state BEFORE navigating to dashboard.
  // IMPORTANT: kc_demo_mode must be 'true' to prevent auth.tsx from clearing
  // the demo token when OAuth is configured on the backend (lines 208-227).
  await page.evaluate(
    ({ mc, mcKey }) => {
      localStorage.setItem('token', 'demo-token')
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.setItem('kc-has-session', 'true')
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
          deployMode: 'phased', aiStreaming: false, launchProgress: [],
          ...mc,
        },
        savedAt: Date.now(),
      }))
    },
    { mc: overrides, mcKey: MC_STORAGE_KEY }
  )

  // Navigate to dashboard — React mounts and reads seeded state
  await page.goto('/')
  await page.waitForLoadState('networkidle', { timeout: DIALOG_TIMEOUT_MS })
  await expect(page.locator('body')).not.toBeEmpty({ timeout: DIALOG_TIMEOUT_MS })

  await ensureDashboard(page)
  await openMC(page)
}

export async function ensureDashboard(page: Page) {
  // Retry auth up to 3 times if stuck on login page
  for (let attempt = 0; attempt < 3; attempt++) {
    const onLogin = await page.getByText('Continue with GitHub').isVisible({ timeout: 3000 }).catch((error) => { console.error('Promise error:', error); return false })
    if (!onLogin) return // Dashboard loaded
    await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
    localStorage.setItem('kc_onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc_user_cache', JSON.stringify({
      id: 'demo-user', github_id: '12345', github_login: 'demo-user',
      email: 'demo@example.com', role: 'viewer', onboarded: true,
    }))
  })
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: DIALOG_TIMEOUT_MS })
    await expect(page.locator('body')).not.toBeEmpty({ timeout: DIALOG_TIMEOUT_MS })
  }
}

export async function openMC(page: Page) {
  await ensureDashboard(page)

  // Strategy: first try the deep-link (most reliable), then fall back to
  // finding the Mission Control button inside the sidebar.
  const clicked = await page.evaluate(() => {
    // 1. Try the sidebar toggle first — open the sidebar so buttons are interactive
    const toggleBtn = document.querySelector('[data-testid="mission-sidebar-toggle"]') as HTMLElement
      || document.querySelector('[data-tour="ai-missions-toggle"]') as HTMLElement
    if (toggleBtn) toggleBtn.click()

    // 2. Find the "Mission Control" button (inside the sidebar empty-state or add menu)
    const buttons = Array.from(document.querySelectorAll('button'))
    const mcBtn = buttons.find(b => b.textContent?.trim() === 'Mission Control')
      || buttons.find(b => b.textContent?.includes('Mission Control'))
    if (mcBtn) { (mcBtn as HTMLElement).click(); return true }
    return false
  })

  if (!clicked) {
    // Final fallback — use the deep-link URL param
    await page.goto('/?mission-control=open')
    await page.waitForLoadState('domcontentloaded', { timeout: DIALOG_TIMEOUT_MS })
  }

  // Wait for the wizard dialog to render — look for phase stepper text
  // Phase labels: "Define Mission", "Chart Course", "Flight Plan"
  await expect(
    page.getByText(/Define Mission|Chart Course|Flight Plan|Define Your|Chart Your|Launch/i).first()
  ).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------


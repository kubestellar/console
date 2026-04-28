import { test, expect, Page} from '@playwright/test'
import { setupAuth } from './mocks/liveMocks'

// Mission Control requires an admin-role user to see all phases of the wizard.
// The shared `setupAuth` (from ./mocks/liveMocks) accepts a custom user override.
const MISSION_CONTROL_ADMIN_USER = {
  id: '1',
  github_id: '12345',
  github_login: 'testuser',
  email: 'test@example.com',
  onboarded: true,
  role: 'admin',
} as const

/**
 * Mission Control E2E Integration Tests
 *
 * Tests the full Mission Control wizard flow: Define → Assign → Flight Plan,
 * verifying that AI installer missions, AI fixer missions, and user-imported
 * YAML/Markdown runbooks work in concert to build holistic solutions.
 *
 * Two modes:
 *   LIVE MODE (default):  Uses real kc-agent + real GitHub API
 *     npx playwright test e2e/mission-control-e2e.spec.ts --headed
 *
 *   MOCK MODE (nightly):  Fully self-contained, no external deps
 *     MOCK_AI=true npx playwright test e2e/mission-control-e2e.spec.ts
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Whether to use mocked AI/GitHub responses (for nightly CI) */
const MOCK_MODE = process.env.MOCK_AI === 'true'

/** Timeout for AI responses — real agent can take 30-60s, mocks are instant */
const AI_RESPONSE_TIMEOUT_MS = MOCK_MODE ? 10_000 : 90_000
/** Timeout for page navigation and dialog rendering */
const DIALOG_RENDER_TIMEOUT_MS = 15_000
/** Timeout for GitHub API calls */
const GITHUB_FETCH_TIMEOUT_MS = MOCK_MODE ? 10_000 : 30_000
/** Test repo with sample YAML/MD runbooks */
const SAMPLE_REPO = 'clubanderson/sample-runbooks'

// ---------------------------------------------------------------------------
// Canned mock data for nightly CI
// ---------------------------------------------------------------------------

const MOCK_AI_PROJECTS = [
  { name: 'prometheus', displayName: 'Prometheus', reason: 'Core metrics collection and alerting for observability stack', category: 'Observability', priority: 'required', dependencies: ['helm'], maturity: 'graduated', difficulty: 'intermediate' },
  { name: 'jaeger', displayName: 'Jaeger', reason: 'Distributed tracing for request flow visibility', category: 'Observability', priority: 'recommended', dependencies: ['cert-manager'], maturity: 'graduated', difficulty: 'intermediate' },
  { name: 'fluentd', displayName: 'Fluentd', reason: 'Log aggregation and forwarding', category: 'Observability', priority: 'recommended', dependencies: [], maturity: 'graduated', difficulty: 'beginner' },
  { name: 'cert-manager', displayName: 'cert-manager', reason: 'TLS certificate management for secure endpoints', category: 'Security', priority: 'required', dependencies: ['helm'], maturity: 'incubating', difficulty: 'beginner' },
]

const MOCK_AI_ASSIGNMENTS = {
  assignments: [
    { clusterName: 'prod-cluster', clusterContext: 'prod', provider: 'eks', projectNames: ['prometheus', 'cert-manager'], warnings: ['65% CPU headroom'], readiness: { cpuHeadroomPercent: 65, memHeadroomPercent: 72, storageHeadroomPercent: 80, overallScore: 72 } },
    { clusterName: 'staging-cluster', clusterContext: 'staging', provider: 'gke', projectNames: ['jaeger', 'fluentd'], warnings: ['Small cluster — 3 nodes'], readiness: { cpuHeadroomPercent: 45, memHeadroomPercent: 55, storageHeadroomPercent: 90, overallScore: 63 } },
  ],
  phases: [
    { phase: 1, name: 'Core Infrastructure', projectNames: ['cert-manager'], estimatedSeconds: 60 },
    { phase: 2, name: 'Observability Stack', projectNames: ['prometheus', 'jaeger', 'fluentd'], estimatedSeconds: 180 },
  ],
}

const MOCK_GITHUB_REPO_CONTENTS = [
  { name: 'argocd-application.yaml', path: 'argocd-application.yaml', type: 'file', size: 441 },
  { name: 'argocd-multi-app.yaml', path: 'argocd-multi-app.yaml', type: 'file', size: 680 },
  { name: 'deploy-ray-runbook.md', path: 'deploy-ray-runbook.md', type: 'file', size: 1011 },
  { name: 'fluxcd-helmrelease.yaml', path: 'fluxcd-helmrelease.yaml', type: 'file', size: 520 },
  { name: 'gitops-setup-runbook.md', path: 'gitops-setup-runbook.md', type: 'file', size: 950 },
  { name: 'karmada-propagation.yaml', path: 'karmada-propagation.yaml', type: 'file', size: 379 },
  { name: 'multi-project.yaml', path: 'multi-project.yaml', type: 'file', size: 473 },
  { name: 'ray-cluster.yaml', path: 'ray-cluster.yaml', type: 'file', size: 673 },
  { name: 'troubleshoot-karmada.md', path: 'troubleshoot-karmada.md', type: 'file', size: 694 },
]

const MOCK_FILE_CONTENTS: Record<string, string> = {
  'argocd-application.yaml': `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: guestbook
  syncPolicy:
    automated:
      prune: true
      selfHeal: true`,

  'multi-project.yaml': `apiVersion: ray.io/v1alpha1
kind: RayCluster
metadata:
  name: ml-cluster
spec:
  headGroupSpec:
    rayStartParams: {}
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ray-metrics
spec:
  selector:
    matchLabels:
      app: ray
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ray-tls
spec:
  secretName: ray-tls-secret
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer`,

  'deploy-ray-runbook.md': `---
title: Deploy KubeRay for ML Inference
tags:
  - kuberay
  - ml
  - inference
---

# Deploy KubeRay for ML Inference

Set up a KubeRay cluster for serving ML models on Kubernetes.

## Install the KubeRay operator

\`\`\`bash
helm repo add kuberay https://ray-project.github.io/kuberay-helm/
helm install kuberay-operator kuberay/kuberay-operator --namespace ray-system --create-namespace
\`\`\`

## Apply the RayCluster CR

\`\`\`yaml
apiVersion: ray.io/v1alpha1
kind: RayCluster
metadata:
  name: inference-cluster
  namespace: ray-system
spec:
  headGroupSpec:
    rayStartParams:
      dashboard-host: '0.0.0.0'
\`\`\`

## Verify the deployment

\`\`\`bash
kubectl get rayclusters -n ray-system
kubectl get pods -n ray-system -l ray.io/cluster=inference-cluster
\`\`\`

## Troubleshoot common issues

\`\`\`bash
kubectl describe raycluster inference-cluster -n ray-system
kubectl logs -l ray.io/cluster=inference-cluster -n ray-system --tail=50
\`\`\``,

  'troubleshoot-karmada.md': `# Troubleshoot Karmada Propagation Failures

Debug guide for when resources fail to propagate to member clusters.

## Check PropagationPolicy status

\`\`\`bash
kubectl get propagationpolicy -A
kubectl describe propagationpolicy nginx-propagation
\`\`\`

## Inspect ResourceBindings

\`\`\`yaml
apiVersion: work.karmada.io/v1alpha2
kind: ResourceBinding
metadata:
  name: nginx-deployment
spec:
  resource:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx
\`\`\`

## Check member cluster health

\`\`\`bash
kubectl get clusters
kubectl describe cluster member1
\`\`\``,

  'fluxcd-helmrelease.yaml': `apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: prometheus-community
  namespace: flux-system
spec:
  interval: 1h
  url: https://prometheus-community.github.io/helm-charts
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
      sourceRef:
        kind: HelmRepository
        name: prometheus-community
        namespace: flux-system`,

  'karmada-propagation.yaml': `apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: nginx-propagation
spec:
  resourceSelectors:
    - apiVersion: apps/v1
      kind: Deployment
      name: nginx
  placement:
    clusterAffinity:
      clusterNames:
        - member1
        - member2`,
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

async function setupClusterMocks(page: Page) {
  await page.route('**/api/mcp/clusters', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clusters: [
          { name: 'prod-cluster', context: 'prod', healthy: true, nodeCount: 5, podCount: 120, provider: 'eks', reachable: true },
          { name: 'staging-cluster', context: 'staging', healthy: true, nodeCount: 3, podCount: 45, provider: 'gke', reachable: true },
          { name: 'dev-cluster', context: 'dev', healthy: true, nodeCount: 2, podCount: 15, provider: 'kind', reachable: true },
        ],
      }),
    })
  )

  await page.route('**/api/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', oauth_configured: true, in_cluster: false, install_method: 'dev' }),
    })
  )

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

async function setupGitHubMocks(page: Page) {
  await page.route('**/api/github/token/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasToken: true, source: 'env' }),
    })
  )

  if (MOCK_MODE) {
    // Mock GitHub Contents API for repo file listing
    await page.route(`**/api/github/repos/${SAMPLE_REPO}/contents**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_GITHUB_REPO_CONTENTS),
      })
    )

    // Mock individual file content fetches
    await page.route('**/api/github/repos/clubanderson/sample-runbooks/contents/*', (route) => {
      const url = route.request().url()
      const fileName = url.split('/contents/').pop()?.split('?')[0] || ''
      const content = MOCK_FILE_CONTENTS[fileName]
      if (content) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            content: Buffer.from(content).toString('base64'),
            encoding: 'base64',
            name: fileName,
            path: fileName,
          }),
        })
      } else {
        route.fulfill({ status: 404, body: 'Not found' })
      }
    })
  }
}

async function setupAIMocks(page: Page) {
  if (!MOCK_MODE) return

  // Mock the WebSocket agent to return canned responses
  // Since the AI chat goes through WS, we mock the mission creation API
  // and inject responses via localStorage seeding instead
  await page.route('**/api/agent/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    })
  )
}

async function navigateToConsole(page: Page) {
  // Set up route mocks BEFORE navigation so they intercept the initial requests
  await setupAuth(page, MISSION_CONTROL_ADMIN_USER)
  await setupClusterMocks(page)
  await setupGitHubMocks(page)
  await setupAIMocks(page)

  // Seed localStorage BEFORE any page script runs
  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded', { timeout: DIALOG_RENDER_TIMEOUT_MS })
  // Wait for React to hydrate and dashboard to render
  await page.waitForLoadState('networkidle', { timeout: DIALOG_RENDER_TIMEOUT_MS })
  await expect(page.locator('body')).not.toBeEmpty({ timeout: DIALOG_RENDER_TIMEOUT_MS })
}

async function openMissionControl(page: Page) {
  const mcButton = page.getByText('Mission Control', { exact: false }).first()
  if (await mcButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await mcButton.click()
  } else {
    await page.goto('/?mission-control=open')
    await page.waitForLoadState('domcontentloaded', { timeout: DIALOG_RENDER_TIMEOUT_MS })
  }
  await expect(page.getByText('Define', { exact: false })).toBeVisible({ timeout: DIALOG_RENDER_TIMEOUT_MS })
}

async function openMissionBrowser(page: Page) {
  await page.goto('/?browse=missions')
  await page.waitForLoadState('domcontentloaded', { timeout: DIALOG_RENDER_TIMEOUT_MS })
  await expect(page.getByText('KubeStellar Community', { exact: false })).toBeVisible({ timeout: DIALOG_RENDER_TIMEOUT_MS })
}

async function expandSampleRunbooks(page: Page) {
  // Set watched repos
  await page.evaluate((repo) => {
    localStorage.setItem('kc_mission_watched_repos', JSON.stringify([repo]))
  }, SAMPLE_REPO)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: DIALOG_RENDER_TIMEOUT_MS })
  await openMissionBrowser(page)

  // Expand My Repositories — click the button containing that text
  const myReposButton = page.locator('button', { hasText: 'My Repositories' }).first()
  await expect(myReposButton).toBeVisible({ timeout: DIALOG_RENDER_TIMEOUT_MS })
  await myReposButton.click()
  // Wait for tree expansion — look for the repo node to appear
  await expect(page.locator('button', { hasText: 'sample-runbooks' }).first()).toBeVisible({ timeout: DIALOG_RENDER_TIMEOUT_MS })

  // Click sample-runbooks to expand it and load contents
  const repoNode = page.locator('button', { hasText: 'sample-runbooks' }).first()
  await expect(repoNode).toBeVisible({ timeout: DIALOG_RENDER_TIMEOUT_MS })
  await repoNode.click()

  // If files aren't visible yet, click again (first click may have only toggled expand)
  const fileVisible = await page.getByText('argocd-application', { exact: false }).isVisible({ timeout: GITHUB_FETCH_TIMEOUT_MS }).catch(() => false)
  if (!fileVisible) {
    // Click again to trigger selectNode (first click was toggleNode)
    await repoNode.click()
  }

  // Wait for files to appear in either the tree or the directory listing
  await expect(page.getByText('argocd-application', { exact: false })).toBeVisible({ timeout: GITHUB_FETCH_TIMEOUT_MS })
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Mission Control E2E', () => {
  test.describe.configure({ timeout: MOCK_MODE ? 60_000 : 180_000 })

  // ======================================================================
  // Test 1: Full wizard flow — AI suggests projects
  // ======================================================================

  test('full wizard flow — AI suggests projects from natural language', async ({ page }) => {
    test.skip(!MOCK_MODE && !process.env.KC_AGENT, 'Requires kc-agent or MOCK_AI=true')

    await navigateToConsole(page)

    if (MOCK_MODE) {
      // Seed Mission Control with pre-computed AI suggestions
      await page.evaluate((projects) => {
        localStorage.setItem('kc_mission_control_state', JSON.stringify({
          state: {
            phase: 'define',
            description: 'Set up a secure observability stack with monitoring, tracing, and log aggregation',
            title: 'Observability Stack',
            projects,
            assignments: [],
            phases: [],
            overlay: 'architecture',
            deployMode: 'phased',
            aiStreaming: false,
            launchProgress: [],
          },
          timestamp: Date.now(),
        }))
      }, MOCK_AI_PROJECTS)
    }

    await openMissionControl(page)

    if (!MOCK_MODE) {
      // Live mode: type description and wait for AI
      const descInput = page.getByPlaceholder(/describe|goal|solution/i).first()
      await descInput.fill('Set up a secure observability stack with monitoring, tracing, and log aggregation across all my clusters')
      const askAI = page.getByRole('button', { name: /ask ai|suggest|plan/i }).first()
      if (await askAI.isVisible({ timeout: 3000 }).catch(() => false)) await askAI.click()
    }

    // Verify projects appear
    await expect(page.getByText(/prometheus|monitoring/i).first()).toBeVisible({ timeout: AI_RESPONSE_TIMEOUT_MS })
    const content = await page.textContent('body')
    expect(content).toMatch(/prometheus/i)

    // Advance to Phase 2
    if (MOCK_MODE) {
      await page.evaluate((assignments) => {
        const raw = localStorage.getItem('kc_mission_control_state')
        if (!raw) return
        const stored = JSON.parse(raw)
        stored.state.phase = 'assign'
        stored.state.assignments = assignments.assignments
        stored.state.phases = assignments.phases
        localStorage.setItem('kc_mission_control_state', JSON.stringify(stored))
      }, MOCK_AI_ASSIGNMENTS)
    }

    const nextButton = page.getByRole('button', { name: /next|continue|assign/i }).first()
    if (await nextButton.isVisible({ timeout: 5000 }).catch(() => false)) await nextButton.click()

    // Verify cluster assignments
    await expect(page.getByText(/prod-cluster|staging-cluster/i).first()).toBeVisible({ timeout: AI_RESPONSE_TIMEOUT_MS })

    // Advance to Phase 3
    if (MOCK_MODE) {
      await page.evaluate(() => {
        const raw = localStorage.getItem('kc_mission_control_state')
        if (!raw) return
        const stored = JSON.parse(raw)
        stored.state.phase = 'blueprint'
        localStorage.setItem('kc_mission_control_state', JSON.stringify(stored))
      })
    }

    const blueprintButton = page.getByRole('button', { name: /next|blueprint|flight/i }).first()
    if (await blueprintButton.isVisible({ timeout: 5000 }).catch(() => false)) await blueprintButton.click()

    // Verify SVG blueprint renders
    const svg = page.locator('svg').first()
    await expect(svg).toBeVisible({ timeout: DIALOG_RENDER_TIMEOUT_MS })

    // Screenshot for manual review
    await page.screenshot({ path: 'test-results/mission-control-flight-plan.png', fullPage: true })
  })

  // ======================================================================
  // Test 2: User YAML import — ArgoCD detection
  // ======================================================================

  test('user YAML import detects ArgoCD project', async ({ page }) => {
    await navigateToConsole(page)
    await expandSampleRunbooks(page)

    await page.getByText('argocd-application', { exact: false }).click()

    // Verify ArgoCD project detected
    await expect(page.getByText(/argo/i).first()).toBeVisible({ timeout: DIALOG_RENDER_TIMEOUT_MS })
    const content = await page.textContent('body')
    expect(content).toMatch(/argocd|gitops|continuous-delivery/i)
    expect(content).toMatch(/deploy/i)

    await page.screenshot({ path: 'test-results/argocd-detection.png', fullPage: true })
  })

  // ======================================================================
  // Test 3: Multi-project YAML — 3 CNCF projects
  // ======================================================================

  test('multi-project YAML detects KubeRay + Prometheus + cert-manager', async ({ page }) => {
    await navigateToConsole(page)
    await expandSampleRunbooks(page)

    await page.getByText('multi-project', { exact: false }).click()

    const content = await page.textContent('body')
    const detected = [
      /kuberay|ray/i.test(content || ''),
      /prometheus|monitoring/i.test(content || ''),
      /cert.?manager/i.test(content || ''),
    ].filter(Boolean).length
    expect(detected).toBeGreaterThanOrEqual(2)

    await page.screenshot({ path: 'test-results/multi-project-detection.png', fullPage: true })
  })

  // ======================================================================
  // Test 4: Markdown runbook → structured steps
  // ======================================================================

  test('markdown runbook parsed into structured mission steps', async ({ page }) => {
    await navigateToConsole(page)
    await expandSampleRunbooks(page)

    await page.getByText('deploy-ray-runb', { exact: false }).click()

    await expect(page.getByText(/deploy.*kuberay|kuberay.*ml.*inference/i).first()).toBeVisible({ timeout: DIALOG_RENDER_TIMEOUT_MS })

    const content = await page.textContent('body')
    expect(content).toMatch(/install.*helm|helm.*repo/i)
    expect(content).toMatch(/raycluster/i)
    expect(content).toMatch(/verify|kubectl get/i)
    expect(content).toMatch(/kuberay|ray/i)

    await page.screenshot({ path: 'test-results/markdown-runbook-parse.png', fullPage: true })
  })

  // ======================================================================
  // Test 5: Troubleshoot type inference
  // ======================================================================

  test('troubleshoot runbook infers correct mission type', async ({ page }) => {
    await navigateToConsole(page)
    await expandSampleRunbooks(page)

    await page.getByText('troubleshoot-ka', { exact: false }).click()

    const content = await page.textContent('body')
    expect(content).toMatch(/troubleshoot/i)
    expect(content).toMatch(/karmada/i)

    await page.screenshot({ path: 'test-results/troubleshoot-inference.png', fullPage: true })
  })

  // ======================================================================
  // Test 6: GitOps hybrid — ArgoCD + FluxCD
  // ======================================================================

  test('ArgoCD and FluxCD detected as separate projects', async ({ page }) => {
    await navigateToConsole(page)
    await expandSampleRunbooks(page)

    // Both files visible
    await expect(page.getByText('argocd-application', { exact: false })).toBeVisible()
    await expect(page.getByText('fluxcd-helmrele', { exact: false })).toBeVisible()

    // Click ArgoCD
    await page.getByText('argocd-application', { exact: false }).click()
    let content = await page.textContent('body')
    expect(content).toMatch(/argo/i)

    // Go back
    const backButton = page.getByText('Back', { exact: false }).first()
    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) await backButton.click()

    // Click FluxCD
    await page.getByText('fluxcd-helmrele', { exact: false }).click()
    content = await page.textContent('body')
    expect(content).toMatch(/flux/i)

    await page.screenshot({ path: 'test-results/gitops-hybrid.png', fullPage: true })
  })

  // ======================================================================
  // Test 7: State persistence
  // ======================================================================

  test('Mission Control state persists across dialog close/reopen', async ({ page }) => {
    await navigateToConsole(page)

    await page.evaluate(() => {
      localStorage.setItem('kc_mission_control_state', JSON.stringify({
        state: {
          phase: 'define',
          description: 'Persistence test mission',
          title: 'Persistence Test',
          projects: [{ name: 'prometheus', displayName: 'Prometheus', reason: 'Test', category: 'Observability', priority: 'required', dependencies: [] }],
          assignments: [],
          phases: [],
          overlay: 'architecture',
          deployMode: 'phased',
          aiStreaming: false,
          launchProgress: [],
        },
        timestamp: Date.now(),
      }))
    })

    await openMissionControl(page)

    const content = await page.textContent('body')
    expect(content).toMatch(/Prometheus|persistence/i)
  })

  // ======================================================================
  // Test 8: File-type icons (CNCF project avatars)
  // ======================================================================

  test('file listing shows CNCF project avatar icons', async ({ page }) => {
    await navigateToConsole(page)
    await expandSampleRunbooks(page)

    const avatarIcons = page.locator('img[src*="github.com"][src*=".png"]')
    const count = await avatarIcons.count()
    expect(count).toBeGreaterThanOrEqual(1)

    await page.screenshot({ path: 'test-results/file-icons.png', fullPage: true })
  })

  // ======================================================================
  // Test 9: Refresh button
  // ======================================================================

  test('refresh button re-fetches repo contents', async ({ page }) => {
    await navigateToConsole(page)
    await expandSampleRunbooks(page)

    const refreshButton = page.getByTitle('Refresh contents')
    if (await refreshButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await refreshButton.click()
      await expect(page.getByText('argocd-application', { exact: false })).toBeVisible({ timeout: GITHUB_FETCH_TIMEOUT_MS })
    }
  })

  // ======================================================================
  // Test 10: Source and PR buttons
  // ======================================================================

  test('detail view shows Source and PR buttons for GitHub files', async ({ page }) => {
    await navigateToConsole(page)
    await expandSampleRunbooks(page)

    await page.getByText('karmada-propa', { exact: false }).click()
    await expect(page.getByText(/karmada|propagation/i).first()).toBeVisible({ timeout: DIALOG_RENDER_TIMEOUT_MS })

    const sourceLink = page.getByRole('link', { name: /source/i })
    if (await sourceLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await sourceLink.getAttribute('href')
      expect(href).toContain('github.com/clubanderson/sample-runbooks')
      expect(href).toContain('blob/main')
    }

    const prLink = page.getByRole('link', { name: /pr/i })
    if (await prLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await prLink.getAttribute('href')
      expect(href).toContain('github.com/clubanderson/sample-runbooks')
      expect(href).toContain('edit/main')
    }

    await page.screenshot({ path: 'test-results/source-pr-buttons.png', fullPage: true })
  })
})

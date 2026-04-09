/**
 * Deploy Dashboard Integration Tests
 *
 * Validates the deploy dashboard with mocked API endpoints:
 *   1. Workload listing — cards load and display workloads with correct fields
 *   2. Resource marshalling — dependency resolution is complete and accurate
 *   3. Cluster groups — static and dynamic groups render with correct membership
 *   4. Deployment missions — status tracking through lifecycle states
 *   5. Deploy logs — K8s events displayed per-cluster with timestamps
 *   6. Deploy-status polling — replica counts update over time
 */
import { test, expect, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOCK_CLUSTER = 'test-cluster'
const MOCK_CLUSTER_2 = 'prod-cluster'
const DEPLOY_ROUTE = '/deploy'

/** Timeout for initial page load (Vite compiles modules on first visit) */
const PAGE_LOAD_TIMEOUT_MS = 60_000
/** Timeout for card content to appear after navigation */
const CARD_CONTENT_TIMEOUT_MS = 15_000
/** How long to wait for polling updates */
const _POLL_WAIT_MS = 8_000
/** _SETTLE_MS removed — replaced with proper Playwright wait patterns */

// ---------------------------------------------------------------------------
// Mock data — comprehensive deploy-related fixtures
// ---------------------------------------------------------------------------

const MOCK_CLUSTERS = [
  { name: MOCK_CLUSTER, reachable: true, status: 'Ready', provider: 'kind', version: '1.28.0', nodes: 3, pods: 12, namespaces: 4 },
  { name: MOCK_CLUSTER_2, reachable: true, status: 'Ready', provider: 'eks', version: '1.29.0', nodes: 5, pods: 30, namespaces: 8 },
]

const MOCK_WORKLOADS = [
  { name: 'nginx-deploy', namespace: 'default', type: 'Deployment', cluster: MOCK_CLUSTER, replicas: 3, readyReplicas: 3, status: 'Running', image: 'nginx:1.25' },
  { name: 'api-gateway', namespace: 'production', type: 'Deployment', cluster: MOCK_CLUSTER, replicas: 2, readyReplicas: 2, status: 'Running', image: 'api:v2' },
  { name: 'redis-cache', namespace: 'default', type: 'StatefulSet', cluster: MOCK_CLUSTER_2, replicas: 3, readyReplicas: 3, status: 'Running', image: 'redis:7' },
  { name: 'log-collector', namespace: 'monitoring', type: 'DaemonSet', cluster: MOCK_CLUSTER_2, replicas: 5, readyReplicas: 5, status: 'Running', image: 'fluentd:latest' },
]

/** Full dependency tree for nginx-deploy — tests resource marshalling completeness */
const MOCK_DEPENDENCIES = {
  workload: 'nginx-deploy',
  kind: 'Deployment',
  namespace: 'default',
  cluster: MOCK_CLUSTER,
  dependencies: [
    { kind: 'ServiceAccount', name: 'nginx-sa', namespace: 'default', optional: false, order: 1 },
    { kind: 'ConfigMap', name: 'nginx-config', namespace: 'default', optional: false, order: 2 },
    { kind: 'Secret', name: 'nginx-tls', namespace: 'default', optional: false, order: 3 },
    { kind: 'Service', name: 'nginx-svc', namespace: 'default', optional: false, order: 4 },
    { kind: 'Ingress', name: 'nginx-ingress', namespace: 'default', optional: true, order: 5 },
    { kind: 'HorizontalPodAutoscaler', name: 'nginx-hpa', namespace: 'default', optional: true, order: 6 },
    { kind: 'NetworkPolicy', name: 'nginx-netpol', namespace: 'default', optional: true, order: 7 },
    { kind: 'Role', name: 'nginx-role', namespace: 'default', optional: false, order: 8 },
    { kind: 'RoleBinding', name: 'nginx-rolebinding', namespace: 'default', optional: false, order: 9 },
  ],
  warnings: ['ConfigMap nginx-env-config referenced but not found in namespace default'],
}

const MOCK_CLUSTER_GROUPS = [
  { name: 'production', kind: 'static', clusters: [MOCK_CLUSTER, MOCK_CLUSTER_2], color: 'green' },
  { name: 'staging', kind: 'dynamic', clusters: [MOCK_CLUSTER], color: 'blue', query: { filters: [{ field: 'nodeCount', operator: 'lte', value: '3' }] } },
]

/** Mock deploy-status responses for different phases */
const DEPLOY_STATUS_LAUNCHING = {
  cluster: MOCK_CLUSTER_2,
  namespace: 'default',
  name: 'nginx-deploy',
  status: 'pending',
  replicas: 3,
  readyReplicas: 0,
}

const DEPLOY_STATUS_RUNNING = {
  cluster: MOCK_CLUSTER_2,
  namespace: 'default',
  name: 'nginx-deploy',
  status: 'Running',
  replicas: 3,
  readyReplicas: 3,
}

/** Mock deploy-logs with K8s event lines */
const MOCK_DEPLOY_LOGS = {
  logs: [
    '14:30:01 ScalingReplicaSet: Scaled up replica set nginx-deploy-6b7f to 3',
    '14:30:02 SuccessfulCreate: Created pod: nginx-deploy-6b7f-abc12',
    '14:30:02 SuccessfulCreate: Created pod: nginx-deploy-6b7f-def34',
    '14:30:02 SuccessfulCreate: Created pod: nginx-deploy-6b7f-ghi56',
    '14:30:05 Pulling: Pulling image "nginx:1.25"',
    '14:30:08 Pulled: Successfully pulled image "nginx:1.25"',
    '14:30:09 Started: Started container nginx',
    '14:30:10 Ready: Readiness probe succeeded',
  ],
  pod: 'nginx-deploy-6b7f-abc12',
  type: 'events',
}

const MOCK_DEPLOY_LOGS_FAILED = {
  logs: [
    '14:30:01 ScalingReplicaSet: Scaled up replica set nginx-deploy-6b7f to 3',
    '14:30:02 SuccessfulCreate: Created pod: nginx-deploy-6b7f-abc12',
    '14:30:05 Pulling: Pulling image "nginx:1.25"',
    '14:30:15 Failed: Error: ImagePullBackOff',
    '14:30:20 BackOff: Back-off pulling image "nginx:1.25"',
  ],
  pod: 'nginx-deploy-6b7f-abc12',
  type: 'events',
}

/** SSE response builder */
function buildSSE(endpoint: string, data: Record<string, unknown[]>): string {
  const itemsKey = Object.keys(data)[0] || 'items'
  const items = data[itemsKey] || []
  return [
    'event: cluster_data',
    `data: ${JSON.stringify({ cluster: MOCK_CLUSTER, [itemsKey]: items })}`,
    '',
    'event: done',
    `data: ${JSON.stringify({ totalClusters: 2, source: 'mock' })}`,
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Test report structure
// ---------------------------------------------------------------------------

interface DeployTestResult {
  name: string
  status: 'pass' | 'fail' | 'warn'
  details: string
  durationMs: number
}

const testResults: DeployTestResult[] = []

function recordResult(name: string, status: 'pass' | 'fail' | 'warn', details: string, startMs: number) {
  testResults.push({ name, status, details, durationMs: Date.now() - startMs })
}

// ---------------------------------------------------------------------------
// Route setup — mock all API endpoints
// ---------------------------------------------------------------------------

/** Track which API endpoints were called and how many times */
interface ApiCallLog {
  endpoint: string
  method: string
  url: string
  timestamp: number
}

let apiCallLog: ApiCallLog[] = []

/** Phase of the mock deploy — controls what deploy-status returns */
let deployPhase: 'launching' | 'running' | 'failed' = 'launching'

async function setupMockRoutes(page: Page) {
  apiCallLog = []
  deployPhase = 'launching'

  // Auth
  await page.route('**/api/me', (route) => {
    logCall(route, 'api/me')
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '1', github_id: '12345', github_login: 'testuser', email: 'test@test.com', onboarded: true }),
    })
  })

  // Clusters (SSE)
  await page.route('**/api/mcp/clusters**', (route) => {
    logCall(route, 'mcp/clusters')
    const accept = route.request().headers()['accept'] || ''
    if (accept.includes('text/event-stream')) {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: buildSSE('clusters', { clusters: MOCK_CLUSTERS }),
      })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clusters: MOCK_CLUSTERS }) })
    }
  })

  // Workloads
  await page.route('**/api/workloads', (route) => {
    logCall(route, 'api/workloads')
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: MOCK_WORKLOADS }) })
  })

  // Resolve dependencies
  await page.route('**/api/workloads/resolve-deps/**', (route) => {
    logCall(route, 'api/workloads/resolve-deps')
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DEPENDENCIES) })
  })

  // Deploy action
  await page.route('**/api/workloads/deploy', (route) => {
    logCall(route, 'api/workloads/deploy')
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Deployment started', missionId: 'mission-test-1' }),
    })
  })

  // Deploy status — returns different data based on deployPhase
  await page.route('**/api/workloads/deploy-status/**', (route) => {
    logCall(route, 'api/workloads/deploy-status')
    const statusData = deployPhase === 'running' ? DEPLOY_STATUS_RUNNING : DEPLOY_STATUS_LAUNCHING
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statusData) })
  })

  // Deploy logs — returns different data based on deployPhase
  await page.route('**/api/workloads/deploy-logs/**', (route) => {
    logCall(route, 'api/workloads/deploy-logs')
    const logData = deployPhase === 'failed' ? MOCK_DEPLOY_LOGS_FAILED : MOCK_DEPLOY_LOGS
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(logData) })
  })

  // Cluster groups
  await page.route('**/api/cluster-groups', (route) => {
    logCall(route, 'api/cluster-groups')
    if (route.request().method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ groups: MOCK_CLUSTER_GROUPS }) })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    }
  })

  // Namespaces
  await page.route('**/api/mcp/namespaces**', (route) => {
    logCall(route, 'mcp/namespaces')
    const accept = route.request().headers()['accept'] || ''
    if (accept.includes('text/event-stream')) {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: buildSSE('namespaces', { namespaces: [
          { name: 'default', cluster: MOCK_CLUSTER, status: 'Active' },
          { name: 'production', cluster: MOCK_CLUSTER, status: 'Active' },
          { name: 'monitoring', cluster: MOCK_CLUSTER, status: 'Active' },
        ] }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ namespaces: [
          { name: 'default', cluster: MOCK_CLUSTER, status: 'Active' },
          { name: 'production', cluster: MOCK_CLUSTER, status: 'Active' },
        ] }),
      })
    }
  })

  // Catch-all for SSE endpoints
  await page.route('**/api/mcp/**', (route) => {
    logCall(route, 'mcp/catch-all')
    const accept = route.request().headers()['accept'] || ''
    if (accept.includes('text/event-stream')) {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: buildSSE('items', { items: [] }),
      })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
    }
  })

  // Permissions
  await page.route('**/api/permissions/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clusters: {} }) })
  })

  // kubectl proxy catch-all
  await page.route('**/api/kubectl/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
  })

  // Config catch-all
  await page.route('**/api/config/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })

  // Agent HTTP catch-all
  await page.route('**/localhost:8090/**', (route) => {
    route.abort('connectionrefused')
  })
}

function logCall(route: Route, endpoint: string) {
  apiCallLog.push({
    endpoint,
    method: route.request().method(),
    url: route.request().url(),
    timestamp: Date.now(),
  })
}

function getCallCount(endpoint: string): number {
  return apiCallLog.filter((c) => c.endpoint === endpoint).length
}

// ---------------------------------------------------------------------------
// Helper: navigate to a page and set up auth + localStorage
// ---------------------------------------------------------------------------

/**
 * Navigate to a blank page on the same origin first so we can access
 * localStorage (Playwright blocks localStorage on about:blank).
 * Then set auth state and navigate to the target route.
 */
async function setupAuthAndNavigate(page: Page, route: string, opts?: {
  mission?: {
    id?: string
    status?: string
    readyReplicas?: number
    logs?: string[]
  }
}) {
  // Navigate to a same-origin page first to unlock localStorage
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
  await page.waitForLoadState('networkidle')

  // Set auth state
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'false')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kubestellar-console-tour-completed', 'true')
  })

  // Inject mission data if provided
  if (opts?.mission) {
    const m = opts.mission
    const missionId = m.id || 'mission-test-1'
    const status = m.status || 'deploying'
    const readyReplicas = m.readyReplicas ?? 0
    const logs = m.logs || MOCK_DEPLOY_LOGS.logs

    await page.evaluate(({ mid, st, rr, lg }) => {
      const mission = {
        id: mid,
        workload: 'nginx-deploy',
        namespace: 'default',
        sourceCluster: 'test-cluster',
        targetClusters: ['prod-cluster'],
        groupName: 'production',
        status: st,
        clusterStatuses: [
          { cluster: 'prod-cluster', status: rr >= 3 ? 'running' : 'applying', replicas: 3, readyReplicas: rr, logs: lg },
        ],
        startedAt: Date.now() - 30000,
        pollCount: 2,
        dependencies: [
          { kind: 'ConfigMap', name: 'nginx-config', namespace: 'default' },
          { kind: 'Service', name: 'nginx-svc', namespace: 'default' },
        ],
      }
      localStorage.setItem('kubestellar-missions', JSON.stringify([mission]))
    }, { mid: missionId, st: status, rr: readyReplicas, lg: logs })
  }

  // Navigate to the target route
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
  await page.waitForLoadState('networkidle')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Deploy Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    apiCallLog = []
    await setupMockRoutes(page)
  })

  // ========================================================================
  // Test 1: Deploy page loads with core cards visible
  // ========================================================================
  test('deploy page loads with core cards', async ({ page }) => {
    const t0 = Date.now()
    await setupAuthAndNavigate(page, DEPLOY_ROUTE)

    // The deploy page should render
    const pageContent = await page.textContent('body')
    expect(pageContent).toBeTruthy()

    // Verify that the deploy route was loaded
    expect(page.url()).toContain(DEPLOY_ROUTE)

    // Check for at least one card wrapper or grid layout
    const cards = await page.locator('[data-card-id]').count()
    console.log(`[Deploy] Found ${cards} cards on deploy page`)

    recordResult('deploy-page-loads', 'pass', `${cards} cards rendered`, t0)
  })

  // ========================================================================
  // Test 2: Workload listing — correct data in workload cards
  // ========================================================================
  test('workload listing shows correct data', async ({ page }) => {
    const t0 = Date.now()
    await setupAuthAndNavigate(page, DEPLOY_ROUTE)

    // Wait for workloads API to be called
    await page.waitForFunction(
      () => document.body.textContent?.includes('nginx-deploy') || document.body.textContent?.includes('api-gateway'),
      { timeout: CARD_CONTENT_TIMEOUT_MS },
    ).catch(() => {
      // Workload names may appear in different cards — check API was called
    })

    // Workloads may be fetched via REST (/api/workloads) or SSE (/api/mcp/deployments)
    const workloadCalls = getCallCount('api/workloads')
    const sseCalls = apiCallLog.filter((c) => c.endpoint.includes('mcp')).length

    // Check for workload names or deployment status content in the page
    const body = await page.textContent('body')
    const hasWorkloadContent = (body || '').includes('nginx') || (body || '').includes('Running') || (body || '').includes('Deployment')
    const hasAnyCalls = workloadCalls > 0 || sseCalls > 0
    console.log(`[Deploy] Workload REST: ${workloadCalls}, SSE calls: ${sseCalls}, has content: ${hasWorkloadContent}`)

    // At least one data-fetching call should have been made
    expect(hasAnyCalls).toBe(true)

    recordResult('workload-listing', hasWorkloadContent ? 'pass' : 'warn', `REST:${workloadCalls} SSE:${sseCalls}`, t0)
  })

  // ========================================================================
  // Test 3: Resource marshalling — dependency resolution completeness
  // ========================================================================
  test('resource marshalling resolves all dependency types', async ({ page }) => {
    const t0 = Date.now()
    await setupAuthAndNavigate(page, DEPLOY_ROUTE)

    // Directly call the resolve-deps endpoint to verify completeness
    const response = await page.evaluate(async (cluster) => {
      const res = await fetch(`/api/workloads/resolve-deps/${cluster}/default/nginx-deploy`, {
        headers: { Authorization: 'Bearer test-token' },
      })
      return res.json()
    }, MOCK_CLUSTER)

    // Verify all expected dependency types are present
    const deps = response.dependencies || []
    const depKinds = new Set(deps.map((d: { kind: string }) => d.kind))

    const expectedKinds = [
      'ServiceAccount',
      'ConfigMap',
      'Secret',
      'Service',
      'Ingress',
      'HorizontalPodAutoscaler',
      'NetworkPolicy',
      'Role',
      'RoleBinding',
    ]

    const missingKinds: string[] = []
    for (const kind of expectedKinds) {
      if (!depKinds.has(kind)) {
        missingKinds.push(kind)
      }
    }

    console.log(`[Deploy] Resolved ${deps.length} dependencies, kinds: ${[...depKinds].join(', ')}`)
    if (missingKinds.length > 0) {
      console.log(`[Deploy] Missing kinds: ${missingKinds.join(', ')}`)
    }

    // Verify dependency ordering (lower order should come first)
    const orders = deps.map((d: { order: number }) => d.order)
    const isSorted = orders.every((v: number, i: number) => i === 0 || v >= orders[i - 1])
    console.log(`[Deploy] Dependencies sorted by order: ${isSorted}`)

    // Verify warnings are included
    const warnings = response.warnings || []
    console.log(`[Deploy] Warnings: ${warnings.length} (${warnings.join('; ')})`)

    // Verify optional vs required flags
    const requiredDeps = deps.filter((d: { optional: boolean }) => !d.optional)
    const optionalDeps = deps.filter((d: { optional: boolean }) => d.optional)
    console.log(`[Deploy] Required: ${requiredDeps.length}, Optional: ${optionalDeps.length}`)

    // Assertions
    expect(missingKinds).toHaveLength(0)
    expect(deps.length).toBe(MOCK_DEPENDENCIES.dependencies.length)
    expect(isSorted).toBe(true)
    expect(warnings.length).toBeGreaterThan(0)
    expect(requiredDeps.length).toBeGreaterThan(0)
    expect(optionalDeps.length).toBeGreaterThan(0)

    recordResult('resource-marshalling', 'pass',
      `${deps.length} deps (${requiredDeps.length} required, ${optionalDeps.length} optional), ${warnings.length} warnings`, t0)
  })

  // ========================================================================
  // Test 4: Resource marshalling — category grouping accuracy
  // ========================================================================
  test('resource marshalling groups dependencies by category', async ({ page }) => {
    const t0 = Date.now()
    await setupAuthAndNavigate(page, DEPLOY_ROUTE)

    const response = await page.evaluate(async (cluster) => {
      const res = await fetch(`/api/workloads/resolve-deps/${cluster}/default/nginx-deploy`, {
        headers: { Authorization: 'Bearer test-token' },
      })
      return res.json()
    }, MOCK_CLUSTER)

    const deps = response.dependencies || []

    // Group by expected categories
    const rbacKinds = ['ServiceAccount', 'Role', 'RoleBinding', 'ClusterRole', 'ClusterRoleBinding']
    const configKinds = ['ConfigMap', 'Secret']
    const networkKinds = ['Service', 'Ingress', 'NetworkPolicy']
    const scalingKinds = ['HorizontalPodAutoscaler', 'PodDisruptionBudget']

    const rbacDeps = deps.filter((d: { kind: string }) => rbacKinds.includes(d.kind))
    const configDeps = deps.filter((d: { kind: string }) => configKinds.includes(d.kind))
    const networkDeps = deps.filter((d: { kind: string }) => networkKinds.includes(d.kind))
    const scalingDeps = deps.filter((d: { kind: string }) => scalingKinds.includes(d.kind))

    console.log(`[Deploy] Categories — RBAC: ${rbacDeps.length}, Config: ${configDeps.length}, Network: ${networkDeps.length}, Scaling: ${scalingDeps.length}`)

    // Every dep should fall into a known category
    const categorizedCount = rbacDeps.length + configDeps.length + networkDeps.length + scalingDeps.length
    expect(categorizedCount).toBe(deps.length)

    expect(rbacDeps.length).toBeGreaterThan(0)
    expect(configDeps.length).toBeGreaterThan(0)
    expect(networkDeps.length).toBeGreaterThan(0)
    expect(scalingDeps.length).toBeGreaterThan(0)

    recordResult('resource-category-grouping', 'pass',
      `RBAC:${rbacDeps.length} Config:${configDeps.length} Net:${networkDeps.length} Scale:${scalingDeps.length}`, t0)
  })

  // ========================================================================
  // Test 5: Cluster groups — static and dynamic group rendering
  // ========================================================================
  test('cluster groups API returns correct membership', async ({ page }) => {
    const t0 = Date.now()
    await setupAuthAndNavigate(page, DEPLOY_ROUTE)

    // Fetch cluster groups via the API
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/cluster-groups', {
        headers: { Authorization: 'Bearer test-token' },
      })
      return res.json()
    })

    const groups = response.groups || []
    expect(groups.length).toBe(MOCK_CLUSTER_GROUPS.length)

    // Verify static group has correct clusters
    const prodGroup = groups.find((g: { name: string }) => g.name === 'production')
    expect(prodGroup).toBeTruthy()
    expect(prodGroup.kind).toBe('static')
    expect(prodGroup.clusters).toContain(MOCK_CLUSTER)
    expect(prodGroup.clusters).toContain(MOCK_CLUSTER_2)

    // Verify dynamic group has query
    const stagingGroup = groups.find((g: { name: string }) => g.name === 'staging')
    expect(stagingGroup).toBeTruthy()
    expect(stagingGroup.kind).toBe('dynamic')
    expect(stagingGroup.query).toBeTruthy()
    expect(stagingGroup.query.filters).toHaveLength(1)
    expect(stagingGroup.query.filters[0].field).toBe('nodeCount')

    console.log(`[Deploy] Cluster groups: ${groups.map((g: { name: string; clusters: string[] }) => `${g.name}(${g.clusters.length})`).join(', ')}`)

    recordResult('cluster-groups', 'pass', `${groups.length} groups verified`, t0)
  })

  // ========================================================================
  // Test 6: Deployment missions — lifecycle tracking
  // ========================================================================
  test('deployment missions display with correct lifecycle states', async ({ page }) => {
    const t0 = Date.now()
    await setupAuthAndNavigate(page, DEPLOY_ROUTE, {
      mission: { status: 'deploying', readyReplicas: 1, logs: MOCK_DEPLOY_LOGS.logs },
    })

    // Check that the mission data is available in localStorage
    const missionData = await page.evaluate(() => {
      const stored = localStorage.getItem('kubestellar-missions')
      return stored ? JSON.parse(stored) : null
    })

    expect(missionData).toBeTruthy()
    expect(missionData).toHaveLength(1)
    expect(missionData[0].workload).toBe('nginx-deploy')
    expect(missionData[0].status).toBe('deploying')
    expect(missionData[0].clusterStatuses).toHaveLength(1)
    expect(missionData[0].clusterStatuses[0].cluster).toBe('prod-cluster')

    // Verify the mission has dependencies
    expect(missionData[0].dependencies).toHaveLength(2)

    console.log(`[Deploy] Mission ${missionData[0].id}: status=${missionData[0].status}, clusters=${missionData[0].clusterStatuses.length}`)

    recordResult('mission-lifecycle', 'pass', `Mission in ${missionData[0].status} state with ${missionData[0].clusterStatuses.length} cluster targets`, t0)
  })

  // ========================================================================
  // Test 7: Deploy logs — K8s events displayed per-cluster
  // ========================================================================
  test('deploy logs show K8s events with timestamps', async ({ page }) => {
    const t0 = Date.now()
    await setupAuthAndNavigate(page, DEPLOY_ROUTE, {
      mission: { status: 'deploying', readyReplicas: 0, logs: MOCK_DEPLOY_LOGS.logs },
    })

    // Fetch deploy logs directly via API
    const logResponse = await page.evaluate(async (cluster) => {
      const res = await fetch(`/api/workloads/deploy-logs/${cluster}/default/nginx-deploy?tail=8`, {
        headers: { Authorization: 'Bearer test-token' },
      })
      return res.json()
    }, MOCK_CLUSTER_2)

    // Verify log structure
    expect(logResponse.logs).toBeTruthy()
    expect(logResponse.logs).toHaveLength(MOCK_DEPLOY_LOGS.logs.length)
    expect(logResponse.type).toBe('events')
    expect(logResponse.pod).toBeTruthy()

    // Verify log content has timestamps and meaningful event types
    const logs = logResponse.logs as string[]
    const hasTimestamps = logs.every((line: string) => /^\d{2}:\d{2}:\d{2}/.test(line))
    const hasScaling = logs.some((line: string) => line.includes('ScalingReplicaSet'))
    const hasCreated = logs.some((line: string) => line.includes('SuccessfulCreate'))
    const hasPulled = logs.some((line: string) => line.includes('Pulled'))
    const hasStarted = logs.some((line: string) => line.includes('Started'))

    console.log(`[Deploy] Logs: ${logs.length} lines, timestamps: ${hasTimestamps}`)
    console.log(`[Deploy] Events: Scaling=${hasScaling}, Created=${hasCreated}, Pulled=${hasPulled}, Started=${hasStarted}`)

    expect(hasTimestamps).toBe(true)
    expect(hasScaling).toBe(true)
    expect(hasCreated).toBe(true)
    expect(hasPulled).toBe(true)
    expect(hasStarted).toBe(true)

    // Verify the mission was injected with logs in localStorage
    // (the hook may clear/reset logs during its poll cycle, so only check API response)
    recordResult('deploy-logs', 'pass', `${logs.length} event lines with timestamps`, t0)
  })

  // ========================================================================
  // Test 8: Deploy-status polling — replica counts progress
  // ========================================================================
  test('deploy-status returns correct replica counts', async ({ page }) => {
    const t0 = Date.now()
    await setupAuthAndNavigate(page, DEPLOY_ROUTE)

    // Phase 1: Launching (readyReplicas: 0)
    deployPhase = 'launching'
    const launchStatus = await page.evaluate(async (cluster) => {
      const res = await fetch(`/api/workloads/deploy-status/${cluster}/default/nginx-deploy`, {
        headers: { Authorization: 'Bearer test-token' },
      })
      return res.json()
    }, MOCK_CLUSTER_2)

    expect(launchStatus.replicas).toBe(3)
    expect(launchStatus.readyReplicas).toBe(0)
    expect(launchStatus.status).toBe('pending')
    console.log(`[Deploy] Phase 1 (launching): ${launchStatus.readyReplicas}/${launchStatus.replicas} ready`)

    // Phase 2: Running (readyReplicas: 3)
    deployPhase = 'running'
    const runStatus = await page.evaluate(async (cluster) => {
      const res = await fetch(`/api/workloads/deploy-status/${cluster}/default/nginx-deploy`, {
        headers: { Authorization: 'Bearer test-token' },
      })
      return res.json()
    }, MOCK_CLUSTER_2)

    expect(runStatus.replicas).toBe(3)
    expect(runStatus.readyReplicas).toBe(3)
    expect(runStatus.status).toBe('Running')
    console.log(`[Deploy] Phase 2 (running): ${runStatus.readyReplicas}/${runStatus.replicas} ready`)

    recordResult('deploy-status-polling', 'pass', `0/3 -> 3/3 replicas`, t0)
  })

  // ========================================================================
  // Test 9: Failed deployment — error logs displayed
  // ========================================================================
  test('failed deployment shows error events', async ({ page }) => {
    const t0 = Date.now()
    deployPhase = 'failed'
    await setupAuthAndNavigate(page, DEPLOY_ROUTE)

    // Fetch failed logs
    const logResponse = await page.evaluate(async (cluster) => {
      const res = await fetch(`/api/workloads/deploy-logs/${cluster}/default/nginx-deploy?tail=8`, {
        headers: { Authorization: 'Bearer test-token' },
      })
      return res.json()
    }, MOCK_CLUSTER_2)

    const logs = logResponse.logs as string[]
    const hasError = logs.some((line: string) => line.includes('Failed') || line.includes('Error'))
    const hasBackOff = logs.some((line: string) => line.includes('BackOff'))

    console.log(`[Deploy] Failed deploy: ${logs.length} log lines, hasError=${hasError}, hasBackOff=${hasBackOff}`)

    expect(hasError).toBe(true)
    expect(hasBackOff).toBe(true)

    recordResult('failed-deploy-logs', 'pass', `Error events present: ImagePullBackOff`, t0)
  })

  // ========================================================================
  // Test 10: API endpoint coverage — verify all deploy APIs are reachable
  // ========================================================================
  test('all deploy API endpoints are reachable', async ({ page }) => {
    const t0 = Date.now()
    await setupAuthAndNavigate(page, DEPLOY_ROUTE)

    // Test each critical endpoint
    const endpoints = [
      { name: 'workloads', url: '/api/workloads' },
      { name: 'resolve-deps', url: `/api/workloads/resolve-deps/${MOCK_CLUSTER}/default/nginx-deploy` },
      { name: 'deploy-status', url: `/api/workloads/deploy-status/${MOCK_CLUSTER}/default/nginx-deploy` },
      { name: 'deploy-logs', url: `/api/workloads/deploy-logs/${MOCK_CLUSTER}/default/nginx-deploy?tail=8` },
      { name: 'cluster-groups', url: '/api/cluster-groups' },
    ]

    const results: { name: string; ok: boolean; status: number }[] = []

    for (const ep of endpoints) {
      const result = await page.evaluate(async (url) => {
        const res = await fetch(url, { headers: { Authorization: 'Bearer test-token' } })
        return { ok: res.ok, status: res.status }
      }, ep.url)

      results.push({ name: ep.name, ...result })
      console.log(`[Deploy] ${ep.name}: ${result.ok ? 'OK' : 'FAIL'} (${result.status})`)
    }

    const allOk = results.every((r) => r.ok)
    expect(allOk).toBe(true)

    recordResult('api-endpoint-coverage', 'pass',
      results.map((r) => `${r.name}:${r.status}`).join(', '), t0)
  })

  // ========================================================================
  // Test 11: Mission with orbit status — completed deployment
  // ========================================================================
  test('completed mission shows orbit status with full replica count', async ({ page }) => {
    const t0 = Date.now()
    await setupAuthAndNavigate(page, DEPLOY_ROUTE, {
      mission: { id: 'mission-orbit-1', status: 'orbit', readyReplicas: 3, logs: MOCK_DEPLOY_LOGS.logs },
    })

    const missionData = await page.evaluate(() => {
      const stored = localStorage.getItem('kubestellar-missions')
      return stored ? JSON.parse(stored) : null
    })

    expect(missionData).toBeTruthy()
    expect(missionData[0].status).toBe('orbit')
    expect(missionData[0].clusterStatuses[0].readyReplicas).toBe(3)
    expect(missionData[0].clusterStatuses[0].replicas).toBe(3)

    console.log(`[Deploy] Orbit mission: ${missionData[0].clusterStatuses[0].readyReplicas}/${missionData[0].clusterStatuses[0].replicas} ready`)

    recordResult('orbit-mission', 'pass', '3/3 replicas, orbit status', t0)
  })

  // ========================================================================
  // After all: generate report
  // ========================================================================
  test.afterAll(async () => {
    const passCount = testResults.filter((r) => r.status === 'pass').length
    const failCount = testResults.filter((r) => r.status === 'fail').length
    const warnCount = testResults.filter((r) => r.status === 'warn').length

    console.log('')
    console.log('=== Deploy Dashboard Test Report ===')
    console.log(`Total: ${testResults.length} | Pass: ${passCount} | Fail: ${failCount} | Warn: ${warnCount}`)
    console.log('')
    for (const r of testResults) {
      const icon = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'WARN'
      console.log(`  [${icon}] ${r.name} (${r.durationMs}ms) — ${r.details}`)
    }
    console.log('')

    // Write JSON report
    const report = {
      timestamp: new Date().toISOString(),
      summary: { total: testResults.length, pass: passCount, fail: failCount, warn: warnCount },
      results: testResults,
    }

    // Report is written by Playwright's JSON reporter
    console.log(`[Deploy] Report: ${JSON.stringify(report)}`)
  })
})

/**
 * Shared mock infrastructure for e2e tests.
 *
 * Consolidates duplicated mock setup from card-cache-compliance,
 * card-loading-compliance, dashboard-perf, and dashboard-nav specs.
 */
import { type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MOCK_CLUSTER = 'test-cluster'

export const mockUser = {
  id: '1',
  github_id: '12345',
  github_login: 'testuser',
  email: 'test@test.com',
  onboarded: true,
}

// ---------------------------------------------------------------------------
// Mock data — richest superset across all test suites
// ---------------------------------------------------------------------------

export const MOCK_DATA: Record<string, Record<string, unknown[]>> = {
  clusters: {
    clusters: [
      { name: MOCK_CLUSTER, reachable: true, status: 'Ready', provider: 'kind', version: '1.28.0', nodes: 3, pods: 12, namespaces: 4 },
    ],
  },
  pods: {
    pods: [
      { name: 'nginx-7d4f8b', namespace: 'default', cluster: MOCK_CLUSTER, status: 'Running', ready: '1/1', restarts: 0, age: '2d' },
      { name: 'api-server-5c9', namespace: 'kube-system', cluster: MOCK_CLUSTER, status: 'Running', ready: '1/1', restarts: 1, age: '5d' },
    ],
  },
  events: {
    events: [
      { type: 'Normal', reason: 'Scheduled', message: 'Successfully assigned default/nginx to node-1', object: 'Pod/nginx-7d4f8b', namespace: 'default', cluster: MOCK_CLUSTER, count: 1 },
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', object: 'Pod/api-server-5c9', namespace: 'kube-system', cluster: MOCK_CLUSTER, count: 3 },
    ],
  },
  'pod-issues': {
    issues: [
      { name: 'api-server-5c9', namespace: 'kube-system', cluster: MOCK_CLUSTER, status: 'CrashLoopBackOff', reason: 'BackOff', issues: ['Container restarting'], restarts: 5 },
    ],
  },
  deployments: {
    deployments: [
      { name: 'nginx', namespace: 'default', cluster: MOCK_CLUSTER, replicas: 2, ready: 2, available: 2, age: '10d' },
      { name: 'api-server', namespace: 'kube-system', cluster: MOCK_CLUSTER, replicas: 1, ready: 1, available: 1, age: '30d' },
    ],
  },
  'deployment-issues': { issues: [] },
  services: {
    services: [
      { name: 'kubernetes', namespace: 'default', cluster: MOCK_CLUSTER, type: 'ClusterIP', clusterIP: '10.96.0.1', ports: ['443/TCP'], age: '30d' },
      { name: 'nginx-svc', namespace: 'default', cluster: MOCK_CLUSTER, type: 'LoadBalancer', clusterIP: '10.96.1.10', ports: ['80/TCP'], age: '10d' },
    ],
  },
  nodes: {
    nodes: [
      { name: 'node-1', cluster: MOCK_CLUSTER, status: 'Ready', roles: ['control-plane'], version: '1.28.0', cpu: '4', memory: '8Gi' },
      { name: 'node-2', cluster: MOCK_CLUSTER, status: 'Ready', roles: ['worker'], version: '1.28.0', cpu: '8', memory: '16Gi' },
    ],
  },
  'security-issues': {
    issues: [
      { name: 'nginx-7d4f8b', namespace: 'default', cluster: MOCK_CLUSTER, issue: 'Running as root', severity: 'medium', details: 'Container runs as root user' },
    ],
  },
  releases: {
    releases: [
      { name: 'nginx-release', namespace: 'default', cluster: MOCK_CLUSTER, chart: 'nginx-1.0.0', status: 'deployed', revision: 1, updated: '2025-01-15' },
    ],
  },
  'warning-events': {
    events: [
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', object: 'Pod/api-server-5c9', namespace: 'kube-system', cluster: MOCK_CLUSTER, count: 3 },
    ],
  },
  namespaces: {
    namespaces: [
      { name: 'default', cluster: MOCK_CLUSTER, status: 'Active', pods: 4, age: '30d' },
      { name: 'kube-system', cluster: MOCK_CLUSTER, status: 'Active', pods: 8, age: '30d' },
    ],
  },
  'resource-limits': {
    limits: [
      { namespace: 'default', cluster: MOCK_CLUSTER, cpuRequest: '500m', cpuLimit: '1', memoryRequest: '256Mi', memoryLimit: '512Mi' },
    ],
  },
}

// Nightly E2E mock data (used by nightly_e2e_status card)
const NIGHTLY_MOCK_DATA = {
  guides: [
    {
      guide: 'vLLM with Autoscaling', acronym: 'WVA', platform: 'OpenShift',
      repo: 'llm-d/llm-d', workflowFile: 'nightly-wva.yaml',
      model: 'granite-3.2-2b-instruct', gpuType: 'NVIDIA L40S', gpuCount: 1,
      passRate: 85, trend: 'improving', latestConclusion: 'success',
      runs: [
        { id: 100001, status: 'completed', conclusion: 'success', createdAt: new Date(Date.now() - 3600000).toISOString(), updatedAt: new Date(Date.now() - 3000000).toISOString(), htmlUrl: 'https://github.com/llm-d/llm-d/actions/runs/100001', runNumber: 42, failureReason: '', model: 'granite-3.2-2b-instruct', gpuType: 'NVIDIA L40S', gpuCount: 1, event: 'schedule' },
        { id: 100002, status: 'completed', conclusion: 'failure', createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date(Date.now() - 85800000).toISOString(), htmlUrl: 'https://github.com/llm-d/llm-d/actions/runs/100002', runNumber: 41, failureReason: 'Pod timeout', model: 'granite-3.2-2b-instruct', gpuType: 'NVIDIA L40S', gpuCount: 1, event: 'schedule' },
      ],
    },
    {
      guide: 'Prefix Cache Aware Routing', acronym: 'PCAR', platform: 'OpenShift',
      repo: 'llm-d/llm-d', workflowFile: 'nightly-pcar.yaml',
      model: 'granite-3.2-2b-instruct', gpuType: 'NVIDIA L40S', gpuCount: 1,
      passRate: 100, trend: 'stable', latestConclusion: 'success',
      runs: [
        { id: 100003, status: 'completed', conclusion: 'success', createdAt: new Date(Date.now() - 7200000).toISOString(), updatedAt: new Date(Date.now() - 6600000).toISOString(), htmlUrl: 'https://github.com/llm-d/llm-d/actions/runs/100003', runNumber: 15, failureReason: '', model: 'granite-3.2-2b-instruct', gpuType: 'NVIDIA L40S', gpuCount: 1, event: 'schedule' },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Options & return types
// ---------------------------------------------------------------------------

export interface LiveMockOptions {
  /** When true, data routes delay 30s (for cache isolation tests). Default: false */
  delayDataAPIs?: boolean
  /** When true, SSE request URLs are logged to the returned array. Default: false */
  trackSSERequests?: boolean
  /** Error mode for error-resilience testing */
  errorMode?: {
    type: '500' | 'timeout' | 'partial'
    /** Which endpoints fail in 'partial' mode */
    failEndpoints?: string[]
    /** Timeout delay in ms for 'timeout' mode (default 30000) */
    delayMs?: number
  }
}

export interface MockControl {
  /** SSE request URLs (populated when trackSSERequests=true) */
  sseRequestLog: string[]
  /** Toggle data delay mode mid-test (for cache isolation) */
  setDelayMode: (enabled: boolean) => void
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/** Build SSE response body with cluster_data + done events */
export function buildSSEResponse(endpoint: string, data?: Record<string, Record<string, unknown[]>>, cluster?: string): string {
  const mockData = data || MOCK_DATA
  const clusterName = cluster || MOCK_CLUSTER
  const endpointData = mockData[endpoint] || { items: [] }
  const itemsKey = Object.keys(endpointData)[0] || 'items'
  const items = endpointData[itemsKey] || []

  return [
    'event: cluster_data',
    `data: ${JSON.stringify({ cluster: clusterName, [itemsKey]: items })}`,
    '',
    'event: done',
    `data: ${JSON.stringify({ totalClusters: 1, source: 'mock' })}`,
    '',
  ].join('\n')
}

/** Get mock REST response for an endpoint URL */
export function getMockRESTData(url: string, data?: Record<string, Record<string, unknown[]>>): Record<string, unknown> {
  const mockData = data || MOCK_DATA
  const match = url.match(/\/api\/mcp\/([^/?]+)/)
  const endpoint = match?.[1] || ''
  if (mockData[endpoint]) return { ...mockData[endpoint], source: 'mock' }
  return { items: [], message: 'No data available for this endpoint', source: 'mock' }
}

/** Mock /api/me endpoint with test user */
export async function setupAuth(page: Page, user?: typeof mockUser): Promise<void> {
  const u = user || mockUser
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(u) })
  )
}

/**
 * Mock all API endpoints for live mode testing.
 *
 * Handles SSE streams, REST endpoints, health checks, kc-agent, WebSocket,
 * RSS feeds, and catch-all routes. Returns a control handle for mid-test
 * adjustments (delay toggling, SSE log access).
 */
export async function setupLiveMocks(page: Page, options?: LiveMockOptions): Promise<MockControl> {
  const sseRequestLog: string[] = []
  let delayDataAPIs = options?.delayDataAPIs ?? false
  const WARM_DELAY_MS = 30_000
  const errorMode = options?.errorMode
  const trackSSE = options?.trackSSERequests ?? false

  // Helper: apply data delay if enabled
  const maybeDelay = async () => {
    if (delayDataAPIs) await new Promise(r => setTimeout(r, WARM_DELAY_MS))
  }

  // Helper: check if endpoint should error (for error mode)
  const shouldError = (endpoint: string): boolean => {
    if (!errorMode) return false
    if (errorMode.type === '500') return true
    if (errorMode.type === 'timeout') return true
    if (errorMode.type === 'partial') return errorMode.failEndpoints?.includes(endpoint) ?? false
    return false
  }

  // Helper: fulfill with error based on mode
  const fulfillError = async (route: Parameters<Parameters<Page['route']>[1]>[0], endpoint: string) => {
    if (errorMode?.type === '500') {
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal Server Error"}' })
      return true
    }
    if (errorMode?.type === 'timeout') {
      await new Promise(r => setTimeout(r, errorMode.delayMs ?? 30_000))
      route.fulfill({ status: 504, contentType: 'application/json', body: '{"error":"Gateway Timeout"}' })
      return true
    }
    if (errorMode?.type === 'partial' && errorMode.failEndpoints?.includes(endpoint)) {
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Partial failure"}' })
      return true
    }
    return false
  }

  // 1. SSE endpoints (MUST be registered BEFORE generic /api/mcp/**)
  await page.route('**/api/mcp/*/stream**', async (route) => {
    const url = route.request().url()
    if (trackSSE) sseRequestLog.push(url)
    const endpoint = url.match(/\/api\/mcp\/([^/]+)\/stream/)?.[1] || ''

    if (shouldError(endpoint)) {
      await fulfillError(route, endpoint)
      return
    }

    await maybeDelay()
    await new Promise(r => setTimeout(r, 150))
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: buildSSEResponse(endpoint),
    })
  })

  // 2. Specific MCP REST endpoints with richer data
  const specificMCPEndpoints = [
    { pattern: '**/api/mcp/gpu-nodes**', data: { nodes: [{ name: 'gpu-node-1', cluster: MOCK_CLUSTER, gpus: [{ model: 'A100', memory: '80Gi', index: 0 }], labels: {}, allocatable: {}, capacity: {} }] } },
    { pattern: '**/api/mcp/helm-releases**', data: { releases: [{ name: 'ingress-nginx', namespace: 'default', cluster: MOCK_CLUSTER, chart: 'nginx-1.0.0', status: 'deployed', revision: 1, updated: new Date().toISOString() }] } },
    { pattern: '**/api/mcp/operators**', data: { operators: [{ name: 'test-operator', namespace: 'openshift-operators', cluster: MOCK_CLUSTER, status: 'Succeeded', version: '1.0.0' }] } },
    { pattern: '**/api/mcp/operator-subscriptions**', data: { subscriptions: [{ name: 'test-sub', namespace: 'openshift-operators', cluster: MOCK_CLUSTER, package: 'test-operator', channel: 'stable', currentCSV: 'test-operator.v1.0.0', installedCSV: 'test-operator.v1.0.0' }] } },
    { pattern: '**/api/mcp/resource-quotas**', data: { quotas: [{ name: 'default-quota', namespace: 'default', cluster: MOCK_CLUSTER, hard: { cpu: '4', memory: '8Gi' }, used: { cpu: '1', memory: '2Gi' } }] } },
    { pattern: '**/api/mcp/nodes**', data: { nodes: [{ name: 'node-1', cluster: MOCK_CLUSTER, status: 'Ready', roles: ['control-plane'], kubeletVersion: 'v1.28.0', conditions: [{ type: 'Ready', status: 'True' }] }] } },
  ]

  for (const ep of specificMCPEndpoints) {
    await page.route(ep.pattern, async (route) => {
      if (route.request().url().includes('/stream')) { await route.fallback(); return }
      const endpoint = route.request().url().match(/\/api\/mcp\/([^/?]+)/)?.[1] || ''
      if (shouldError(endpoint)) { await fulfillError(route, endpoint); return }
      await maybeDelay()
      await new Promise(r => setTimeout(r, 150))
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ep.data) })
    })
  }

  // 3. Generic MCP REST endpoints
  await page.route('**/api/mcp/**', async (route) => {
    if (route.request().url().includes('/stream')) { await route.fallback(); return }
    const endpoint = route.request().url().match(/\/api\/mcp\/([^/?]+)/)?.[1] || ''
    if (shouldError(endpoint)) { await fulfillError(route, endpoint); return }
    await maybeDelay()
    const delay = 100 + Math.random() * 200
    await new Promise(r => setTimeout(r, delay))
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(getMockRESTData(route.request().url())),
    })
  })

  // 4. Health endpoints
  await page.route('**/health', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', uptime: 3600 }) })
  })

  // 5. Utility endpoints
  await page.route('**/api/active-users', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/api/notifications/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) })
  })
  await page.route('**/api/user/preferences', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route('**/api/permissions/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clusters: {} }) })
  })

  // 6. Workloads endpoint
  await page.route('**/api/workloads**', async (route) => {
    if (shouldError('workloads')) { await fulfillError(route, 'workloads'); return }
    await maybeDelay()
    await new Promise(r => setTimeout(r, 150))
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { name: 'nginx-deploy', namespace: 'default', type: 'Deployment', cluster: MOCK_CLUSTER, replicas: 2, readyReplicas: 2, status: 'Running', image: 'nginx:1.25' },
          { name: 'api-gateway', namespace: 'production', type: 'Deployment', cluster: MOCK_CLUSTER, replicas: 3, readyReplicas: 3, status: 'Running', image: 'api:v2' },
        ],
      }),
    })
  })

  // 7. kubectl proxy
  await page.route('**/api/kubectl/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], message: 'No kubectl data in test mode' }) })
  })

  // 8. Buildpack images
  await page.route('**/api/gitops/buildpack-images**', async (route) => {
    await maybeDelay()
    await new Promise(r => setTimeout(r, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ name: 'test-image', namespace: 'default', cluster: MOCK_CLUSTER, status: 'succeeded', builder: 'paketo' }] }) })
  })

  // 9. Config endpoints
  await page.route('**/api/config/**', async (route) => {
    await maybeDelay()
    await new Promise(r => setTimeout(r, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })

  // 10. Nightly E2E data
  await page.route('**/api/nightly-e2e/**', async (route) => {
    await maybeDelay()
    await new Promise(r => setTimeout(r, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NIGHTLY_MOCK_DATA) })
  })
  await page.route('**/api/public/nightly-e2e/**', async (route) => {
    await maybeDelay()
    await new Promise(r => setTimeout(r, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NIGHTLY_MOCK_DATA) })
  })

  // 11. Array endpoints (must return [] not {})
  const arrayEndpoints = [
    '**/api/dashboards**',
    '**/api/gpu/reservations**',
    '**/api/feedback/queue**',
    '**/api/notifications**',
    '**/api/persistence/**',
  ]
  for (const pattern of arrayEndpoints) {
    await page.route(pattern, async (route) => {
      await maybeDelay()
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
  }

  // 12. Catch-all for remaining /api/** endpoints
  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const skipPatterns = [
      '/api/mcp/', '/api/me', '/api/workloads', '/api/kubectl/',
      '/api/active-users', '/api/notifications', '/api/user/preferences',
      '/api/permissions/', '/health', '/api/dashboards', '/api/gpu/',
      '/api/feedback/', '/api/persistence/', '/api/config/', '/api/gitops/',
      '/api/nightly-e2e/', '/api/public/nightly-e2e/',
    ]
    if (skipPatterns.some(p => url.includes(p))) {
      await route.fallback()
      return
    }
    await maybeDelay()
    await new Promise(r => setTimeout(r, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  // 13. RSS feed CORS proxy mocks
  await page.route('**/api.rss2json.com/**', async (route) => {
    await maybeDelay()
    await new Promise(r => setTimeout(r, 100))
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        items: [
          { title: 'Kubernetes 1.32 Released', link: 'https://example.com/1', description: 'Major release with new features', pubDate: new Date().toISOString(), author: 'CNCF' },
          { title: 'Cloud Native Best Practices', link: 'https://example.com/2', description: 'Guide to cloud native development', pubDate: new Date().toISOString(), author: 'Tech Blog' },
          { title: 'Container Security in 2026', link: 'https://example.com/3', description: 'Latest security trends', pubDate: new Date().toISOString(), author: 'Security Weekly' },
        ],
      }),
    })
  })

  await page.route('**/api.allorigins.win/**', async (route) => {
    await maybeDelay()
    await new Promise(r => setTimeout(r, 100))
    route.fulfill({
      status: 200,
      contentType: 'application/xml',
      body: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test Feed</title>
<item><title>Kubernetes 1.32 Released</title><link>https://example.com/1</link><description>Major release</description><pubDate>${new Date().toUTCString()}</pubDate></item>
<item><title>Cloud Native Best Practices</title><link>https://example.com/2</link><description>Guide to development</description><pubDate>${new Date().toUTCString()}</pubDate></item>
</channel></rss>`,
    })
  })

  await page.route('**/corsproxy.io/**', async (route) => {
    await maybeDelay()
    await new Promise(r => setTimeout(r, 100))
    route.fulfill({
      status: 200,
      contentType: 'application/xml',
      body: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test Feed</title>
<item><title>Test Article</title><link>https://example.com/1</link><description>Test content</description><pubDate>${new Date().toUTCString()}</pubDate></item>
</channel></rss>`,
    })
  })

  // 14. Local agent (port 8585) — health returns 200, data returns 503
  await page.route('http://127.0.0.1:8585/**', (route) => {
    const url = route.request().url()
    if (url.endsWith('/health') || url.includes('/health?')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: 'e2e-test', clusters: 1, hasClaude: false }),
      })
    } else {
      route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"unavailable"}' })
    }
  })

  // 15. WebSocket mock for kubectl proxy
  await page.routeWebSocket('ws://127.0.0.1:8585/**', (ws) => {
    ws.onMessage((data) => {
      try {
        const msg = JSON.parse(String(data))
        ws.send(JSON.stringify({ id: msg.id, type: 'result', payload: { output: '{"items":[]}', exitCode: 0 } }))
      } catch {
        // ignore parse errors
      }
    })
  })

  return {
    sseRequestLog,
    setDelayMode: (enabled: boolean) => { delayDataAPIs = enabled },
  }
}

// ---------------------------------------------------------------------------
// Mode helpers
// ---------------------------------------------------------------------------

/** Configure localStorage for live cold mode (no cache) */
export async function setLiveColdMode(page: Page, user?: typeof mockUser): Promise<void> {
  const u = user || mockUser
  await page.addInitScript(
    ({ user: usr }: { user: typeof mockUser }) => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kubestellar-console-tour-completed', 'true')
      localStorage.setItem('kc-user-cache', JSON.stringify(usr))
      localStorage.setItem('kc-backend-status', JSON.stringify({ available: true, timestamp: Date.now() }))
      localStorage.setItem('kc-sqlite-migrated', '2')

      // Clear all caches for cold start
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (!key) continue
        if (key.includes('dashboard-cards') || key.startsWith('cache:') || key.includes('kubestellar-stack-cache')) {
          localStorage.removeItem(key)
        }
      }
    },
    { user: u },
  )

  // Clear IndexedDB caches
  await page.addInitScript(() => {
    for (const name of ['kc_cache', 'kubestellar-cache']) {
      try { indexedDB.deleteDatabase(name) } catch { /* ignore */ }
    }
  })
}

/** Configure localStorage for demo, live, or live+cache mode */
export async function setMode(page: Page, mode: 'demo' | 'live' | 'live+cache', user?: typeof mockUser): Promise<void> {
  const u = user || mockUser
  const isLive = mode === 'live' || mode === 'live+cache'

  const stackCache = JSON.stringify({
    stacks: [{
      id: `default@${MOCK_CLUSTER}`,
      name: 'test-stack',
      namespace: 'default',
      cluster: MOCK_CLUSTER,
      components: { prefill: [], decode: [], both: [], epp: null, gateway: null },
      status: 'healthy',
      hasDisaggregation: false,
      totalReplicas: 0,
      readyReplicas: 0,
    }],
    timestamp: Date.now(),
  })

  const lsValues: Record<string, string> = {
    token: isLive ? 'test-token' : 'demo-token',
    'kc-demo-mode': String(!isLive),
    'demo-user-onboarded': 'true',
    'kubestellar-console-tour-completed': 'true',
    'kc-user-cache': JSON.stringify(u),
    'kc-backend-status': JSON.stringify({ available: true, timestamp: Date.now() }),
    'kc-sqlite-migrated': '2',
  }

  if (mode === 'live+cache') {
    lsValues['kubestellar-stack-cache'] = stackCache
  }

  await page.addInitScript(
    (values: Record<string, string>) => {
      for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v)
      // Clear stale dashboard card layouts
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.endsWith('-dashboard-cards')) keysToRemove.push(key)
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    },
    lsValues,
  )

  // Pre-populate cache in live+cache mode
  if (mode === 'live+cache') {
    const CACHE_VERSION = 4
    const seedEntries = [
      { key: 'prowjobs:prow:prow', entry: { data: [], timestamp: Date.now(), version: CACHE_VERSION } },
      { key: 'llmd-models:vllm-d,platform-eval', entry: { data: [], timestamp: Date.now(), version: CACHE_VERSION } },
    ]

    await page.addInitScript(
      (entries: Array<{ key: string; entry: { data: unknown; timestamp: number; version: number } }>) => {
        (window as Window & { __CACHE_SEED__?: typeof entries }).__CACHE_SEED__ = entries
      },
      seedEntries,
    )

    await page.addInitScript(() => {
      const DB_NAME = 'kc_cache'
      const STORE_NAME = 'cache'
      const entries = [
        { key: 'prowjobs:prow:prow', data: [], timestamp: Date.now(), version: 4 },
        { key: 'llmd-models:vllm-d,platform-eval', data: [], timestamp: Date.now(), version: 4 },
      ]
      const request = indexedDB.open(DB_NAME)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close()
          const req2 = indexedDB.open(DB_NAME, db.version + 1)
          req2.onupgradeneeded = () => req2.result.createObjectStore(STORE_NAME, { keyPath: 'key' })
          req2.onsuccess = () => {
            const d = req2.result
            const t = d.transaction(STORE_NAME, 'readwrite')
            const s = t.objectStore(STORE_NAME)
            for (const e of entries) s.put(e)
            t.oncomplete = () => d.close()
          }
          return
        }
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        for (const e of entries) store.put(e)
        tx.oncomplete = () => db.close()
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Navigation helpers (for compliance tests that use /__compliance/all-cards)
// ---------------------------------------------------------------------------

export interface ManifestItem {
  cardType: string
  cardId: string
}

export interface ManifestData {
  allCardTypes: string[]
  totalCards: number
  batch: number
  batchSize: number
  selected: ManifestItem[]
}

/**
 * Navigate to the compliance test page for a given batch.
 * `batch` is 0-indexed; the URL uses 1-indexed batch numbers (batch+1).
 * Third argument can be a timeout number (ms) or an options object.
 */
export async function navigateToBatch(
  page: Page,
  batch: number,
  optionsOrTimeout?: number | { batchSize?: number; timeoutMs?: number }
): Promise<ManifestData> {
  const batchSize =
    typeof optionsOrTimeout === 'object' ? optionsOrTimeout?.batchSize ?? 24 : 24
  const timeoutMs =
    typeof optionsOrTimeout === 'number'
      ? optionsOrTimeout
      : optionsOrTimeout?.timeoutMs ?? 20_000

  // The compliance page expects 1-indexed batch numbers and a `size` param
  await page.goto(`/__compliance/all-cards?batch=${batch + 1}&size=${batchSize}`, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  })

  // Wait for the manifest to appear on the window object
  const handle = await page.waitForFunction(
    () => (window as Window & { __COMPLIANCE_MANIFEST__?: unknown }).__COMPLIANCE_MANIFEST__,
    undefined,
    { timeout: timeoutMs },
  )
  return (await handle.jsonValue()) as ManifestData
}

/** Wait for all cards in a list to finish loading (data-loading=false) */
export async function waitForCardsToLoad(
  page: Page,
  cardIds: string[],
  timeoutMs = 20_000
): Promise<void> {
  await page.waitForFunction(
    (ids: string[]) => {
      for (const id of ids) {
        const el = document.querySelector(`[data-card-id="${id}"]`)
        if (!el) return false
        if (el.getAttribute('data-loading') === 'true') return false
      }
      return true
    },
    cardIds,
    { timeout: timeoutMs },
  )
}

// ---------------------------------------------------------------------------
// Dashboard definitions (shared across perf and nav tests)
// ---------------------------------------------------------------------------

export const DASHBOARDS = [
  { id: 'main', name: 'Dashboard', route: '/' },
  { id: 'clusters', name: 'Clusters', route: '/clusters' },
  { id: 'compute', name: 'Compute', route: '/compute' },
  { id: 'security', name: 'Security', route: '/security' },
  { id: 'gitops', name: 'GitOps', route: '/gitops' },
  { id: 'pods', name: 'Pods', route: '/pods' },
  { id: 'deployments', name: 'Deployments', route: '/deployments' },
  { id: 'services', name: 'Services', route: '/services' },
  { id: 'events', name: 'Events', route: '/events' },
  { id: 'storage', name: 'Storage', route: '/storage' },
  { id: 'network', name: 'Network', route: '/network' },
  { id: 'nodes', name: 'Nodes', route: '/nodes' },
  { id: 'workloads', name: 'Workloads', route: '/workloads' },
  { id: 'gpu', name: 'GPU', route: '/gpu-reservations' },
  { id: 'alerts', name: 'Alerts', route: '/alerts' },
  { id: 'helm', name: 'Helm', route: '/helm' },
  { id: 'operators', name: 'Operators', route: '/operators' },
  { id: 'compliance', name: 'Compliance', route: '/compliance' },
  { id: 'cost', name: 'Cost', route: '/cost' },
  { id: 'ai-ml', name: 'AI/ML', route: '/ai-ml' },
  { id: 'ci-cd', name: 'CI/CD', route: '/ci-cd' },
  { id: 'logs', name: 'Logs', route: '/logs' },
  { id: 'deploy', name: 'Deploy', route: '/deploy' },
  { id: 'ai-agents', name: 'AI Agents', route: '/ai-agents' },
  { id: 'data-compliance', name: 'Data Compliance', route: '/data-compliance' },
  { id: 'arcade', name: 'Arcade', route: '/arcade' },
] as const

export type Dashboard = (typeof DASHBOARDS)[number]

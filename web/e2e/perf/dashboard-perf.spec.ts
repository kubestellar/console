import { test, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import {
  setupNetworkInterceptor,
  summarizeReport,
  type DashboardMetric,
  type CardMetric,
  type PerfReport,
} from './metrics'

// ---------------------------------------------------------------------------
// Dashboard definitions — route + human name for each dashboard to test
// ---------------------------------------------------------------------------

const DASHBOARDS = [
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
]

// Max cards to measure per dashboard (prevent very long tests)
const MAX_CARDS_PER_DASHBOARD = 20
// How long to wait for a card to show content before marking as timed out
const CARD_CONTENT_TIMEOUT = 25_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUser = {
  id: '1',
  github_id: '12345',
  github_login: 'perftest',
  email: 'perf@test.com',
  onboarded: true,
}

async function setupAuth(page: Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) })
  )
}

// ---------------------------------------------------------------------------
// Mock data for live mode — enough content so cards render >10 chars of text
// ---------------------------------------------------------------------------

const MOCK_CLUSTER = 'perf-test-cluster'

const MOCK_DATA: Record<string, Record<string, unknown[]>> = {
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
  'deployment-issues': {
    issues: [],
  },
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

/** Build an SSE response body with cluster_data + done events */
function buildSSEResponse(endpoint: string): string {
  const data = MOCK_DATA[endpoint]
  const itemsKey = Object.keys(data || {})[0] || 'items'
  const items = data ? data[itemsKey] || [] : []

  const lines: string[] = []
  // Send one cluster_data event with the mock data
  lines.push('event: cluster_data')
  lines.push(`data: ${JSON.stringify({ cluster: MOCK_CLUSTER, [itemsKey]: items })}`)
  lines.push('')
  // Send done event to cleanly close the stream
  lines.push('event: done')
  lines.push(`data: ${JSON.stringify({ totalClusters: 1, source: 'mock' })}`)
  lines.push('')

  return lines.join('\n')
}

/** Get mock REST response for an endpoint URL */
function getMockRESTData(url: string): Record<string, unknown> {
  // Extract endpoint from URL like /api/mcp/pods?cluster=x or /api/mcp/pods
  const match = url.match(/\/api\/mcp\/([^/?]+)/)
  const endpoint = match?.[1] || ''
  const data = MOCK_DATA[endpoint]
  if (data) return { ...data, source: 'mock' }
  // Default: return a generic response with enough text content
  return { items: [], message: 'No data available for this endpoint', source: 'mock' }
}

/**
 * Mock all API endpoints for live mode testing.
 * Handles SSE streams, REST endpoints, health checks, and utility endpoints.
 */
async function setupLiveMocks(page: Page) {
  // 1. Mock SSE endpoints with proper text/event-stream content type.
  //    EventSource rejects non-text/event-stream responses, causing infinite
  //    reconnection loops that can crash the browser.
  //    IMPORTANT: Register this BEFORE the generic /api/mcp/** handler.
  await page.route('**/api/mcp/*/stream**', (route) => {
    const url = route.request().url()
    const endpoint = url.match(/\/api\/mcp\/([^/]+)\/stream/)?.[1] || ''
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
      body: buildSSEResponse(endpoint),
    })
  })

  // 2. Mock regular MCP REST API endpoints with realistic data
  await page.route('**/api/mcp/**', async (route) => {
    // Skip stream endpoints (already handled above)
    if (route.request().url().includes('/stream')) {
      await route.fallback()
      return
    }
    // Simulate 100-300ms backend latency
    const delay = 100 + Math.random() * 200
    await new Promise((r) => setTimeout(r, delay))
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(getMockRESTData(route.request().url())),
    })
  })

  // 3. Mock health endpoints (backend + local agent)
  await page.route('**/health', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', uptime: 3600 }),
    })
  })

  // 4. Mock utility endpoints that could hang or error
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
    // usePermissions expects PermissionsSummary = { clusters: Record<string, ClusterPermissions> }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clusters: {} }) })
  })
  await page.route('**/api/workloads**', (route) => {
    // useCachedWorkloads fetcher expects { items: [...] } or a raw array.
    // Returning { workloads: [...] } causes items.map() to throw because
    // (data.items || data) resolves to the object, not an array.
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

  // 5. Mock kubectl proxy (used by OPA Policies card)
  await page.route('**/api/kubectl/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], message: 'No kubectl data in test mode' }),
    })
  })

  // 6. Endpoints that return ARRAYS (not objects) — the catch-all returns an
  //    object `{items:[]}` which crashes any code that iterates the response
  //    with `for (const x of data)` since plain objects aren't iterable.
  //    useDashboards:    setDashboards(data || [])  →  for (const d of dashboards) in useSearchIndex
  //    useGPUReservations: setReservations(data)    →  .map() / .sort() on array
  //    useFeatureRequests: setRequests(data || [])   →  .map() / .filter() on array
  //    useConsoleCRs:      setItems(data || [])      →  .map() on array
  const arrayEndpoints = [
    '**/api/dashboards**',
    '**/api/gpu/reservations**',
    '**/api/feedback/queue**',
    '**/api/notifications**',
    '**/api/persistence/**',
  ]
  for (const pattern of arrayEndpoints) {
    await page.route(pattern, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
  }

  // 7. Catch-all for any other /api/ endpoints to prevent real network requests
  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    // Skip already-handled routes
    if (url.includes('/api/mcp/') || url.includes('/api/me') || url.includes('/api/workloads') ||
        url.includes('/api/kubectl/') || url.includes('/api/active-users') ||
        url.includes('/api/notifications') || url.includes('/api/user/preferences') ||
        url.includes('/api/permissions/') || url.includes('/health') ||
        url.includes('/api/dashboards') || url.includes('/api/gpu/') ||
        url.includes('/api/feedback/') || url.includes('/api/persistence/')) {
      await route.fallback()
      return
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], source: 'mock-catchall' }),
    })
  })

  // 8. Mock ALL requests to the local agent (port 8585).
  //    Without this, kubectlProxy tries ws://127.0.0.1:8585/ws (30s timeout
  //    per cluster), kagenti hooks try http://127.0.0.1:8585/kagenti/* (15s
  //    timeout), and useStackDiscovery chains 7 parallel kubectlProxy.exec()
  //    calls per cluster.  These are the root cause of 15+ second card loads
  //    on Clusters, AI/ML, CI/CD, and Compliance dashboards.
  //
  //    CRITICAL: /health must return 200 so AgentManager stays 'connected'.
  //    If it returns 503, AgentManager transitions to 'disconnected', which
  //    triggers forceSkeletonForOffline in CardWrapper — forcing ALL cards
  //    into skeleton/loading state regardless of whether they have data.
  //    All other endpoints return 503 so hooks fail fast and fall through
  //    to their SSE/REST data paths.
  //
  //    This route is registered LAST (Playwright routes are LIFO) so it takes
  //    priority over the generic **/health handler for agent health requests.
  await page.route('http://127.0.0.1:8585/**', (route) => {
    const url = route.request().url()
    if (url.endsWith('/health') || url.includes('/health?')) {
      // Return healthy agent response so AgentManager stays 'connected'
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          version: 'perf-test',
          clusters: 1,
          hasClaude: false,
        }),
      })
    } else {
      // Return 503 for data endpoints so hooks fail fast and fall through
      route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"unavailable"}' })
    }
  })

  // 9. Intercept WebSocket connections to the local agent.
  //    kubectlProxy uses ws://127.0.0.1:8585/ws for kubectl exec commands.
  //    Instead of closing immediately (which leaves hooks in loading state),
  //    respond to each kubectl message with an empty result. This lets hooks
  //    complete their fetch cycle and transition out of loading state.
  await page.routeWebSocket('ws://127.0.0.1:8585/**', (ws) => {
    ws.onMessage((data) => {
      try {
        const msg = JSON.parse(String(data))
        // Respond with empty kubectl result for each request
        ws.send(JSON.stringify({
          id: msg.id,
          type: 'result',
          payload: { output: '{"items":[]}', exitCode: 0 },
        }))
      } catch {
        // Ignore parse errors
      }
    })
  })
}

/**
 * Configure localStorage for demo or live mode.
 *
 * Uses page.addInitScript() to inject localStorage values BEFORE any
 * page scripts execute.  This avoids the race condition caused by
 * navigating to /login first (where React could start a client-side
 * redirect that races with the subsequent page.goto()).
 *
 * We also do a brief initial navigation to about:blank on the target
 * origin to establish localStorage, then the addInitScript re-applies
 * on each subsequent page.goto().
 */
async function setMode(page: Page, mode: 'demo' | 'live' | 'live+cache') {
  // Pre-populate stack cache so useStackDiscovery starts with cached data and
  // isLoading=false.  Without this, the hook fires 7 sequential kubectlProxy
  // WebSocket calls per cluster (max 2 concurrent) which adds 300-500ms to
  // AI/ML dashboard rendering.  With the cache, the refetch is silent (background)
  // and doesn't block card rendering.
  const stackCache = JSON.stringify({
    stacks: [{
      id: 'default@perf-test-cluster',
      name: 'perf-stack',
      namespace: 'default',
      cluster: 'perf-test-cluster',
      components: { prefill: [], decode: [], both: [], epp: null, gateway: null },
      status: 'healthy',
      hasDisaggregation: false,
      totalReplicas: 0,
      readyReplicas: 0,
    }],
    timestamp: Date.now(),
  })

  const isLive = mode === 'live' || mode === 'live+cache'

  const lsValues: Record<string, string> = {
    token: isLive ? 'test-token' : 'demo-token',
    'kc-demo-mode': String(!isLive),
    'demo-user-onboarded': 'true',
    'kubestellar-console-tour-completed': 'true',
    'kc-user-cache': JSON.stringify(mockUser),
    'kc-backend-status': JSON.stringify({ available: true, timestamp: Date.now() }),
  }

  // Only pre-populate localStorage stack cache in warm mode (live+cache).
  // Cold live mode tests measure worst-case first-visit performance.
  if (mode === 'live+cache') {
    lsValues['kubestellar-stack-cache'] = stackCache
  }

  // addInitScript fires before any page JS on every navigation,
  // ensuring localStorage is always set before React bootstraps.
  await page.addInitScript(
    (values: Record<string, string>) => {
      for (const [k, v] of Object.entries(values)) {
        localStorage.setItem(k, v)
      }
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

  // In live mode, pre-populate IndexedDB `kc_cache` so useCache hooks find
  // valid data on mount.  Without this, hooks like useCachedProwJobs (CI/CD)
  // and useCachedLLMdModels (AI/ML) start with isLoading=true and must wait
  // for kubectlProxy WebSocket responses.  With pre-populated cache, useCache
  // sees hasCachedData=true → isLoading=false → cards render immediately.
  //
  // This runs as an addInitScript (fires before any page JS).  The async IDB
  // write completes well before React boots and useCache reads from IDB.
  if (mode === 'live+cache') {
    await page.addInitScript(() => {
      const CACHE_VERSION = 4
      const DB_NAME = 'kc_cache'
      const STORE_NAME = 'cache'
      const entries = [
        { key: 'prowjobs:prow:prow', data: [], timestamp: Date.now(), version: CACHE_VERSION },
        { key: 'llmd-models:vllm-d,platform-eval', data: [], timestamp: Date.now(), version: CACHE_VERSION },
      ]
      const request = indexedDB.open(DB_NAME)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
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

/**
 * Navigate to a dashboard and measure every card on it.
 *
 * Uses a SINGLE browser-side polling function that atomically discovers cards
 * AND monitors their loading state.  This eliminates the race condition where
 * separate waitForSelector → page.evaluate calls lose elements because React
 * re-renders between the two CDP round-trips.
 */
async function measureDashboard(
  page: Page,
  dashboard: (typeof DASHBOARDS)[0],
  mode: 'demo' | 'live' | 'live+cache'
): Promise<DashboardMetric> {
  const networkTimings = setupNetworkInterceptor(page)

  const navStart = Date.now()
  await page.goto(dashboard.route, { waitUntil: 'domcontentloaded' })

  // Wait for React to mount and the Layout component to render.
  // Without this, we start polling for cards before the page-level
  // lazy chunk has loaded, and the 5-second "genuinely 0 cards" timeout
  // fires while the page is still showing the Suspense loading fallback.
  // GPU is a custom page with no sidebar, so we skip this wait for it.
  if (dashboard.id !== 'gpu') {
    try {
      await page.waitForSelector('[data-testid="sidebar"]', { timeout: 10_000 })
    } catch {
      // If sidebar doesn't appear, log but continue — we'll still measure what renders
    }
  }

  // --- Single atomic discover + monitor ---
  type PerfResult = {
    cards: { cardType: string; cardId: string; isDemoCard: boolean }[]
    loadTimes: Record<string, number>
  }

  let perfResult: PerfResult = { cards: [], loadTimes: {} }
  const timedOutCards = new Set<string>()

  try {
    const handle = await page.waitForFunction(
      ({ maxCards }: { maxCards: number }) => {
        // Per-page state stored on window so it persists across polls
        const w = window as Window & {
          __perf?: {
            startTime: number
            tracked: Record<string, { ct: string; demo: boolean; t: number | null }>
            lastCount: number
            stableAt: number
          }
        }
        if (!w.__perf) {
          w.__perf = {
            startTime: performance.now(),
            tracked: {},
            lastCount: -1,
            stableAt: performance.now(),
          }
        }
        const st = w.__perf
        const now = performance.now()
        const elapsed = now - st.startTime

        // --- Phase A: Discover [data-card-type] elements ---
        const els = document.querySelectorAll('[data-card-type]')
        const count = Math.min(els.length, maxCards)

        // Track any newly-appeared cards
        for (let i = 0; i < count; i++) {
          const el = els[i]
          const id = el.getAttribute('data-card-id') || `card-${i}`
          if (!st.tracked[id]) {
            st.tracked[id] = {
              ct: el.getAttribute('data-card-type') || `unknown-${i}`,
              demo: !!el.querySelector('[data-testid="demo-badge"]'),
              t: null,
            }
          }
        }

        // --- Phase B: Monitor loading state for all tracked cards ---
        for (const id of Object.keys(st.tracked)) {
          if (st.tracked[id].t !== null) continue // already loaded
          const el = document.querySelector(`[data-card-id="${id}"]`)
          if (!el) continue // temporarily unmounted — keep polling
          if (el.getAttribute('data-loading') === 'true') continue
          let hasSkeleton = false
          for (const p of el.querySelectorAll('.animate-pulse')) {
            if ((p as HTMLElement).getBoundingClientRect().height > 40) {
              hasSkeleton = true
              break
            }
          }
          if (hasSkeleton) continue
          if ((el.textContent || '').trim().length <= 10) continue
          st.tracked[id].t = Math.round(now)
        }

        // --- Stability: card count unchanged for 500ms ---
        if (count !== st.lastCount) {
          st.stableAt = now
          st.lastCount = count
        }
        const stable = now - st.stableAt > 500

        const ids = Object.keys(st.tracked)
        const allLoaded = ids.length > 0 && ids.every((id) => st.tracked[id].t !== null)

        // Resolve: all cards loaded AND count stable
        if (allLoaded && stable) {
          const r: {
            cards: { cardType: string; cardId: string; isDemoCard: boolean }[]
            loadTimes: Record<string, number>
          } = { cards: [], loadTimes: {} }
          for (const id of ids) {
            r.cards.push({ cardType: st.tracked[id].ct, cardId: id, isDemoCard: st.tracked[id].demo })
            if (st.tracked[id].t !== null) r.loadTimes[id] = st.tracked[id].t as number
          }
          return r
        }

        // No cards after 8s — some dashboards genuinely have 0 cards
        if (elapsed > 8000 && ids.length === 0 && count === 0 && stable) {
          return { cards: [] as { cardType: string; cardId: string; isDemoCard: boolean }[], loadTimes: {} as Record<string, number> }
        }

        return false // keep polling
      },
      { maxCards: MAX_CARDS_PER_DASHBOARD },
      { timeout: CARD_CONTENT_TIMEOUT + 5000, polling: 100 }
    )

    perfResult = (await handle.jsonValue()) as PerfResult
  } catch {
    // Timeout — collect partial results from window.__perf
    try {
      perfResult = await page.evaluate(() => {
        const w = window as Window & {
          __perf?: {
            tracked: Record<string, { ct: string; demo: boolean; t: number | null }>
          }
        }
        if (!w.__perf) return { cards: [], loadTimes: {} }
        const r: {
          cards: { cardType: string; cardId: string; isDemoCard: boolean }[]
          loadTimes: Record<string, number>
        } = { cards: [], loadTimes: {} }
        for (const [id, info] of Object.entries(w.__perf.tracked)) {
          r.cards.push({ cardType: info.ct, cardId: id, isDemoCard: info.demo })
          if (info.t !== null) r.loadTimes[id] = info.t
        }
        return r
      })
    } catch {
      // Page might have crashed
    }
    for (const card of perfResult.cards) {
      if (perfResult.loadTimes[card.cardId] === undefined) timedOutCards.add(card.cardId)
    }
  }

  // Debug: log if no cards found at all
  if (perfResult.cards.length === 0) {
    try {
      const debugState = await page.evaluate(() => ({
        url: window.location.pathname,
        cardTypeCount: document.querySelectorAll('[data-card-type]').length,
        hasSidebar: !!document.querySelector('[data-testid="sidebar"]'),
        hasMain: !!document.querySelector('main'),
        h1: document.querySelector('h1')?.textContent || 'none',
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
        hasTourPrompt: !!document.querySelector('[data-testid="tour-prompt"]'),
        backendStatus: localStorage.getItem('kc-backend-status'),
        bodyText: (document.body.textContent || '').slice(0, 500),
      }))
      console.log(`  NO CARDS on ${dashboard.name}: ${JSON.stringify(debugState)}`)
    } catch { /* page unavailable */ }
  }

  // --- Build CardMetric array ---
  const cardMetrics: CardMetric[] = []
  let firstCardTime = Infinity
  let lastCardTime = 0

  for (const info of perfResult.cards) {
    const loadTimeMs = perfResult.loadTimes[info.cardId]
    const timedOut = timedOutCards.has(info.cardId)
    const timeToFirstContent = loadTimeMs !== undefined ? loadTimeMs : Date.now() - navStart

    if (timedOut) {
      try {
        const debugInfo = await page.evaluate((sel: string) => {
          const card = document.querySelector(sel)
          if (!card) return { found: false }
          const pulses: { h: number; w: number }[] = []
          for (const el of card.querySelectorAll('.animate-pulse')) {
            const r = el.getBoundingClientRect()
            pulses.push({ h: r.height, w: r.width })
          }
          const text = (card.textContent || '').trim()
          return { found: true, loading: card.getAttribute('data-loading'), pulses, textLen: text.length, text: text.slice(0, 200) }
        }, `[data-card-id="${info.cardId}"]`)
        console.log(`  TIMEOUT DEBUG [${info.cardType}/${info.cardId}]:`, JSON.stringify(debugInfo, null, 2))
      } catch {
        console.log(`  TIMEOUT DEBUG [${info.cardType}/${info.cardId}]: page unavailable`)
      }
    }

    if (!timedOut) {
      firstCardTime = Math.min(firstCardTime, timeToFirstContent)
      lastCardTime = Math.max(lastCardTime, timeToFirstContent)
    }

    cardMetrics.push({
      cardType: info.cardType,
      cardId: info.cardId,
      isDemoDataCard: info.isDemoCard || mode === 'demo',
      apiTimeToFirstByte: null,
      apiTotalTime: null,
      skeletonDuration: timedOut ? CARD_CONTENT_TIMEOUT : timeToFirstContent,
      timeToFirstContent,
      timedOut,
    })
  }

  // Correlate network timings
  const networkEntries = [...networkTimings.values()]
  if (networkEntries.length > 0) {
    const avgTtfb = Math.round(networkEntries.reduce((s, t) => s + t.ttfb, 0) / networkEntries.length)
    const avgTotal = Math.round(networkEntries.reduce((s, t) => s + t.totalTime, 0) / networkEntries.length)
    for (const cm of cardMetrics) {
      cm.apiTimeToFirstByte = avgTtfb
      cm.apiTotalTime = avgTotal
    }
  }

  return {
    dashboardId: dashboard.id,
    dashboardName: dashboard.name,
    route: dashboard.route,
    mode,
    navigationStartMs: navStart,
    firstCardVisibleMs: firstCardTime === Infinity ? -1 : firstCardTime,
    lastCardVisibleMs: lastCardTime === 0 ? -1 : lastCardTime,
    totalApiRequests: networkTimings.size,
    cards: cardMetrics,
  }
}

// ---------------------------------------------------------------------------
// Report accumulator
// ---------------------------------------------------------------------------

const perfReport: PerfReport = {
  timestamp: new Date().toISOString(),
  dashboards: [],
}

// ---------------------------------------------------------------------------
// Warmup — prime Vite module cache so first real test isn't penalized
// ---------------------------------------------------------------------------

test('warmup (demo live live+cache) — prime Vite module cache', async ({ page }) => {
  await setupAuth(page)
  await setMode(page, 'demo')
  // Navigate through several dashboards to warm up React + card chunk modules.
  // Each route triggers loading of unique card components not shared by others.
  // Test name contains both "demo" and "live" so it runs regardless of grep filter.
  const warmupRoutes = ['/', '/deploy', '/ai-ml', '/compliance', '/ci-cd', '/arcade']
  for (const route of warmupRoutes) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForSelector('[data-card-type]', { timeout: 8_000 })
    } catch { /* ignore — just warming up */ }
  }
})

// ---------------------------------------------------------------------------
// Test generation
// ---------------------------------------------------------------------------

for (const dashboard of DASHBOARDS) {
  for (const mode of ['demo', 'live', 'live+cache'] as const) {
    test(`${dashboard.name} (${mode}) — card loading performance`, async ({ page }) => {
      // Capture uncaught JS errors to debug React crashes
      const pageErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(err.message))

      await setupAuth(page)
      if (mode === 'live' || mode === 'live+cache') await setupLiveMocks(page)
      await setMode(page, mode)

      const metric = await measureDashboard(page, dashboard, mode)
      perfReport.dashboards.push(metric)

      // Log per-test summary
      const validCards = metric.cards.filter((c) => !c.timedOut)
      const avg =
        validCards.length > 0
          ? Math.round(validCards.reduce((s, c) => s + c.timeToFirstContent, 0) / validCards.length)
          : -1
      console.log(
        `  ${dashboard.name} (${mode}): cards=${metric.cards.length} first=${metric.firstCardVisibleMs}ms avg=${avg}ms api_reqs=${metric.totalApiRequests}`
      )
      if (pageErrors.length > 0) {
        console.log(`  JS ERRORS: ${pageErrors.map(e => e.slice(0, 120)).join(' | ')}`)
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Write report after all tests
// ---------------------------------------------------------------------------

test.afterAll(async () => {
  const outDir = path.resolve(__dirname, '../test-results')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  fs.writeFileSync(path.join(outDir, 'perf-report.json'), JSON.stringify(perfReport, null, 2))

  const summary = summarizeReport(perfReport)
  console.log(summary)

  // Also write a text summary
  fs.writeFileSync(path.join(outDir, 'perf-summary.txt'), summary)
})

import { test, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Scenario = 'cold-nav' | 'warm-nav' | 'rapid-nav'

interface NavMetric {
  from: string
  to: string
  targetName: string
  scenario: Scenario
  clickToUrlChangeMs: number
  urlChangeToFirstCardMs: number
  urlChangeToAllCardsMs: number
  totalMs: number
  cardsFound: number
  cardsLoaded: number
  cardsTimedOut: number
}

interface NavReport {
  timestamp: string
  metrics: NavMetric[]
}

// ---------------------------------------------------------------------------
// Dashboard definitions — same set as dashboard-perf.spec.ts
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
  { id: 'gpu', name: 'GPU Reservations', route: '/gpu-reservations' },
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

// How long to wait for cards to load after navigation
const NAV_CARD_TIMEOUT_MS = 15_000
// How long to wait for initial app load
const APP_LOAD_TIMEOUT_MS = 15_000

// ---------------------------------------------------------------------------
// Mock data & helpers (reused from dashboard-perf.spec.ts)
// ---------------------------------------------------------------------------

const mockUser = {
  id: '1',
  github_id: '12345',
  github_login: 'perftest',
  email: 'perf@test.com',
  onboarded: true,
}

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

function buildSSEResponse(endpoint: string): string {
  const data = MOCK_DATA[endpoint]
  const itemsKey = Object.keys(data || {})[0] || 'items'
  const items = data ? data[itemsKey] || [] : []
  return [
    'event: cluster_data',
    `data: ${JSON.stringify({ cluster: MOCK_CLUSTER, [itemsKey]: items })}`,
    '',
    'event: done',
    `data: ${JSON.stringify({ totalClusters: 1, source: 'mock' })}`,
    '',
  ].join('\n')
}

function getMockRESTData(url: string): Record<string, unknown> {
  const match = url.match(/\/api\/mcp\/([^/?]+)/)
  const endpoint = match?.[1] || ''
  const data = MOCK_DATA[endpoint]
  if (data) return { ...data, source: 'mock' }
  return { items: [], message: 'No data available for this endpoint', source: 'mock' }
}

// ---------------------------------------------------------------------------
// Page setup
// ---------------------------------------------------------------------------

async function setupAuth(page: Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) })
  )
}

async function setupLiveMocks(page: Page) {
  // SSE streams
  await page.route('**/api/mcp/*/stream**', (route) => {
    const url = route.request().url()
    const endpoint = url.match(/\/api\/mcp\/([^/]+)\/stream/)?.[1] || ''
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: buildSSEResponse(endpoint),
    })
  })

  // REST MCP endpoints
  await page.route('**/api/mcp/**', async (route) => {
    if (route.request().url().includes('/stream')) {
      await route.fallback()
      return
    }
    const delay = 100 + Math.random() * 200
    await new Promise((r) => setTimeout(r, delay))
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(getMockRESTData(route.request().url())),
    })
  })

  // Health
  await page.route('**/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', uptime: 3600 }) })
  )

  // Utility endpoints
  await page.route('**/api/active-users', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api/notifications/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) })
  )
  await page.route('**/api/user/preferences', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )
  await page.route('**/api/permissions/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clusters: {} }) })
  )
  await page.route('**/api/workloads**', (route) =>
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
  )

  // kubectl proxy
  await page.route('**/api/kubectl/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], message: 'No kubectl data in test mode' }) })
  )

  // Array endpoints (must return [] not {items:[]})
  const arrayEndpoints = [
    '**/api/dashboards**',
    '**/api/gpu/reservations**',
    '**/api/feedback/queue**',
    '**/api/notifications**',
    '**/api/persistence/**',
  ]
  for (const pattern of arrayEndpoints) {
    await page.route(pattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
  }

  // Catch-all for remaining /api/ routes
  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/api/mcp/') || url.includes('/api/me') || url.includes('/api/workloads') ||
        url.includes('/api/kubectl/') || url.includes('/api/active-users') ||
        url.includes('/api/notifications') || url.includes('/api/user/preferences') ||
        url.includes('/api/permissions/') || url.includes('/health') ||
        url.includes('/api/dashboards') || url.includes('/api/gpu/') ||
        url.includes('/api/feedback/') || url.includes('/api/persistence/')) {
      await route.fallback()
      return
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], source: 'mock-catchall' }) })
  })

  // External requests
  await page.route('**/api.github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.route('**/api.rss2json.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        items: [
          { title: 'Test Article 1', link: 'https://example.com/1', description: 'Test', pubDate: new Date().toISOString(), author: 'Test' },
          { title: 'Test Article 2', link: 'https://example.com/2', description: 'Test', pubDate: new Date().toISOString(), author: 'Test' },
        ],
      }),
    })
  )
  await page.route('**/api.allorigins.win/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/xml',
      body: `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title><item><title>Test</title><link>https://example.com/1</link><description>Test</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`,
    })
  )
  await page.route('**/corsproxy.io/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/xml',
      body: `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title><item><title>Test</title><link>https://example.com/1</link><description>Test</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`,
    })
  )

  // kc-agent (port 8585) — must return 200 for /health so AgentManager stays
  // 'connected'. Other endpoints return valid empty data so hooks complete
  // their fetch cycle instead of forcing skeleton state via forceSkeletonForOffline.
  await page.route('http://127.0.0.1:8585/**', (route) => {
    const url = route.request().url()
    if (url.endsWith('/health') || url.includes('/health?')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: 'perf-test', clusters: 1, hasClaude: false }),
      })
      return
    }
    if (url.includes('/settings')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }
    if (url.includes('/clusters')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // WebSocket
  await page.routeWebSocket('ws://127.0.0.1:8585/**', (ws) => {
    ws.onMessage((data) => {
      try {
        const msg = JSON.parse(String(data))
        ws.send(JSON.stringify({ id: msg.id, type: 'result', payload: { output: '{"items":[]}', exitCode: 0 } }))
      } catch { /* ignore */ }
    })
  })
}

async function setMode(page: Page) {
  const lsValues: Record<string, string> = {
    token: 'test-token',
    'kc-demo-mode': 'false',
    'demo-user-onboarded': 'true',
    'kubestellar-console-tour-completed': 'true',
    'kc-user-cache': JSON.stringify(mockUser),
    'kc-backend-status': JSON.stringify({ available: true, timestamp: Date.now() }),
    'kc-sqlite-migrated': '2',
  }

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
}

// ---------------------------------------------------------------------------
// Navigation measurement
// ---------------------------------------------------------------------------

/**
 * Click a sidebar link and measure navigation timing.
 *
 * Captures three phases:
 * 1. click → URL changes (router transition)
 * 2. URL change → first card has content
 * 3. URL change → all cards have content
 */
async function measureNavigation(
  page: Page,
  fromRoute: string,
  target: (typeof DASHBOARDS)[0],
  scenario: Scenario,
): Promise<NavMetric | null> {
  // Find the sidebar link for this dashboard
  // Primary nav links: [data-testid="sidebar-primary-nav"] a[href="<route>"]
  // The home route "/" needs exact match to avoid matching all routes
  const linkSelector = target.route === '/'
    ? '[data-testid="sidebar-primary-nav"] a[href="/"]'
    : `[data-testid="sidebar-primary-nav"] a[href="${target.route}"]`

  const link = page.locator(linkSelector).first()

  // Check if link exists and is visible
  try {
    await link.waitFor({ state: 'visible', timeout: 3_000 })
  } catch {
    console.log(`  SKIP ${target.name}: sidebar link not found (${linkSelector})`)
    return null
  }

  // Clear browser-side perf state before navigation
  await page.evaluate(() => {
    delete (window as Window & { __navPerf?: unknown }).__navPerf
  })

  // Record click time and click
  const clickTime = Date.now()
  await link.click()

  // Phase 1: Wait for URL to change
  let urlChangeTime: number
  if (target.route === fromRoute) {
    // Same route — URL won't change, skip this phase
    urlChangeTime = clickTime
  } else {
    try {
      // For "/" route, wait for exact path match
      if (target.route === '/') {
        await page.waitForURL((url) => url.pathname === '/', { timeout: 5_000 })
      } else {
        await page.waitForURL(`**${target.route}`, { timeout: 5_000 })
      }
      urlChangeTime = Date.now()
    } catch {
      console.log(`  TIMEOUT ${target.name}: URL did not change to ${target.route} within 5s`)
      urlChangeTime = Date.now()
    }
  }

  const clickToUrlChangeMs = urlChangeTime - clickTime

  // Phase 2+3: Wait for cards to load using browser-side polling
  type CardResult = {
    firstCardMs: number
    allCardsMs: number
    cardsFound: number
    cardsLoaded: number
    cardsTimedOut: number
  }

  let cardResult: CardResult = {
    firstCardMs: -1,
    allCardsMs: -1,
    cardsFound: 0,
    cardsLoaded: 0,
    cardsTimedOut: 0,
  }

  try {
    const handle = await page.waitForFunction(
      ({ timeout }: { timeout: number }) => {
        const win = window as Window & {
          __navPerf?: {
            startedAt: number
            firstCardAt: number | null
            tracked: Record<string, number | null>
            lastCount: number
            stableAt: number
          }
        }

        const now = performance.now()
        if (!win.__navPerf) {
          win.__navPerf = {
            startedAt: now,
            firstCardAt: null,
            tracked: {},
            lastCount: -1,
            stableAt: now,
          }
        }
        const st = win.__navPerf
        const elapsed = now - st.startedAt

        // Discover cards
        const els = document.querySelectorAll('[data-card-type]')
        const count = Math.min(els.length, 30) // cap at 30

        for (let i = 0; i < count; i++) {
          const el = els[i]
          const id = el.getAttribute('data-card-id') || `card-${i}`
          if (st.tracked[id] === undefined) {
            st.tracked[id] = null
          }
        }

        // Check loading state for each tracked card
        for (const id of Object.keys(st.tracked)) {
          if (st.tracked[id] !== null) continue
          const el = document.querySelector(`[data-card-id="${id}"]`)
          if (!el) continue
          if (el.getAttribute('data-loading') === 'true') continue
          let hasSkeleton = false
          for (const p of el.querySelectorAll('.animate-pulse')) {
            if ((p as HTMLElement).getBoundingClientRect().height > 40) {
              hasSkeleton = true
              break
            }
          }
          if (hasSkeleton) continue
          const text = (el.textContent || '').trim()
          const hasVisual = !!el.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
          if (text.length <= 10 && !hasVisual) continue

          st.tracked[id] = Math.round(now - st.startedAt)
          if (st.firstCardAt === null) st.firstCardAt = st.tracked[id]
        }

        // Stability: card count unchanged for 500ms
        if (count !== st.lastCount) {
          st.stableAt = now
          st.lastCount = count
        }
        const stable = now - st.stableAt > 500

        const ids = Object.keys(st.tracked)
        const allLoaded = ids.length > 0 && ids.every((id) => st.tracked[id] !== null)

        // All cards loaded and count stable
        if (allLoaded && stable) {
          const loadedCount = ids.filter((id) => st.tracked[id] !== null).length
          return {
            firstCardMs: st.firstCardAt ?? -1,
            allCardsMs: Math.round(now - st.startedAt),
            cardsFound: ids.length,
            cardsLoaded: loadedCount,
            cardsTimedOut: 0,
          }
        }

        // No cards after 8s — some dashboards have 0 cards
        if (elapsed > 8000 && ids.length === 0 && count === 0 && stable) {
          return {
            firstCardMs: -1,
            allCardsMs: -1,
            cardsFound: 0,
            cardsLoaded: 0,
            cardsTimedOut: 0,
          }
        }

        // Hard timeout
        if (elapsed > timeout) {
          const loadedCount = ids.filter((id) => st.tracked[id] !== null).length
          return {
            firstCardMs: st.firstCardAt ?? -1,
            allCardsMs: Math.round(now - st.startedAt),
            cardsFound: ids.length,
            cardsLoaded: loadedCount,
            cardsTimedOut: ids.length - loadedCount,
          }
        }

        return false // keep polling
      },
      { timeout: NAV_CARD_TIMEOUT_MS },
      { timeout: NAV_CARD_TIMEOUT_MS + 3_000, polling: 100 }
    )

    cardResult = (await handle.jsonValue()) as CardResult
  } catch {
    // Timeout — collect partial results
    try {
      cardResult = await page.evaluate(() => {
        const win = window as Window & {
          __navPerf?: {
            firstCardAt: number | null
            startedAt: number
            tracked: Record<string, number | null>
          }
        }
        if (!win.__navPerf) return { firstCardMs: -1, allCardsMs: -1, cardsFound: 0, cardsLoaded: 0, cardsTimedOut: 0 }
        const ids = Object.keys(win.__navPerf.tracked)
        const loadedCount = ids.filter((id) => win.__navPerf!.tracked[id] !== null).length
        return {
          firstCardMs: win.__navPerf.firstCardAt ?? -1,
          allCardsMs: Math.round(performance.now() - win.__navPerf.startedAt),
          cardsFound: ids.length,
          cardsLoaded: loadedCount,
          cardsTimedOut: ids.length - loadedCount,
        }
      })
    } catch { /* page crashed */ }
  }

  const totalMs = cardResult.allCardsMs >= 0
    ? clickToUrlChangeMs + cardResult.allCardsMs
    : clickToUrlChangeMs

  return {
    from: fromRoute,
    to: target.route,
    targetName: target.name,
    scenario,
    clickToUrlChangeMs,
    urlChangeToFirstCardMs: cardResult.firstCardMs,
    urlChangeToAllCardsMs: cardResult.allCardsMs,
    totalMs,
    cardsFound: cardResult.cardsFound,
    cardsLoaded: cardResult.cardsLoaded,
    cardsTimedOut: cardResult.cardsTimedOut,
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const navReport: NavReport = {
  timestamp: new Date().toISOString(),
  metrics: [],
}

function summarizeScenario(metrics: NavMetric[]): string {
  if (metrics.length === 0) return 'no data'
  const valid = metrics.filter((m) => m.cardsFound > 0)
  const avgTotal = valid.length
    ? Math.round(valid.reduce((s, m) => s + m.totalMs, 0) / valid.length)
    : -1
  const avgClickToUrl = valid.length
    ? Math.round(valid.reduce((s, m) => s + m.clickToUrlChangeMs, 0) / valid.length)
    : -1
  const avgUrlToFirst = valid.length
    ? Math.round(valid.reduce((s, m) => s + m.urlChangeToFirstCardMs, 0) / valid.length)
    : -1
  const avgUrlToAll = valid.length
    ? Math.round(valid.reduce((s, m) => s + m.urlChangeToAllCardsMs, 0) / valid.length)
    : -1
  const timedOut = metrics.reduce((s, m) => s + m.cardsTimedOut, 0)
  return `navs=${metrics.length} with-cards=${valid.length} avg-total=${avgTotal}ms click→url=${avgClickToUrl}ms url→first=${avgUrlToFirst}ms url→all=${avgUrlToAll}ms timeouts=${timedOut}`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test('warmup — prime module cache', async ({ page }) => {
  await setupAuth(page)
  await setupLiveMocks(page)
  await setMode(page)

  // Load the app and visit a few dashboards to warm up Vite module cache
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: APP_LOAD_TIMEOUT_MS })
  } catch { /* continue */ }

  const warmupRoutes = ['/deploy', '/ai-ml', '/compliance', '/ci-cd', '/arcade']
  for (const route of warmupRoutes) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForSelector('[data-card-type]', { timeout: 8_000 })
    } catch { /* ignore — just warming up */ }
  }
})

test('cold-nav — first visit to each dashboard via sidebar', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await setupAuth(page)
  await setupLiveMocks(page)
  await setMode(page)

  // Start at home dashboard
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: APP_LOAD_TIMEOUT_MS })
    // Wait for home dashboard cards to settle
    await page.waitForSelector('[data-card-type]', { timeout: 10_000 })
    await page.waitForTimeout(1_000) // let data flow settle
  } catch { /* continue */ }

  let currentRoute = '/'

  // Visit each dashboard for the first time (skip home, we're already there)
  for (const dashboard of DASHBOARDS) {
    if (dashboard.route === '/') continue

    const metric = await measureNavigation(page, currentRoute, dashboard, 'cold-nav')
    if (metric) {
      navReport.metrics.push(metric)
      currentRoute = dashboard.route
      console.log(
        `  cold-nav → ${dashboard.name}: total=${metric.totalMs}ms click→url=${metric.clickToUrlChangeMs}ms url→first=${metric.urlChangeToFirstCardMs}ms url→all=${metric.urlChangeToAllCardsMs}ms cards=${metric.cardsFound}/${metric.cardsLoaded}`
      )
    }
  }

  if (pageErrors.length > 0) {
    console.log(`  JS ERRORS (cold-nav): ${pageErrors.slice(0, 5).map(e => e.slice(0, 120)).join(' | ')}`)
  }

  const coldMetrics = navReport.metrics.filter((m) => m.scenario === 'cold-nav')
  console.log(`[NAV] cold-nav: ${summarizeScenario(coldMetrics)}`)
})

test('warm-nav — revisit dashboards (chunks already cached)', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await setupAuth(page)
  await setupLiveMocks(page)
  await setMode(page)

  // Start at home and warm up ALL dashboards first (simulate the cold run)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: APP_LOAD_TIMEOUT_MS })
  } catch { /* continue */ }

  // Pre-visit all dashboards to warm up chunks
  for (const dashboard of DASHBOARDS) {
    await page.goto(dashboard.route, { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForSelector('[data-card-type]', { timeout: 8_000 })
    } catch { /* some dashboards have no cards */ }
  }

  // Now navigate back home and measure warm re-visits via sidebar clicks
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: APP_LOAD_TIMEOUT_MS })
    await page.waitForSelector('[data-card-type]', { timeout: 10_000 })
    await page.waitForTimeout(500)
  } catch { /* continue */ }

  let currentRoute = '/'

  for (const dashboard of DASHBOARDS) {
    if (dashboard.route === '/') continue

    const metric = await measureNavigation(page, currentRoute, dashboard, 'warm-nav')
    if (metric) {
      navReport.metrics.push(metric)
      currentRoute = dashboard.route
      console.log(
        `  warm-nav → ${dashboard.name}: total=${metric.totalMs}ms click→url=${metric.clickToUrlChangeMs}ms url→first=${metric.urlChangeToFirstCardMs}ms url→all=${metric.urlChangeToAllCardsMs}ms cards=${metric.cardsFound}/${metric.cardsLoaded}`
      )
    }
  }

  if (pageErrors.length > 0) {
    console.log(`  JS ERRORS (warm-nav): ${pageErrors.slice(0, 5).map(e => e.slice(0, 120)).join(' | ')}`)
  }

  const warmMetrics = navReport.metrics.filter((m) => m.scenario === 'warm-nav')
  console.log(`[NAV] warm-nav: ${summarizeScenario(warmMetrics)}`)
})

test('rapid-nav — quick clicks through dashboards', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await setupAuth(page)
  await setupLiveMocks(page)
  await setMode(page)

  // Pre-warm all dashboards so we isolate rapid-click behavior
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: APP_LOAD_TIMEOUT_MS })
  } catch { /* continue */ }
  for (const dashboard of DASHBOARDS) {
    await page.goto(dashboard.route, { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForSelector('[data-card-type]', { timeout: 8_000 })
    } catch { /* ignore */ }
  }

  // Navigate home
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: APP_LOAD_TIMEOUT_MS })
    await page.waitForSelector('[data-card-type]', { timeout: 10_000 })
    await page.waitForTimeout(500)
  } catch { /* continue */ }

  // Rapid-click through 10 dashboards with 200ms between clicks
  // Pick a diverse set of dashboards
  const rapidTargets = DASHBOARDS.filter((d) =>
    ['clusters', 'pods', 'deployments', 'security', 'ai-ml', 'events', 'helm', 'compliance', 'deploy', 'workloads'].includes(d.id)
  )

  let currentRoute = '/'

  for (const dashboard of rapidTargets) {
    // Click rapidly — only wait 200ms between clicks
    const linkSelector = `[data-testid="sidebar-primary-nav"] a[href="${dashboard.route}"]`
    const link = page.locator(linkSelector).first()
    try {
      await link.waitFor({ state: 'visible', timeout: 2_000 })
    } catch {
      continue
    }

    const clickTime = Date.now()
    await link.click()
    await page.waitForTimeout(200) // rapid-fire gap

    // After clicking, quickly record where we are
    const urlAfterClick = new URL(page.url()).pathname

    // Now measure if the final dashboard loaded
    // Only measure the last dashboard we clicked (the one that should actually render)
    if (dashboard === rapidTargets[rapidTargets.length - 1]) {
      const metric = await measureNavigation(page, currentRoute, dashboard, 'rapid-nav')
      if (metric) {
        // Adjust: we already clicked, so set clickToUrlChange from our earlier measurement
        metric.clickToUrlChangeMs = Date.now() - clickTime - 200 // subtract the waitForTimeout
        navReport.metrics.push(metric)
      }
    } else {
      // For intermediate dashboards, just record the click→url timing
      navReport.metrics.push({
        from: currentRoute,
        to: dashboard.route,
        targetName: dashboard.name,
        scenario: 'rapid-nav',
        clickToUrlChangeMs: urlAfterClick === dashboard.route ? Date.now() - clickTime : -1,
        urlChangeToFirstCardMs: -1,
        urlChangeToAllCardsMs: -1,
        totalMs: Date.now() - clickTime,
        cardsFound: -1, // not measured for intermediate clicks
        cardsLoaded: -1,
        cardsTimedOut: 0,
      })
    }

    currentRoute = dashboard.route
  }

  if (pageErrors.length > 0) {
    console.log(`  JS ERRORS (rapid-nav): ${pageErrors.slice(0, 5).map(e => e.slice(0, 120)).join(' | ')}`)
  }

  const rapidMetrics = navReport.metrics.filter((m) => m.scenario === 'rapid-nav')
  console.log(`[NAV] rapid-nav: ${summarizeScenario(rapidMetrics)}`)
})

// ---------------------------------------------------------------------------
// Write report after all tests
// ---------------------------------------------------------------------------

test.afterAll(async () => {
  const outDir = path.resolve(__dirname, '../test-results')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  // JSON report
  fs.writeFileSync(path.join(outDir, 'nav-report.json'), JSON.stringify(navReport, null, 2))

  // Markdown summary
  const lines: string[] = [
    '# Dashboard Navigation Performance',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total navigations: ${navReport.metrics.length}`,
    '',
    '## Summary by Scenario',
    '',
  ]

  for (const scenario of ['cold-nav', 'warm-nav', 'rapid-nav'] as const) {
    const metrics = navReport.metrics.filter((m) => m.scenario === scenario)
    lines.push(`- **${scenario}**: ${summarizeScenario(metrics)}`)
  }

  lines.push('')
  lines.push('## Per-Navigation Breakdown')
  lines.push('')
  lines.push(`| Scenario | Dashboard | Total(ms) | Click→URL(ms) | URL→First(ms) | URL→All(ms) | Cards |`)
  lines.push(`|----------|-----------|-----------|---------------|----------------|--------------|-------|`)

  for (const m of navReport.metrics) {
    lines.push(
      `| ${m.scenario} | ${m.targetName} | ${m.totalMs} | ${m.clickToUrlChangeMs} | ${m.urlChangeToFirstCardMs} | ${m.urlChangeToAllCardsMs} | ${m.cardsFound}/${m.cardsLoaded} |`
    )
  }

  lines.push('')

  // Highlight slow navigations (> 3s)
  const slow = navReport.metrics.filter((m) => m.totalMs > 3000 && m.cardsFound > 0)
  if (slow.length > 0) {
    lines.push('## Slow Navigations (> 3s)')
    lines.push('')
    for (const m of slow) {
      const bottleneck = m.clickToUrlChangeMs > m.urlChangeToAllCardsMs
        ? 'router transition'
        : m.urlChangeToFirstCardMs > (m.urlChangeToAllCardsMs - m.urlChangeToFirstCardMs)
          ? 'first card render'
          : 'card data loading'
      lines.push(`- **${m.targetName}** (${m.scenario}): ${m.totalMs}ms — bottleneck: ${bottleneck}`)
    }
    lines.push('')
  }

  fs.writeFileSync(path.join(outDir, 'nav-summary.md'), lines.join('\n'))
  console.log(lines.join('\n'))
})

import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestItem {
  cardType: string
  cardId: string
}

interface ManifestData {
  allCardTypes: string[]
  totalCards: number
  batch: number
  batchSize: number
  selected: ManifestItem[]
}

interface ColdLoadSnapshot {
  cardId: string
  cardType: string
  textLength: number
  hasVisualContent: boolean
  hasContent: boolean
  hasDemoBadge: boolean
  dataLoading: string | null
}

interface WarmLoadSnapshot {
  cardId: string
  cardType: string
  textLength: number
  hasVisualContent: boolean
  hasContent: boolean
  hasDemoBadge: boolean
  hasLargeSkeleton: boolean
  dataLoading: string | null
  /** ms from navigation to first content (estimated from snapshot index) */
  timeToContentMs: number | null
}

interface CacheEntry {
  key: string
  timestamp: number
  version: number
  dataSize: number
  dataType: string
  isArray: boolean
  arrayLength: number | null
}

type CardCacheStatus = 'pass' | 'fail' | 'warn' | 'skip'

interface CardCacheResult {
  cardType: string
  cardId: string
  /** Whether the card had data after cold load */
  coldLoadHadContent: boolean
  /** Whether cache entries were written (globally — not per-card since key→card mapping is complex) */
  cacheWritten: boolean
  /** Whether the card showed content on warm return with network blocked */
  warmReturnHadContent: boolean
  /** Whether warm return content matched cold load (text length similarity) */
  contentMatched: boolean
  /** Whether demo badge appeared on warm return (should NOT happen if cache works) */
  warmDemoBadge: boolean
  /** Whether skeleton appeared on warm return (should NOT happen if cache is fast) */
  warmSkeleton: boolean
  /** Time-to-content on warm return (ms, null if never showed content) */
  warmTimeToContentMs: number | null
  /** Overall status */
  status: CardCacheStatus
  /** Status details */
  details: string
}

interface CacheComplianceReport {
  timestamp: string
  totalCards: number
  cacheSnapshot: {
    indexedDBEntries: number
    localStorageCacheKeys: number
    cacheEntries: CacheEntry[]
    localStorageKeys: string[]
  }
  batches: Array<{
    batchIndex: number
    cards: CardCacheResult[]
  }>
  summary: {
    totalCards: number
    passCount: number
    failCount: number
    warnCount: number
    skipCount: number
    cacheHitRate: number
    avgWarmTimeToContentMs: number | null
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 24
const BATCH_LOAD_TIMEOUT_MS = 20_000
const WARM_RETURN_WAIT_MS = 3_000
const WARM_POLL_INTERVAL_MS = 50

const MOCK_CLUSTER = 'cache-test-cluster'

const mockUser = {
  id: '1',
  github_id: '12345',
  github_login: 'cachetest',
  email: 'cache@test.com',
  onboarded: true,
}

const MOCK_DATA: Record<string, Record<string, unknown[]>> = {
  clusters: { clusters: [{ name: MOCK_CLUSTER, reachable: true, status: 'Ready' }] },
  pods: {
    pods: [
      { name: 'nginx-1', namespace: 'default', cluster: MOCK_CLUSTER, status: 'Running' },
      { name: 'api-1', namespace: 'kube-system', cluster: MOCK_CLUSTER, status: 'Running' },
    ],
  },
  events: {
    events: [
      { type: 'Normal', reason: 'Scheduled', message: 'Pod scheduled', cluster: MOCK_CLUSTER },
      { type: 'Warning', reason: 'BackOff', message: 'Restarting container', cluster: MOCK_CLUSTER },
    ],
  },
  'pod-issues': { issues: [{ name: 'api-1', namespace: 'kube-system', cluster: MOCK_CLUSTER }] },
  deployments: { deployments: [{ name: 'nginx', namespace: 'default', cluster: MOCK_CLUSTER }] },
  'deployment-issues': { issues: [] },
  services: { services: [{ name: 'nginx-svc', namespace: 'default', cluster: MOCK_CLUSTER }] },
  'security-issues': { issues: [{ name: 'nginx-1', namespace: 'default', cluster: MOCK_CLUSTER }] },
}

// ---------------------------------------------------------------------------
// Mock setup (mirrors card-loading-compliance.spec.ts)
// Flag to switch between live data mode and blocked mode for cache isolation
// ---------------------------------------------------------------------------

/** When true, data routes delay 30s instead of 150ms — simulates blocked network
 *  while keeping successful responses (avoids 503 triggering app error handling/redirect) */
let delayDataAPIs = false
const WARM_DELAY_MS = 30_000

function buildSSEResponse(endpoint: string): string {
  const data = MOCK_DATA[endpoint] || { items: [] }
  const key = Object.keys(data)[0] || 'items'
  const items = data[key] || []
  return [
    'event: cluster_data',
    `data: ${JSON.stringify({ cluster: MOCK_CLUSTER, [key]: items })}`,
    '',
    'event: done',
    `data: ${JSON.stringify({ totalClusters: 1, source: 'mock' })}`,
    '',
  ].join('\n')
}

function getMockRESTData(url: string): Record<string, unknown> {
  const match = url.match(/\/api\/mcp\/([^/?]+)/)
  const endpoint = match?.[1] || ''
  return MOCK_DATA[endpoint] ? { ...MOCK_DATA[endpoint], source: 'mock' } : { items: [], source: 'mock' }
}

async function setupAuth(page: Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) })
  )
}

async function setupLiveMocks(page: Page) {
  await page.route('**/api/mcp/*/stream**', async (route) => {
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    const url = route.request().url()
    const endpoint = url.match(/\/api\/mcp\/([^/]+)\/stream/)?.[1] || ''
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: buildSSEResponse(endpoint),
    })
  })

  await page.route('**/api/mcp/**', async (route) => {
    if (route.request().url().includes('/stream')) {
      await route.fallback()
      return
    }
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    const delay = 100 + Math.random() * 150
    await new Promise((resolve) => setTimeout(resolve, delay))
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(getMockRESTData(route.request().url())),
    })
  })

  await page.route('**/health', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) })
  })

  await page.route('**/api/workloads**', async (route) => {
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
  })

  await page.route('**/api/dashboards**', async (route) => {
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  await page.route('**/api/config/**', async (route) => {
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })

  await page.route('**/api/gitops/buildpack-images**', async (route) => {
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ name: 'test-image', namespace: 'default', cluster: MOCK_CLUSTER, status: 'succeeded', builder: 'paketo' }] }) })
  })

  await page.route('**/api/mcp/gpu-nodes**', async (route) => {
    if (route.request().url().includes('/stream')) { await route.fallback(); return }
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ nodes: [{ name: 'gpu-node-1', cluster: MOCK_CLUSTER, gpus: [{ model: 'A100', memory: '80Gi', index: 0 }], labels: {}, allocatable: {}, capacity: {} }] }) })
  })

  await page.route('**/api/mcp/helm-releases**', async (route) => {
    if (route.request().url().includes('/stream')) { await route.fallback(); return }
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ releases: [{ name: 'ingress-nginx', namespace: 'default', cluster: MOCK_CLUSTER, chart: 'nginx-1.0.0', status: 'deployed', revision: 1, updated: new Date().toISOString() }] }) })
  })

  await page.route('**/api/mcp/operators**', async (route) => {
    if (route.request().url().includes('/stream')) { await route.fallback(); return }
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ operators: [{ name: 'test-operator', namespace: 'openshift-operators', cluster: MOCK_CLUSTER, status: 'Succeeded', version: '1.0.0' }] }) })
  })

  await page.route('**/api/mcp/operator-subscriptions**', async (route) => {
    if (route.request().url().includes('/stream')) { await route.fallback(); return }
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subscriptions: [{ name: 'test-sub', namespace: 'openshift-operators', cluster: MOCK_CLUSTER, package: 'test-operator', channel: 'stable', currentCSV: 'test-operator.v1.0.0', installedCSV: 'test-operator.v1.0.0' }] }) })
  })

  await page.route('**/api/mcp/resource-quotas**', async (route) => {
    if (route.request().url().includes('/stream')) { await route.fallback(); return }
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quotas: [{ name: 'default-quota', namespace: 'default', cluster: MOCK_CLUSTER, hard: { cpu: '4', memory: '8Gi' }, used: { cpu: '1', memory: '2Gi' } }] }) })
  })

  await page.route('**/api/mcp/nodes**', async (route) => {
    if (route.request().url().includes('/stream')) { await route.fallback(); return }
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ nodes: [{ name: 'node-1', cluster: MOCK_CLUSTER, status: 'Ready', roles: ['control-plane'], kubeletVersion: 'v1.28.0', conditions: [{ type: 'Ready', status: 'True' }] }] }) })
  })

  const nightlyMockData = {
    guides: [
      {
        guide: 'vLLM with Autoscaling', acronym: 'WVA', platform: 'OpenShift',
        repo: 'llm-d/llm-d', workflowFile: 'nightly-wva.yaml',
        model: 'granite-3.2-2b-instruct', gpuType: 'NVIDIA L40S', gpuCount: 1,
        passRate: 85, trend: 'improving', latestConclusion: 'success',
        runs: [
          { id: 100001, status: 'completed', conclusion: 'success', createdAt: new Date(Date.now() - 3600000).toISOString(), updatedAt: new Date(Date.now() - 3000000).toISOString(), htmlUrl: 'https://github.com/llm-d/llm-d/actions/runs/100001', runNumber: 42, failureReason: '', model: 'granite-3.2-2b-instruct', gpuType: 'NVIDIA L40S', gpuCount: 1, event: 'schedule' },
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

  await page.route('**/api/nightly-e2e/**', async (route) => {
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nightlyMockData) })
  })

  await page.route('**/api/public/nightly-e2e/**', async (route) => {
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nightlyMockData) })
  })

  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    if (
      url.includes('/api/mcp/') ||
      url.includes('/api/me') ||
      url.includes('/api/workloads') ||
      url.includes('/api/dashboards') ||
      url.includes('/api/config/') ||
      url.includes('/api/gitops/') ||
      url.includes('/api/nightly-e2e/') ||
      url.includes('/api/public/nightly-e2e/')
    ) {
      await route.fallback()
      return
    }
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 150))
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  await page.route('**/api.rss2json.com/**', async (route) => {
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 100))
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        items: [
          { title: 'Kubernetes 1.32 Released', link: 'https://example.com/1', description: 'Major release', pubDate: new Date().toISOString(), author: 'CNCF' },
          { title: 'Cloud Native Best Practices', link: 'https://example.com/2', description: 'Guide', pubDate: new Date().toISOString(), author: 'Tech Blog' },
        ],
      }),
    })
  })

  await page.route('**/api.allorigins.win/**', async (route) => {
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 100))
    route.fulfill({
      status: 200,
      contentType: 'application/xml',
      body: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test Feed</title>
<item><title>Test Article</title><link>https://example.com/1</link><description>Test</description><pubDate>${new Date().toUTCString()}</pubDate></item>
</channel></rss>`,
    })
  })

  await page.route('**/corsproxy.io/**', async (route) => {
    if (delayDataAPIs) { await new Promise((r) => setTimeout(r, WARM_DELAY_MS)) }
    await new Promise((resolve) => setTimeout(resolve, 100))
    route.fulfill({
      status: 200,
      contentType: 'application/xml',
      body: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test Feed</title>
<item><title>Test Article</title><link>https://example.com/1</link><description>Test</description><pubDate>${new Date().toUTCString()}</pubDate></item>
</channel></rss>`,
    })
  })

  await page.route('http://127.0.0.1:8585/**', (route) => {
    const url = route.request().url()
    if (url.endsWith('/health') || url.includes('/health?')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: 'cache-test' }),
      })
      return
    }
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"unavailable"}' })
  })

  await page.routeWebSocket('ws://127.0.0.1:8585/**', (ws) => {
    ws.onMessage((data) => {
      try {
        const msg = JSON.parse(String(data))
        ws.send(JSON.stringify({ id: msg.id, type: 'result', payload: { output: '{"items":[]}', exitCode: 0 } }))
      } catch {
        // ignore
      }
    })
  })
}

async function setLiveColdMode(page: Page) {
  await page.addInitScript(
    ({ user }: { user: unknown }) => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kubestellar-console-tour-completed', 'true')
      localStorage.setItem('kc-user-cache', JSON.stringify(user))
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
    { user: mockUser }
  )

  await page.addInitScript(() => {
    const databases = ['kc_cache', 'kubestellar-cache']
    for (const name of databases) {
      try {
        indexedDB.deleteDatabase(name)
      } catch {
        // ignore
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

async function navigateToBatch(page: Page, batch: number, timeoutMs = 60_000): Promise<ManifestData> {
  const url = `/__compliance/all-cards?batch=${batch + 1}&size=${BATCH_SIZE}`
  console.log(`[CacheTest] Navigating to ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  try {
    await page.waitForFunction(
      () => !!(window as Window & { __COMPLIANCE_MANIFEST__?: unknown }).__COMPLIANCE_MANIFEST__,
      { timeout: timeoutMs }
    )
  } catch {
    const debug = await page.evaluate(() => ({
      path: window.location.pathname,
      hasManifest: !!document.querySelector('[data-testid="compliance-manifest"]'),
      bodyPreview: (document.body.textContent || '').slice(0, 200),
    }))
    throw new Error(`Manifest did not load for batch ${batch}: ${JSON.stringify(debug)}`)
  }

  const manifest = await page.evaluate(
    () => (window as Window & { __COMPLIANCE_MANIFEST__?: unknown }).__COMPLIANCE_MANIFEST__
  )
  if (!manifest) throw new Error('Missing __COMPLIANCE_MANIFEST__')
  return manifest as ManifestData
}

async function waitForCardsToLoad(page: Page, cardIds: string[], timeoutMs: number) {
  await page.waitForFunction(
    ({ ids, timeout }: { ids: string[]; timeout: number }) => {
      const win = window as Window & { __CACHE_LOAD_START__?: number }
      const now = performance.now()
      if (!win.__CACHE_LOAD_START__) win.__CACHE_LOAD_START__ = now

      const allDone = ids.every((id) => {
        const card = document.querySelector(`[data-card-id="${id}"]`)
        if (!card) return false
        return card.getAttribute('data-loading') === 'false'
      })
      if (allDone) return true
      if (now - win.__CACHE_LOAD_START__ > timeout) return true
      return false
    },
    { ids: cardIds, timeout: timeoutMs },
    { timeout: timeoutMs + 5_000, polling: 200 }
  )
}

// ---------------------------------------------------------------------------
// Card state capture helpers
// ---------------------------------------------------------------------------

async function captureColdSnapshots(page: Page, cardIds: string[]): Promise<ColdLoadSnapshot[]> {
  return await page.evaluate((ids: string[]) => {
    return ids.map((id) => {
      const card = document.querySelector(`[data-card-id="${id}"]`)
      if (!card) {
        return {
          cardId: id, cardType: '', textLength: 0,
          hasVisualContent: false, hasContent: false,
          hasDemoBadge: false, dataLoading: null,
        }
      }
      const textLen = (card.textContent || '').trim().length
      const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
      return {
        cardId: id,
        cardType: card.getAttribute('data-card-type') || '',
        textLength: textLen,
        hasVisualContent: hasVisual,
        hasContent: textLen > 10 || hasVisual,
        hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
        dataLoading: card.getAttribute('data-loading'),
      }
    })
  }, cardIds)
}

async function captureWarmSnapshots(
  page: Page,
  cardIds: string[],
  pollMs: number,
  totalMs: number
): Promise<WarmLoadSnapshot[]> {
  // Poll card state over time to find when content first appears
  return await page.evaluate(
    ({ ids, interval, duration }: { ids: string[]; interval: number; duration: number }) => {
      return new Promise<Array<{
        cardId: string; cardType: string; textLength: number;
        hasVisualContent: boolean; hasContent: boolean;
        hasDemoBadge: boolean; hasLargeSkeleton: boolean;
        dataLoading: string | null; timeToContentMs: number | null;
      }>>((resolve) => {
        const firstContentTime: Record<string, number | null> = {}
        for (const id of ids) firstContentTime[id] = null

        const start = performance.now()
        const timer = setInterval(() => {
          const elapsed = performance.now() - start
          for (const id of ids) {
            if (firstContentTime[id] !== null) continue
            const card = document.querySelector(`[data-card-id="${id}"]`)
            if (!card) continue
            const textLen = (card.textContent || '').trim().length
            const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
            const hasSkeleton = !!card.querySelector('[data-card-skeleton="true"]')
            if ((textLen > 10 || hasVisual) && !hasSkeleton) {
              firstContentTime[id] = elapsed
            }
          }

          if (elapsed >= duration) {
            clearInterval(timer)
            // Final snapshot
            const results = ids.map((id) => {
              const card = document.querySelector(`[data-card-id="${id}"]`)
              if (!card) {
                return {
                  cardId: id, cardType: '', textLength: 0,
                  hasVisualContent: false, hasContent: false,
                  hasDemoBadge: false, hasLargeSkeleton: false,
                  dataLoading: null, timeToContentMs: null,
                }
              }
              const textLen = (card.textContent || '').trim().length
              const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
              const hasSkeleton = !!card.querySelector('[data-card-skeleton="true"]')
              return {
                cardId: id,
                cardType: card.getAttribute('data-card-type') || '',
                textLength: textLen,
                hasVisualContent: hasVisual,
                hasContent: textLen > 10 || hasVisual,
                hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
                hasLargeSkeleton: hasSkeleton,
                dataLoading: card.getAttribute('data-loading'),
                timeToContentMs: firstContentTime[id],
              }
            })
            resolve(results)
          }
        }, interval)
      })
    },
    { ids: cardIds, interval: pollMs, duration: totalMs }
  )
}

// ---------------------------------------------------------------------------
// Cache inspection helpers
// ---------------------------------------------------------------------------

async function snapshotCacheState(page: Page): Promise<{
  indexedDBEntries: CacheEntry[]
  localStorageKeys: string[]
}> {
  return await page.evaluate(async () => {
    // Read localStorage cache-related keys
    const lsKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (
        key.includes('cache') || key.includes('kubestellar-') ||
        key.startsWith('kc-') || key.startsWith('kc_') || key.startsWith('cache:')
      ) {
        lsKeys.push(key)
      }
    }

    // Read IndexedDB kc_cache entries
    const idbEntries = await new Promise<Array<{
      key: string; timestamp: number; version: number;
      dataSize: number; dataType: string; isArray: boolean; arrayLength: number | null;
    }>>((resolve) => {
      try {
        const req = indexedDB.open('kc_cache', 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('cache')) {
            db.createObjectStore('cache', { keyPath: 'key' })
          }
        }
        req.onsuccess = () => {
          try {
            const db = req.result
            if (!db.objectStoreNames.contains('cache')) {
              db.close()
              resolve([])
              return
            }
            const tx = db.transaction('cache', 'readonly')
            const store = tx.objectStore('cache')
            const all = store.getAll()
            all.onsuccess = () => {
              const entries = (all.result || []).map((entry: Record<string, unknown>) => {
                const data = entry.data
                return {
                  key: String(entry.key || ''),
                  timestamp: Number(entry.timestamp || 0),
                  version: Number(entry.version || 0),
                  dataSize: JSON.stringify(data).length,
                  dataType: typeof data,
                  isArray: Array.isArray(data),
                  arrayLength: Array.isArray(data) ? data.length : null,
                }
              })
              db.close()
              resolve(entries)
            }
            all.onerror = () => { db.close(); resolve([]) }
          } catch {
            resolve([])
          }
        }
        req.onerror = () => resolve([])
      } catch {
        resolve([])
      }
    })

    return { indexedDBEntries: idbEntries, localStorageKeys: lsKeys }
  })
}

// delayDataAPIs flag is checked by all data route handlers above.
// Set it to `true` before warm return navigation; data routes will delay 30s
// while auth, health, and WebSocket routes continue to respond normally.
// This avoids 503 errors that trigger app error handling / route redirects.

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function writeReport(report: CacheComplianceReport, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  // JSON report
  fs.writeFileSync(path.join(outDir, 'cache-compliance-report.json'), JSON.stringify(report, null, 2))

  // Markdown summary
  const allCards = report.batches.flatMap((b) => b.cards)
  const md: string[] = [
    '# Card Cache Compliance Report',
    '',
    `Generated: ${report.timestamp}`,
    `Total cards tested: ${report.totalCards}`,
    '',
    '## Cache Snapshot After Cold Load',
    '',
    `- IndexedDB entries: ${report.cacheSnapshot.indexedDBEntries}`,
    `- localStorage cache-related keys: ${report.cacheSnapshot.localStorageCacheKeys}`,
    '',
  ]

  if (report.cacheSnapshot.cacheEntries.length > 0) {
    md.push('### IndexedDB Cache Entries', '', '| Key | Version | Data Size | Type | Array Length |', '|-----|---------|-----------|------|-------------|')
    for (const entry of report.cacheSnapshot.cacheEntries) {
      md.push(`| ${entry.key} | ${entry.version} | ${entry.dataSize} | ${entry.dataType} | ${entry.arrayLength ?? 'N/A'} |`)
    }
    md.push('')
  }

  // Summary stats
  md.push(
    '## Summary',
    '',
    `- **Pass**: ${report.summary.passCount} cards — cached data loaded on warm return without network`,
    `- **Fail**: ${report.summary.failCount} cards — no cached data on warm return`,
    `- **Warn**: ${report.summary.warnCount} cards — partial cache behavior`,
    `- **Skip**: ${report.summary.skipCount} cards — no content on cold load (demo-only or game cards)`,
    `- **Cache hit rate**: ${Math.round(report.summary.cacheHitRate * 100)}%`,
    `- **Avg warm time-to-content**: ${report.summary.avgWarmTimeToContentMs !== null ? `${Math.round(report.summary.avgWarmTimeToContentMs)}ms` : 'N/A'}`,
    '',
  )

  // Pass/fail table
  md.push('## Per-Card Results', '', '| Card Type | Cold Content | Warm Content | Demo Badge | Skeleton | Time-to-Content | Status | Details |', '|-----------|-------------|-------------|------------|----------|-----------------|--------|---------|')
  for (const card of allCards) {
    md.push(
      `| ${card.cardType} | ${card.coldLoadHadContent ? 'Yes' : 'No'} | ${card.warmReturnHadContent ? 'Yes' : 'No'} | ${card.warmDemoBadge ? 'YES' : 'No'} | ${card.warmSkeleton ? 'YES' : 'No'} | ${card.warmTimeToContentMs !== null ? `${Math.round(card.warmTimeToContentMs)}ms` : 'N/A'} | ${card.status} | ${card.details} |`
    )
  }

  // Failures section
  const failedCards = allCards.filter((c) => c.status === 'fail')
  if (failedCards.length > 0) {
    md.push('', '## Failures', '')
    for (const card of failedCards) {
      md.push(`- **${card.cardType}**: ${card.details}`)
    }
  }

  md.push('')
  fs.writeFileSync(path.join(outDir, 'cache-compliance-summary.md'), md.join('\n') + '\n')
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test('card cache compliance — storage and retrieval', async ({ page }) => {
  const allBatchResults: Array<{ batchIndex: number; cards: CardCacheResult[] }> = []
  const coldSnapshots: Map<string, ColdLoadSnapshot> = new Map()
  let totalCards = 0

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Browser ERROR] ${msg.text()}`)
  })
  page.on('pageerror', (err) => console.log(`[Browser EXCEPTION] ${err.message}`))

  // ── Phase 1: Setup ────────────────────────────────────────────────────
  console.log('[CacheTest] Phase 1: Setup — mocks + cold mode')
  await setupAuth(page)
  await setupLiveMocks(page)
  await setLiveColdMode(page)

  // ── Phase 2: Warmup — prime Vite module cache ──────────────────────────
  console.log('[CacheTest] Phase 2: Warmup — priming module cache')
  const warmupManifest = await navigateToBatch(page, 0, 180_000)
  totalCards = warmupManifest.totalCards
  const totalBatches = Math.ceil(totalCards / BATCH_SIZE)
  console.log(`[CacheTest] Total cards: ${totalCards}, batches: ${totalBatches}`)
  await page.waitForTimeout(3_000)

  // ── Phase 3: Cold load all batches ─────────────────────────────────────
  console.log('[CacheTest] Phase 3: Cold load — loading all batches with network')

  for (let batch = 0; batch < totalBatches; batch++) {
    // Clear caches before each batch for true cold start
    await page.evaluate(() => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (!key) continue
        if (key.includes('dashboard-cards') || key.startsWith('cache:') || key.includes('kubestellar-stack-cache')) {
          localStorage.removeItem(key)
        }
      }
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('token', 'test-token')
    })

    const manifest = await navigateToBatch(page, batch)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    const cardIds = selected.map((item) => item.cardId)
    await waitForCardsToLoad(page, cardIds, BATCH_LOAD_TIMEOUT_MS)
    // Allow lazy (code-split) components to mount and report state.
    // StackContext cards dynamically report isDemoData via useReportCardDataState —
    // without this wait the cold snapshot may capture before the child reports.
    await page.waitForTimeout(500)

    // Capture cold load state
    const snapshots = await captureColdSnapshots(page, cardIds)
    for (const snap of snapshots) {
      // Map cardId → cardType from manifest
      const manifestItem = selected.find((s) => s.cardId === snap.cardId)
      if (manifestItem) snap.cardType = manifestItem.cardType
      coldSnapshots.set(snap.cardId, snap)
    }

    const contentCount = snapshots.filter((s) => s.hasContent).length
    console.log(`[CacheTest] Batch ${batch + 1}/${totalBatches} cold: ${selected.length} cards, ${contentCount} with content`)
  }

  // ── Phase 4: Cache snapshot ────────────────────────────────────────────
  console.log('[CacheTest] Phase 4: Inspecting cache state')
  const cacheState = await snapshotCacheState(page)
  console.log(`[CacheTest] IndexedDB: ${cacheState.indexedDBEntries.length} entries, localStorage: ${cacheState.localStorageKeys.length} cache keys`)

  for (const entry of cacheState.indexedDBEntries) {
    console.log(`[CacheTest]   IDB: ${entry.key} (v${entry.version}, ${entry.dataSize} bytes, array=${entry.isArray}${entry.isArray ? ` len=${entry.arrayLength}` : ''})`)
  }

  // ── Phase 5: Navigate away ─────────────────────────────────────────────
  console.log('[CacheTest] Phase 5: Navigate away')
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  // ── Phase 6: Delay APIs + warm return ──────────────────────────────────
  console.log('[CacheTest] Phase 6: Warm return with delayed APIs (30s delay)')

  // Flip the flag — all data route handlers now delay 30s before responding.
  // Cards should display cached data within 500ms, well before API responses arrive.
  // Auth, health, and WebSocket routes continue to work normally (no delay).
  delayDataAPIs = true

  for (let batch = 0; batch < totalBatches; batch++) {
    const manifest = await navigateToBatch(page, batch)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    const cardIds = selected.map((item) => item.cardId)

    // Poll card state over the warm return period
    const warmSnapshots = await captureWarmSnapshots(page, cardIds, WARM_POLL_INTERVAL_MS, WARM_RETURN_WAIT_MS)

    // Evaluate each card
    const batchCards: CardCacheResult[] = []
    for (const warmSnap of warmSnapshots) {
      const coldSnap = coldSnapshots.get(warmSnap.cardId)
      const manifestItem = selected.find((s) => s.cardId === warmSnap.cardId)
      const cardType = manifestItem?.cardType || warmSnap.cardType || 'unknown'

      // Skip cards that had no content during cold load (demo-only, game cards, etc.)
      if (!coldSnap || !coldSnap.hasContent) {
        batchCards.push({
          cardType,
          cardId: warmSnap.cardId,
          coldLoadHadContent: false,
          cacheWritten: false,
          warmReturnHadContent: warmSnap.hasContent,
          contentMatched: false,
          warmDemoBadge: warmSnap.hasDemoBadge,
          warmSkeleton: warmSnap.hasLargeSkeleton,
          warmTimeToContentMs: warmSnap.timeToContentMs,
          status: 'skip',
          details: 'No content on cold load — card may be demo-only or game card',
        })
        continue
      }

      // Card had content on cold load — check warm return
      const warmHadContent = warmSnap.hasContent
      const warmDemoBadge = warmSnap.hasDemoBadge
      const warmSkeleton = warmSnap.hasLargeSkeleton

      // Content match: warm text length should be similar to cold (within 50% or at least 10 chars)
      const textSimilar =
        warmSnap.textLength >= Math.min(coldSnap.textLength * 0.5, 10) ||
        (warmSnap.hasVisualContent && coldSnap.hasVisualContent)

      let status: CardCacheStatus = 'pass'
      let details = ''

      if (!warmHadContent) {
        status = 'fail'
        details = `No content on warm return (cold had ${coldSnap.textLength} chars). Cache miss.`
      } else if (warmDemoBadge && !coldSnap.hasDemoBadge) {
        status = 'fail'
        details = 'Demo badge appeared on warm return but not on cold load — cache fell back to demo data'
      } else if (warmSkeleton) {
        status = 'warn'
        details = `Content present but skeleton still visible on warm return (ttc: ${warmSnap.timeToContentMs}ms)`
      } else if (!textSimilar) {
        status = 'warn'
        details = `Content mismatch: cold=${coldSnap.textLength} chars, warm=${warmSnap.textLength} chars`
      } else if (warmSnap.timeToContentMs !== null && warmSnap.timeToContentMs > 500) {
        status = 'warn'
        details = `Cache loaded but slow: ${Math.round(warmSnap.timeToContentMs)}ms to content`
      } else {
        details = warmSnap.timeToContentMs !== null
          ? `Cache hit: content in ${Math.round(warmSnap.timeToContentMs)}ms`
          : 'Cache hit: content present immediately'
      }

      batchCards.push({
        cardType,
        cardId: warmSnap.cardId,
        coldLoadHadContent: true,
        cacheWritten: true,
        warmReturnHadContent: warmHadContent,
        contentMatched: textSimilar && warmHadContent,
        warmDemoBadge,
        warmSkeleton,
        warmTimeToContentMs: warmSnap.timeToContentMs,
        status,
        details,
      })
    }

    const failCount = batchCards.filter((c) => c.status === 'fail').length
    console.log(
      `[CacheTest] Batch ${batch + 1}/${totalBatches} warm: ${selected.length} cards, ${failCount} failures`
    )

    allBatchResults.push({ batchIndex: batch, cards: batchCards })
  }

  // ── Phase 7: Generate report ───────────────────────────────────────────
  console.log('[CacheTest] Phase 7: Generating report')

  const allCards = allBatchResults.flatMap((b) => b.cards)
  const testableCards = allCards.filter((c) => c.status !== 'skip')
  const passCount = allCards.filter((c) => c.status === 'pass').length
  const failCount = allCards.filter((c) => c.status === 'fail').length
  const warnCount = allCards.filter((c) => c.status === 'warn').length
  const skipCount = allCards.filter((c) => c.status === 'skip').length
  const cacheHitRate = testableCards.length > 0 ? testableCards.filter((c) => c.warmReturnHadContent).length / testableCards.length : 0

  const ttcValues = allCards.filter((c) => c.warmTimeToContentMs !== null).map((c) => c.warmTimeToContentMs!)
  const avgTtc = ttcValues.length > 0 ? ttcValues.reduce((a, b) => a + b, 0) / ttcValues.length : null

  const report: CacheComplianceReport = {
    timestamp: new Date().toISOString(),
    totalCards,
    cacheSnapshot: {
      indexedDBEntries: cacheState.indexedDBEntries.length,
      localStorageCacheKeys: cacheState.localStorageKeys.length,
      cacheEntries: cacheState.indexedDBEntries,
      localStorageKeys: cacheState.localStorageKeys,
    },
    batches: allBatchResults,
    summary: {
      totalCards: allCards.length,
      passCount,
      failCount,
      warnCount,
      skipCount,
      cacheHitRate,
      avgWarmTimeToContentMs: avgTtc,
    },
  }

  const outDir = path.resolve(__dirname, '../test-results')
  writeReport(report, outDir)

  console.log(`[CacheTest] Report: ${path.join(outDir, 'cache-compliance-report.json')}`)
  console.log(`[CacheTest] Summary: ${path.join(outDir, 'cache-compliance-summary.md')}`)
  console.log(`[CacheTest] Pass: ${passCount}, Fail: ${failCount}, Warn: ${warnCount}, Skip: ${skipCount}`)
  console.log(`[CacheTest] Cache hit rate: ${Math.round(cacheHitRate * 100)}%`)
  if (avgTtc !== null) {
    console.log(`[CacheTest] Avg warm time-to-content: ${Math.round(avgTtc)}ms`)
  }

  // ── Assertions ──────────────────────────────────────────────────────────
  expect(cacheHitRate, `Cache hit rate ${Math.round(cacheHitRate * 100)}% should be >= 80%`).toBeGreaterThanOrEqual(0.80)
  expect(failCount, `${failCount} cache failures found`).toBe(0)
  if (avgTtc !== null) {
    expect(avgTtc, `Avg warm time-to-content ${Math.round(avgTtc)}ms should be < 500ms`).toBeLessThan(500)
  }
})

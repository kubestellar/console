import { expect, test, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { setupAuth } from '../helpers/setup'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type PerfMode = 'live-cold' | 'live-warm' | 'demo-cold' | 'demo-warm'
type DataSource = 'cache' | 'stream' | 'network' | 'demo'
type Status = 'ok' | 'timeout' | 'error'

// Issue 9232: this spec used to measure TTFI, timeouts, and p95 per mode, write
// them to ttfi-report.json, and return without asserting anything. A shared
// `compare-ttfi.mjs` script existed but was only invoked from two of the three
// CI workflows that run this spec (and even then one wrapped it in `|| true`),
// so regressions to TTFI silently passed every time the spec ran standalone.
// The block below wires the same budgets that `compare-ttfi.mjs` uses —
// `baseline/ttfi-baseline.json` — directly into the test's `afterAll`, so a
// per-card TTFI, p95, or timeout-count breach fails the Playwright run
// regardless of which workflow invoked it.
const TTFI_BASELINE_PATH = path.resolve(__dirname, 'baseline/ttfi-baseline.json')
// Percent tolerance applied on top of the baseline budgets. Mirrors the
// `CI_TOLERANCE_PCT` env var consumed by compare-ttfi.mjs so both the in-test
// gate and the post-test workflow gate agree. Default 0 matches the script's
// default; the perf-ttfi.yml workflow sets it to 15 to absorb CI-runner noise.
const TTFI_DEFAULT_TOLERANCE_PCT = 0
const TTFI_IN_TEST_TOLERANCE_PCT = Number(
  process.env.CI_TOLERANCE_PCT || String(TTFI_DEFAULT_TOLERANCE_PCT)
)
const TTFI_TOLERANCE_FACTOR = 1 + TTFI_IN_TEST_TOLERANCE_PCT / 100

interface TTFIModeBudget {
  max_ttfi_ms: number
  max_p95_ms: number
  max_timeout_count: number
}
interface TTFIBaseline {
  budgets: Partial<Record<PerfMode, TTFIModeBudget>>
}

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

interface CardTTFIMetric {
  cardType: string
  cardId: string
  mode: PerfMode
  source: DataSource
  status: Status
  ttfi_ms: number
  timedOut: boolean
  batchIndex: number
}

interface TTFIReport {
  timestamp: string
  batchSize: number
  cards: CardTTFIMetric[]
}

const mockUser = {
  id: '1',
  github_id: '12345',
  github_login: 'perftest',
  email: 'perf@test.com',
  onboarded: true,
}

const BATCH_SIZE = 24
const BATCH_TIMEOUT_MS = 18_000
const report: TTFIReport = {
  timestamp: new Date().toISOString(),
  batchSize: BATCH_SIZE,
  cards: [],
}

const MOCK_CLUSTER = 'perf-test-cluster'

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
  'gpu-nodes': { nodes: [{ name: 'gpu-node-1', cluster: MOCK_CLUSTER, gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2, labels: {} }] },
}

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

async function setupLiveMocks(page: Page) {
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

  await page.route('**/api/mcp/**', async (route) => {
    if (route.request().url().includes('/stream')) {
      await route.fallback()
      return
    }
    const delay = 80 + Math.random() * 180
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

  await page.route('**/api/workloads**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
  )

  // /api/dashboards expects an array response (not {items:[]})
  await page.route('**/api/dashboards**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )

  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    if (
      url.includes('/api/mcp/') ||
      url.includes('/api/me') ||
      url.includes('/api/workloads') ||
      url.includes('/api/dashboards')
    ) {
      await route.fallback()
      return
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
  })

  // Mock external requests that would otherwise hang
  await page.route('**/api.github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )

  // RSS feed CORS proxy mocks (prevent hanging external requests)
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

  await page.route('http://127.0.0.1:8585/**', (route) => {
    const url = route.request().url()
    if (url.endsWith('/health') || url.includes('/health?')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: 'perf-test' }),
      })
      return
    }
    // Return empty but valid data for all kc-agent endpoints
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

async function setMode(page: Page, mode: PerfMode) {
  const isDemo = mode.startsWith('demo')
  const isWarm = mode.endsWith('warm')

  await page.addInitScript(
    ({ demo, warm, user }: { demo: boolean; warm: boolean; user: unknown }) => {
      // Guard: about:blank has no origin and throws on localStorage access.
      try {
        localStorage.setItem('token', demo ? 'demo-token' : 'test-token')
        localStorage.setItem('kc-demo-mode', String(demo))
        localStorage.setItem('demo-user-onboarded', 'true')
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
        localStorage.setItem('kc-user-cache', JSON.stringify(user))
        localStorage.setItem('kc-backend-status', JSON.stringify({ available: true, timestamp: Date.now() }))
        localStorage.setItem('kc-sqlite-migrated', '2')

        if (!warm) {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i)
            if (!key) continue
            if (key.includes('dashboard-cards') || key.startsWith('cache:') || key.includes('kubestellar-stack-cache')) {
              localStorage.removeItem(key)
            }
          }
        }
      } catch { /* about:blank has no origin */ }
    },
    { demo: isDemo, warm: isWarm, user: mockUser }
  )

  if (!isWarm) {
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
}

async function getManifestForBatch(page: Page, batch: number, batchSize: number): Promise<ManifestData> {
  await page.goto(`/__perf/all-cards?batch=${batch + 1}&size=${batchSize}`, { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForFunction(() => !!window.__TTFI_MANIFEST__, { timeout: 60_000 })
  } catch {
    const debug = await page.evaluate(() => ({
      path: window.location.pathname,
      hasManifestEl: !!document.querySelector('[data-testid="ttfi-manifest"]'),
      hasSidebar: !!document.querySelector('[data-testid="sidebar"]'),
      bodyPreview: (document.body.textContent || '').slice(0, 300),
      hasLoginForm: !!document.querySelector('input[type="password"]'),
    }))
    throw new Error(`TTFI manifest did not load: ${JSON.stringify(debug)}`)
  }

  const manifest = await page.evaluate(() => window.__TTFI_MANIFEST__)
  if (!manifest) {
    throw new Error('Missing __TTFI_MANIFEST__ from all-cards perf route')
  }
  return manifest as ManifestData
}

async function monitorBatch(page: Page, cardIds: string[], timeoutMs: number): Promise<{
  loadTimes: Record<string, number>
  timedOut: string[]
}> {
  const handle = await page.waitForFunction(
    ({ ids, timeout }: { ids: string[]; timeout: number }) => {
      const win = window as Window & {
        __TTFI_MONITOR__?: { startedAt: number; loadTimes: Record<string, number> }
      }
      const now = performance.now()
      if (!win.__TTFI_MONITOR__) {
        win.__TTFI_MONITOR__ = { startedAt: now, loadTimes: {} }
      }
      const monitor = win.__TTFI_MONITOR__

      for (const id of ids) {
        if (monitor.loadTimes[id] !== undefined) continue
        const card = document.querySelector(`[data-card-id="${id}"]`)
        if (!card) continue

        const isLoading = card.getAttribute('data-loading') === 'true'
        if (isLoading) continue

        if (card.querySelector('[data-card-skeleton="true"]')) continue

        const textLen = (card.textContent || '').trim().length
        const hasVisualContent = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
        if (textLen <= 10 && !hasVisualContent) continue

        monitor.loadTimes[id] = Math.round(now - monitor.startedAt)
      }

      const missing = ids.filter((id) => monitor.loadTimes[id] === undefined)
      if (missing.length === 0) {
        return { loadTimes: monitor.loadTimes, timedOut: [] }
      }

      if (now - monitor.startedAt > timeout) {
        return { loadTimes: monitor.loadTimes, timedOut: missing }
      }
      return false
    },
    { ids: cardIds, timeout: timeoutMs },
    { timeout: timeoutMs + 3_000, polling: 100 }
  )
  return (await handle.jsonValue()) as { loadTimes: Record<string, number>; timedOut: string[] }
}

async function prewarmIfNeeded(page: Page, mode: PerfMode, totalCards: number) {
  if (!mode.endsWith('warm')) return
  const batches = Math.ceil(totalCards / BATCH_SIZE)
  for (let batch = 0; batch < batches; batch++) {
    await getManifestForBatch(page, batch, BATCH_SIZE)
    // perf measurement: intentional delay for timing baseline between prewarm batches
    await page.waitForTimeout(350)
  }
}

function modeToSource(mode: PerfMode): DataSource {
  if (mode.startsWith('demo')) return 'demo'
  if (mode.endsWith('warm')) return 'cache'
  return 'network'
}

function summarizeMode(cards: CardTTFIMetric[]): string {
  if (cards.length === 0) return 'no-cards'
  const valid = cards.filter((c) => c.status === 'ok')
  const timeouts = cards.filter((c) => c.status === 'timeout').length
  const avg = valid.length
    ? Math.round(valid.reduce((sum, c) => sum + c.ttfi_ms, 0) / valid.length)
    : -1
  const p95 = valid.length
    ? [...valid].sort((a, b) => a.ttfi_ms - b.ttfi_ms)[Math.max(0, Math.ceil(valid.length * 0.95) - 1)].ttfi_ms
    : -1
  return `cards=${cards.length} ok=${valid.length} timeout=${timeouts} avg=${avg}ms p95=${p95}ms`
}

async function runMode(page: Page, mode: PerfMode): Promise<CardTTFIMetric[]> {
  await setupAuth(page, mockUser)
  if (mode.startsWith('live')) {
    await setupLiveMocks(page)
  } else {
    // Demo modes still need the catch-all API mock to prevent hangs
    await setupLiveMocks(page)
  }
  await setMode(page, mode)

  const firstManifest = await getManifestForBatch(page, 0, BATCH_SIZE)
  const totalCards = firstManifest.totalCards
  await prewarmIfNeeded(page, mode, totalCards)

  const expectedTypes = new Set(firstManifest.allCardTypes)
  const seenTypes = new Set<string>()
  const batches = Math.ceil(totalCards / BATCH_SIZE)
  const results: CardTTFIMetric[] = []

  for (let batch = 0; batch < batches; batch++) {
    if (batch > 0) {
      await page.goto('about:blank', { waitUntil: 'domcontentloaded' })
      // perf measurement: intentional delay for timing baseline between batches
      await page.waitForTimeout(200)
    }
    const manifest = await getManifestForBatch(page, batch, BATCH_SIZE)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    for (const item of selected) seenTypes.add(item.cardType)

    const cardIds = selected.map((item) => item.cardId)
    const monitored = await monitorBatch(page, cardIds, BATCH_TIMEOUT_MS)

    for (const item of selected) {
      const ttfi = monitored.loadTimes[item.cardId]
      const timedOut = monitored.timedOut.includes(item.cardId) || ttfi === undefined
      results.push({
        cardType: item.cardType,
        cardId: item.cardId,
        mode,
        source: modeToSource(mode),
        status: timedOut ? 'timeout' : 'ok',
        ttfi_ms: timedOut ? BATCH_TIMEOUT_MS : ttfi,
        timedOut,
        batchIndex: batch,
      })
    }
  }

  expect(seenTypes.size, `${mode}: rendered card types`).toBe(expectedTypes.size)
  return results
}

test.describe.configure({ mode: 'serial' })

// In CI there is no backend, so live-mode mocks (cross-origin SSE to localhost:8080)
// are unreliable. Only run demo modes in CI; run all modes locally.
const MODES: PerfMode[] = process.env.CI
  ? ['demo-cold', 'demo-warm']
  : ['live-cold', 'live-warm', 'demo-cold', 'demo-warm']

for (const mode of MODES) {
  test(`all cards TTFI (${mode})`, async ({ page }) => {
    const modeResults = await runMode(page, mode)
    report.cards.push(...modeResults)
    console.log(`[TTFI] ${mode}: ${summarizeMode(modeResults)}`)
  })
}

test.afterAll(async () => {
  const outDir = path.resolve(__dirname, '../test-results')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const byMode = new Map<PerfMode, CardTTFIMetric[]>()
  for (const mode of ['live-cold', 'live-warm', 'demo-cold', 'demo-warm'] as const) {
    byMode.set(mode, report.cards.filter((card) => card.mode === mode))
  }

  const summaryLines = [
    '# All-Card TTFI Summary',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total records: ${report.cards.length}`,
    '',
  ]

  for (const mode of ['live-cold', 'live-warm', 'demo-cold', 'demo-warm'] as const) {
    summaryLines.push(`- ${mode}: ${summarizeMode(byMode.get(mode) || [])}`)
  }

  fs.writeFileSync(path.join(outDir, 'ttfi-report.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(outDir, 'ttfi-summary.md'), `${summaryLines.join('\n')}\n`)

  // ── Issue 9232: in-test TTFI budget assertions ───────────────────────────
  // Use try/catch for atomic read (avoids existsSync → readFileSync TOCTOU).
  let baselineContent: string | null = null
  try {
    baselineContent = fs.readFileSync(TTFI_BASELINE_PATH, 'utf-8')
  } catch {
    // Baseline intentionally absent — skip the gate rather than fail. The spec
    // is still useful as a reporting tool in that case; CI will regenerate
    // the baseline on the next run.
    console.log(`[TTFI] baseline missing at ${TTFI_BASELINE_PATH} — skipping in-test budget assertion`)
    return
  }

  const baseline = JSON.parse(baselineContent) as TTFIBaseline
  const failures: string[] = []

  // Percentile index — compare-ttfi.mjs uses the 95th percentile for p95.
  const P95_PERCENTILE = 0.95

  for (const mode of ['live-cold', 'live-warm', 'demo-cold', 'demo-warm'] as const) {
    const modeCards = byMode.get(mode) || []
    if (modeCards.length === 0) continue // mode was skipped (e.g. live modes in CI)
    const budget = baseline.budgets?.[mode]
    if (!budget) {
      failures.push(`${mode}: missing budget in ttfi-baseline.json`)
      continue
    }

    const okCards = modeCards.filter((c) => c.status === 'ok')
    const timeoutCards = modeCards.filter((c) => c.status === 'timeout')
    const values = okCards.map((c) => c.ttfi_ms).sort((a, b) => a - b)
    const p95 = values.length
      ? values[Math.max(0, Math.ceil(values.length * P95_PERCENTILE) - 1)]
      : -1

    const effectiveP95 = Math.round(budget.max_p95_ms * TTFI_TOLERANCE_FACTOR)
    const effectiveTtfi = Math.round(budget.max_ttfi_ms * TTFI_TOLERANCE_FACTOR)

    if (timeoutCards.length > budget.max_timeout_count) {
      failures.push(
        `${mode}: timeout count ${timeoutCards.length} > budget ${budget.max_timeout_count}`
      )
    }
    if (p95 > effectiveP95) {
      failures.push(`${mode}: p95 ${p95}ms > budget ${effectiveP95}ms`)
    }
    for (const card of okCards) {
      if (card.ttfi_ms > effectiveTtfi) {
        failures.push(
          `${mode}:${card.cardType} ttfi ${card.ttfi_ms}ms > max ${effectiveTtfi}ms`
        )
      }
    }
  }

  // Cap the failure message length — a perf regression can produce hundreds
  // of over-budget cards and the full list drowns out the actual signal.
  const MAX_FAILURES_IN_MESSAGE = 20
  const displayed = failures.slice(0, MAX_FAILURES_IN_MESSAGE)
  const suffix = failures.length > MAX_FAILURES_IN_MESSAGE
    ? `\n…and ${failures.length - MAX_FAILURES_IN_MESSAGE} more (see ttfi-report.json)`
    : ''
  expect(
    failures.length,
    `TTFI budget breached (${failures.length} failure(s)):\n${displayed.join('\n')}${suffix}`
  ).toBe(0)
})

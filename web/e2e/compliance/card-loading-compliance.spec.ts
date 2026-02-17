import { test, type Page } from '@playwright/test'
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

interface CardStateSnapshot {
  timestamp: number
  dataLoading: string | null
  hasDemoBadge: boolean
  hasYellowBorder: boolean
  hasLargeSkeleton: boolean
  hasSpinningRefresh: boolean
  textContentLength: number
  hasVisualContent: boolean
}

type CriterionStatus = 'pass' | 'fail' | 'warn' | 'skip'

interface CriterionResult {
  criterion: string
  status: CriterionStatus
  details: string
}

interface CardComplianceResult {
  cardType: string
  cardId: string
  criteria: Record<string, CriterionResult>
  overallStatus: CriterionStatus
}

interface BatchResult {
  batchIndex: number
  cards: CardComplianceResult[]
}

interface ComplianceReport {
  timestamp: string
  totalCards: number
  batches: BatchResult[]
  summary: {
    totalCards: number
    passCount: number
    failCount: number
    warnCount: number
    skipCount: number
    criterionPassRates: Record<string, number>
  }
  gapAnalysis: GapAnalysisEntry[]
}

interface GapAnalysisEntry {
  area: string
  observation: string
  suggestedImprovement: string
  priority: 'high' | 'medium' | 'low'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 24
const BATCH_LOAD_TIMEOUT_MS = 20_000
const MONITOR_POLL_INTERVAL_MS = 50
const WARM_RETURN_WAIT_MS = 3_000

const MOCK_CLUSTER = 'compliance-test-cluster'

const mockUser = {
  id: '1',
  github_id: '12345',
  github_login: 'compliancetest',
  email: 'compliance@test.com',
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
// Mock setup (mirrors all-cards-ttfi.spec.ts)
// ---------------------------------------------------------------------------

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

const sseRequestLog: string[] = []

async function setupAuth(page: Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) })
  )
}

async function setupLiveMocks(page: Page) {
  await page.route('**/api/mcp/*/stream**', (route) => {
    const url = route.request().url()
    sseRequestLog.push(url)
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

  // Endpoints that expect array responses (not { items: [] })
  await page.route('**/api/dashboards**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  )

  await page.route('**/api/config/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  )

  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    if (
      url.includes('/api/mcp/') ||
      url.includes('/api/me') ||
      url.includes('/api/workloads') ||
      url.includes('/api/dashboards') ||
      url.includes('/api/config/')
    ) {
      await route.fallback()
      return
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  await page.route('http://127.0.0.1:8585/**', (route) => {
    const url = route.request().url()
    if (url.endsWith('/health') || url.includes('/health?')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: 'compliance-test' }),
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

  // Clear IndexedDB caches
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
// Compliance monitor — injected into the page
// ---------------------------------------------------------------------------

async function startComplianceMonitor(page: Page, cardIds: string[]) {
  await page.evaluate(
    ({ ids, pollInterval }: { ids: string[]; pollInterval: number }) => {
      type Snapshot = {
        timestamp: number
        dataLoading: string | null
        hasDemoBadge: boolean
        hasYellowBorder: boolean
        hasLargeSkeleton: boolean
        hasSpinningRefresh: boolean
        textContentLength: number
        hasVisualContent: boolean
      }

      const win = window as Window & {
        __COMPLIANCE_MONITOR__?: {
          cardHistory: Record<string, Snapshot[]>
          running: boolean
          intervalId: number
        }
      }

      const cardHistory: Record<string, Snapshot[]> = {}
      for (const id of ids) cardHistory[id] = []

      function snapshot() {
        const now = performance.now()
        for (const id of ids) {
          const card = document.querySelector(`[data-card-id="${id}"]`)
          if (!card) continue

          const snap: Snapshot = {
            timestamp: now,
            dataLoading: card.getAttribute('data-loading'),
            hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
            hasYellowBorder: card.className.includes('border-yellow-500'),
            hasLargeSkeleton: false,
            hasSpinningRefresh: !!card.querySelector('svg.animate-spin'),
            textContentLength: (card.textContent || '').trim().length,
            hasVisualContent: !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]'),
          }

          // Check for large skeleton placeholders
          for (const el of card.querySelectorAll('.animate-pulse')) {
            if ((el as HTMLElement).getBoundingClientRect().height > 40) {
              snap.hasLargeSkeleton = true
              break
            }
          }

          cardHistory[id].push(snap)
        }
      }

      const intervalId = window.setInterval(snapshot, pollInterval)
      // Take an immediate first snapshot
      snapshot()

      win.__COMPLIANCE_MONITOR__ = { cardHistory, running: true, intervalId }
    },
    { ids: cardIds, pollInterval: MONITOR_POLL_INTERVAL_MS }
  )
}

async function stopComplianceMonitor(page: Page): Promise<Record<string, CardStateSnapshot[]>> {
  return await page.evaluate(() => {
    const win = window as Window & {
      __COMPLIANCE_MONITOR__?: {
        cardHistory: Record<string, unknown[]>
        running: boolean
        intervalId: number
      }
    }
    const monitor = win.__COMPLIANCE_MONITOR__
    if (!monitor) return {}
    clearInterval(monitor.intervalId)
    monitor.running = false
    return monitor.cardHistory as Record<string, CardStateSnapshot[]>
  })
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

async function navigateToBatch(page: Page, batch: number, manifestTimeoutMs = 60_000): Promise<ManifestData> {
  const url = `/__compliance/all-cards?batch=${batch + 1}&size=${BATCH_SIZE}`
  console.log(`[Compliance] Navigating to ${url} (timeout: ${manifestTimeoutMs}ms)`)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  console.log(`[Compliance] DOM loaded, waiting for manifest...`)

  // Periodic debug logging while waiting
  const debugInterval = setInterval(async () => {
    try {
      const state = await page.evaluate(() => ({
        path: window.location.pathname,
        hasManifest: !!(window as Window & { __COMPLIANCE_MANIFEST__?: unknown }).__COMPLIANCE_MANIFEST__,
        hasLoginForm: !!document.querySelector('input[type="password"]'),
        hasSidebar: !!document.querySelector('[data-testid="sidebar"]'),
        bodyLen: (document.body.textContent || '').trim().length,
        bodyPreview: (document.body.textContent || '').trim().slice(0, 100),
      }))
      console.log(`[Compliance] Page state: ${JSON.stringify(state)}`)
    } catch {
      console.log(`[Compliance] Page state: (evaluate failed)`)
    }
  }, 10_000)

  try {
    await page.waitForFunction(() => !!(window as Window & { __COMPLIANCE_MANIFEST__?: unknown }).__COMPLIANCE_MANIFEST__, {
      timeout: manifestTimeoutMs,
    })
  } catch {
    clearInterval(debugInterval)
    const debug = await page.evaluate(() => ({
      path: window.location.pathname,
      hasManifestEl: !!document.querySelector('[data-testid="compliance-manifest"]'),
      hasSidebar: !!document.querySelector('[data-testid="sidebar"]'),
      bodyPreview: (document.body.textContent || '').slice(0, 300),
      hasLoginForm: !!document.querySelector('input[type="password"]'),
    }))
    throw new Error(`Compliance manifest did not load: ${JSON.stringify(debug)}`)
  }
  clearInterval(debugInterval)
  console.log(`[Compliance] Manifest loaded for batch ${batch}`)

  const manifest = await page.evaluate(
    () => (window as Window & { __COMPLIANCE_MANIFEST__?: unknown }).__COMPLIANCE_MANIFEST__
  )
  if (!manifest) throw new Error('Missing __COMPLIANCE_MANIFEST__ from compliance route')
  return manifest as ManifestData
}

async function waitForCardsToLoad(page: Page, cardIds: string[], timeoutMs: number) {
  await page.waitForFunction(
    ({ ids, timeout }: { ids: string[]; timeout: number }) => {
      const win = window as Window & {
        __COMPLIANCE_LOAD_START__?: number
      }
      const now = performance.now()
      if (!win.__COMPLIANCE_LOAD_START__) win.__COMPLIANCE_LOAD_START__ = now

      const allDone = ids.every((id) => {
        const card = document.querySelector(`[data-card-id="${id}"]`)
        if (!card) return false
        return card.getAttribute('data-loading') === 'false'
      })
      if (allDone) return true
      if (now - win.__COMPLIANCE_LOAD_START__ > timeout) return true
      return false
    },
    { ids: cardIds, timeout: timeoutMs },
    { timeout: timeoutMs + 5_000, polling: 200 }
  )
}

// ---------------------------------------------------------------------------
// Criterion evaluators
// ---------------------------------------------------------------------------

function checkCriterionA(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // Skeleton phase should NOT have demo badge or yellow border
  const loadingSnapshots = history.filter((s) => s.dataLoading === 'true')
  if (loadingSnapshots.length === 0) {
    return { criterion: 'a', status: 'skip', details: 'No loading snapshots captured' }
  }

  const violations = loadingSnapshots.filter((s) => s.hasDemoBadge || s.hasYellowBorder)
  if (violations.length === 0) {
    return { criterion: 'a', status: 'pass', details: `${loadingSnapshots.length} loading snapshots, all clean` }
  }

  const pct = Math.round((violations.length / loadingSnapshots.length) * 100)
  return {
    criterion: 'a',
    status: 'fail',
    details: `${violations.length}/${loadingSnapshots.length} loading snapshots showed demo indicators (${pct}%)`,
  }
}

function checkCriterionB(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // Refresh icon should spin during loading
  const loadingSnapshots = history.filter((s) => s.dataLoading === 'true')
  if (loadingSnapshots.length === 0) {
    return { criterion: 'b', status: 'skip', details: 'No loading snapshots captured' }
  }

  const spinning = loadingSnapshots.filter((s) => s.hasSpinningRefresh)
  if (spinning.length > 0) {
    return {
      criterion: 'b',
      status: 'pass',
      details: `${spinning.length}/${loadingSnapshots.length} loading snapshots had spinning refresh`,
    }
  }

  return {
    criterion: 'b',
    status: 'fail',
    details: `No spinning refresh icon detected during ${loadingSnapshots.length} loading snapshots`,
  }
}

function checkCriterionC(
  cardId: string,
  cardType: string,
  sseUrls: string[]
): CriterionResult {
  // Check if SSE stream requests were made (some cards use REST only)
  if (sseUrls.length > 0) {
    return { criterion: 'c', status: 'pass', details: `${sseUrls.length} SSE stream requests observed` }
  }
  return {
    criterion: 'c',
    status: 'warn',
    details: 'No SSE /stream requests detected — card may use REST only',
  }
}

function checkCriterionD(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // Transition: loading → content (data-loading goes from true to false, text > 10 chars)
  const hadLoading = history.some((s) => s.dataLoading === 'true')
  const hadContent = history.some(
    (s) => s.dataLoading === 'false' && (s.textContentLength > 10 || s.hasVisualContent)
  )

  if (!hadLoading && hadContent) {
    return { criterion: 'd', status: 'pass', details: 'Content appeared (no loading phase captured)' }
  }
  if (hadLoading && hadContent) {
    return { criterion: 'd', status: 'pass', details: 'Transitioned from loading skeleton to content' }
  }
  if (hadLoading && !hadContent) {
    return { criterion: 'd', status: 'fail', details: 'Loading skeleton appeared but no content followed' }
  }
  return { criterion: 'd', status: 'skip', details: 'No loading or content snapshots captured' }
}

function checkCriterionE(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // After first content, refresh icon should still spin during incremental load
  const firstContentIdx = history.findIndex(
    (s) => s.dataLoading === 'false' && (s.textContentLength > 10 || s.hasVisualContent)
  )
  if (firstContentIdx === -1) {
    return { criterion: 'e', status: 'skip', details: 'No content phase captured' }
  }

  // Look for spinning refresh in post-content snapshots (incremental refresh)
  const postContent = history.slice(firstContentIdx)
  const hasSpinner = postContent.some((s) => s.hasSpinningRefresh && s.textContentLength > 10)
  if (hasSpinner) {
    return { criterion: 'e', status: 'pass', details: 'Refresh icon animated during incremental load' }
  }
  // This is expected to skip for most cards — auto-refresh timer is 15s+
  return {
    criterion: 'e',
    status: 'skip',
    details: 'No incremental refresh observed (auto-refresh timer not triggered within test window)',
  }
}

async function checkCriterionF(page: Page): Promise<CriterionResult> {
  // Check IndexedDB kc_cache has entries
  const cacheCount = await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      try {
        const req = indexedDB.open('kc_cache')
        req.onsuccess = () => {
          try {
            const db = req.result
            const storeNames = Array.from(db.objectStoreNames)
            if (storeNames.length === 0) {
              db.close()
              resolve(0)
              return
            }
            const tx = db.transaction(storeNames, 'readonly')
            let total = 0
            let done = 0
            for (const store of storeNames) {
              const countReq = tx.objectStore(store).count()
              countReq.onsuccess = () => {
                total += countReq.result
                done++
                if (done === storeNames.length) {
                  db.close()
                  resolve(total)
                }
              }
              countReq.onerror = () => {
                done++
                if (done === storeNames.length) {
                  db.close()
                  resolve(total)
                }
              }
            }
          } catch {
            resolve(0)
          }
        }
        req.onerror = () => resolve(0)
      } catch {
        resolve(0)
      }
    })
  })

  if (cacheCount > 0) {
    return { criterion: 'f', status: 'pass', details: `IndexedDB kc_cache has ${cacheCount} entries` }
  }
  return { criterion: 'f', status: 'fail', details: 'No entries found in IndexedDB kc_cache' }
}

function checkCriterionG(
  cardId: string,
  cardType: string,
  warmHistory: CardStateSnapshot[]
): CriterionResult {
  // On warm return: first snapshot should have content, no skeleton
  if (warmHistory.length === 0) {
    return { criterion: 'g', status: 'skip', details: 'No warm return snapshots captured' }
  }

  const first = warmHistory[0]
  const hasImmediateContent = (first.textContentLength > 10 || first.hasVisualContent) && !first.hasLargeSkeleton
  const skeletonSnapshots = warmHistory.filter((s) => s.hasLargeSkeleton && s.dataLoading === 'true')

  if (hasImmediateContent && skeletonSnapshots.length === 0) {
    return { criterion: 'g', status: 'pass', details: 'Cached data loaded immediately, no skeleton phase' }
  }
  if (hasImmediateContent && skeletonSnapshots.length > 0) {
    return {
      criterion: 'g',
      status: 'warn',
      details: `Content appeared first but ${skeletonSnapshots.length} skeleton snapshots followed`,
    }
  }
  return {
    criterion: 'g',
    status: 'fail',
    details: `First snapshot: text=${first.textContentLength} chars, skeleton=${first.hasLargeSkeleton}, loading=${first.dataLoading}`,
  }
}

function checkCriterionH(
  cardId: string,
  cardType: string,
  warmHistory: CardStateSnapshot[]
): CriterionResult {
  // Cached data maintained throughout warm return — no regressions to skeleton
  if (warmHistory.length === 0) {
    return { criterion: 'h', status: 'skip', details: 'No warm return snapshots captured' }
  }

  const contentSnapshots = warmHistory.filter(
    (s) => s.textContentLength > 10 || s.hasVisualContent
  )
  const skeletonSnapshots = warmHistory.filter((s) => s.hasLargeSkeleton)

  if (contentSnapshots.length === warmHistory.length) {
    return { criterion: 'h', status: 'pass', details: 'Content stable throughout warm return' }
  }
  if (contentSnapshots.length > 0 && skeletonSnapshots.length === 0) {
    return { criterion: 'h', status: 'pass', details: 'Content present, no skeleton regression' }
  }

  const demoBadges = warmHistory.filter((s) => s.hasDemoBadge)
  if (demoBadges.length > 0) {
    return {
      criterion: 'h',
      status: 'fail',
      details: `${demoBadges.length}/${warmHistory.length} warm snapshots showed demo badge`,
    }
  }

  return {
    criterion: 'h',
    status: 'warn',
    details: `${contentSnapshots.length}/${warmHistory.length} snapshots had content, ${skeletonSnapshots.length} had skeleton`,
  }
}

// ---------------------------------------------------------------------------
// Gap analysis — self-evaluating section for continuous improvement
// ---------------------------------------------------------------------------

function generateGapAnalysis(report: ComplianceReport): GapAnalysisEntry[] {
  const gaps: GapAnalysisEntry[] = []
  const rates = report.summary.criterionPassRates

  // Check for criteria with high skip rates (not enough coverage)
  const allCards = report.batches.flatMap((b) => b.cards)
  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const results = allCards.map((c) => c.criteria[criterion]).filter(Boolean)
    const skipCount = results.filter((r) => r.status === 'skip').length
    const skipRate = results.length > 0 ? skipCount / results.length : 0

    if (skipRate > 0.5) {
      gaps.push({
        area: `Criterion ${criterion} coverage`,
        observation: `${Math.round(skipRate * 100)}% of cards skipped criterion ${criterion}`,
        suggestedImprovement:
          criterion === 'e'
            ? 'Consider triggering a manual refresh via button click to test incremental refresh, rather than waiting for auto-refresh timer'
            : `Review test timing — the polling window may be too short to capture the loading→content transition for criterion ${criterion}`,
        priority: skipRate > 0.8 ? 'high' : 'medium',
      })
    }
  }

  // Check if demo badge failures cluster around specific card types
  const failedCards = allCards.filter((c) => c.criteria.a?.status === 'fail')
  if (failedCards.length > 3) {
    const failedTypes = failedCards.map((c) => c.cardType)
    const uniqueTypes = [...new Set(failedTypes)]
    gaps.push({
      area: 'Demo badge contamination',
      observation: `${uniqueTypes.length} card types show demo badges during skeleton: ${uniqueTypes.slice(0, 5).join(', ')}${uniqueTypes.length > 5 ? '...' : ''}`,
      suggestedImprovement:
        'Investigate whether these cards report isDemoData=true during initial load. The showDemoIndicator logic in CardWrapper may need a loading-phase exemption.',
      priority: 'high',
    })
  }

  // Check warm return issues — caching gaps
  const warmFailCards = allCards.filter((c) => c.criteria.g?.status === 'fail')
  if (warmFailCards.length > 0) {
    gaps.push({
      area: 'Cache miss on warm return',
      observation: `${warmFailCards.length} cards showed skeleton on warm return instead of cached data`,
      suggestedImprovement:
        'Check if these cards use useCachedData correctly. Cards may be clearing cache on unmount or using non-cacheable data sources.',
      priority: 'high',
    })
  }

  // Check criterion C (SSE) — many warns suggest cards arent using SSE
  if (rates.c !== undefined && rates.c < 0.3) {
    gaps.push({
      area: 'SSE streaming adoption',
      observation: `Only ${Math.round(rates.c * 100)}% of cards use SSE streaming — most use REST only`,
      suggestedImprovement:
        'Consider whether criterion C should be split: REST cards vs SSE cards, each with their own compliance path. REST cards should still validate incremental loading.',
      priority: 'low',
    })
  }

  // Meta: suggest adding new criteria based on observed patterns
  gaps.push({
    area: 'Future criteria candidates',
    observation: 'The current 8 criteria cover core loading behavior but may miss edge cases',
    suggestedImprovement:
      'Consider adding: (i) error-state compliance — cards showing errors should not show demo badges; (j) responsive sizing — cards should not overflow their container during loading; (k) accessibility — skeleton states should have appropriate ARIA attributes.',
    priority: 'low',
  })

  return gaps
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function deriveOverallStatus(criteria: Record<string, CriterionResult>): CriterionStatus {
  const statuses = Object.values(criteria).map((r) => r.status)
  if (statuses.includes('fail')) return 'fail'
  if (statuses.includes('warn')) return 'warn'
  if (statuses.every((s) => s === 'skip')) return 'skip'
  return 'pass'
}

function writeReport(report: ComplianceReport, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  // JSON report
  fs.writeFileSync(path.join(outDir, 'compliance-report.json'), JSON.stringify(report, null, 2))

  // Markdown summary
  const allCards = report.batches.flatMap((b) => b.cards)
  const md: string[] = [
    '# Card Loading Compliance Report',
    '',
    `Generated: ${report.timestamp}`,
    `Total cards tested: ${report.totalCards}`,
    '',
    '## Criterion Pass Rates',
    '',
    '| Criterion | Description | Pass Rate | Pass | Fail | Warn | Skip |',
    '|-----------|-------------|-----------|------|------|------|------|',
  ]

  const criterionDescriptions: Record<string, string> = {
    a: 'Skeleton without demo badge during loading',
    b: 'Refresh icon spins during loading',
    c: 'Data loads via SSE streaming',
    d: 'Skeleton replaced by data content',
    e: 'Refresh icon animated during incremental load',
    f: 'Data cached in IndexedDB as it loads',
    g: 'Cached data loads immediately on return',
    h: 'Cached data updated without skeleton regression',
  }

  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const results = allCards.map((c) => c.criteria[criterion]).filter(Boolean)
    const pass = results.filter((r) => r.status === 'pass').length
    const fail = results.filter((r) => r.status === 'fail').length
    const warn = results.filter((r) => r.status === 'warn').length
    const skip = results.filter((r) => r.status === 'skip').length
    const rate = report.summary.criterionPassRates[criterion]
    const pct = rate !== undefined ? `${Math.round(rate * 100)}%` : 'N/A'

    md.push(
      `| ${criterion} | ${criterionDescriptions[criterion] || ''} | ${pct} | ${pass} | ${fail} | ${warn} | ${skip} |`
    )
  }

  // Failures section
  const failedCards = allCards.filter((c) => c.overallStatus === 'fail')
  if (failedCards.length > 0) {
    md.push('', '## Failures', '', '| Card Type | Failed Criteria | Details |', '|-----------|----------------|---------|')
    for (const card of failedCards) {
      const failedCriteria = Object.entries(card.criteria)
        .filter(([, r]) => r.status === 'fail')
        .map(([key, r]) => `${key}: ${r.details}`)
      md.push(`| ${card.cardType} | ${failedCriteria.map((f) => f.split(':')[0]).join(', ')} | ${failedCriteria.join('; ')} |`)
    }
  }

  // Summary
  md.push(
    '',
    '## Summary',
    '',
    `- **Pass**: ${report.summary.passCount}`,
    `- **Fail**: ${report.summary.failCount}`,
    `- **Warn**: ${report.summary.warnCount}`,
    `- **Skip**: ${report.summary.skipCount}`,
  )

  // Gap analysis section
  if (report.gapAnalysis.length > 0) {
    md.push(
      '',
      '## Gap Analysis & Improvement Opportunities',
      '',
      'The following gaps were identified during this compliance run. Use these to improve both the test suite and the UI:',
      '',
    )
    for (const gap of report.gapAnalysis) {
      md.push(
        `### [${gap.priority.toUpperCase()}] ${gap.area}`,
        '',
        `**Observation:** ${gap.observation}`,
        '',
        `**Suggested improvement:** ${gap.suggestedImprovement}`,
        '',
      )
    }
  }

  fs.writeFileSync(path.join(outDir, 'compliance-summary.md'), md.join('\n') + '\n')
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test('card loading compliance — cold + warm', async ({ page }) => {
  const allBatchResults: BatchResult[] = []
  let totalCards = 0

  // Capture browser console for debugging
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Browser ERROR] ${msg.text()}`)
  })
  page.on('pageerror', (err) => console.log(`[Browser EXCEPTION] ${err.message}`))

  // ── Phase 1: Setup mocks ──────────────────────────────────────────────
  await setupAuth(page)
  await setupLiveMocks(page)
  await setLiveColdMode(page)

  // ── Phase 2: Warmup — prime Vite module cache ─────────────────────────
  console.log('[Compliance] Phase 1: Warmup — priming Vite module cache')

  // Use 180s timeout for cold dev server (Vite compiles 174 card modules on first load)
  const warmupManifest = await navigateToBatch(page, 0, 180_000)
  totalCards = warmupManifest.totalCards
  const totalBatches = Math.ceil(totalCards / BATCH_SIZE)
  console.log(`[Compliance] Total cards: ${totalCards}, batches: ${totalBatches}`)

  // Let modules finish loading
  await page.waitForTimeout(3_000)

  // ── Phase 3: Live-Cold — test each batch ──────────────────────────────
  console.log('[Compliance] Phase 2: Live-Cold — testing card loading behavior')

  for (let batch = 0; batch < totalBatches; batch++) {
    // Clear caches in-page before each batch (init scripts already set from phase 1)
    await page.evaluate(() => {
      // Clear cache-related localStorage entries
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (!key) continue
        if (key.includes('dashboard-cards') || key.startsWith('cache:') || key.includes('kubestellar-stack-cache')) {
          localStorage.removeItem(key)
        }
      }
      // Ensure live mode
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('token', 'test-token')
    })

    sseRequestLog.length = 0

    const manifest = await navigateToBatch(page, batch)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    const cardIds = selected.map((item) => item.cardId)

    // Start the compliance monitor
    await startComplianceMonitor(page, cardIds)

    // Wait for cards to finish loading
    await waitForCardsToLoad(page, cardIds, BATCH_LOAD_TIMEOUT_MS)

    // Stop monitor, collect history
    const coldHistory = await stopComplianceMonitor(page)

    // Check criterion F (cache) once per batch
    const criterionFResult = await checkCriterionF(page)

    // Evaluate criteria a-f per card
    const batchCards: CardComplianceResult[] = []
    for (const item of selected) {
      const history = coldHistory[item.cardId] || []
      const criteria: Record<string, CriterionResult> = {
        a: checkCriterionA(item.cardId, item.cardType, history),
        b: checkCriterionB(item.cardId, item.cardType, history),
        c: checkCriterionC(item.cardId, item.cardType, sseRequestLog),
        d: checkCriterionD(item.cardId, item.cardType, history),
        e: checkCriterionE(item.cardId, item.cardType, history),
        f: criterionFResult,
      }

      batchCards.push({
        cardType: item.cardType,
        cardId: item.cardId,
        criteria,
        overallStatus: deriveOverallStatus(criteria),
      })
    }

    const failCount = batchCards.filter((c) => c.overallStatus === 'fail').length
    console.log(
      `[Compliance] Batch ${batch + 1}/${totalBatches} cold: ${selected.length} cards, ${failCount} failures`
    )

    allBatchResults.push({ batchIndex: batch, cards: batchCards })
  }

  // ── Phase 4: Navigate away ────────────────────────────────────────────
  console.log('[Compliance] Phase 3: Navigate away')
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  // ── Phase 5: Live-Warm return — test cache behavior ───────────────────
  console.log('[Compliance] Phase 4: Live-Warm return — testing cache behavior')

  for (let batch = 0; batch < totalBatches; batch++) {
    // Do NOT re-apply cold mode — we want warm/cached data
    const manifest = await navigateToBatch(page, batch)
    const selected = manifest.selected || []
    if (selected.length === 0) continue

    const cardIds = selected.map((item) => item.cardId)

    // Start monitor for warm return
    await startComplianceMonitor(page, cardIds)

    // Wait shorter — cached data should appear fast
    await page.waitForTimeout(WARM_RETURN_WAIT_MS)

    const warmHistory = await stopComplianceMonitor(page)

    // Evaluate criteria g, h per card and add to existing batch results
    const batchResult = allBatchResults.find((b) => b.batchIndex === batch)
    if (batchResult) {
      for (const card of batchResult.cards) {
        const history = warmHistory[card.cardId] || []
        card.criteria.g = checkCriterionG(card.cardId, card.cardType, history)
        card.criteria.h = checkCriterionH(card.cardId, card.cardType, history)
        card.overallStatus = deriveOverallStatus(card.criteria)
      }
    }

    const warmFails = batchResult
      ? batchResult.cards.filter((c) => c.criteria.g?.status === 'fail' || c.criteria.h?.status === 'fail').length
      : 0
    console.log(
      `[Compliance] Batch ${batch + 1}/${totalBatches} warm: ${selected.length} cards, ${warmFails} warm failures`
    )
  }

  // ── Phase 6: Generate report ──────────────────────────────────────────
  console.log('[Compliance] Phase 5: Generating report')

  const allCards = allBatchResults.flatMap((b) => b.cards)
  const criterionPassRates: Record<string, number> = {}
  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const results = allCards.map((c) => c.criteria[criterion]).filter(Boolean)
    const testable = results.filter((r) => r.status !== 'skip')
    criterionPassRates[criterion] = testable.length > 0
      ? testable.filter((r) => r.status === 'pass').length / testable.length
      : 1
  }

  const report: ComplianceReport = {
    timestamp: new Date().toISOString(),
    totalCards,
    batches: allBatchResults,
    summary: {
      totalCards: allCards.length,
      passCount: allCards.filter((c) => c.overallStatus === 'pass').length,
      failCount: allCards.filter((c) => c.overallStatus === 'fail').length,
      warnCount: allCards.filter((c) => c.overallStatus === 'warn').length,
      skipCount: allCards.filter((c) => c.overallStatus === 'skip').length,
      criterionPassRates,
    },
    gapAnalysis: [],
  }

  // Generate gap analysis
  report.gapAnalysis = generateGapAnalysis(report)

  const outDir = path.resolve(__dirname, '../test-results')
  writeReport(report, outDir)

  console.log(`[Compliance] Report: ${path.join(outDir, 'compliance-report.json')}`)
  console.log(`[Compliance] Summary: ${path.join(outDir, 'compliance-summary.md')}`)
  console.log(`[Compliance] Pass: ${report.summary.passCount}, Fail: ${report.summary.failCount}, Warn: ${report.summary.warnCount}, Skip: ${report.summary.skipCount}`)

  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const rate = criterionPassRates[criterion]
    console.log(`[Compliance] Criterion ${criterion}: ${Math.round(rate * 100)}% pass rate`)
  }

  if (report.gapAnalysis.length > 0) {
    console.log(`[Compliance] Gap analysis: ${report.gapAnalysis.length} improvement opportunities identified`)
    for (const gap of report.gapAnalysis) {
      console.log(`  [${gap.priority.toUpperCase()}] ${gap.area}: ${gap.observation}`)
    }
  }
})

import { test, expect, type Page } from '@playwright/test'
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
import {
  setupAuth,
  setupLiveMocks,
  setMode,
} from '../mocks/liveMocks'

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
const MAX_CARDS_PER_DASHBOARD = 30
// How long to wait for a card to show content before marking as timed out
const CARD_CONTENT_TIMEOUT = 25_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Mock data, setupAuth, setupLiveMocks, setMode imported from ../mocks/liveMocks


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
          if (el.querySelector('[data-card-skeleton="true"]')) continue
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

  // ── Performance threshold assertions ──────────────────────────────────
  const THRESHOLDS: Record<string, number> = {
    demo: 3000,        // demo mode: first card should appear within 3s
    live: 5000,        // live mode: first card within 5s (includes mock API latency)
    'live+cache': 2000 // cached mode: first card within 2s
  }

  for (const [mode, threshold] of Object.entries(THRESHOLDS)) {
    const dashboardsForMode = perfReport.dashboards.filter(
      (d) => d.mode === mode && d.cards.length > 0 && d.firstCardVisibleMs > 0
    )
    if (dashboardsForMode.length === 0) continue

    const avgFirstCard = Math.round(
      dashboardsForMode.reduce((s, d) => s + d.firstCardVisibleMs, 0) / dashboardsForMode.length
    )
    console.log(`[Perf] ${mode} avg first-card: ${avgFirstCard}ms (threshold: ${threshold}ms)`)
    expect(
      avgFirstCard,
      `${mode} mode avg first-card time ${avgFirstCard}ms exceeds ${threshold}ms threshold`
    ).toBeLessThan(threshold)
  }

  // ── Baseline regression comparison ────────────────────────────────────
  const baselinePath = path.resolve(__dirname, 'baseline/perf-baseline.json')
  if (fs.existsSync(baselinePath)) {
    console.log('[Perf] Comparing against baseline...')
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as PerfReport

    const REGRESSION_THRESHOLD_PCT = 20 // warn if >20% slower
    let regressionCount = 0

    for (const current of perfReport.dashboards) {
      if (current.cards.length === 0 || current.firstCardVisibleMs <= 0) continue
      const base = baseline.dashboards.find(
        (b) => b.dashboardId === current.dashboardId && b.mode === current.mode
      )
      if (!base || base.firstCardVisibleMs <= 0) continue

      const pctChange = ((current.firstCardVisibleMs - base.firstCardVisibleMs) / base.firstCardVisibleMs) * 100
      if (pctChange > REGRESSION_THRESHOLD_PCT) {
        regressionCount++
        console.log(
          `[Perf] REGRESSION: ${current.dashboardName} (${current.mode}): ${base.firstCardVisibleMs}ms → ${current.firstCardVisibleMs}ms (+${Math.round(pctChange)}%)`
        )
      }
    }

    if (regressionCount > 0) {
      console.log(`[Perf] ${regressionCount} dashboard(s) regressed >20% vs baseline`)
    } else {
      console.log('[Perf] No regressions detected vs baseline')
    }

    // Fail if more than 5 dashboards regressed
    expect(
      regressionCount,
      `${regressionCount} dashboards regressed >20% vs baseline (max 5 allowed)`
    ).toBeLessThanOrEqual(5)
  } else {
    console.log('[Perf] No baseline found — saving current run as baseline')
    const baselineDir = path.resolve(__dirname, 'baseline')
    if (!fs.existsSync(baselineDir)) fs.mkdirSync(baselineDir, { recursive: true })
    fs.writeFileSync(baselinePath, JSON.stringify(perfReport, null, 2))
  }
})

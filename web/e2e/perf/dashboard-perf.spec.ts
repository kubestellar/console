import { test, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import {
  setupNetworkInterceptor,
  waitForCardContent,
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

/** Mock all MCP API endpoints with realistic-ish latency */
async function setupLiveMocks(page: Page) {
  await page.route('**/api/mcp/**', async (route) => {
    // Simulate 200-700ms backend latency for live mode
    const delay = 200 + Math.random() * 500
    await new Promise((r) => setTimeout(r, delay))
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clusters: [],
        health: [],
        pods: [],
        issues: [],
        events: [],
        deployments: [],
        services: [],
        nodes: [],
        releases: [],
        source: 'mock',
      }),
    })
  })
}

/** Configure localStorage for demo or live mode before navigation */
async function setMode(page: Page, mode: 'demo' | 'live') {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ mode }) => {
      localStorage.setItem('token', mode === 'demo' ? 'demo-token' : 'test-token')
      localStorage.setItem('kc-demo-mode', String(mode === 'demo'))
      localStorage.setItem('demo-user-onboarded', 'true')
      localStorage.setItem('kubestellar-console-tour-completed', 'true')
      // Clear any stored dashboard card layouts from previous runs
      // to ensure we test the default config, not stale persisted layouts
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.endsWith('-dashboard-cards')) keysToRemove.push(key)
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    },
    { mode }
  )
}

/**
 * Navigate to a dashboard and measure every card on it.
 */
async function measureDashboard(
  page: Page,
  dashboard: (typeof DASHBOARDS)[0],
  mode: 'demo' | 'live'
): Promise<DashboardMetric> {
  const networkTimings = setupNetworkInterceptor(page)

  const navStart = Date.now()
  await page.goto(dashboard.route, { waitUntil: 'domcontentloaded' })

  // Wait for cards to render (up to 3s for chunks to load)
  await page.waitForTimeout(500)
  // Try waiting for at least one card, with a fallback
  try {
    await page.waitForSelector('[data-card-type]', { timeout: 3000 })
  } catch {
    // No cards found — log page state for debugging
    const debugState = await page.evaluate(() => {
      const body = document.body
      const allDataAttrs = body.querySelectorAll('[data-card-type]')
      const h1 = body.querySelector('h1')?.textContent || 'none'
      const dialogs = body.querySelectorAll('[role="dialog"]')
      const tourPrompt = body.querySelector('[data-testid="tour-prompt"]')
      return {
        cardTypeCount: allDataAttrs.length,
        h1,
        dialogCount: dialogs.length,
        hasTourPrompt: !!tourPrompt,
        bodyText: (body.textContent || '').slice(0, 300),
      }
    })
    console.log(`  NO CARDS on ${dashboard.name}: ${JSON.stringify(debugState)}`)
  }

  // Find all card containers
  const cardElements = await page.$$('[data-card-type]')
  const cardCount = Math.min(cardElements.length, MAX_CARDS_PER_DASHBOARD)

  const cardMetrics: CardMetric[] = []
  let firstCardTime = Infinity
  let lastCardTime = 0

  for (let i = 0; i < cardCount; i++) {
    const el = cardElements[i]
    const cardType = (await el.getAttribute('data-card-type')) || `unknown-${i}`
    const cardId = (await el.getAttribute('data-card-id')) || `card-${i}`
    const isDemoCard = (await el.$('[data-testid="demo-badge"]')) !== null

    const contentStart = Date.now()
    const { skeletonDuration, timedOut } = await waitForCardContent(
      page,
      `[data-card-id="${cardId}"]`,
      CARD_CONTENT_TIMEOUT
    )

    const timeToFirstContent = Date.now() - navStart

    // Debug: log why a card timed out
    if (timedOut) {
      const debugInfo = await page.evaluate((selector: string) => {
        const card = document.querySelector(selector)
        if (!card) return { found: false }
        const isLoading = card.getAttribute('data-loading')
        const pulseEls = card.querySelectorAll('.animate-pulse')
        const pulseInfo: { tag: string; classes: string; height: number; width: number }[] = []
        for (const el of pulseEls) {
          const rect = el.getBoundingClientRect()
          pulseInfo.push({ tag: el.tagName, classes: el.className, height: rect.height, width: rect.width })
        }
        const text = (card.textContent || '').trim()
        // Check for hidden content div (CardWrapper hides children when skeleton shows)
        const hiddenDiv = card.querySelector('.hidden')
        const contentsDiv = card.querySelector('.contents')
        // Check if card has Suspense fallback (no real content yet)
        const childContent = hiddenDiv || contentsDiv
        const childText = childContent ? (childContent.textContent || '').trim().slice(0, 200) : 'N/A'
        return { found: true, isLoading, pulseCount: pulseEls.length, pulseInfo, textLength: text.length, textSnippet: text.slice(0, 200), hasHiddenDiv: !!hiddenDiv, hasContentsDiv: !!contentsDiv, childText }
      }, `[data-card-id="${cardId}"]`)
      console.log(`  TIMEOUT DEBUG [${cardType}/${cardId}]:`, JSON.stringify(debugInfo, null, 2))
    }

    if (!timedOut) {
      firstCardTime = Math.min(firstCardTime, timeToFirstContent)
      lastCardTime = Math.max(lastCardTime, timeToFirstContent)
    }

    cardMetrics.push({
      cardType,
      cardId,
      isDemoDataCard: isDemoCard || mode === 'demo',
      apiTimeToFirstByte: null, // Populated below
      apiTotalTime: null,
      skeletonDuration,
      timeToFirstContent,
      timedOut,
    })
  }

  // Correlate network timings — assign the first matching request timing to cards
  // This is a rough heuristic since multiple cards may share the same API call
  const networkEntries = [...networkTimings.values()]
  if (networkEntries.length > 0) {
    const avgTtfb = Math.round(
      networkEntries.reduce((s, t) => s + t.ttfb, 0) / networkEntries.length
    )
    const avgTotal = Math.round(
      networkEntries.reduce((s, t) => s + t.totalTime, 0) / networkEntries.length
    )
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
// Test generation
// ---------------------------------------------------------------------------

for (const dashboard of DASHBOARDS) {
  for (const mode of ['demo', 'live'] as const) {
    test(`${dashboard.name} (${mode}) — card loading performance`, async ({ page }) => {
      await setupAuth(page)
      if (mode === 'live') await setupLiveMocks(page)
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

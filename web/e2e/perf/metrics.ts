import type { Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequestTiming {
  url: string
  startTime: number
  ttfb: number
  totalTime: number
}

export interface CardMetric {
  cardType: string
  cardId: string
  isDemoDataCard: boolean
  /** ms from first API request to first response byte (null if no matching request) */
  apiTimeToFirstByte: number | null
  /** ms for full API response (null if no matching request) */
  apiTotalTime: number | null
  /** ms the skeleton was visible before content appeared */
  skeletonDuration: number
  /** ms from navigation start to first visible content in this card */
  timeToFirstContent: number
  /** -1 means timed out waiting for content */
  timedOut: boolean
}

export interface DashboardMetric {
  dashboardId: string
  dashboardName: string
  route: string
  mode: 'demo' | 'live' | 'live+cache'
  navigationStartMs: number
  /** ms from nav to first card showing content */
  firstCardVisibleMs: number
  /** ms from nav to last card showing content */
  lastCardVisibleMs: number
  totalApiRequests: number
  cards: CardMetric[]
}

export interface PerfReport {
  timestamp: string
  dashboards: DashboardMetric[]
}

// ---------------------------------------------------------------------------
// Network interception
// ---------------------------------------------------------------------------

/**
 * Intercept all /api/mcp/* and /api/workloads/* network requests and record timing.
 * Returns a Map<url, RequestTiming>.
 */
export function setupNetworkInterceptor(page: Page): Map<string, RequestTiming> {
  const timings = new Map<string, RequestTiming>()

  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/api/mcp/') || url.includes('/api/workloads')) {
      timings.set(url, { url, startTime: Date.now(), ttfb: 0, totalTime: 0 })
    }
  })

  page.on('response', (response) => {
    const timing = timings.get(response.url())
    if (timing && timing.ttfb === 0) {
      timing.ttfb = Date.now() - timing.startTime
    }
  })

  page.on('requestfinished', (request) => {
    const timing = timings.get(request.url())
    if (timing) {
      timing.totalTime = Date.now() - timing.startTime
    }
  })

  return timings
}

// ---------------------------------------------------------------------------
// Card content detection
// ---------------------------------------------------------------------------

/**
 * Wait until a card transitions from skeleton/loading to real content.
 *
 * Detection strategy:
 * 1. Card has `data-loading="false"` (set by CardWrapper)
 * 2. No `.animate-pulse` descendants (skeleton shimmer)
 * 3. Meaningful textContent (> 10 chars — enough for a label + number)
 */
export async function waitForCardContent(
  page: Page,
  cardSelector: string,
  timeout = 25_000
): Promise<{ skeletonDuration: number; timedOut: boolean }> {
  const startTime = Date.now()

  try {
    await page.waitForFunction(
      (selector: string) => {
        const card = document.querySelector(selector)
        if (!card) return false
        const isLoading = card.getAttribute('data-loading') === 'true'
        // Check for skeleton blocks — large animate-pulse divs (>40px tall)
        // that are layout placeholders. Small animate-pulse elements (icons,
        // status dots) are legitimate content and should not count as skeletons.
        const pulseEls = card.querySelectorAll('.animate-pulse')
        let hasSkeleton = false
        for (const el of pulseEls) {
          const rect = el.getBoundingClientRect()
          if (rect.height > 40) { hasSkeleton = true; break }
        }
        const text = card.textContent || ''
        return !isLoading && !hasSkeleton && text.trim().length > 10
      },
      cardSelector,
      { timeout }
    )
    return { skeletonDuration: Date.now() - startTime, timedOut: false }
  } catch {
    return { skeletonDuration: Date.now() - startTime, timedOut: true }
  }
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

export function summarizeReport(report: PerfReport): string {
  const lines: string[] = [
    '',
    '=== Performance Report Summary ===',
    '',
    `${'Dashboard'.padEnd(22)} ${'Mode'.padEnd(6)} ${'Cards'.padEnd(6)} ${'First(ms)'.padEnd(10)} ${'Last(ms)'.padEnd(10)} ${'AvgCard(ms)'.padEnd(12)} ${'API Reqs'.padEnd(8)}`,
    '-'.repeat(80),
  ]

  for (const d of report.dashboards) {
    const validCards = d.cards.filter((c) => !c.timedOut)
    const avgRender =
      validCards.length > 0
        ? Math.round(
            validCards.reduce((sum, c) => sum + c.timeToFirstContent, 0) / validCards.length
          )
        : -1

    lines.push(
      `${d.dashboardName.padEnd(22)} ${d.mode.padEnd(6)} ${String(d.cards.length).padEnd(6)} ${String(d.firstCardVisibleMs).padEnd(10)} ${String(d.lastCardVisibleMs).padEnd(10)} ${String(avgRender).padEnd(12)} ${String(d.totalApiRequests).padEnd(8)}`
    )
  }

  // Per-mode comparison
  const modes = ['demo', 'live', 'live+cache'] as const
  lines.push('')
  for (const m of modes) {
    const cards = report.dashboards
      .filter((d) => d.mode === m)
      .flatMap((d) => d.cards)
      .filter((c) => !c.timedOut)
    if (cards.length === 0) continue
    const avg = Math.round(cards.reduce((s, c) => s + c.timeToFirstContent, 0) / cards.length)
    const label = m === 'live+cache' ? 'Live+cache' : m.charAt(0).toUpperCase() + m.slice(1)
    lines.push(`${label} avg card load: ${avg}ms (${cards.length} cards)`)
  }
  lines.push('')

  return lines.join('\n')
}

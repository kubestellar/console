/**
 * IssueActivityChart data layer — constants, types, demo data generator, and
 * GitHub fetch helpers used by the IssueActivityChart card.
 */
import { MS_PER_DAY } from '../../lib/constants/time'

// ── Constants ───────────────────────────────────────────────────────────────

/** Default lookback in days */
export const DEFAULT_LOOKBACK_DAYS = 90
/** Maximum items per page from GitHub API */
const GITHUB_PER_PAGE = 100
/**
 * Maximum pages to paginate through for each query (#8303). Raised from 5
 * so the 90-day window actually fits for active repos. With GitHub's
 * `sort=updated&direction=desc` and only 500 items, an active repo (like
 * kubestellar/console) could blow through the whole page budget in a
 * few weeks of recent updates and report empty older days. The loop
 * below also short-circuits once items fall before the window, so this
 * cap only matters as a safety bound.
 */
const MAX_PAGES = 30
/** Default repo to display if none configured */
export const DEFAULT_REPO = 'kubestellar/console'
/** Available lookback options in days */
export const LOOKBACK_OPTIONS = [
  { value: 30, label: '30d' },
  { value: 60, label: '60d' },
  { value: 90, label: '90d' },
  { value: 180, label: '180d' },
] as const

// ── Types ───────────────────────────────────────────────────────────────────

export interface DailyStats {
  date: string // YYYY-MM-DD
  opened: number
  closed: number
  prsMerged: number
}

export interface IssueActivityConfig {
  repo?: string
  days?: number
}

// ── Date helpers ────────────────────────────────────────────────────────────

/** Format a Date to YYYY-MM-DD */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Generate an array of YYYY-MM-DD strings from startDate to endDate inclusive */
function generateDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = []
  const current = new Date(startDate)
  current.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  while (current <= end) {
    dates.push(toDateString(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

// ── Demo data generator ─────────────────────────────────────────────────────

export function generateDemoData(days: number): DailyStats[] {
  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - days * MS_PER_DAY)
  const dateRange = generateDateRange(startDate, endDate)

  return dateRange.map(date => {
    // Generate plausible-looking activity patterns
    const dayOfWeek = new Date(date).getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const baseOpened = isWeekend ? 1 : 3
    const baseClosed = isWeekend ? 0 : 2
    const basePRs = isWeekend ? 0 : 2

    return {
      date,
      opened: Math.max(0, baseOpened + Math.floor(Math.random() * 4) - 1),
      closed: Math.max(0, baseClosed + Math.floor(Math.random() * 4) - 1),
      prsMerged: Math.max(0, basePRs + Math.floor(Math.random() * 3) - 1),
    }
  })
}

// ── Data fetching ───────────────────────────────────────────────────────────

/**
 * Paginate GitHub list results sorted by `updated_at` descending, stopping
 * once the oldest item on the current page is older than `stopBefore` —
 * further pages can't contribute anything to the chart window (#8303).
 * Without this bound, active repos blew through MAX_PAGES on "recently
 * updated" items that all landed on the newest few days, leaving older
 * days in the window showing zero activity.
 */
async function fetchAllPages(
  url: string,
  stopBefore?: Date,
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const allItems: Record<string, unknown>[] = []
  const stopMs = stopBefore?.getTime()
  let page = 1
  while (page <= MAX_PAGES) {
    const separator = url.includes('?') ? '&' : '?'
    const response = await fetch(
      `${url}${separator}per_page=${GITHUB_PER_PAGE}&page=${page}`,
      { signal }
    )
    // Throw on non-2xx (MSW catch-all returns 503 in demo mode) AND on
    // non-JSON (SPA catch-all returns HTML on Netlify). Both should trigger
    // the demo data fallback instead of silently returning empty arrays.
    if (!response.ok) {
      throw new Error(`GitHub proxy returned ${response.status}`)
    }
    const ct = response.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      throw new Error('GitHub proxy not available — showing demo data')
    }
    const data = await response.json().catch(() => null)
    if (!data || !Array.isArray(data) || data.length === 0) break
    allItems.push(...data)
    if (data.length < GITHUB_PER_PAGE) break
    if (stopMs !== undefined) {
      const last = data[data.length - 1] as Record<string, unknown>
      const lastUpdated = last.updated_at
      if (typeof lastUpdated === 'string' && new Date(lastUpdated).getTime() < stopMs) break
    }
    page++
  }
  return allItems
}

/**
 * Fetch issue stats incrementally — shows partial data as each API call
 * completes instead of waiting for everything to finish. The `onPartial`
 * callback is called after issues are fetched (before PRs), so the chart
 * renders immediately with opened/closed counts while PR data loads.
 */
export async function fetchIssueStats(
  repo: string,
  days: number,
  signal?: AbortSignal,
  onPartial?: (stats: DailyStats[]) => void,
): Promise<DailyStats[]> {
  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - days * MS_PER_DAY)
  const sinceISO = startDate.toISOString()

  // Fetch issues (state=all) updated since startDate
  // GitHub issues API includes PRs, so we filter by pull_request absence
  const issues = await fetchAllPages(
    `/api/github/repos/${repo}/issues?state=all&since=${sinceISO}&sort=updated&direction=desc`,
    startDate,
    signal,
  )

  // Build partial stats from issues only — show chart immediately
  const dateRange = generateDateRange(startDate, endDate)
  const partialMap = new Map<string, DailyStats>()
  for (const date of dateRange) {
    partialMap.set(date, { date, opened: 0, closed: 0, prsMerged: 0 })
  }
  for (const issue of issues) {
    if ((issue as Record<string, unknown>).pull_request) continue
    const createdDate = toDateString(new Date(issue.created_at as string))
    const entry = partialMap.get(createdDate)
    if (entry) entry.opened++
    if (issue.state === 'closed' && issue.closed_at) {
      const closedDate = toDateString(new Date(issue.closed_at as string))
      const closedEntry = partialMap.get(closedDate)
      if (closedEntry) closedEntry.closed++
    }
  }
  if (onPartial && !signal?.aborted) {
    onPartial(dateRange.map(d => partialMap.get(d)!).filter(Boolean))
  }

  // Fetch merged PRs (closed PRs that have merged_at). The pulls endpoint
  // doesn't support `since=`, so we rely on the fetchAllPages stop bound
  // to end pagination once we see PRs updated before the window (#8303).
  const closedPRs = await fetchAllPages(
    `/api/github/repos/${repo}/pulls?state=closed&sort=updated&direction=desc`,
    startDate,
    signal,
  )

  // Reuse the partial map (already has issues data) — just add PR merges
  const statsMap = partialMap

  // Count PRs merged per day
  for (const pr of closedPRs) {
    if (!pr.merged_at) continue
    const mergedDate = toDateString(new Date(pr.merged_at as string))
    const entry = statsMap.get(mergedDate)
    if (entry) entry.prsMerged++
  }

  return dateRange.map(d => statsMap.get(d)!).filter(Boolean)
}

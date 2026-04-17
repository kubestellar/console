/**
 * IssueActivityChart — Daily Issues & PRs chart card
 *
 * Shows a grouped bar chart of issues opened vs closed and PRs merged
 * per day over a configurable lookback period (default: 90 days).
 *
 * Data source: GitHub REST API via the backend proxy at /api/github/*.
 * Falls back to demo data when in demo mode.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { Calendar, RefreshCw, GitPullRequest } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../ui/Skeleton'
import { usePipelineFilter } from './pipelines/PipelineFilterContext'
import { RepoSubtitle } from './pipelines/RepoSubtitle'
import { Button } from '../ui/Button'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useCardLoadingState } from './CardDataContext'
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_TEXT_COLOR,
  CHART_TOOLTIP_LABEL_COLOR,
} from '../../lib/constants'

// ── Constants ───────────────────────────────────────────────────────────────

/** Default lookback in days */
const DEFAULT_LOOKBACK_DAYS = 90
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
/** Cache TTL in milliseconds (1 hour) */
const CACHE_TTL_MS = 60 * 60 * 1000
/** LocalStorage cache key prefix */
const CACHE_KEY_PREFIX = 'issue_activity_chart_cache_'
/** Milliseconds in one day */
const MS_PER_DAY = 86_400_000
/** Bar chart color for issues opened */
const COLOR_OPENED = '#4472C4'
/** Bar chart color for issues closed */
const COLOR_CLOSED = '#70AD47'
/** Line color for PRs merged */
const COLOR_PR_MERGED = '#ED7D31'
/** ECharts bar border radius for top corners */
const BAR_BORDER_RADIUS: [number, number, number, number] = [3, 3, 0, 0]
/** Chart minimum height in pixels */
const CHART_HEIGHT_PX = 320
/** Default repo to display if none configured */
const DEFAULT_REPO = 'kubestellar/console'
/** Available lookback options in days */
const LOOKBACK_OPTIONS = [
  { value: 30, label: '30d' },
  { value: 60, label: '60d' },
  { value: 90, label: '90d' },
  { value: 180, label: '180d' },
] as const

// ── Types ───────────────────────────────────────────────────────────────────

interface DailyStats {
  date: string // YYYY-MM-DD
  opened: number
  closed: number
  prsMerged: number
}

interface IssueActivityConfig {
  repo?: string
  days?: number
}

interface CachedIssueData {
  timestamp: number
  stats: DailyStats[]
  repo: string
  days: number
}

// ── Cache helpers ───────────────────────────────────────────────────────────

function getCacheKey(repo: string, days: number): string {
  return `${CACHE_KEY_PREFIX}${repo.replace('/', '_')}_${days}`
}

function getCachedStats(repo: string, days: number): DailyStats[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(getCacheKey(repo, days))
    if (!raw) return null
    const cached: CachedIssueData = JSON.parse(raw)
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null
    return cached.stats
  } catch {
    return null
  }
}

function setCachedStats(repo: string, days: number, stats: DailyStats[]): void {
  try {
    const data: CachedIssueData = { timestamp: Date.now(), stats, repo, days }
    localStorage.setItem(getCacheKey(repo, days), JSON.stringify(data))
  } catch {
    // Storage might be full — silently ignore
  }
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

function generateDemoData(days: number): DailyStats[] {
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

async function fetchIssueStats(
  repo: string,
  days: number,
  signal?: AbortSignal,
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

  // Fetch merged PRs (closed PRs that have merged_at). The pulls endpoint
  // doesn't support `since=`, so we rely on the fetchAllPages stop bound
  // to end pagination once we see PRs updated before the window (#8303).
  const closedPRs = await fetchAllPages(
    `/api/github/repos/${repo}/pulls?state=closed&sort=updated&direction=desc`,
    startDate,
    signal,
  )

  // Build a map of date -> stats
  const dateRange = generateDateRange(startDate, endDate)
  const statsMap = new Map<string, DailyStats>()
  for (const date of dateRange) {
    statsMap.set(date, { date, opened: 0, closed: 0, prsMerged: 0 })
  }

  // Count issues opened and closed per day
  for (const issue of issues) {
    // Skip pull requests included in issues endpoint
    if ((issue as Record<string, unknown>).pull_request) continue

    const createdDate = toDateString(new Date(issue.created_at as string))
    const entry = statsMap.get(createdDate)
    if (entry) entry.opened++

    if (issue.state === 'closed' && issue.closed_at) {
      const closedDate = toDateString(new Date(issue.closed_at as string))
      const closedEntry = statsMap.get(closedDate)
      if (closedEntry) closedEntry.closed++
    }
  }

  // Count PRs merged per day
  for (const pr of closedPRs) {
    if (!pr.merged_at) continue
    const mergedDate = toDateString(new Date(pr.merged_at as string))
    const entry = statsMap.get(mergedDate)
    if (entry) entry.prsMerged++
  }

  return dateRange.map(d => statsMap.get(d)!).filter(Boolean)
}

// ── Component ───────────────────────────────────────────────────────────────

export function IssueActivityChart(props: { config?: IssueActivityConfig }) {
  const { t } = useTranslation('cards')
  const { isDemoMode } = useDemoMode()
  const shared = usePipelineFilter()
  const repo = shared?.repoFilter || props.config?.repo || DEFAULT_REPO
  const initialDays = props.config?.days || DEFAULT_LOOKBACK_DAYS

  const [days, setDays] = useState(initialDays)
  const [stats, setStats] = useState<DailyStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDemoFallback, setIsDemoFallback] = useState(false)

  const hasData = stats.length > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, hasAnyData: hasData, isDemoData: isDemoMode || isDemoFallback })

  const loadData = useCallback(async (lookbackDays: number, signal?: AbortSignal) => {
    // No early demo guard — try live data first (liveInDemoMode pattern).
    // Falls back to demo fixtures in the fetch-error catch path.

    // Check cache
    const cached = getCachedStats(repo, lookbackDays)
    if (cached) {
      setStats(cached)
      setIsLoading(false)
      setError(null)
      setIsDemoFallback(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchIssueStats(repo, lookbackDays, signal)
      if (signal?.aborted) return
      setStats(data)
      setIsDemoFallback(false)
      setCachedStats(repo, lookbackDays, data)
    } catch (err) {
      if (signal?.aborted) return
      const message = err instanceof Error ? err.message : 'Failed to fetch issue data'
      setError(message)
      // Fall back to demo data on error
      setIsDemoFallback(true)
      setStats(generateDemoData(lookbackDays))
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [isDemoMode, repo])

  useEffect(() => {
    const controller = new AbortController()
    loadData(days, controller.signal)
    return () => controller.abort()
  }, [days, loadData])

  // Compute summary stats
  const summary = useMemo(() => {
    const totalOpened = (stats || []).reduce((sum, s) => sum + s.opened, 0)
    const totalClosed = (stats || []).reduce((sum, s) => sum + s.closed, 0)
    const totalPRsMerged = (stats || []).reduce((sum, s) => sum + s.prsMerged, 0)
    return { totalOpened, totalClosed, totalPRsMerged }
  }, [stats])

  // Build ECharts option
  const chartOption = useMemo(() => {
    const dates = (stats || []).map(s => s.date)
    const opened = (stats || []).map(s => s.opened)
    const closed = (stats || []).map(s => s.closed)
    const prsMerged = (stats || []).map(s => s.prsMerged)

    return {
      backgroundColor: 'transparent',
      grid: { left: 50, right: 50, top: 40, bottom: 60, containLabel: false },
      legend: {
        data: [
          t('issueActivityChart.opened', 'Opened'),
          t('issueActivityChart.closed', 'Closed'),
          t('issueActivityChart.prsMerged', 'PRs Merged'),
        ],
        top: 8,
        textStyle: { color: '#aaa', fontSize: 11 },
        itemWidth: 14,
        itemHeight: 10,
      },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
        borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
        textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: 12 },
        formatter: (
          params: Array<{ seriesName: string; value: number; color: string; axisValueLabel: string }>
        ) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const dateLabel = `<span style="color:${CHART_TOOLTIP_LABEL_COLOR};font-weight:600">${params[0].axisValueLabel}</span>`
          const lines = params.map(
            p =>
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${p.seriesName}: <b>${p.value}</b>`
          )
          return `${dateLabel}<br/>${lines.join('<br/>')}`
        },
      },
      xAxis: {
        type: 'category' as const,
        data: dates,
        axisLabel: {
          color: '#888',
          fontSize: 10,
          rotate: 45,
          formatter: (val: string) => {
            // Show abbreviated date: "Mar 15"
            const d = new Date(val + 'T00:00:00')
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          },
          // Show ~15 labels max regardless of date range
          interval: Math.max(0, Math.floor(dates.length / 15) - 1),
        },
        axisLine: { lineStyle: { color: '#333' } },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: t('issueActivityChart.issues', 'Issues'),
          nameTextStyle: { color: '#888', fontSize: 10 },
          axisLabel: { color: '#888', fontSize: 10 },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#333', type: 'dashed' as const } },
          minInterval: 1,
        },
        {
          type: 'value' as const,
          name: t('issueActivityChart.prs', 'PRs'),
          nameTextStyle: { color: '#888', fontSize: 10 },
          axisLabel: { color: '#888', fontSize: 10 },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          minInterval: 1,
        },
      ],
      series: [
        {
          name: t('issueActivityChart.opened', 'Opened'),
          type: 'bar',
          data: opened,
          itemStyle: { color: COLOR_OPENED, borderRadius: BAR_BORDER_RADIUS },
          barMaxWidth: 12,
        },
        {
          name: t('issueActivityChart.closed', 'Closed'),
          type: 'bar',
          data: closed,
          itemStyle: { color: COLOR_CLOSED, borderRadius: BAR_BORDER_RADIUS },
          barMaxWidth: 12,
        },
        {
          name: t('issueActivityChart.prsMerged', 'PRs Merged'),
          type: 'line',
          yAxisIndex: 1,
          data: prsMerged,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: COLOR_PR_MERGED, width: 2 },
          itemStyle: { color: COLOR_PR_MERGED },
          areaStyle: { color: 'rgba(237, 125, 49, 0.08)' },
        },
      ],
      dataZoom: [
        {
          type: 'inside' as const,
          start: 0,
          end: 100,
        },
      ],
    }
  }, [stats, t])

  if (isLoading && stats.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-[320px] w-full" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <RepoSubtitle repo={repo} />
        </div>
        <div className="flex items-center gap-1">
          {LOOKBACK_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              variant={days === opt.value ? 'primary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => {
              // Clear cache and reload
              try { localStorage.removeItem(getCacheKey(repo, days)) } catch { /* ignore */ }
              loadData(days)
            }}
            title={t('issueActivityChart.refresh', 'Refresh')}
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-center">
          <div className="text-lg font-semibold text-blue-400">{summary.totalOpened}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('issueActivityChart.opened', 'Opened')}
          </div>
        </div>
        <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-center">
          <div className="text-lg font-semibold text-green-400">{summary.totalClosed}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('issueActivityChart.closed', 'Closed')}
          </div>
        </div>
        <div className="rounded-md bg-orange-500/10 border border-orange-500/20 px-3 py-2 text-center">
          <div className="text-lg font-semibold text-orange-400">{summary.totalPRsMerged}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">
            <GitPullRequest className="h-3 w-3" />
            {t('issueActivityChart.merged', 'Merged')}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
          {error} — {t('issueActivityChart.showingDemo', 'showing demo data')}
        </div>
      )}

      {/* Chart */}
      <div className="w-full overflow-hidden" style={{ minWidth: 0 }}>
        <ReactECharts
          option={chartOption}
          style={{ height: CHART_HEIGHT_PX, width: '100%' }}
          notMerge={true}
          opts={{ renderer: 'svg' }}
        />
      </div>
    </div>
  )
}

export default IssueActivityChart

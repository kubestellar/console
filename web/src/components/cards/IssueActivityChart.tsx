/**
 * IssueActivityChart — Daily Issues & PRs chart card
 *
 * Shows a grouped bar chart of issues opened vs closed and PRs merged
 * per day over a configurable lookback period (default: 90 days).
 *
 * Data source: GitHub REST API via the backend proxy at /api/github/*.
 * Falls back to demo data when in demo mode.
 */

import { memo, useState, useMemo, useCallback, useRef } from 'react'
import { LazyEChart } from '../charts/LazyEChart'
import type ReactEChartsType from 'echarts-for-react'
import { Calendar, RefreshCw, GitPullRequest } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../ui/Skeleton'
import { usePipelineFilter } from './pipelines/PipelineFilterContext'
import { RepoSubtitle } from './pipelines/RepoSubtitle'
import { Button } from '../ui/Button'
import type { EChartsEventHandler } from '../../lib/compat/echarts-for-react/lib/types'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useCardLoadingState } from './CardDataContext'
import { useCache } from '../../lib/cache'
import type { CSSProperties } from 'react'
import {
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_REPO,
  LOOKBACK_OPTIONS,
  generateDemoData,
  fetchIssueStats,
} from './IssueActivityChart.data'
import type { DailyStats, IssueActivityConfig } from './IssueActivityChart.data'
import { useIssueActivityChartOption, ZOOM_RANGE_START, ZOOM_RANGE_END } from './IssueActivityChart.chartOption'

// Inline style constants
const ISSUE_ACTIVITY_CHART_DIV_STYLE_1: CSSProperties = { minWidth: 0 }


// ── Constants ───────────────────────────────────────────────────────────────

/** Chart minimum height in pixels */
const CHART_HEIGHT_PX = 320
const ISSUE_CHART_STYLE = { height: CHART_HEIGHT_PX, width: '100%' } as const
/** Percentage threshold for float comparison when detecting custom zoom */
const ZOOM_EPSILON = 0.01

// ── Component ───────────────────────────────────────────────────────────────

const IssueActivityChart = memo(function IssueActivityChart(props: { config?: IssueActivityConfig }) {
  const { t } = useTranslation('cards')
  const { isDemoMode } = useDemoMode()
  const shared = usePipelineFilter()
  const repo = shared?.repoFilter || props.config?.repo || DEFAULT_REPO
  const initialDays = props.config?.days || DEFAULT_LOOKBACK_DAYS

  const [days, setDays] = useState(initialDays)
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
    start: ZOOM_RANGE_START,
    end: ZOOM_RANGE_END,
  })
  const chartRef = useRef<ReactEChartsType>(null)

  const demoData = useMemo(() => generateDemoData(days), [days])

  // Issue stats via useCache (SWR pattern, persistent cache, demo fallback)
  const {
    data: stats,
    isLoading,
    isRefreshing,
    isDemoFallback,
    error,
    refetch,
  } = useCache<DailyStats[]>({
    key: `issue-activity-chart-${repo}-${days}`,
    initialData: [],
    demoData: demoData,
    persist: true,
    demoWhenEmpty: true,
    isEmpty: (d) => d.length === 0,
    progressiveFetcher: async (onProgress) => {
      return fetchIssueStats(repo, days, undefined, (partial) => {
        onProgress(partial)
      })
    },
    fetcher: async () => fetchIssueStats(repo, days),
  })

  const hasData = (stats || []).length > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isDemoMode || (isDemoFallback && !isLoading) })

  // Compute summary stats from the visible zoom window
  const visibleStats = useMemo(() => {
    const safeStats = stats || []
    const startIdx = Math.floor((visibleRange.start / ZOOM_RANGE_END) * safeStats.length)
    const endIdx = Math.ceil((visibleRange.end / ZOOM_RANGE_END) * safeStats.length)
    const slice = safeStats.slice(startIdx, endIdx)
    const isCustomRange =
      visibleRange.start > ZOOM_RANGE_START + ZOOM_EPSILON ||
      visibleRange.end < ZOOM_RANGE_END - ZOOM_EPSILON
    return {
      totalOpened: slice.reduce((sum, s) => sum + s.opened, 0),
      totalClosed: slice.reduce((sum, s) => sum + s.closed, 0),
      totalPRsMerged: slice.reduce((sum, s) => sum + s.prsMerged, 0),
      isCustomRange,
      startDate: slice.length > 0 ? slice[0].date : '',
      endDate: slice.length > 0 ? slice[slice.length - 1].date : '',
    }
  }, [stats, visibleRange])

  /** Handle dataZoom events from scroll/drag/slider interaction */
  const handleDataZoom = useCallback((params: Record<string, unknown>) => {
    // ECharts emits batch or single events depending on trigger source
    const batch = params.batch as Array<{ start?: number; end?: number }> | undefined
    if (batch && batch.length > 0) {
      setVisibleRange({
        start: batch[0].start ?? ZOOM_RANGE_START,
        end: batch[0].end ?? ZOOM_RANGE_END,
      })
    } else {
      setVisibleRange({
        start: (params.start as number) ?? ZOOM_RANGE_START,
        end: (params.end as number) ?? ZOOM_RANGE_END,
      })
    }
  }, [])

  /** ECharts event map for the onEvents prop */
  const chartEvents = useMemo<Record<string, EChartsEventHandler>>(() => ({
    datazoom: handleDataZoom as EChartsEventHandler,
  }), [handleDataZoom])

  /** Reset zoom to full range and update chart programmatically */
  const resetZoom = useCallback(() => {
    setVisibleRange({ start: ZOOM_RANGE_START, end: ZOOM_RANGE_END })
    const instance = chartRef.current?.getEchartsInstance()
    if (instance) {
      instance.dispatchAction({
        type: 'dataZoom',
        start: ZOOM_RANGE_START,
        end: ZOOM_RANGE_END,
      })
    }
  }, [])

  /** Handle preset button click — reset zoom then switch days */
  const handlePresetClick = useCallback((newDays: number) => {
    resetZoom()
    setDays(newDays)
  }, [resetZoom])

  const chartOption = useIssueActivityChartOption(stats)

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
      {/* Header — @container responsive */}
      <div className="flex flex-wrap @lg:flex-nowrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <RepoSubtitle repo={repo} />
        </div>
        <div className="flex items-center gap-1">
          {LOOKBACK_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              variant={days === opt.value && !visibleStats.isCustomRange ? 'primary' : 'ghost'}
              size="sm"
              className={`h-6 px-2 text-xs ${visibleStats.isCustomRange ? 'opacity-50' : ''}`}
              onClick={() => handlePresetClick(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
          {visibleStats.isCustomRange && (
            <span className="text-xs text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
              Custom
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => {
              refetch()
            }}
            title={t('issueActivityChart.refresh', 'Refresh')}
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary stats — @container responsive grid */}
      {visibleStats.isCustomRange && visibleStats.startDate && visibleStats.endDate && (
        <div className="text-xs text-muted-foreground text-center">
          {t('issueActivityChart.showingRange', 'Showing {{start}} to {{end}}', {
            start: visibleStats.startDate,
            end: visibleStats.endDate,
          })}
        </div>
      )}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-3">
        <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-center">
          <div className="text-lg font-semibold text-blue-400">{visibleStats.totalOpened}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('issueActivityChart.opened', 'Opened')}
          </div>
        </div>
        <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-center">
          <div className="text-lg font-semibold text-green-400">{visibleStats.totalClosed}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('issueActivityChart.closed', 'Closed')}
          </div>
        </div>
        <div className="rounded-md bg-orange-500/10 border border-orange-500/20 px-3 py-2 text-center">
          <div className="text-lg font-semibold text-orange-400">{visibleStats.totalPRsMerged}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">
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
      <div className="w-full overflow-hidden" style={ISSUE_ACTIVITY_CHART_DIV_STYLE_1}>
        <LazyEChart
          ref={chartRef}
          option={chartOption}
          style={ISSUE_CHART_STYLE}
          notMerge={true}
          opts={{ renderer: 'svg' }}
          onEvents={chartEvents}
        />
      </div>
    </div>
  )
})

export default IssueActivityChart
export { IssueActivityChart }

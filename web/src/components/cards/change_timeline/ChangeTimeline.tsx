/**
 * ChangeTimeline — ECharts scatter plot of change events across clusters.
 *
 * X-axis = time, Y-axis = cluster name, dot color = event type.
 * Time range selector: 1 h / 6 h / 24 h / 7 d (default 24 h).
 * Click a dot → drills down to EventsDrillDown for that cluster.
 */
import { useState, useMemo, useCallback } from 'react'
import { LazyEChart } from '../../charts/LazyEChart'
import { Clock, Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCardLoadingState } from '../CardDataContext'
import { useCachedTimeline } from '../../../hooks/useCachedTimeline'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { cn } from '../../../lib/cn'
import { Skeleton } from '../../ui/Skeleton'
import type { TimelineEventType, TimelineEvent } from './demoData'
import { MS_PER_HOUR, MS_PER_DAY } from '../../../lib/constants/time'
import { CHART_TICK_COLOR } from '../../../lib/constants'

const SIX_HOURS_MS = 6 * MS_PER_HOUR
const TWENTY_FOUR_HOURS_MS = MS_PER_DAY
const SEVEN_DAYS_MS = 7 * MS_PER_DAY

interface RangeOption {
  labelKey: 'cards:changeTimeline.range1h' | 'cards:changeTimeline.range6h' | 'cards:changeTimeline.range24h' | 'cards:changeTimeline.range7d'
  ms: number
}

const RANGE_OPTIONS: RangeOption[] = [
  { labelKey: 'cards:changeTimeline.range1h', ms: MS_PER_HOUR },
  { labelKey: 'cards:changeTimeline.range6h', ms: SIX_HOURS_MS },
  { labelKey: 'cards:changeTimeline.range24h', ms: TWENTY_FOUR_HOURS_MS },
  { labelKey: 'cards:changeTimeline.range7d', ms: SEVEN_DAYS_MS },
]

const DEFAULT_RANGE_MS = TWENTY_FOUR_HOURS_MS

/** Colour palette per event type — ECharts requires hex strings. */
const EVENT_TYPE_COLORS: Record<TimelineEventType, string> = {
  Created: '#22c55e',   // green-500   // ai-quality-ignore
  Modified: '#3b82f6',  // blue-500   // ai-quality-ignore
  Deleted: '#ef4444',   // red-500    // ai-quality-ignore
  Scaled: '#a855f7',    // purple-500 // ai-quality-ignore
  Restarted: '#f97316', // orange-500 // ai-quality-ignore
  Failed: '#dc2626',    // red-600    // ai-quality-ignore
  Warning: '#eab308',   // yellow-500 // ai-quality-ignore
}

const DOT_SIZE = 10
const CHART_HEIGHT_PX = 280
const CHART_GRID_LEFT_PX = 100
const CHART_GRID_RIGHT_PX = 24
const CHART_GRID_TOP_PX = 16
const CHART_GRID_BOTTOM_PX = 40
const TOOLTIP_PADDING_PX = 8

const CHART_LABEL_COLOR = '#94a3b8'
const CHART_AXIS_COLOR = '#334155'
const CHART_GRID_COLOR = '#1e293b'
const CHART_LEGEND_COLOR = '#e2e8f0'
const CHART_FALLBACK_COLOR = CHART_TICK_COLOR
const CHART_LABEL_FONT_SIZE = 11
const CHART_LEGEND_FONT_SIZE = 12

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface ChangeTimelineProps {
  config?: {
    cluster?: string
  }
}

export function ChangeTimeline({ config: _config }: ChangeTimelineProps) {
  const { t } = useTranslation(['cards', 'common'])
  const [rangeMs, setRangeMs] = useState(DEFAULT_RANGE_MS)

  // Data hook (must come before useCardLoadingState)
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
  } = useCachedTimeline(rangeMs)

  const hasData = (data || []).length > 0

  // Report to CardWrapper
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
  })

  // Drill-down
  const { drillToEvents } = useDrillDownActions()

  // Derive unique cluster names for Y-axis
  const clusters = useMemo(() => {
    const set = new Set((data || []).map((e) => e.cluster))
    return Array.from(set).sort()
  }, [data])

  // Build ECharts option
  const chartOption = useMemo(() => {
    const events: TimelineEvent[] = data || []

    // Group by event type → one series per type
    const grouped: Record<string, Array<[string, string, TimelineEvent]>> = {}
    for (const evt of events) {
      if (!grouped[evt.eventType]) grouped[evt.eventType] = []
      grouped[evt.eventType].push([evt.timestamp, evt.cluster, evt])
    }

    const series = Object.entries(grouped).map(([type, items]) => ({
      name: type,
      type: 'scatter' as const,
      symbolSize: DOT_SIZE,
      itemStyle: { color: EVENT_TYPE_COLORS[type as TimelineEventType] ?? CHART_FALLBACK_COLOR },
      data: items.map(([ts, cluster, evt]) => ({
        value: [ts, cluster],
        _event: evt,
      })),
    }))

    return {
      tooltip: {
        trigger: 'item' as const,
        padding: TOOLTIP_PADDING_PX,
        backgroundColor: 'rgba(30,30,46,0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: CHART_LEGEND_COLOR, fontSize: CHART_LEGEND_FONT_SIZE },
        formatter: (params: { data?: { _event?: TimelineEvent } }) => {
          const evt: TimelineEvent | undefined = params?.data?._event
          if (!evt) return ''
          return [
            `<strong>${evt.eventType}</strong>`,
            `${evt.resource}`,
            `${evt.namespace} / ${evt.cluster}`,
            `<span style="opacity:0.7">${new Date(evt.timestamp).toLocaleString()}</span>`,
            `<span style="opacity:0.7">${evt.message}</span>`,
          ].join('<br/>')
        },
      },
      grid: {
        left: CHART_GRID_LEFT_PX,
        right: CHART_GRID_RIGHT_PX,
        top: CHART_GRID_TOP_PX,
        bottom: CHART_GRID_BOTTOM_PX,
      },
      xAxis: {
        type: 'time' as const,
        axisLabel: { color: CHART_LABEL_COLOR, fontSize: CHART_LABEL_FONT_SIZE },
        axisLine: { lineStyle: { color: CHART_AXIS_COLOR } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category' as const,
        data: clusters,
        axisLabel: { color: CHART_LABEL_COLOR, fontSize: CHART_LABEL_FONT_SIZE },
        axisLine: { lineStyle: { color: CHART_AXIS_COLOR } },
        splitLine: { lineStyle: { color: CHART_GRID_COLOR } },
      },
      legend: {
        data: Object.keys(grouped),
        textStyle: { color: CHART_LABEL_COLOR, fontSize: CHART_LABEL_FONT_SIZE },
        top: 0,
        right: 0,
        orient: 'horizontal' as const,
        itemWidth: DOT_SIZE,
        itemHeight: DOT_SIZE,
      },
      series,
    }
  }, [data, clusters])

  // Handle click → drill to events
  const handleChartClick = useCallback((params: { data?: { _event?: TimelineEvent } }) => {
    const evt: TimelineEvent | undefined = params?.data?._event
    if (!evt) return
    drillToEvents(evt.cluster, evt.namespace, evt.resource)
  }, [drillToEvents])

  const onEvents = useMemo(() => ({
    click: handleChartClick,
  }), [handleChartClick])

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  if (showSkeleton) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Activity className="w-8 h-8 opacity-50" />
        <p className="text-sm">{t('cards:changeTimeline.empty')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-2">
      {/* Time range selector */}
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.ms}
              onClick={() => setRangeMs(opt.ms)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                rangeMs === opt.ms
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary',
              )}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <LazyEChart
        option={chartOption}
        style={{ height: `${CHART_HEIGHT_PX}px`, width: '100%' }}
        onEvents={onEvents}
        notMerge
      />
    </div>
  )
}

export default ChangeTimeline

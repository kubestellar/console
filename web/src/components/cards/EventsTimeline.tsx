import { memo } from 'react'
import { Activity, AlertTriangle, CheckCircle, Clock, Server } from 'lucide-react'
import { LazyEChart } from '../charts/LazyEChart'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { CHART_HEIGHT_STANDARD } from '../../lib/constants'
import { useCardLoadingState } from './CardDataContext'
import { useEventsTimeline, type TimeRange } from './useEventsTimeline'

const CLUSTER_FILTER_MIN_CLUSTERS = 1
const CHART_CONTAINER_STYLE = { width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD } as const
const CHART_STYLE = { height: CHART_HEIGHT_STANDARD, width: '100%' } as const

function EventsTimelineInternal() {
  const {
    t,
    TIME_RANGE_OPTIONS,
    isRefreshing,
    lastRefresh,
    cardLoadingInput,
    timeRange,
    setTimeRange,
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    availableClustersForFilter,
    filteredClusterCount,
    filteredEvents,
    totalWarnings,
    totalNormal,
    peakEvents,
    chartOption,
  } = useEventsTimeline()

  // Report state to CardWrapper for refresh animation
  const { showSkeleton, showEmptyState } = useCardLoadingState(cardLoadingInput)

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="rounded" width={28} height={28} />
        </div>
        <SkeletonStats className="mb-4" />
        <Skeleton variant="rounded" height={160} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <Activity className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">{t('eventsTimeline.noEvents')}</p>
        <p className="text-xs mt-1">{t('eventsTimeline.noEventsHint')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Controls - single row: Time Range -> Cluster Filter -> Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
            size="sm"
            showLabel={true}
            staleThresholdMinutes={5}
          />
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {filteredClusterCount}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Time Range Filter */}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground cursor-pointer"
              title={t('eventsTimeline.selectTimeRange')}
            >
              {TIME_RANGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Cluster Filter */}
          <CardClusterFilter
            availableClusters={availableClustersForFilter}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={clearClusterFilter}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={CLUSTER_FILTER_MIN_CLUSTERS}
          />

        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3 h-3 text-orange-400" aria-hidden="true" />
            <span className="text-xs text-orange-400">{t('common:common.warnings')}</span>
          </div>
          <span className="text-lg font-bold text-foreground">{totalWarnings}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle className="w-3 h-3 text-green-400" aria-hidden="true" />
            <span className="text-xs text-green-400">{t('common:common.normal')}</span>
          </div>
          <span className="text-lg font-bold text-foreground">{totalNormal}</span>
        </div>
        <div className="p-2 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">{t('eventsTimeline.peak')}</span>
          </div>
          <span className="text-lg font-bold text-foreground">{peakEvents}</span>
        </div>
      </div>

      {/* Stacked Area Chart */}
      <div className="flex-1 min-h-[160px]">
        {filteredEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {t('eventsTimeline.noEventsInRange')}
          </div>
        ) : (
          <div style={CHART_CONTAINER_STYLE} role="img" aria-label={`Events timeline chart showing ${totalWarnings} warnings and ${totalNormal} normal events, peak ${peakEvents} events`}>
            <LazyEChart
              option={chartOption}
              style={CHART_STYLE}
              notMerge={true}
              opts={{ renderer: 'svg' }}
            />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-orange-500/60" />
          <span className="text-muted-foreground">{t('common:common.warnings')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500/60" />
          <span className="text-muted-foreground">{t('common:common.normal')}</span>
        </div>
      </div>
    </div>
  )
}

export const EventsTimeline = memo(function EventsTimeline() {
  return (
    <DynamicCardErrorBoundary cardId="EventsTimeline">
      <EventsTimelineInternal />
    </DynamicCardErrorBoundary>
  )
})

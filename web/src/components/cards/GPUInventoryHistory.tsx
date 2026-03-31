import { useMemo, useState, useRef } from 'react'
import { Cpu, TrendingUp, TrendingDown, Minus, Clock, Server } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useMetricsHistory } from '../../hooks/useMetricsHistory'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import {
  CHART_HEIGHT_STANDARD,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TICK_COLOR,
  CHART_LEGEND_WRAPPER_STYLE,
} from '../../lib/constants'

/** Minimum number of snapshots needed to compute a meaningful trend */
const MIN_TREND_SNAPSHOTS = 3
/** Number of recent snapshots to use for trend calculation (last ~1 hour at 10-min intervals) */
const RECENT_SNAPSHOT_WINDOW = 6
/** Threshold (in GPUs) to consider a trend as changing rather than stable */
const TREND_CHANGE_THRESHOLD = 1
/** Percentage threshold to classify usage level as high */
const HIGH_USAGE_PCT = 80
/** Percentage threshold to classify usage level as medium */
const MEDIUM_USAGE_PCT = 50
/** Number of demo data points to generate */
const DEMO_POINT_COUNT = 24
/** Base total GPUs in demo data */
const DEMO_BASE_TOTAL = 32
/** Base allocated GPUs in demo data */
const DEMO_BASE_ALLOCATED = 18
/** Hours of history to represent in demo data */
const DEMO_HOURS_RANGE = 24
/** Max random fluctuation in demo allocated GPUs */
const DEMO_FLUCTUATION = 4
/** Multiplier for percentage calculation */
const PERCENT_MULTIPLIER = 100

interface GPUHistoryDataPoint {
  time: string
  timestamp: number
  allocated: number
  total: number
  free: number
}

function generateDemoData(): GPUHistoryDataPoint[] {
  const points: GPUHistoryDataPoint[] = []
  const now = Date.now()
  const msPerHour = 60 * 60 * 1000

  for (let i = 0; i < DEMO_POINT_COUNT; i++) {
    const hoursAgo = DEMO_HOURS_RANGE - i
    const ts = now - hoursAgo * msPerHour
    const date = new Date(ts)
    const allocated = DEMO_BASE_ALLOCATED + Math.floor(Math.random() * DEMO_FLUCTUATION)
    points.push({
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: ts,
      allocated,
      total: DEMO_BASE_TOTAL,
      free: DEMO_BASE_TOTAL - allocated,
    })
  }
  return points
}

export function GPUInventoryHistory() {
  const { t } = useTranslation(['cards', 'common'])
  const { history } = useMetricsHistory()
  const {
    nodes: gpuNodes,
    isLoading: hookLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
  } = useCachedGPUNodes()
  const { isDemoMode } = useDemoMode()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  const hasData = gpuNodes.length > 0
  const isLoading = hookLoading && !hasData
  const showDemo = isDemoMode || isDemoFallback

  useCardLoadingState({
    isLoading: hookLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData || history.length > 0,
    isDemoData: showDemo,
    isFailed,
    consecutiveFailures,
  })

  // Get clusters present in GPU nodes for local filter
  const availableClusters = useMemo(() => {
    const clusterNames = new Set((gpuNodes || []).map(n => n.cluster))
    return Array.from(clusterNames).map(name => ({ name, reachable: true }))
  }, [gpuNodes])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  // Transform metrics history into chart data, applying cluster filters
  const chartData = useMemo<GPUHistoryDataPoint[]>(() => {
    if (showDemo || history.length === 0) {
      return generateDemoData()
    }

    return (history || []).map(snapshot => {
      let filteredGpuNodes = snapshot.gpuNodes || []

      // Apply global cluster filter
      if (!isAllClustersSelected && selectedClusters.length > 0) {
        filteredGpuNodes = filteredGpuNodes.filter(g =>
          selectedClusters.some(sc => g.cluster.includes(sc) || sc.includes(g.cluster))
        )
      }

      // Apply local cluster filter
      if (localClusterFilter.length > 0) {
        filteredGpuNodes = filteredGpuNodes.filter(g =>
          localClusterFilter.some(lc => g.cluster.includes(lc) || lc.includes(g.cluster))
        )
      }

      const allocated = filteredGpuNodes.reduce((sum, g) => sum + (g.gpuAllocated || 0), 0)
      const total = filteredGpuNodes.reduce((sum, g) => sum + (g.gpuTotal || 0), 0)
      const date = new Date(snapshot.timestamp)

      return {
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: date.getTime(),
        allocated,
        total,
        free: Math.max(total - allocated, 0),
      }
    })
  }, [history, showDemo, selectedClusters, isAllClustersSelected, localClusterFilter])

  // Current totals from the latest data point
  const currentTotals = useMemo(() => {
    if (chartData.length === 0) return { allocated: 0, total: 0, free: 0 }
    const latest = chartData[chartData.length - 1]
    return {
      allocated: latest.allocated,
      total: latest.total,
      free: latest.free,
    }
  }, [chartData])

  // Trend indicator: compare first half vs second half of recent data
  const trend = useMemo<'up' | 'down' | 'stable'>(() => {
    if (chartData.length < MIN_TREND_SNAPSHOTS) return 'stable'

    const recent = chartData.slice(-RECENT_SNAPSHOT_WINDOW)
    if (recent.length < MIN_TREND_SNAPSHOTS) return 'stable'

    const halfLen = Math.floor(recent.length / 2)
    const firstHalf = recent.slice(0, halfLen)
    const secondHalf = recent.slice(halfLen)

    const avgFirst = firstHalf.reduce((a, b) => a + b.allocated, 0) / firstHalf.length
    const avgSecond = secondHalf.reduce((a, b) => a + b.allocated, 0) / secondHalf.length

    const diff = avgSecond - avgFirst
    if (diff > TREND_CHANGE_THRESHOLD) return 'up'
    if (diff < -TREND_CHANGE_THRESHOLD) return 'down'
    return 'stable'
  }, [chartData])

  const usagePercent = currentTotals.total > 0
    ? Math.round((currentTotals.allocated / currentTotals.total) * PERCENT_MULTIPLIER)
    : 0

  const getUsageColor = () => {
    if (usagePercent >= HIGH_USAGE_PCT) return 'text-red-400'
    if (usagePercent >= MEDIUM_USAGE_PCT) return 'text-yellow-400'
    return 'text-green-400'
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-2">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="rounded" width={28} height={28} />
        </div>
        <SkeletonStats className="mb-4" />
        <Skeleton variant="rounded" height={CHART_HEIGHT_STANDARD} className="flex-1" />
      </div>
    )
  }

  if (gpuNodes.length === 0 && history.length === 0 && !showDemo) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <Cpu className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">{t('cards:gpuInventoryHistory.noData', 'No GPU History')}</p>
          <p className="text-sm text-muted-foreground">{t('cards:gpuInventoryHistory.noDataDescription', 'No historical GPU data available yet. Data is collected every 10 minutes.')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {chartData.length} {t('cards:gpuInventoryHistory.snapshots', 'snapshots')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
          <CardClusterFilter
            availableClusters={availableClusters}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={() => setLocalClusterFilter([])}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={1}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20" title={`${currentTotals.total} total GPUs`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">{t('common:common.total', 'Total')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.total}</span>
        </div>
        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20" title={`${currentTotals.allocated} GPUs allocated`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-purple-400">{t('common:common.used', 'In Use')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.allocated}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20" title={`${currentTotals.free} GPUs available`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">{t('common:common.free', 'Free')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.free}</span>
        </div>
        <div className="p-2 rounded-lg bg-secondary/50 border border-border" title={`${usagePercent}% GPU utilization — trend: ${trend}`}>
          <div className="flex items-center gap-1 mb-1">
            <TrendIcon className={`w-3 h-3 ${getUsageColor()}`} aria-hidden="true" />
            <span className={`text-xs ${getUsageColor()}`}>{t('cards:gpuInventoryHistory.trend', 'Trend')}</span>
          </div>
          <span className={`text-sm font-bold ${getUsageColor()}`}>{usagePercent}%</span>
        </div>
      </div>

      {/* Stacked Area Chart — allocated vs free over time */}
      <div className="flex-1 min-h-[160px]">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {t('cards:gpuInventoryHistory.collecting', 'Collecting data...')}
          </div>
        ) : (
          <div
            style={{ width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD }}
            role="img"
            aria-label={`GPU inventory history chart: ${currentTotals.allocated} of ${currentTotals.total} GPUs in use (${usagePercent}% utilization), trend: ${trend}`}
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT_STANDARD}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gpuHistAllocated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9333ea" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#9333ea" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="gpuHistFree" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: CHART_TICK_COLOR, fontSize: 10 }}
                  axisLine={{ stroke: CHART_AXIS_STROKE }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: CHART_TICK_COLOR, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                  labelStyle={{ color: CHART_TICK_COLOR }}
                  formatter={(value, name) => {
                    const label = name === 'allocated'
                      ? t('cards:gpuInventoryHistory.inUse', 'In Use')
                      : t('cards:gpuInventoryHistory.free', 'Free')
                    return [`${value} GPUs`, label]
                  }}
                />
                <Legend
                  wrapperStyle={CHART_LEGEND_WRAPPER_STYLE}
                  iconType="rect"
                  formatter={(value: string) =>
                    value === 'allocated'
                      ? t('cards:gpuInventoryHistory.inUse', 'In Use')
                      : t('cards:gpuInventoryHistory.free', 'Free')
                  }
                />
                <Area
                  type="stepAfter"
                  dataKey="allocated"
                  stackId="1"
                  stroke="#9333ea"
                  strokeWidth={2}
                  fill="url(#gpuHistAllocated)"
                  name="allocated"
                />
                <Area
                  type="stepAfter"
                  dataKey="free"
                  stackId="1"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#gpuHistFree)"
                  name="free"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Peak/min stats footer */}
      {chartData.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            {t('cards:gpuInventoryHistory.peakUsage', 'Peak')}: {' '}
            <span className="text-foreground font-medium">
              {Math.max(...chartData.map(d => d.allocated))} GPUs
            </span>
          </span>
          <span>
            {t('cards:gpuInventoryHistory.minUsage', 'Min')}: {' '}
            <span className="text-foreground font-medium">
              {Math.min(...chartData.map(d => d.allocated))} GPUs
            </span>
          </span>
          <span>
            {t('cards:gpuInventoryHistory.avgUsage', 'Avg')}: {' '}
            <span className="text-foreground font-medium">
              {Math.round(chartData.reduce((s, d) => s + d.allocated, 0) / chartData.length)} GPUs
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

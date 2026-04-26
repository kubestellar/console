import { useMemo, useState, useEffect, useRef } from 'react'
import { CheckCircle, AlertTriangle, Clock, Server } from 'lucide-react'
import { LazyEChart } from '../charts/LazyEChart'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPodIssues } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useCardLoadingState } from './CardDataContext'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { isDemoMode } from '../../lib/demoMode'
import { useTranslation } from 'react-i18next'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import {
  CHART_HEIGHT_STANDARD,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TICK_COLOR,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE } from '../../lib/constants'
import { useDemoMode } from '../../hooks/useDemoMode'
import { safeGet, safeSet } from '../../lib/safeLocalStorage'
import { ORANGE_500, YELLOW_500, GREEN_500_BRIGHT, hexToRgba } from '../../lib/theme/chartColors'

interface HealthPoint {
  time: string
  healthy: number
  issues: number
  pending: number
}

type TimeRange = '15m' | '1h' | '6h' | '24h'

/** Opacity at the top of area-fill gradients */
const AREA_GRADIENT_TOP_ALPHA = 0.4
/** Opacity at the bottom of area-fill gradients (fully transparent) */
const AREA_GRADIENT_BOTTOM_ALPHA = 0

/** Maximum data points to display per time range selection */
const TIME_RANGE_MAX_POINTS: Record<TimeRange, number> = {
  '15m': 15,
  '1h': 20,
  '6h': 24,
  '24h': 24,
}

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; points: number }[] = [
  { value: '15m', label: '15 min', points: TIME_RANGE_MAX_POINTS['15m'] },
  { value: '1h', label: '1 hour', points: TIME_RANGE_MAX_POINTS['1h'] },
  { value: '6h', label: '6 hours', points: TIME_RANGE_MAX_POINTS['6h'] },
  { value: '24h', label: '24 hours', points: TIME_RANGE_MAX_POINTS['24h'] },
]

export function PodHealthTrend() {
  const { t } = useTranslation(['common', 'cards'])
  const { deduplicatedClusters: clusters, isLoading: clustersLoading, isRefreshing: clustersRefreshing, isFailed: clustersFailed, consecutiveFailures: clustersFailures } = useClusters()
  const { issues, isLoading: issuesLoading, isRefreshing: issuesRefreshing, isDemoFallback, isFailed: issuesFailed, consecutiveFailures: issuesFailures } = useCachedPodIssues()

  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode: isDemoModeActive } = useDemoMode()

  // hasData should be true once loading completes (even with empty data)
  const hasData = clusters.length > 0 || issues.length > 0
  // Report state to CardWrapper for refresh animation
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: (clustersLoading || issuesLoading) && !hasData,
    isRefreshing: clustersRefreshing || issuesRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoModeActive || isDemoFallback,
    isFailed: clustersFailed || issuesFailed,
    consecutiveFailures: Math.max(clustersFailures, issuesFailures) })
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Track historical data points with persistence
  const STORAGE_KEY = 'pod-health-trend-history'
  const MAX_AGE_MS = 30 * MS_PER_MINUTE // 30 minutes - discard older data

  // Load from localStorage on mount
  const loadSavedHistory = (): HealthPoint[] => {
    const saved = safeGet(STORAGE_KEY)
    if (!saved) return []
    try {
      const parsed = JSON.parse(saved) as { data: HealthPoint[]; timestamp: number }
      // Check if data is not too old
      if (Date.now() - parsed.timestamp < MAX_AGE_MS) {
        return parsed.data
      }
    } catch {
      // Ignore parse errors
    }
    return []
  }

  const initialHistory = loadSavedHistory()
  const historyRef = useRef<HealthPoint[]>(initialHistory)
  const [history, setHistory] = useState<HealthPoint[]>(initialHistory)

  // Save to localStorage when history changes
  useEffect(() => {
    if (history.length > 0) {
      try {
        safeSet(STORAGE_KEY, JSON.stringify({
          data: history,
          timestamp: Date.now() }))
      } catch {
        // Ignore stringify errors
      }
    }
  }, [history])

  // Get reachable clusters
  const reachableClusters = clusters.filter(c => c.reachable !== false)

  // Get available clusters for local filter (respects global filter)
  const availableClustersForFilter = (() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  })()

  // Filter by selected clusters AND local filter AND exclude offline/unreachable clusters
  const filteredClusters = (() => {
    let filtered = reachableClusters
    if (!isAllClustersSelected) {
      filtered = filtered.filter(c => selectedClusters.includes(c.name))
    }
    if (localClusterFilter.length > 0) {
      filtered = filtered.filter(c => localClusterFilter.includes(c.name))
    }
    return filtered
  })()

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  // Get names of reachable clusters for issue filtering
  const reachableClusterNames = new Set(clusters.filter(c => c.reachable !== false).map(c => c.name))

  const filteredIssues = (() => {
    // First filter to only issues from reachable clusters
    let result = issues.filter(i => i.cluster && reachableClusterNames.has(i.cluster))
    if (!isAllClustersSelected) {
      result = result.filter(i => i.cluster && selectedClusters.includes(i.cluster))
    }
    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(i => i.cluster && localClusterFilter.includes(i.cluster))
    }
    return result
  })()

  // Calculate current stats
  const currentStats = useMemo(() => {
    const totalPods = filteredClusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
    const issuePods = filteredIssues.length
    const pendingPods = filteredIssues.filter(i => i.status === 'Pending').length
    const healthyPods = Math.max(0, totalPods - issuePods)
    return { healthy: healthyPods, issues: issuePods - pendingPods, pending: pendingPods, total: totalPods }
  }, [filteredClusters, filteredIssues])

  // Check if we have any reachable clusters
  const hasReachableClusters = filteredClusters.some(c => c.reachable !== false && c.nodeCount !== undefined && c.nodeCount > 0)


  // Add data point to history on each update
  useEffect(() => {
    if (clustersLoading || issuesLoading) return
    if (currentStats.total === 0) return

    let cancelled = false

    const now = new Date()
    const newPoint: HealthPoint = {
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      healthy: currentStats.healthy,
      issues: currentStats.issues,
      pending: currentStats.pending }

    // Only add if data changed or 30 seconds passed
    const lastPoint = historyRef.current[historyRef.current.length - 1]
    const shouldAdd = !lastPoint ||
      lastPoint.healthy !== newPoint.healthy ||
      lastPoint.issues !== newPoint.issues ||
      lastPoint.pending !== newPoint.pending

    if (shouldAdd && !cancelled) {
      const MAX_HISTORY_POINTS = 20
      const newHistory = [...historyRef.current, newPoint].slice(-MAX_HISTORY_POINTS)
      historyRef.current = newHistory
      setHistory(newHistory)
    }

    return () => { cancelled = true }
  }, [currentStats, clustersLoading, issuesLoading])

  // Initialize history -- seed multiple points in demo mode for visible chart
  useEffect(() => {
    if (history.length === 0 && currentStats.total > 0) {
      let cancelled = false
      const now = new Date()
      if (isDemoMode()) {
        // Seed 8 historical points so the time-series chart renders immediately
        const DEMO_SEED_POINTS = 8
        const DEMO_INTERVAL_MS = 5 * MS_PER_MINUTE
        const MAX_JITTER = 3
        const points: HealthPoint[] = []
        for (let i = DEMO_SEED_POINTS - 1; i >= 0; i--) {
          const t = new Date(now.getTime() - i * DEMO_INTERVAL_MS)
          const jitter = Math.floor(Math.random() * MAX_JITTER)
          points.push({
            time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            healthy: currentStats.healthy + jitter,
            issues: Math.max(0, currentStats.issues - jitter + Math.floor(Math.random() * 2)),
            pending: Math.max(0, currentStats.pending + (i % 3 === 0 ? 1 : 0)) })
        }
        if (!cancelled) {
          historyRef.current = points
          setHistory(points)
        }
      } else {
        const initialPoint: HealthPoint = {
          time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          healthy: currentStats.healthy,
          issues: currentStats.issues,
          pending: currentStats.pending }
        if (!cancelled) {
          historyRef.current = [initialPoint]
          setHistory([initialPoint])
        }
      }
      return () => { cancelled = true }
    }
  }, [currentStats, history.length])

  // Slice history to the number of points allowed by the selected time range
  const visibleHistory = useMemo(() => {
    const maxPoints = TIME_RANGE_MAX_POINTS[timeRange]
    return history.slice(-maxPoints)
  }, [history, timeRange])

  const chartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 40, right: 5, top: 5, bottom: 25 },
    xAxis: {
      type: 'category' as const,
      data: visibleHistory.map(d => d.time),
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: { lineStyle: { color: CHART_AXIS_STROKE } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_GRID_STROKE, type: 'dashed' as const } },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
      borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
      textStyle: { color: CHART_TICK_COLOR, fontSize: CHART_BODY_FONT_SIZE },
    },
    series: [
      {
        name: 'Issues',
        type: 'line',
        stack: 'total',
        smooth: true,
        data: visibleHistory.map(d => d.issues),
        lineStyle: { color: ORANGE_500, width: 2 },
        itemStyle: { color: ORANGE_500 },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: hexToRgba(ORANGE_500, AREA_GRADIENT_TOP_ALPHA) }, { offset: 1, color: hexToRgba(ORANGE_500, AREA_GRADIENT_BOTTOM_ALPHA) }] },
        },
        showSymbol: false,
      },
      {
        name: 'Pending',
        type: 'line',
        stack: 'total',
        smooth: true,
        data: visibleHistory.map(d => d.pending),
        lineStyle: { color: YELLOW_500, width: 2 },
        itemStyle: { color: YELLOW_500 },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: hexToRgba(YELLOW_500, AREA_GRADIENT_TOP_ALPHA) }, { offset: 1, color: hexToRgba(YELLOW_500, AREA_GRADIENT_BOTTOM_ALPHA) }] },
        },
        showSymbol: false,
      },
      {
        name: 'Healthy',
        type: 'line',
        stack: 'total',
        smooth: true,
        data: visibleHistory.map(d => d.healthy),
        lineStyle: { color: GREEN_500_BRIGHT, width: 2 },
        itemStyle: { color: GREEN_500_BRIGHT },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: hexToRgba(GREEN_500_BRIGHT, AREA_GRADIENT_TOP_ALPHA) }, { offset: 1, color: hexToRgba(GREEN_500_BRIGHT, AREA_GRADIENT_BOTTOM_ALPHA) }] },
        },
        showSymbol: false,
      },
      {
        name: 'Issues (trend)',
        type: 'line',
        data: visibleHistory.map(d => d.issues),
        smooth: true,
        lineStyle: { color: ORANGE_500, width: 2, type: 'dashed' as const },
        itemStyle: { color: ORANGE_500 },
        showSymbol: false,
        silent: true,
      },
    ],
  }), [visibleHistory])

  if (showSkeleton && history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading pod health...</div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No pod data</p>
        <p className="text-xs mt-1">Pod health trends will appear here</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls - single row: Time Range -> Cluster Filter -> Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          {/* Cluster count indicator */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
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
              title={t('cards:podHealthTrend.selectTimeRange')}
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
            onClear={() => setLocalClusterFilter([])}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={1}
          />

        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20" title={hasReachableClusters ? `${currentStats.healthy} healthy pods` : 'No reachable clusters'}>
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">{t('common.healthy')}</span>
          </div>
          <span className="text-lg font-bold text-foreground">{hasReachableClusters ? currentStats.healthy : '-'}</span>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20" title={hasReachableClusters ? `${currentStats.issues} pods with issues` : 'No reachable clusters'}>
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-xs text-red-400">Issues</span>
          </div>
          <span className="text-lg font-bold text-foreground">{hasReachableClusters ? currentStats.issues : '-'}</span>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20" title={hasReachableClusters ? `${currentStats.pending} pending pods` : 'No reachable clusters'}>
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3 h-3 text-yellow-400" />
            <span className="text-xs text-yellow-400">{t('common.pending')}</span>
          </div>
          <span className="text-lg font-bold text-foreground">{hasReachableClusters ? currentStats.pending : '-'}</span>
        </div>
      </div>

      {/* Stacked Area Chart */}
      <div className="flex-1 min-h-[160px]">
        {history.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No pod data available
          </div>
        ) : (
          <div style={{ width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD }}>
            <LazyEChart
              option={chartOption}
              style={{ height: CHART_HEIGHT_STANDARD, width: '100%' }}
              notMerge={true}
              opts={{ renderer: 'svg' }}
            />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500/60" />
          <span className="text-muted-foreground">{t('common.healthy')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-orange-500/60" />
          <span className="text-muted-foreground">Issues</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-yellow-500/60" />
          <span className="text-muted-foreground">{t('common.pending')}</span>
        </div>
      </div>
    </div>
  )
}

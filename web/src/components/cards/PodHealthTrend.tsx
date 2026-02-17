import { useMemo, useState, useEffect, useRef } from 'react'
import { CheckCircle, AlertTriangle, Clock, Server } from 'lucide-react'
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPodIssues } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useCardLoadingState } from './CardDataContext'
import { CardClusterFilter } from '../../lib/cards'
import { isDemoMode } from '../../lib/demoMode'
import { useTranslation } from 'react-i18next'
import {
  CHART_HEIGHT_STANDARD,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_BORDER,
  CHART_TICK_COLOR,
} from '../../lib/constants'

interface HealthPoint {
  time: string
  healthy: number
  issues: number
  pending: number
}

type TimeRange = '15m' | '1h' | '6h' | '24h'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; points: number }[] = [
  { value: '15m', label: '15 min', points: 15 },
  { value: '1h', label: '1 hour', points: 20 },
  { value: '6h', label: '6 hours', points: 24 },
  { value: '24h', label: '24 hours', points: 24 },
]

export function PodHealthTrend() {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()
  const { issues, isLoading: issuesLoading } = useCachedPodIssues()

  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // hasData should be true once loading completes (even with empty data)
  const isLoadingData = clustersLoading || issuesLoading

  // Report state to CardWrapper for refresh animation
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoadingData,
    hasAnyData: clusters.length > 0 || issues.length > 0,
  })
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
  const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes - discard older data

  // Load from localStorage on mount
  const loadSavedHistory = (): HealthPoint[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { data: HealthPoint[]; timestamp: number }
        // Check if data is not too old
        if (Date.now() - parsed.timestamp < MAX_AGE_MS) {
          return parsed.data
        }
      }
    } catch {
      // Ignore parse errors
    }
    return []
  }

  const historyRef = useRef<HealthPoint[]>(loadSavedHistory())
  const [history, setHistory] = useState<HealthPoint[]>(historyRef.current)

  // Save to localStorage when history changes
  useEffect(() => {
    if (history.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          data: history,
          timestamp: Date.now(),
        }))
      } catch {
        // Ignore storage errors (quota exceeded, etc.)
      }
    }
  }, [history])

  // Get reachable clusters
  const reachableClusters = useMemo(() => {
    return clusters.filter(c => c.reachable !== false)
  }, [clusters])

  // Get available clusters for local filter (respects global filter)
  const availableClustersForFilter = useMemo(() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  }, [reachableClusters, selectedClusters, isAllClustersSelected])

  // Filter by selected clusters AND local filter AND exclude offline/unreachable clusters
  const filteredClusters = useMemo(() => {
    let filtered = reachableClusters
    if (!isAllClustersSelected) {
      filtered = filtered.filter(c => selectedClusters.includes(c.name))
    }
    if (localClusterFilter.length > 0) {
      filtered = filtered.filter(c => localClusterFilter.includes(c.name))
    }
    return filtered
  }, [reachableClusters, selectedClusters, isAllClustersSelected, localClusterFilter])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  // Get names of reachable clusters for issue filtering
  const reachableClusterNames = useMemo(() => {
    return new Set(clusters.filter(c => c.reachable !== false).map(c => c.name))
  }, [clusters])

  const filteredIssues = useMemo(() => {
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
  }, [issues, selectedClusters, isAllClustersSelected, reachableClusterNames, localClusterFilter])

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

    const now = new Date()
    const newPoint: HealthPoint = {
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      healthy: currentStats.healthy,
      issues: currentStats.issues,
      pending: currentStats.pending,
    }

    // Only add if data changed or 30 seconds passed
    const lastPoint = historyRef.current[historyRef.current.length - 1]
    const shouldAdd = !lastPoint ||
      lastPoint.healthy !== newPoint.healthy ||
      lastPoint.issues !== newPoint.issues ||
      lastPoint.pending !== newPoint.pending

    if (shouldAdd) {
      const newHistory = [...historyRef.current, newPoint].slice(-20) // Keep last 20 points
      historyRef.current = newHistory
      setHistory(newHistory)
    }
  }, [currentStats, clustersLoading, issuesLoading])

  // Initialize history — seed multiple points in demo mode for visible chart
  useEffect(() => {
    if (history.length === 0 && currentStats.total > 0) {
      const now = new Date()
      if (isDemoMode()) {
        // Seed 8 historical points so the time-series chart renders immediately
        const points: HealthPoint[] = []
        for (let i = 7; i >= 0; i--) {
          const t = new Date(now.getTime() - i * 5 * 60000) // 5-min intervals
          const jitter = Math.floor(Math.random() * 3)
          points.push({
            time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            healthy: currentStats.healthy + jitter,
            issues: Math.max(0, currentStats.issues - jitter + Math.floor(Math.random() * 2)),
            pending: Math.max(0, currentStats.pending + (i % 3 === 0 ? 1 : 0)),
          })
        }
        historyRef.current = points
        setHistory(points)
      } else {
        const initialPoint: HealthPoint = {
          time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          healthy: currentStats.healthy,
          issues: currentStats.issues,
          pending: currentStats.pending,
        }
        historyRef.current = [initialPoint]
        setHistory([initialPoint])
      }
    }
  }, [currentStats, history.length])

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
      {/* Controls - single row: Time Range → Cluster Filter → Refresh */}
      <div className="flex items-center justify-between mb-3">
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
              title="Select time range"
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
      <div className="grid grid-cols-3 gap-2 mb-4">
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
          <ResponsiveContainer width="100%" height={CHART_HEIGHT_STANDARD}>
            <AreaChart data={history} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradientHealthy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradientIssues" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradientPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
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
                contentStyle={{
                  backgroundColor: CHART_TOOLTIP_BG,
                  border: `1px solid ${CHART_TOOLTIP_BORDER}`,
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: CHART_TICK_COLOR }}
              />
              <Area
                type="basis"
                dataKey="issues"
                stackId="1"
                stroke="#f97316"
                strokeWidth={2}
                fill="url(#gradientIssues)"
                name="Issues"
              />
              <Area
                type="basis"
                dataKey="pending"
                stackId="1"
                stroke="#eab308"
                strokeWidth={2}
                fill="url(#gradientPending)"
                name="Pending"
              />
              <Area
                type="basis"
                dataKey="healthy"
                stackId="1"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#gradientHealthy)"
                name="Healthy"
              />
              {/* Overlay line to make issues more visible */}
              <Line
                type="basis"
                dataKey="issues"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                name="Issues (trend)"
                legendType="none"
              />
            </AreaChart>
          </ResponsiveContainer>
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

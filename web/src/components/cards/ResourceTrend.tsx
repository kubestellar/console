import { useState, useMemo, useEffect, useRef, memo } from 'react'
import { TrendingUp, Cpu, MemoryStick, Box, Server, Clock } from 'lucide-react'
import { LazyEChart } from '../charts/LazyEChart'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useCardLoadingState } from './CardDataContext'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'
import {
  MS_PER_MINUTE,
} from '../../lib/constants/time'
import {
  CHART_HEIGHT_STANDARD,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TICK_COLOR,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE,
  CHART_TEXT_MUTED } from '../../lib/constants'
import { useDemoMode } from '../../hooks/useDemoMode'

interface ResourcePoint {
  time: string
  cpuCores: number
  memoryGB: number
  pods: number
  nodes: number
}

type MetricView = 'all' | 'compute' | 'workloads'
type TimeRange = '15m' | '1h' | '6h' | '24h'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; points: number }[] = [
  { value: '15m', label: '15 min', points: 15 },
  { value: '1h', label: '1 hour', points: 20 },
  { value: '6h', label: '6 hours', points: 24 },
  { value: '24h', label: '24 hours', points: 24 },
]

export const ResourceTrend = memo(function ResourceTrend() {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing, isFailed, consecutiveFailures } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode } = useDemoMode()
  const [view, setView] = useState<MetricView>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Report state to CardWrapper for refresh animation
  const hasData = clusters.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode,
    isFailed,
    consecutiveFailures })

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
  const STORAGE_KEY = 'resource-trend-history'
  const MAX_AGE_MS = 30 * MS_PER_MINUTE // 30 minutes - discard older data

  // Load from localStorage on mount
  const loadSavedHistory = (): ResourcePoint[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { data: ResourcePoint[]; timestamp: number }
        if (Date.now() - parsed.timestamp < MAX_AGE_MS) {
          return parsed.data
        }
      }
    } catch {
      // Ignore parse errors
    }
    return []
  }

  const historyRef = useRef<ResourcePoint[]>(loadSavedHistory())
  const [history, setHistory] = useState<ResourcePoint[]>(historyRef.current)

  // Save to localStorage when history changes
  useEffect(() => {
    if (history.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          data: history,
          timestamp: Date.now() }))
      } catch {
        // Ignore storage errors (quota exceeded, etc.)
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

  // Calculate current totals
  const currentTotals = useMemo(() => {
    return {
      cpuCores: filteredClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0),
      memoryGB: filteredClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0),
      pods: filteredClusters.reduce((sum, c) => sum + (c.podCount || 0), 0),
      nodes: filteredClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0) }
  }, [filteredClusters])

  // Check if we have any reachable clusters with real data
  const hasReachableClusters = filteredClusters.some(c => c.reachable !== false && c.nodeCount !== undefined && c.nodeCount > 0)

  // Add data point to history on each update
  useEffect(() => {
    if (isLoading) return
    if (currentTotals.nodes === 0) return

    const now = new Date()
    const newPoint: ResourcePoint = {
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...currentTotals }

    // Only add if data changed
    const lastPoint = historyRef.current[historyRef.current.length - 1]
    const shouldAdd = !lastPoint ||
      lastPoint.cpuCores !== newPoint.cpuCores ||
      lastPoint.memoryGB !== newPoint.memoryGB ||
      lastPoint.pods !== newPoint.pods ||
      lastPoint.nodes !== newPoint.nodes

    if (shouldAdd) {
      const newHistory = [...historyRef.current, newPoint].slice(-20)
      historyRef.current = newHistory
      setHistory(newHistory)
    }
  }, [currentTotals, isLoading])

  // Initialize with a single real data point (no synthetic history)
  useEffect(() => {
    if (history.length === 0 && currentTotals.nodes > 0) {
      const now = new Date()
      const initialPoint: ResourcePoint = {
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cpuCores: currentTotals.cpuCores,
        memoryGB: currentTotals.memoryGB,
        pods: currentTotals.pods,
        nodes: currentTotals.nodes }
      historyRef.current = [initialPoint]
      setHistory([initialPoint])
    }
  }, [currentTotals, history.length])

  // Get visible lines based on view
  // IMPORTANT: this runs unconditionally before any early return so the
  // hook order below (useMemo for chartOption) stays stable across renders.
  // Moving the early return above this block caused React error #310
  // ("Rendered more hooks than during the previous render") when the
  // loading state flipped, because the useMemo below was skipped on the
  // first render and then called on later renders.
  const getLines = () => {
    switch (view) {
      case 'compute':
        return [
          { dataKey: 'cpuCores', color: '#3b82f6', name: 'CPU Cores' },
          { dataKey: 'memoryGB', color: '#22c55e', name: 'Memory (GB)' },
        ]
      case 'workloads':
        return [
          { dataKey: 'pods', color: '#9333ea', name: 'Pods' },
          { dataKey: 'nodes', color: '#f59e0b', name: 'Nodes' },
        ]
      default:
        return [
          { dataKey: 'cpuCores', color: '#3b82f6', name: 'CPU' },
          { dataKey: 'pods', color: '#9333ea', name: 'Pods' },
        ]
    }
  }

  const lines = getLines()

  const chartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 40, right: 5, top: 5, bottom: 40 },
    xAxis: {
      type: 'category' as const,
      data: history.map(d => d.time),
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
    legend: {
      data: lines.map(l => l.name),
      bottom: 0,
      textStyle: { color: CHART_TEXT_MUTED, fontSize: CHART_AXIS_FONT_SIZE },
      icon: 'roundRect',
    },
    series: lines.map((line, idx) => ({
      name: line.name,
      type: 'line',
      data: history.map(d => d[line.dataKey as keyof ResourcePoint]),
      smooth: 0.4,
      showSymbol: false,
      lineStyle: {
        color: line.color,
        width: 2,
        ...(idx === 1 ? { type: 'dashed' as const } : {}),
      },
      itemStyle: { color: line.color },
    })),
  }), [history, lines])

  // Loading gate — runs AFTER all hooks to keep hook order stable (React #310).
  if (isLoading && history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading resources...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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

      {/* View selector */}
      <div className="flex gap-1 mb-3">
        {(['all', 'compute', 'workloads'] as MetricView[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              view === v
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            {v === 'all' ? 'Overview' : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20" title={hasReachableClusters ? `${currentTotals.cpuCores} CPU cores total` : 'No reachable clusters'}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">CPUs</span>
          </div>
          <span className="text-sm font-bold text-foreground">{hasReachableClusters ? currentTotals.cpuCores : '-'}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20" title={hasReachableClusters ? `${currentTotals.memoryGB.toFixed(2)} GB memory total` : 'No reachable clusters'}>
          <div className="flex items-center gap-1 mb-1">
            <MemoryStick className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">Mem</span>
          </div>
          <span className="text-sm font-bold text-foreground">{hasReachableClusters ? (currentTotals.memoryGB >= 1024 ? `${(currentTotals.memoryGB / 1024).toFixed(1)}T` : `${currentTotals.memoryGB.toFixed(0)}G`) : '-'}</span>
        </div>
        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20" title={hasReachableClusters ? `${currentTotals.pods} pods running` : 'No reachable clusters'}>
          <div className="flex items-center gap-1 mb-1">
            <Box className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-purple-400">{t('common.pods')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{hasReachableClusters ? currentTotals.pods : '-'}</span>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20" title={hasReachableClusters ? `${currentTotals.nodes} nodes total` : 'No reachable clusters'}>
          <div className="flex items-center gap-1 mb-1">
            <Server className="w-3 h-3 text-yellow-400" />
            <span className="text-xs text-yellow-400">{t('common.nodes')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{hasReachableClusters ? currentTotals.nodes : '-'}</span>
        </div>
      </div>

      {/* Multi-line Chart */}
      <div className="flex-1 min-h-[160px]">
        {history.length < 2 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
            <TrendingUp className="w-6 h-6 mb-2 opacity-50" aria-hidden="true" />
            <span>{history.length === 0 ? 'No resource data available' : 'Collecting data...'}</span>
            {history.length === 1 && (
              <span className="text-xs mt-1">Chart will appear after next interval</span>
            )}
          </div>
        ) : (
          <div style={{ width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD }} role="img" aria-label={`Resource trend chart showing ${lines.map(l => l.name).join(', ')} over time`}>
            <LazyEChart
              option={chartOption}
              style={{ height: CHART_HEIGHT_STANDARD, width: '100%' }}
              notMerge={true}
              opts={{ renderer: 'svg' }}
            />
          </div>
        )}
      </div>
    </div>
  )
})

import { useState, useMemo, useEffect, useRef } from 'react'
import { TrendingUp, Cpu, MemoryStick, Box, Server, Clock } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useCardLoadingState } from './CardDataContext'
import { CardClusterFilter } from '../../lib/cards'
import { useTranslation } from 'react-i18next'
import {
  CHART_HEIGHT_STANDARD,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_BORDER,
  CHART_TICK_COLOR,
} from '../../lib/constants'

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

export function ResourceTrend() {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, isLoading } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [view, setView] = useState<MetricView>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Report state to CardWrapper for refresh animation
  useCardLoadingState({
    isLoading,
    hasAnyData: clusters.length > 0,
  })

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
  const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes - discard older data

  // Load from localStorage on mount
  const loadSavedHistory = (): ResourcePoint[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { data: ResourcePoint[]; timestamp: number }
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

  const historyRef = useRef<ResourcePoint[]>(loadSavedHistory())
  const [history, setHistory] = useState<ResourcePoint[]>(historyRef.current)

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

  // Calculate current totals
  const currentTotals = useMemo(() => {
    return {
      cpuCores: filteredClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0),
      memoryGB: filteredClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0),
      pods: filteredClusters.reduce((sum, c) => sum + (c.podCount || 0), 0),
      nodes: filteredClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0),
    }
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
      ...currentTotals,
    }

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
        nodes: currentTotals.nodes,
      }
      historyRef.current = [initialPoint]
      setHistory([initialPoint])
    }
  }, [currentTotals, history.length])

  if (isLoading && history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading resources...</div>
      </div>
    )
  }

  // Get visible lines based on view
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
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20" title={hasReachableClusters ? `${currentTotals.cpuCores} CPU cores total` : 'No reachable clusters'}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">CPUs</span>
          </div>
          <span className="text-sm font-bold text-foreground">{hasReachableClusters ? currentTotals.cpuCores : '-'}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20" title={hasReachableClusters ? `${currentTotals.memoryGB.toFixed(0)} GB memory total` : 'No reachable clusters'}>
          <div className="flex items-center gap-1 mb-1">
            <MemoryStick className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">Mem</span>
          </div>
          <span className="text-sm font-bold text-foreground">{hasReachableClusters ? `${currentTotals.memoryGB.toFixed(0)}G` : '-'}</span>
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
            <TrendingUp className="w-6 h-6 mb-2 opacity-50" />
            <span>{history.length === 0 ? 'No resource data available' : 'Collecting data...'}</span>
            {history.length === 1 && (
              <span className="text-xs mt-1">Chart will appear after next interval</span>
            )}
          </div>
        ) : (
          <div style={{ width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD }}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT_STANDARD}>
            <LineChart data={history} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
              <Legend
                wrapperStyle={{ fontSize: '10px' }}
                iconType="line"
              />
              {lines.map((line, idx) => (
                <Line
                  key={line.dataKey}
                  type="natural"
                  dataKey={line.dataKey}
                  stroke={line.color}
                  strokeWidth={2}
                  strokeDasharray={idx === 1 ? "5 5" : undefined}
                  dot={false}
                  name={line.name}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

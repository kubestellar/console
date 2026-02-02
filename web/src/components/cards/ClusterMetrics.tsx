import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { TimeSeriesChart, MultiSeriesChart } from '../charts'
import { useClusters } from '../../hooks/useMCP'
import { getDemoMode } from '../../hooks/useDemoMode'
import { Server, Clock, Filter, ChevronDown, Layers, TrendingUp } from 'lucide-react'
import { useChartFilters } from '../../lib/cards'

type TimeRange = '15m' | '1h' | '6h' | '24h'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; points: number; intervalMs: number }[] = [
  { value: '15m', label: '15 min', points: 15, intervalMs: 60000 },
  { value: '1h', label: '1 hour', points: 20, intervalMs: 180000 },
  { value: '6h', label: '6 hours', points: 24, intervalMs: 900000 },
  { value: '24h', label: '24 hours', points: 24, intervalMs: 3600000 },
]


type MetricType = 'cpu' | 'memory' | 'pods' | 'nodes'
type ChartMode = 'total' | 'per-cluster'

const metricConfig = {
  cpu: { label: 'CPU Cores', color: '#9333ea', unit: '', baseValue: 65, variance: 30 },
  memory: { label: 'Memory', color: '#3b82f6', unit: ' GB', baseValue: 72, variance: 20 },
  pods: { label: 'Pods', color: '#10b981', unit: '', baseValue: 150, variance: 100 },
  nodes: { label: 'Nodes', color: '#f59e0b', unit: '', baseValue: 10, variance: 5 },
}

interface ClusterMetricValues {
  cpu: number
  memory: number
  pods: number
  nodes: number
}

interface MetricPoint {
  time: string
  timestamp: number
  cpu: number
  memory: number
  pods: number
  nodes: number
  // Per-cluster values for comparison mode
  clusters?: Record<string, ClusterMetricValues>
}

const STORAGE_KEY = 'cluster-metrics-history'
const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes TTL

export function ClusterMetrics() {
  const { isLoading } = useClusters()
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('cpu')
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
  const [chartMode, setChartMode] = useState<ChartMode>('total')

  // Use shared chart filters hook for cluster filtering
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters: availableClustersForFilter,
    filteredClusters: clusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    clusterFilterBtnRef,
    dropdownStyle,
  } = useChartFilters({ storageKey: 'cluster-metrics' })

  // Load history from localStorage
  const loadSavedHistory = useCallback((): MetricPoint[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { data: MetricPoint[]; timestamp: number }
        if (Date.now() - parsed.timestamp < MAX_AGE_MS) {
          return parsed.data
        }
      }
    } catch {
      // Ignore parse errors
    }
    return []
  }, [])

  // Generate demo time series data for demo mode
  const generateDemoHistory = useCallback((): MetricPoint[] => {
    const now = Date.now()
    const points: MetricPoint[] = []
    // Generate 20 points over the last hour
    for (let i = 19; i >= 0; i--) {
      const timestamp = now - i * 3 * 60000 // 3 minutes apart
      const variance = Math.sin(i * 0.5) * 0.1 + (Math.random() - 0.5) * 0.05
      points.push({
        time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp,
        cpu: Math.round(656 * (1 + variance)),
        memory: Math.round(3624 * (1 + variance)),
        pods: Math.round(900 * (1 + variance * 0.5)),
        nodes: Math.round(63 * (1 + variance * 0.3)),
      })
    }
    return points
  }, [])

  const historyRef = useRef<MetricPoint[]>(getDemoMode() ? generateDemoHistory() : loadSavedHistory())
  const [history, setHistory] = useState<MetricPoint[]>(historyRef.current)

  // Save history to localStorage when it changes
  useEffect(() => {
    if (history.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          data: history,
          timestamp: Date.now(),
        }))
      } catch {
        // Ignore storage errors
      }
    }
  }, [history])

  // Calculate real current values from cluster data
  const realValues = useMemo(() => {
    const totalCPUs = clusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const totalMemoryGB = clusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
    const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
    const totalNodes = clusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
    return { cpu: totalCPUs, memory: totalMemoryGB, pods: totalPods, nodes: totalNodes }
  }, [clusters])

  // Check if we have real data
  const hasRealData = clusters.some(c => c.cpuCores !== undefined || c.memoryGB !== undefined)

  // Track data points over time - add new point when values change
  useEffect(() => {
    // In demo mode, regenerate demo history if needed
    if (getDemoMode()) {
      if (historyRef.current.length === 0) {
        const demoHistory = generateDemoHistory()
        historyRef.current = demoHistory
        setHistory(demoHistory)
      }
      return
    }

    if (isLoading || !hasRealData) return
    if (realValues.nodes === 0 && realValues.cpu === 0) return

    const now = Date.now()
    // Build per-cluster values for comparison mode
    const clusterValues: Record<string, ClusterMetricValues> = {}
    clusters.forEach(c => {
      clusterValues[c.name] = {
        cpu: c.cpuCores || 0,
        memory: c.memoryGB || 0,
        pods: c.podCount || 0,
        nodes: c.nodeCount || 0,
      }
    })
    const newPoint: MetricPoint = {
      time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: now,
      cpu: realValues.cpu,
      memory: realValues.memory,
      pods: realValues.pods,
      nodes: realValues.nodes,
      clusters: clusterValues,
    }

    // Only add if data changed or at least 30 seconds since last point
    const lastPoint = historyRef.current[historyRef.current.length - 1]
    const shouldAdd = !lastPoint ||
      (now - lastPoint.timestamp > 30000) ||
      lastPoint.cpu !== newPoint.cpu ||
      lastPoint.memory !== newPoint.memory ||
      lastPoint.pods !== newPoint.pods ||
      lastPoint.nodes !== newPoint.nodes

    if (shouldAdd) {
      // Keep last 60 points (about 30 minutes at 30-second intervals)
      const newHistory = [...historyRef.current, newPoint].slice(-60)
      historyRef.current = newHistory
      setHistory(newHistory)
    }
  }, [realValues, isLoading, hasRealData, clusters, generateDemoHistory])

  // Transform history to chart data for selected metric
  const data = useMemo(() => {
    // Filter history based on time range
    const now = Date.now()
    const rangeMs = {
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
    }[timeRange]

    const filteredHistory = history.filter(p => now - p.timestamp <= rangeMs)

    return filteredHistory.map(point => ({
      time: point.time,
      value: point[selectedMetric],
    }))
  }, [history, selectedMetric, timeRange])

  // Generate per-cluster data for comparison mode
  const perClusterData = useMemo(() => {
    if (chartMode !== 'per-cluster') return { data: [], series: [] }

    const now = Date.now()
    const rangeMs = {
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
    }[timeRange]

    const filteredHistory = history.filter(p => now - p.timestamp <= rangeMs && p.clusters)

    // Get all unique cluster names from history
    const clusterNames = new Set<string>()
    filteredHistory.forEach(point => {
      if (point.clusters) {
        Object.keys(point.clusters).forEach(name => clusterNames.add(name))
      }
    })

    // Colors for different clusters
    const clusterColors = [
      '#9333ea', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
      '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899',
    ]

    // Build series config
    const series = Array.from(clusterNames).map((name, i) => ({
      dataKey: name,
      color: clusterColors[i % clusterColors.length],
      name: name.length > 15 ? name.slice(0, 12) + '...' : name,
    }))

    // Build data with all clusters as keys
    const chartData = filteredHistory.map(point => {
      const entry: { time: string; value: number; [key: string]: string | number } = {
        time: point.time,
        value: 0, // Required by DataPoint interface, not used by MultiSeriesChart
      }
      clusterNames.forEach(name => {
        const clusterData = point.clusters?.[name]
        entry[name] = clusterData ? clusterData[selectedMetric] : 0
      })
      return entry
    })

    return { data: chartData, series }
  }, [history, selectedMetric, timeRange, chartMode])

  const config = metricConfig[selectedMetric]
  // Use real current value if available, otherwise use last chart value
  const currentValue = hasRealData ? realValues[selectedMetric] : (data[data.length - 1]?.value || 0)

  return (
    <div className="h-full flex flex-col">
      {/* Header with metric value and selector */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="text-sm font-medium text-foreground">{config.label}</h4>
          <p className="text-2xl font-bold text-foreground">
            {selectedMetric === 'memory' ? realValues.memory.toFixed(1) : Math.round(currentValue)}<span className="text-sm text-muted-foreground">{config.unit}</span>
          </p>
        </div>
        <div className="flex gap-1">
          {(Object.keys(metricConfig) as MetricType[]).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedMetric(key)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                selectedMetric === key
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {metricConfig[key].label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Controls - single row: Cluster count → Time Range → Cluster Filter → Chart Mode → Refresh */}
      <div className="flex items-center gap-2 mb-3">
        {/* Cluster count indicator */}
        {localClusterFilter.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
            <Server className="w-3 h-3" />
            {clusters.length}/{availableClustersForFilter.length}
          </span>
        )}

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
        {availableClustersForFilter.length >= 1 && (
          <div ref={clusterFilterRef} className="relative">
            <button
              ref={clusterFilterBtnRef}
              onClick={() => setShowClusterFilter(!showClusterFilter)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                localClusterFilter.length > 0
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
              title="Filter by cluster"
            >
              <Filter className="w-3 h-3" />
              <ChevronDown className="w-3 h-3" />
            </button>

            {showClusterFilter && dropdownStyle && createPortal(
              <div
                className="fixed w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
                style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
                onMouseDown={e => e.stopPropagation()}
              >
                <div className="p-1">
                  <button
                    onClick={clearClusterFilter}
                    className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                      localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                    }`}
                  >
                    All clusters
                  </button>
                  {availableClustersForFilter.map(cluster => (
                    <button
                      key={cluster.name}
                      onClick={() => toggleClusterFilter(cluster.name)}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      {cluster.name}
                    </button>
                  ))}
                </div>
              </div>,
              document.body
            )}
          </div>
        )}

        {/* Chart Mode Toggle */}
        {clusters.length >= 1 && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setChartMode('total')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                chartMode === 'total'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
              title="Show aggregated total"
            >
              <TrendingUp className="w-3 h-3" />
              Total
            </button>
            <button
              onClick={() => setChartMode('per-cluster')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                chartMode === 'per-cluster'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
              title="Show per-cluster comparison"
            >
              <Layers className="w-3 h-3" />
              Per Cluster
            </button>
          </div>
        )}

      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[160px]">
        {clusters.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No clusters selected
          </div>
        ) : data.length < 2 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
            <Clock className="w-5 h-5" />
            <span>{data.length === 0 ? 'Collecting data...' : 'Waiting for next data point...'}</span>
            <span className="text-xs text-muted-foreground/70">Chart will appear after collecting more data</span>
          </div>
        ) : chartMode === 'per-cluster' && perClusterData.series.length > 0 ? (
          <MultiSeriesChart
            data={perClusterData.data}
            series={perClusterData.series}
            height={160}
            showGrid
          />
        ) : (
          <TimeSeriesChart
            data={data}
            color={config.color}
            height={160}
            unit={config.unit}
            showGrid
          />
        )}
      </div>

      {/* Stats - show when we have time series data */}
      {data.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Min</p>
            <p className="text-sm font-medium text-foreground">
              {Math.round(Math.min(...data.map((d) => d.value)))}{config.unit}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg</p>
            <p className="text-sm font-medium text-foreground">
              {Math.round(data.reduce((a, b) => a + b.value, 0) / data.length)}{config.unit}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Max</p>
            <p className="text-sm font-medium text-foreground">
              {Math.round(Math.max(...data.map((d) => d.value)))}{config.unit}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

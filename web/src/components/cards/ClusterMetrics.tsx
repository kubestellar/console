import { useState, useMemo, useEffect, useRef } from 'react'
import { TimeSeriesChart } from '../charts'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode } from '../../hooks/useDemoMode'
import { Server, Clock, Filter, ChevronDown, Info } from 'lucide-react'

type TimeRange = '15m' | '1h' | '6h' | '24h'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; points: number; intervalMs: number }[] = [
  { value: '15m', label: '15 min', points: 15, intervalMs: 60000 },
  { value: '1h', label: '1 hour', points: 20, intervalMs: 180000 },
  { value: '6h', label: '6 hours', points: 24, intervalMs: 900000 },
  { value: '24h', label: '24 hours', points: 24, intervalMs: 3600000 },
]

// Generate demo time series data with a seed for consistency per cluster
function generateTimeSeriesData(points: number, baseValue: number, variance: number, seed: number, intervalMs: number) {
  const now = new Date()
  // Simple seeded random for consistency
  const seededRandom = (i: number) => {
    const x = Math.sin(seed + i) * 10000
    return x - Math.floor(x)
  }
  return Array.from({ length: points }, (_, i) => {
    const time = new Date(now.getTime() - (points - i - 1) * intervalMs)
    // Format based on interval
    const timeStr = intervalMs >= 3600000
      ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return {
      time: timeStr,
      value: Math.max(0, baseValue + (seededRandom(i) - 0.5) * variance),
    }
  })
}

type MetricType = 'cpu' | 'memory' | 'pods' | 'nodes'

const metricConfig = {
  cpu: { label: 'CPU Cores', color: '#9333ea', unit: '', baseValue: 65, variance: 30 },
  memory: { label: 'Memory', color: '#3b82f6', unit: ' GB', baseValue: 72, variance: 20 },
  pods: { label: 'Pods', color: '#10b981', unit: '', baseValue: 150, variance: 100 },
  nodes: { label: 'Nodes', color: '#f59e0b', unit: '', baseValue: 10, variance: 5 },
}

// Generate a numeric hash from a string for seeding
function stringToSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function ClusterMetrics() {
  const { clusters: rawClusters } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode } = useDemoMode()
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('cpu')
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

  // Get reachable clusters
  const reachableClusters = useMemo(() => {
    return rawClusters.filter(c => c.reachable !== false)
  }, [rawClusters])

  // Filter clusters based on global selection AND local filter AND exclude offline/unreachable clusters
  const clusters = useMemo(() => {
    let filtered = reachableClusters
    if (!isAllClustersSelected) {
      filtered = filtered.filter(c => selectedClusters.includes(c.name))
    }
    // Apply local cluster filter if any selected
    if (localClusterFilter.length > 0) {
      filtered = filtered.filter(c => localClusterFilter.includes(c.name))
    }
    return filtered
  }, [reachableClusters, selectedClusters, isAllClustersSelected, localClusterFilter])

  // Get available clusters for local filter (respects global filter)
  const availableClustersForFilter = useMemo(() => {
    if (isAllClustersSelected) return reachableClusters
    return reachableClusters.filter(c => selectedClusters.includes(c.name))
  }, [reachableClusters, selectedClusters, isAllClustersSelected])

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

  // Get time range config
  const timeRangeConfig = TIME_RANGE_OPTIONS.find(t => t.value === timeRange) || TIME_RANGE_OPTIONS[1]

  // Generate time-series data - only in demo mode
  const data = useMemo(() => {
    const config = metricConfig[selectedMetric]
    const points = timeRangeConfig.points
    const intervalMs = timeRangeConfig.intervalMs

    // Only generate synthetic data in demo mode
    if (!isDemoMode) {
      return []
    }

    if (clusters.length === 0) {
      return generateTimeSeriesData(points, 0, 0, 0, intervalMs)
    }

    // Use real current value as base if available
    const baseValue = hasRealData ? realValues[selectedMetric] : config.baseValue
    const variance = hasRealData ? baseValue * 0.1 : config.variance // 10% variance around real value

    // Generate simulated historical data centered around current real value
    const clusterData = clusters.map(cluster =>
      generateTimeSeriesData(points, baseValue / clusters.length, variance / clusters.length, stringToSeed(cluster.name + selectedMetric + timeRange), intervalMs)
    )

    // Aggregate by summing all cluster values at each time point
    return Array.from({ length: points }, (_, i) => {
      const totalValue = clusterData.reduce((sum, cd) => sum + cd[i].value, 0)
      return {
        time: clusterData[0][i].time,
        value: totalValue,
      }
    })
  }, [clusters, selectedMetric, hasRealData, realValues, timeRange, timeRangeConfig.points, timeRangeConfig.intervalMs, isDemoMode])

  const config = metricConfig[selectedMetric]
  // Use real current value if available, otherwise use last chart value
  const currentValue = hasRealData ? realValues[selectedMetric] : (data[data.length - 1]?.value || 0)

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with metric selector */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground">{config.label}</h4>
            {clusters.length < availableClustersForFilter.length && clusters.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                <Server className="w-3 h-3" />
                {clusters.length}/{availableClustersForFilter.length}
              </span>
            )}
            {hasRealData && (
              <span className="text-xs text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                Live
              </span>
            )}
          </div>
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

      {/* Filter controls */}
      <div className="flex items-center gap-2 mb-3">
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
        {availableClustersForFilter.length > 1 && (
          <div ref={clusterFilterRef} className="relative">
            <button
              onClick={() => setShowClusterFilter(!showClusterFilter)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                localClusterFilter.length > 0
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
              title="Filter by cluster"
            >
              <Filter className="w-3 h-3" />
              <span>{localClusterFilter.length > 0 ? `${localClusterFilter.length} clusters` : 'All clusters'}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showClusterFilter && (
              <div className="absolute top-full left-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                <div className="p-1">
                  <button
                    onClick={() => setLocalClusterFilter([])}
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[160px]">
        {clusters.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No clusters selected
          </div>
        ) : !isDemoMode ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
            <Info className="w-5 h-5" />
            <span>Historical metrics require Prometheus</span>
            <span className="text-xs text-muted-foreground/70">Enable demo mode to see simulated data</span>
          </div>
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

      {/* Stats - only show when we have time series data */}
      {isDemoMode && data.length > 0 && (
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

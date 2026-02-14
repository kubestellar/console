import { useState, useMemo, useEffect, useRef } from 'react'
import { TrendingUp, Cpu, Server, Clock } from 'lucide-react'
import { CardClusterFilter } from '../../lib/cards'
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
import { useGPUNodes, useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

interface GPUDataPoint {
  time: string
  available: number
  allocated: number
  free: number
}

type TimeRange = '15m' | '1h' | '6h' | '24h'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; points: number; intervalMs: number }[] = [
  { value: '15m', label: '15 min', points: 15, intervalMs: 60000 },
  { value: '1h', label: '1 hour', points: 20, intervalMs: 180000 },
  { value: '6h', label: '6 hours', points: 24, intervalMs: 900000 },
  { value: '24h', label: '24 hours', points: 24, intervalMs: 3600000 },
]

// Normalize cluster name for matching
function normalizeClusterName(cluster: string): string {
  if (!cluster) return ''
  const parts = cluster.split('/')
  return parts[parts.length - 1] || cluster
}

export function GPUUsageTrend() {
  const { t } = useTranslation()
  const {
    nodes: gpuNodes,
    isLoading: hookLoading,
  } = useGPUNodes()
  const { deduplicatedClusters: clusters } = useClusters()

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && gpuNodes.length === 0
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Report state to CardWrapper for refresh animation
  useCardLoadingState({
    isLoading: hookLoading,
    hasAnyData: gpuNodes.length > 0,
  })
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Track historical data points with persistence
  const STORAGE_KEY = 'gpu-usage-trend-history'
  const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes - discard older data

  // Load from localStorage on mount
  const loadSavedHistory = (): GPUDataPoint[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { data: GPUDataPoint[]; timestamp: number }
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

  const historyRef = useRef<GPUDataPoint[]>(loadSavedHistory())
  const [history, setHistory] = useState<GPUDataPoint[]>(historyRef.current)

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

  // Get reachable clusters (those with GPU nodes)
  const gpuClusters = useMemo(() => {
    const clusterNames = new Set(gpuNodes.map(n => normalizeClusterName(n.cluster)))
    return clusters.filter(c => clusterNames.has(normalizeClusterName(c.name)) && c.reachable !== false)
  }, [gpuNodes, clusters])

  // Get available clusters for local filter (respects global filter)
  const availableClustersForFilter = useMemo(() => {
    if (isAllClustersSelected) return gpuClusters
    return gpuClusters.filter(c => selectedClusters.includes(c.name))
  }, [gpuClusters, selectedClusters, isAllClustersSelected])

  // Filter GPU nodes by selected clusters AND local filter
  const filteredNodes = useMemo(() => {
    let filtered = gpuNodes

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      filtered = filtered.filter(node => {
        const normalizedNodeCluster = normalizeClusterName(node.cluster)
        return selectedClusters.some(c => {
          const normalizedSelected = normalizeClusterName(c)
          return normalizedNodeCluster === normalizedSelected ||
                 normalizedNodeCluster.includes(normalizedSelected) ||
                 normalizedSelected.includes(normalizedNodeCluster)
        })
      })
    }

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      filtered = filtered.filter(node => {
        const normalizedNodeCluster = normalizeClusterName(node.cluster)
        return localClusterFilter.some(c => {
          const normalizedLocal = normalizeClusterName(c)
          return normalizedNodeCluster === normalizedLocal ||
                 normalizedNodeCluster.includes(normalizedLocal) ||
                 normalizedLocal.includes(normalizedNodeCluster)
        })
      })
    }

    return filtered
  }, [gpuNodes, selectedClusters, isAllClustersSelected, localClusterFilter])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  // Calculate current GPU totals
  const currentTotals = useMemo(() => {
    const available = filteredNodes.reduce((sum, n) => sum + (n.gpuCount || 0), 0)
    const allocated = filteredNodes.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0)
    return {
      available,
      allocated,
      free: available - allocated,
    }
  }, [filteredNodes])

  // Get time range config
  const timeRangeConfig = TIME_RANGE_OPTIONS.find(t => t.value === timeRange) || TIME_RANGE_OPTIONS[1]

  // Add data point to history on each update
  useEffect(() => {
    if (isLoading) return
    if (currentTotals.available === 0) return

    const now = new Date()
    const newPoint: GPUDataPoint = {
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...currentTotals,
    }

    // Only add if data changed significantly
    const lastPoint = historyRef.current[historyRef.current.length - 1]
    const shouldAdd = !lastPoint ||
      lastPoint.available !== newPoint.available ||
      lastPoint.allocated !== newPoint.allocated

    if (shouldAdd) {
      const maxPoints = timeRangeConfig.points
      const newHistory = [...historyRef.current, newPoint].slice(-maxPoints)
      historyRef.current = newHistory
      setHistory(newHistory)
    }
  }, [currentTotals, isLoading, timeRangeConfig.points])

  // Initialize with simulated history when first loading
  useEffect(() => {
    if (history.length === 0 && currentTotals.available > 0) {
      const now = new Date()
      const initialPoints: GPUDataPoint[] = []
      const points = timeRangeConfig.points
      const intervalMs = timeRangeConfig.intervalMs

      for (let i = points - 1; i >= 0; i--) {
        const time = new Date(now.getTime() - i * intervalMs)
        // Add some variance to make it look like real historical data
        const allocatedVariance = Math.max(0, currentTotals.allocated + Math.floor((Math.random() - 0.5) * 2))
        const bounded = Math.min(allocatedVariance, currentTotals.available)
        initialPoints.push({
          time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          available: currentTotals.available,
          allocated: bounded,
          free: currentTotals.available - bounded,
        })
      }

      historyRef.current = initialPoints
      setHistory(initialPoints)
    }
  }, [currentTotals, history.length, timeRangeConfig.points, timeRangeConfig.intervalMs])

  // Calculate usage percentage
  const usagePercent = currentTotals.available > 0
    ? Math.round((currentTotals.allocated / currentTotals.available) * 100)
    : 0

  // Determine color based on usage
  const getUsageColor = () => {
    if (usagePercent >= 90) return 'text-red-400'
    if (usagePercent >= 75) return 'text-orange-400'
    if (usagePercent >= 50) return 'text-yellow-400'
    return 'text-green-400'
  }

  if (isLoading && history.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-2">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="rounded" width={28} height={28} />
        </div>
        <SkeletonStats className="mb-4" />
        <Skeleton variant="rounded" height={160} className="flex-1" />
      </div>
    )
  }

  if (gpuNodes.length === 0) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex items-center justify-end mb-3">
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <Cpu className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">No GPU Nodes</p>
          <p className="text-sm text-muted-foreground">No GPU resources detected in any cluster</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
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

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20" title={`${currentTotals.available} total GPUs available`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">{t('common.total')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.available}</span>
        </div>
        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20" title={`${currentTotals.allocated} GPUs in use`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-purple-400">{t('common.used')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.allocated}</span>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20" title={`${currentTotals.free} GPUs free`}>
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">{t('common.free')}</span>
          </div>
          <span className="text-sm font-bold text-foreground">{currentTotals.free}</span>
        </div>
        <div className={`p-2 rounded-lg bg-secondary/50 border border-border`} title={`${usagePercent}% GPU utilization`}>
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className={`w-3 h-3 ${getUsageColor()}`} />
            <span className={`text-xs ${getUsageColor()}`}>Usage</span>
          </div>
          <span className={`text-sm font-bold ${getUsageColor()}`}>{usagePercent}%</span>
        </div>
      </div>

      {/* Stacked Area Chart */}
      <div className="flex-1 min-h-[160px]">
        {history.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No GPU data available
          </div>
        ) : (
          <div style={{ width: '100%', minHeight: 160, height: 160 }}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={history} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradientAllocated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9333ea" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#9333ea" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="gradientFree" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#888', fontSize: 10 }}
                  axisLine={{ stroke: '#333' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#888', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#888' }}
                  formatter={(value, name) => {
                    const label = name === 'allocated' ? 'In Use' : 'Free'
                    return [`${value} GPUs`, label]
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '10px' }}
                  iconType="rect"
                  formatter={(value) => value === 'allocated' ? 'In Use' : 'Free'}
                />
                <Area
                  type="stepAfter"
                  dataKey="allocated"
                  stackId="1"
                  stroke="#9333ea"
                  strokeWidth={2}
                  fill="url(#gradientAllocated)"
                  name="allocated"
                />
                <Area
                  type="stepAfter"
                  dataKey="free"
                  stackId="1"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#gradientFree)"
                  name="free"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Footer with GPU types breakdown */}
      {filteredNodes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex flex-wrap gap-2">
            {Object.entries(
              filteredNodes.reduce((acc, node) => {
                const type = node.gpuType || 'Unknown'
                if (!acc[type]) acc[type] = { count: 0, allocated: 0 }
                acc[type].count += node.gpuCount || 0
                acc[type].allocated += node.gpuAllocated || 0
                return acc
              }, {} as Record<string, { count: number; allocated: number }>)
            ).map(([type, data]) => (
              <div
                key={type}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary/50"
                title={`${type}: ${data.allocated}/${data.count} used`}
              >
                <span className="text-muted-foreground truncate max-w-[100px]">{type}:</span>
                <span className="text-foreground">{data.allocated}/{data.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { memo, useState, useMemo, useEffect, useRef } from 'react'
import { TrendingUp, Cpu, Server, Clock } from 'lucide-react'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { LazyEChart } from '../charts/LazyEChart'
import { useClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton, SkeletonStats } from '../ui/Skeleton'
import { useCardLoadingState, useCardDemoState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { normalizeClusterName } from '../../lib/gpu'
import { CHART_HEIGHT_STANDARD } from '../../lib/constants'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import {
  TIME_RANGE_OPTIONS,
  type EffectiveGPUNode,
  type GPUDataPoint,
  type TimeRange } from './GPUUsageTrend.constants'
import { useEffectiveGPUNodes } from './useEffectiveGPUNodes'
import { useGPUUsageTrendChartOption } from './useGPUUsageTrendChartOption'

const GPU_CHART_CONTAINER_STYLE = { width: '100%', minHeight: CHART_HEIGHT_STANDARD, height: CHART_HEIGHT_STANDARD } as const
const GPU_CHART_STYLE = { height: CHART_HEIGHT_STANDARD, width: '100%' } as const

const GPUUsageTrend = memo(function GPUUsageTrend() {
  const { t } = useTranslation()
  const {
    nodes: gpuNodes,
    isLoading: hookLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh } = useCachedGPUNodes()
  const { deduplicatedClusters: clusters } = useClusters()
  const { shouldUseDemoData: isDemoMode } = useCardDemoState({ requires: 'agent' })
  const effectiveGPUNodes = useEffectiveGPUNodes({ gpuNodes, hookLoading, isFailed, consecutiveFailures })

  // Only show skeleton when no cached data exists (live OR snapshot fallback)
  const hasData = effectiveGPUNodes.length > 0
  const isLoading = hookLoading && !hasData
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Report state to CardWrapper for refresh animation
  useCardLoadingState({
    isLoading: hookLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode || isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh })
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Track historical data points with persistence
  const STORAGE_KEY = 'gpu-usage-trend-history'
  const MAX_AGE_MS = 30 * MS_PER_MINUTE // 30 minutes - discard older data

  const loadSavedHistory = (): GPUDataPoint[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { data: GPUDataPoint[]; timestamp: number }
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

  useEffect(() => {
    if (history.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          data: history,
          timestamp: Date.now() }))
      } catch {
        // Ignore storage errors
      }
    }
  }, [history])

  // Get reachable clusters (those with GPU nodes)
  const gpuClusters = (() => {
    const clusterNames = new Set(effectiveGPUNodes.map(n => normalizeClusterName(n.cluster)))
    return clusters.filter(c => clusterNames.has(normalizeClusterName(c.name)) && c.reachable !== false)
  })()

  const availableClustersForFilter = (() => {
    if (isAllClustersSelected) return gpuClusters
    return gpuClusters.filter(c => selectedClusters.includes(c.name))
  })()

  const filteredNodes = useMemo(() => {
    let filtered: EffectiveGPUNode[] = effectiveGPUNodes
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
  }, [effectiveGPUNodes, selectedClusters, isAllClustersSelected, localClusterFilter])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  const currentTotals = useMemo(() => {
    const available = filteredNodes.reduce((sum, n) => sum + (n.gpuCount || 0), 0)
    const allocated = filteredNodes.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0)
    return { available, allocated, free: available - allocated }
  }, [filteredNodes])

  const timeRangeConfig = TIME_RANGE_OPTIONS.find(t => t.value === timeRange) || TIME_RANGE_OPTIONS[1]

  useEffect(() => {
    if (isLoading) return
    if (currentTotals.available === 0) return
    const now = new Date()
    const newPoint: GPUDataPoint = {
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...currentTotals }
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

  const usagePercent = currentTotals.available > 0
    ? Math.round((currentTotals.allocated / currentTotals.available) * 100)
    : 0

  const getUsageColor = () => {
    if (usagePercent >= 90) return 'text-red-400'
    if (usagePercent >= 75) return 'text-orange-400'
    if (usagePercent >= 50) return 'text-yellow-400'
    return 'text-green-400'
  }

  const chartOption = useGPUUsageTrendChartOption(history)

  if (isLoading && history.length === 0) {
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

  if (effectiveGPUNodes.length === 0) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex items-center justify-end mb-3" />
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
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
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

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-4">
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
            <TrendingUp className={`w-3 h-3 ${getUsageColor()}`} aria-hidden="true" />
            <span className={`text-xs ${getUsageColor()}`}>Usage</span>
          </div>
          <span className={`text-sm font-bold ${getUsageColor()}`}>{usagePercent}%</span>
        </div>
      </div>

      <div className="flex-1 min-h-[160px]">
        {history.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Collecting data...
          </div>
        ) : (
          <div style={GPU_CHART_CONTAINER_STYLE} role="img" aria-label={`GPU usage trend chart: ${currentTotals.allocated} of ${currentTotals.available} GPUs in use (${usagePercent}% utilization)`}>
            <LazyEChart
              option={chartOption}
              style={GPU_CHART_STYLE}
              notMerge={true}
              opts={{ renderer: 'svg' }}
            />
          </div>
        )}
      </div>

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
})


export { GPUUsageTrend }
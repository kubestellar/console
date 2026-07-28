import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useMetricsHistory } from '../../../hooks/useMetricsHistory'
import type { MetricsSnapshot } from '../../../types/predictions'
import { useCachedGPUNodes } from '../../../hooks/useCachedData'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useCardLoadingState } from '../CardDataContext'
import { MS_PER_MINUTE, MINUTES_PER_HOUR } from '../../../lib/constants/time'
import {
  MIN_TREND_SNAPSHOTS, RECENT_SNAPSHOT_WINDOW, TREND_CHANGE_THRESHOLD,
  HIGH_USAGE_PCT, MEDIUM_USAGE_PCT,
  PERCENT_MULTIPLIER,
  DEFAULT_SNAPSHOT_INTERVAL_MIN, MIN_CHURN_SNAPSHOTS, TABLE_PAGE_SIZE, MAX_CHART_SERIES,
  generateDemoData, generateDemoTableRows, resolveGPUType,
  type ViewMode, type ChartMode, type GPUHistoryDataPoint, type ChurnMetrics,
} from '../GPUInventoryHistory.parts'

/**
 * All filtering/derived-data logic for the GPUInventoryHistory card: raw
 * data fetching, local UI state (filters, dropdowns, view/chart mode, table
 * pagination), and the memoised chart/table/trend/churn computations.
 * Extracted from GPUInventoryHistory.tsx to keep that file under the
 * line/hook budget (#21650).
 */
export function useGPUInventoryHistoryData() {
  const { history } = useMetricsHistory()
  const {
    nodes: gpuNodes,
    isLoading: hookLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    refetch,
  } = useCachedGPUNodes()
  const { isDemoMode } = useDemoMode()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('chart')
  const [chartMode, setChartMode] = useState<ChartMode>('by-type')
  const [selectedGPUType, setSelectedGPUType] = useState<string>('all')
  const [selectedNode, setSelectedNode] = useState<string>('all')
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const [showNodeDropdown, setShowNodeDropdown] = useState(false)
  const typeDropdownRef = useRef<HTMLDivElement>(null)
  const nodeDropdownRef = useRef<HTMLDivElement>(null)
  const [tablePage, setTablePage] = useState(0)

  const hasData = (gpuNodes || []).length > 0
  const isLoading = hookLoading && !hasData
  const showDemo = isDemoMode || isDemoFallback

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: hookLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData || (history || []).length > 0,
    isDemoData: showDemo,
    isFailed,
    consecutiveFailures,
  })

  // ── Close dropdowns on outside click or Escape ─────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setShowTypeDropdown(false)
      }
      if (nodeDropdownRef.current && !nodeDropdownRef.current.contains(e.target as Node)) {
        setShowNodeDropdown(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTypeDropdown(false)
        setShowNodeDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  // ── Available filter options (from history + current data) ──────────
  const availableClusters = useMemo(() => {
    const names = new Set<string>()
    for (const n of (gpuNodes || [])) names.add(n.cluster)
    for (const s of (history || [])) {
      for (const g of (s.gpuNodes || [])) names.add(g.cluster)
    }
    return Array.from(names).sort().map(name => ({ name, reachable: true }))
  }, [gpuNodes, history])

  const availableGPUTypes = useMemo(() => {
    const types = new Set<string>()
    for (const n of (gpuNodes || [])) types.add(resolveGPUType(n.gpuType))
    for (const s of (history || [])) {
      for (const g of (s.gpuNodes || [])) types.add(resolveGPUType(g.gpuType))
    }
    return Array.from(types).sort()
  }, [gpuNodes, history])

  const availableNodes = useMemo(() => {
    const nodes = new Set<string>()
    for (const n of (gpuNodes || [])) nodes.add(n.name)
    for (const s of (history || [])) {
      for (const g of (s.gpuNodes || [])) nodes.add(g.name)
    }
    return Array.from(nodes).sort()
  }, [gpuNodes, history])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev =>
      prev.includes(clusterName)
        ? prev.filter(c => c !== clusterName)
        : [...prev, clusterName]
    )
  }

  // ── Filter helper applied to snapshot gpuNodes ─────────────────────
  const filterGPUNodes = useCallback((nodes: Array<{ name: string; cluster: string; gpuType?: string; gpuAllocated: number; gpuTotal: number }>) => {
      let filtered = nodes || []

      // Global cluster filter
      if (!isAllClustersSelected && selectedClusters.length > 0) {
        filtered = filtered.filter(g =>
          selectedClusters.some(sc => g.cluster.includes(sc) || sc.includes(g.cluster))
        )
      }
      // Local cluster filter
      if (localClusterFilter.length > 0) {
        filtered = filtered.filter(g =>
          localClusterFilter.some(lc => g.cluster.includes(lc) || lc.includes(g.cluster))
        )
      }
      // GPU type filter
      if (selectedGPUType !== 'all') {
        filtered = filtered.filter(g => resolveGPUType(g.gpuType) === selectedGPUType)
      }
      // Node filter
      if (selectedNode !== 'all') {
        filtered = filtered.filter(g => g.name === selectedNode)
      }
      return filtered
    }, [isAllClustersSelected, selectedClusters, localClusterFilter, selectedGPUType, selectedNode])

  // ── Chart data ─────────────────────────────────────────────────────
  const chartData = useMemo<GPUHistoryDataPoint[]>(() => {
    if (showDemo || (history || []).length === 0) {
      return generateDemoData()
    }

    const points = (history || []).map(snapshot => {
      const filtered = filterGPUNodes(snapshot.gpuNodes || [])
      const allocated = filtered.reduce((sum, g) => sum + (g.gpuAllocated || 0), 0)
      const total = filtered.reduce((sum, g) => sum + (g.gpuTotal || 0), 0)
      const date = new Date(snapshot.timestamp)

      const point: GPUHistoryDataPoint = {
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: date.getTime(),
        allocated,
        total,
        free: Math.max(total - allocated, 0) }

      // Per-GPU-type breakdown for stacked chart
      if (chartMode === 'by-type') {
        const typeTotals = new Map<string, number>()
        for (const g of filtered) {
          const typeName = resolveGPUType(g.gpuType)
          typeTotals.set(typeName, (typeTotals.get(typeName) || 0) + (g.gpuAllocated || 0))
        }
        for (const [typeName, count] of typeTotals) {
          point[typeName] = count
        }
      }

      return point
    })

    // Defensive filter: if any point in the series has a non-zero total, drop
    // points whose total is zero. A zero-total point next to non-zero points
    // is almost always a transient GPU-fetch glitch that slipped through
    // carry-forward protection in useMetricsHistory. Keeps the chart,
    // stats, and trend math from showing misleading flapping zero bars.
    // If EVERY point has total === 0 (legitimate no-GPU state) we leave the
    // series alone so the empty-state paths still fire correctly.
    const anyNonZero = points.some(p => p.total > 0)
    if (anyNonZero) {
      return points.filter(p => p.total > 0)
    }
    return points
  }, [history, showDemo, filterGPUNodes, chartMode])

  /** All GPU type keys present in chart data */
  const allGPUTypeKeys = useMemo(() => {
    if (chartMode !== 'by-type') return []
    const types = new Set<string>()
    for (const dp of (chartData || [])) {
      for (const key of Object.keys(dp)) {
        if (!['time', 'timestamp', 'allocated', 'total', 'free'].includes(key) && typeof dp[key] === 'number') {
          types.add(key)
        }
      }
    }
    return Array.from(types).sort()
  }, [chartData, chartMode])

  /** Sorted list of GPU types for chart series (overflow aggregated into "Other") */
  const chartGPUTypes = (() => {
    if (allGPUTypeKeys.length <= MAX_CHART_SERIES) return allGPUTypeKeys
    return [...allGPUTypeKeys.slice(0, MAX_CHART_SERIES - 1), 'Other']
  })()

  /** Chart data with overflow types aggregated into "Other" */
  const displayChartData = (() => {
    if (allGPUTypeKeys.length <= MAX_CHART_SERIES) return chartData
    const overflowTypes = new Set(allGPUTypeKeys.slice(MAX_CHART_SERIES - 1))
    return (chartData || []).map(dp => {
      const next = { ...dp }
      let otherTotal = 0
      for (const key of overflowTypes) {
        if (typeof next[key] === 'number') {
          otherTotal += next[key] as number
          delete next[key]
        }
      }
      if (otherTotal > 0) next['Other'] = otherTotal
      return next
    })
  })()

  // ── Current totals ─────────────────────────────────────────────────
  const currentTotals = (() => {
    if ((chartData || []).length === 0) return { allocated: 0, total: 0, free: 0 }
    const latest = chartData[chartData.length - 1]
    return {
      allocated: latest.allocated,
      total: latest.total,
      free: latest.free }
  })()

  // ── Trend ──────────────────────────────────────────────────────────
  const trend = useMemo<'up' | 'down' | 'stable'>(() => {
    if ((chartData || []).length < MIN_TREND_SNAPSHOTS) return 'stable'
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

  // ── Churn metrics ──────────────────────────────────────────────────
  const churnMetrics = useMemo<ChurnMetrics | null>(() => {
    // Drop snapshots with zero total GPUs before diffing so transient empty
    // captures don't show up as massive departure/arrival churn.
    const churnHistory = (history || []).filter(s => {
      const nodes = s.gpuNodes || []
      if (nodes.length === 0) return false
      const total = nodes.reduce((sum, g) => sum + (g.gpuTotal || 0), 0)
      return total > 0
    })

    if (showDemo || churnHistory.length < MIN_CHURN_SNAPSHOTS) return null

    let totalArrivals = 0
    let totalDepartures = 0
    let diffCount = 0

    for (let i = 1; i < churnHistory.length; i++) {
      const prev = filterGPUNodes(churnHistory[i - 1].gpuNodes || [])
      const curr = filterGPUNodes(churnHistory[i].gpuNodes || [])

      // Per-node diffing captures churn even when allocations and frees cancel at aggregate level
      const prevMap: Record<string, number> = {}
      for (const g of prev) {
        const key = g.name
        prevMap[key] = (prevMap[key] || 0) + (g.gpuAllocated || 0)
      }
      const currMap: Record<string, number> = {}
      for (const g of curr) {
        const key = g.name
        currMap[key] = (currMap[key] || 0) + (g.gpuAllocated || 0)
      }

      const allKeys = new Set([...Object.keys(prevMap), ...Object.keys(currMap)])
      for (const key of allKeys) {
        const delta = (currMap[key] ?? 0) - (prevMap[key] ?? 0)
        if (delta > 0) totalArrivals += delta
        if (delta < 0) totalDepartures += Math.abs(delta)
      }
      diffCount++
    }

    if (diffCount === 0) return null

    const arrivalRate = totalArrivals / diffCount
    const departureRate = totalDepartures / diffCount

    // Little's Law: L/λ — use mean allocated across all data points (not just latest)
    const allocatedValues = (chartData || []).map(dp => dp.allocated)
    const meanAllocated = allocatedValues.length > 0
      ? allocatedValues.reduce((a, b) => a + b, 0) / allocatedValues.length
      : 0
    const avgDurationIntervals = arrivalRate > 0 ? meanAllocated / arrivalRate : 0

    return { arrivalRate, departureRate, avgDurationIntervals }
  }, [history, showDemo, filterGPUNodes, chartData])

  const meanAllocatedGPUs = useMemo(() => {
    const safeData = chartData || []
    if (safeData.length === 0) return 0
    return Math.round(safeData.reduce((s, d) => s + d.allocated, 0) / safeData.length)
  }, [chartData])

  // ── Snapshot interval (computed from history timestamps) ────────────
  /** Median interval between consecutive snapshots in minutes, used to display churn metrics in real time units */
  const snapshotIntervalMin = (() => {
    if ((history || []).length < MIN_CHURN_SNAPSHOTS) return DEFAULT_SNAPSHOT_INTERVAL_MIN
    const intervals: number[] = []
    for (let i = 1; i < (history || []).length; i++) {
      const deltaMs = new Date((history || [])[i].timestamp).getTime() - new Date((history || [])[i - 1].timestamp).getTime()
      if (deltaMs > 0) intervals.push(deltaMs / MS_PER_MINUTE)
    }
    if (intervals.length === 0) return DEFAULT_SNAPSHOT_INTERVAL_MIN
    intervals.sort((a, b) => a - b)
    const mid = Math.floor(intervals.length / 2)
    return Math.round(intervals.length % 2 === 0 ? (intervals[mid - 1] + intervals[mid]) / 2 : intervals[mid])
  })()

  /** Format a duration given in snapshot intervals as a human-readable time string (e.g. "~30 min" or "~2.5 hrs") */
  const formatIntervalDuration = (intervals: number): string => {
    const totalMin = intervals * snapshotIntervalMin
    if (totalMin < MINUTES_PER_HOUR) return `~${Math.round(totalMin)} min`
    return `~${(totalMin / MINUTES_PER_HOUR).toFixed(1)} hrs`
  }

  // ── Table data (per-node, per-type breakdown from latest snapshot) ──
  const tableRows = (() => {
    if (showDemo) return generateDemoTableRows()

    // Walk history from the end and pick the most recent snapshot whose
    // total GPU count is non-zero. Falls back to the literal latest (even if
    // zero) so genuine no-GPU clusters still render an empty table rather
    // than a stale one.
    let latestSnapshot: MetricsSnapshot | null = null
    const hist = history || []
    for (let i = hist.length - 1; i >= 0; i--) {
      const s = hist[i]
      const nodes = s.gpuNodes || []
      const total = nodes.reduce((sum, g) => sum + (g.gpuTotal || 0), 0)
      if (total > 0) {
        latestSnapshot = s
        break
      }
    }
    if (!latestSnapshot && hist.length > 0) {
      latestSnapshot = hist[hist.length - 1]
    }
    if (!latestSnapshot) return []

    const filtered = filterGPUNodes(latestSnapshot.gpuNodes || [])
    return filtered.map(g => {
      const total = g.gpuTotal || 0
      const allocated = g.gpuAllocated || 0
      return {
        name: g.name,
        cluster: g.cluster,
        gpuType: resolveGPUType(g.gpuType),
        allocated,
        total,
        free: Math.max(total - allocated, 0),
        utilizationPct: total > 0 ? Math.round((allocated / total) * PERCENT_MULTIPLIER) : 0 }
    })
  })()

  const totalTablePages = Math.max(1, Math.ceil((tableRows || []).length / TABLE_PAGE_SIZE))

  // Clamp page to valid range when filters shrink the row count
  const effectivePage = Math.min(tablePage, totalTablePages - 1)

  const paginatedRows = (() => {
    const start = effectivePage * TABLE_PAGE_SIZE
    return (tableRows || []).slice(start, start + TABLE_PAGE_SIZE)
  })()

  const usagePercent = currentTotals.total > 0
    ? Math.round((currentTotals.allocated / currentTotals.total) * PERCENT_MULTIPLIER)
    : 0

  const getUsageColor = () => {
    if (usagePercent >= HIGH_USAGE_PCT) return 'text-red-400'
    if (usagePercent >= MEDIUM_USAGE_PCT) return 'text-yellow-400'
    return 'text-green-400'
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return {
    gpuNodes,
    isRefreshing,
    isFailed,
    refetch,
    isLoading,
    showDemo,
    showSkeleton,
    showEmptyState,
    history,
    localClusterFilter,
    setLocalClusterFilter,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    viewMode,
    setViewMode,
    chartMode,
    setChartMode,
    selectedGPUType,
    setSelectedGPUType,
    selectedNode,
    setSelectedNode,
    showTypeDropdown,
    setShowTypeDropdown,
    showNodeDropdown,
    setShowNodeDropdown,
    typeDropdownRef,
    nodeDropdownRef,
    tablePage,
    setTablePage,
    availableClusters,
    availableGPUTypes,
    availableNodes,
    toggleClusterFilter,
    chartData,
    chartGPUTypes,
    displayChartData,
    currentTotals,
    trend,
    TrendIcon,
    churnMetrics,
    meanAllocatedGPUs,
    snapshotIntervalMin,
    formatIntervalDuration,
    tableRows,
    totalTablePages,
    effectivePage,
    paginatedRows,
    usagePercent,
    getUsageColor,
  }
}

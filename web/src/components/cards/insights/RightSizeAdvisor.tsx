import { useMemo, useState } from 'react'
import { Scale, ChevronDown, ChevronUp, Cpu, MemoryStick, AlertTriangle, CheckCircle2, MinusCircle, HelpCircle } from 'lucide-react'
import { useClusters } from '../../../hooks/useMCP'
import { useCachedGPUNodes } from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useCardLoadingState } from '../CardDataContext'
import { useChartFilters } from '../../../lib/cards/cardHooks'
import { CardControlsRow } from '../../../lib/cards/CardComponents'
import { StatusBadge } from '../../ui/StatusBadge'
import { Skeleton } from '../../ui/Skeleton'

type Verdict = 'under-provisioned' | 'right-sized' | 'over-provisioned' | 'insufficient-data'

interface ResourceMetric {
  used: number
  capacity: number
  pct: number
  verdict: Verdict
  unit: string
}

interface ClusterSizing {
  name: string
  cpu: ResourceMetric
  memory: ResourceMetric
  overall: Verdict
  nodeCount: number
  hasGPU: boolean
  gpuConstrained: boolean
  recommendation: string
}

const DEFAULT_HEADROOM_PCT = 30
const MIN_HEADROOM = 10
const MAX_HEADROOM = 60

const SORT_OPTIONS = [
  { value: 'verdict' as const, label: 'Verdict' },
  { value: 'name' as const, label: 'Name' },
  { value: 'cpu' as const, label: 'CPU %' },
  { value: 'memory' as const, label: 'Memory %' },
]

type SortField = 'verdict' | 'name' | 'cpu' | 'memory'

function computeVerdict(pct: number, headroom: number): Verdict {
  const target = 100 - headroom
  if (pct > target) return 'under-provisioned'
  if (pct < Math.max(0, target - 30)) return 'over-provisioned'
  return 'right-sized'
}

function overallVerdict(cpu: Verdict, mem: Verdict): Verdict {
  if (cpu === 'under-provisioned' || mem === 'under-provisioned') return 'under-provisioned'
  if (cpu === 'insufficient-data' && mem === 'insufficient-data') return 'insufficient-data'
  if (cpu === 'over-provisioned' && mem === 'over-provisioned') return 'over-provisioned'
  if (cpu === 'over-provisioned' || mem === 'over-provisioned') return 'over-provisioned'
  return 'right-sized'
}

function buildRecommendation(s: ClusterSizing, headroom: number): string {
  if (s.overall === 'insufficient-data') return 'Metrics unavailable — ensure metrics-server is running.'

  const target = 100 - headroom
  const parts: string[] = []

  if (s.cpu.verdict === 'under-provisioned') {
    const deficit = s.cpu.pct - target
    const coresNeeded = Math.ceil((deficit / 100) * s.cpu.capacity)
    parts.push(`CPU at ${s.cpu.pct}% — add ~${Math.max(1, coresNeeded)} cores to reach ${target}% target`)
  } else if (s.cpu.verdict === 'over-provisioned') {
    const surplus = target - s.cpu.pct
    const reclaimable = Math.round((surplus / 100) * s.cpu.capacity * 10) / 10
    parts.push(`CPU at ${s.cpu.pct}% — ~${reclaimable} cores reclaimable`)
  }

  if (s.memory.verdict === 'under-provisioned') {
    const deficit = s.memory.pct - target
    const gbNeeded = Math.ceil((deficit / 100) * s.memory.capacity)
    parts.push(`Memory at ${s.memory.pct}% — add ~${Math.max(1, gbNeeded)} GB to reach ${target}% target`)
  } else if (s.memory.verdict === 'over-provisioned') {
    const surplus = target - s.memory.pct
    const reclaimable = Math.round((surplus / 100) * s.memory.capacity * 10) / 10
    parts.push(`Memory at ${s.memory.pct}% — ~${reclaimable} GB reclaimable`)
  }

  if (s.gpuConstrained) {
    parts.push('⚠️ GPU allocation is tight — do not scale down compute nodes')
  }

  if (parts.length === 0) {
    return `Utilization within target range (${target}% ± headroom). No action needed.`
  }

  return parts.join('. ') + '.'
}

const VERDICT_ORDER: Record<Verdict, number> = { 'under-provisioned': 0, 'over-provisioned': 1, 'right-sized': 2, 'insufficient-data': 3 }
const VERDICT_CONFIG: Record<Verdict, { color: 'red' | 'green' | 'yellow' | 'gray'; icon: typeof Scale; label: string }> = {
  'under-provisioned': { color: 'red', icon: AlertTriangle, label: 'Under-provisioned' },
  'right-sized': { color: 'green', icon: CheckCircle2, label: 'Right-sized' },
  'over-provisioned': { color: 'yellow', icon: MinusCircle, label: 'Over-provisioned' },
  'insufficient-data': { color: 'gray', icon: HelpCircle, label: 'No data' },
}

export function RightSizeAdvisor() {
  const { deduplicatedClusters, isLoading, isRefreshing, isFailed, consecutiveFailures, error } = useClusters()
  const { nodes: gpuNodes, isDemoFallback } = useCachedGPUNodes()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode } = useDemoMode()
  const [headroom, setHeadroom] = useState(DEFAULT_HEADROOM_PCT)
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortField>('verdict')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(10)

  // Cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef } = useChartFilters({ storageKey: 'right-size-advisor' })

  // Filter by global + local cluster selection
  const clusters = useMemo(() => {
    let result = deduplicatedClusters
    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(c => localClusterFilter.includes(c.name))
    }
    return result
  }, [deduplicatedClusters, globalSelectedClusters, isAllClustersSelected, localClusterFilter])

  // GPU cluster set
  const gpuClusterSet = useMemo(() => {
    const s = new Set<string>()
    for (const n of gpuNodes) {
      if (n.cluster) s.add(n.cluster)
    }
    return s
  }, [gpuNodes])

  const sizings = useMemo((): ClusterSizing[] => {
    const items = clusters.map(c => {
      const hasCpuData = typeof c.cpuCores === 'number' && c.cpuCores > 0
      const hasMemData = typeof c.memoryGB === 'number' && c.memoryGB > 0

      const cpuUsed = c.cpuUsageCores ?? c.cpuRequestsCores ?? 0
      const cpuCap = c.cpuCores ?? 0
      const cpuPct = hasCpuData ? Math.round((cpuUsed / cpuCap) * 100) : -1

      const memUsed = c.memoryUsageGB ?? c.memoryRequestsGB ?? 0
      const memCap = c.memoryGB ?? 0
      const memPct = hasMemData ? Math.round((memUsed / memCap) * 100) : -1

      const cpuVerdict: Verdict = hasCpuData ? computeVerdict(cpuPct, headroom) : 'insufficient-data'
      const memVerdict: Verdict = hasMemData ? computeVerdict(memPct, headroom) : 'insufficient-data'
      const combined = overallVerdict(cpuVerdict, memVerdict)

      const hasGPU = gpuClusterSet.has(c.name)
      const gpuConstrained = hasGPU && gpuNodes
        .filter(n => n.cluster === c.name)
        .some(n => {
          const alloc = n.gpuAllocated ?? 0
          const total = n.gpuCount ?? 0
          return total > 0 && (alloc / total) > 0.7
        })

      const sizing: ClusterSizing = {
        name: c.name,
        cpu: { used: cpuUsed, capacity: cpuCap, pct: cpuPct, verdict: cpuVerdict, unit: 'cores' },
        memory: { used: Math.round(memUsed * 10) / 10, capacity: Math.round(memCap * 10) / 10, pct: memPct, verdict: memVerdict, unit: 'GB' },
        overall: combined,
        nodeCount: c.nodeCount ?? 0,
        hasGPU,
        gpuConstrained,
        recommendation: '',
      }
      sizing.recommendation = buildRecommendation(sizing, headroom)
      return sizing
    })

    // Sort
    items.sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1
      switch (sortBy) {
        case 'verdict': return (VERDICT_ORDER[a.overall] - VERDICT_ORDER[b.overall]) * dir
        case 'name': return a.name.localeCompare(b.name) * dir
        case 'cpu': return ((a.cpu.pct === -1 ? 999 : a.cpu.pct) - (b.cpu.pct === -1 ? 999 : b.cpu.pct)) * dir
        case 'memory': return ((a.memory.pct === -1 ? 999 : a.memory.pct) - (b.memory.pct === -1 ? 999 : b.memory.pct)) * dir
        default: return 0
      }
    })

    // Apply limit
    if (limit !== 'unlimited') return items.slice(0, limit)
    return items
  }, [clusters, headroom, gpuClusterSet, gpuNodes, sortBy, sortDirection, limit])

  const hasData = clusters.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
    errorMessage: error ?? undefined,
    isDemoData: isDemoMode || isDemoFallback,
  })

  if (showSkeleton) {
    return <div className="space-y-3 p-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
  }

  if (showEmptyState || !hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
        <Scale className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No clusters available</p>
        <p className="text-xs mt-1">Connect clusters to see right-sizing recommendations</p>
      </div>
    )
  }

  // Summary counts (over full unsliced data)
  const allSizings = clusters.map(c => {
    const hasCpuData = typeof c.cpuCores === 'number' && c.cpuCores > 0
    const hasMemData = typeof c.memoryGB === 'number' && c.memoryGB > 0
    const cpuPct = hasCpuData ? Math.round(((c.cpuUsageCores ?? c.cpuRequestsCores ?? 0) / (c.cpuCores ?? 1)) * 100) : -1
    const memPct = hasMemData ? Math.round(((c.memoryUsageGB ?? c.memoryRequestsGB ?? 0) / (c.memoryGB ?? 1)) * 100) : -1
    const cpuV: Verdict = hasCpuData ? computeVerdict(cpuPct, headroom) : 'insufficient-data'
    const memV: Verdict = hasMemData ? computeVerdict(memPct, headroom) : 'insufficient-data'
    return overallVerdict(cpuV, memV)
  })
  const counts = allSizings.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc }, {} as Record<Verdict, number>)

  return (
    <div className="space-y-3 p-1">
      {/* Unified controls row */}
      <CardControlsRow
        clusterFilter={{
          availableClusters,
          selectedClusters: localClusterFilter,
          onToggle: toggleClusterFilter,
          onClear: clearClusterFilter,
          isOpen: showClusterFilter,
          setIsOpen: setShowClusterFilter,
          containerRef: clusterFilterRef,
          minClusters: 2,
        }}
        clusterIndicator={{
          selectedCount: localClusterFilter.length || clusters.length,
          totalCount: deduplicatedClusters.length,
        }}
        cardControls={{
          limit,
          onLimitChange: setLimit,
          sortBy,
          sortOptions: SORT_OPTIONS,
          onSortChange: (v) => setSortBy(v as SortField),
          sortDirection,
          onSortDirectionChange: setSortDirection,
        }}
        extra={
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Headroom</label>
            <input
              type="range"
              min={MIN_HEADROOM}
              max={MAX_HEADROOM}
              value={headroom}
              onChange={e => setHeadroom(Number(e.target.value))}
              className="w-20 h-1.5 accent-emerald-500"
            />
            <span className="text-xs font-mono text-muted-foreground w-8 text-right">{headroom}%</span>
          </div>
        }
      />

      {/* Summary badges */}
      <div className="flex gap-2 px-1 flex-wrap">
        {counts['under-provisioned'] ? <StatusBadge color="red" size="xs">{counts['under-provisioned']} under-provisioned</StatusBadge> : null}
        {counts['over-provisioned'] ? <StatusBadge color="yellow" size="xs">{counts['over-provisioned']} over-provisioned</StatusBadge> : null}
        {counts['right-sized'] ? <StatusBadge color="green" size="xs">{counts['right-sized']} right-sized</StatusBadge> : null}
        {counts['insufficient-data'] ? <StatusBadge color="gray" size="xs">{counts['insufficient-data']} no data</StatusBadge> : null}
      </div>

      {/* Cluster list */}
      <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
        {sizings.map(s => {
          const cfg = VERDICT_CONFIG[s.overall]
          const Icon = cfg.icon
          const isExpanded = expandedCluster === s.name

          return (
            <div key={s.name} className="rounded-lg border border-border/50 bg-secondary/20">
              <button
                onClick={() => setExpandedCluster(isExpanded ? null : s.name)}
                className="w-full flex items-center gap-2 p-2 hover:bg-secondary/40 transition-colors rounded-lg text-left"
              >
                <Icon className={`w-4 h-4 shrink-0 ${
                  cfg.color === 'red' ? 'text-red-400' :
                  cfg.color === 'green' ? 'text-green-400' :
                  cfg.color === 'yellow' ? 'text-yellow-400' : 'text-gray-400'
                }`} />
                <span className="text-sm font-medium flex-1 truncate">{s.name}</span>
                <StatusBadge color={cfg.color} size="xs">{cfg.label}</StatusBadge>
                {s.hasGPU && <StatusBadge color="purple" size="xs">GPU</StatusBadge>}
                <span className="text-xs text-muted-foreground">{s.nodeCount}n</span>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {s.cpu.verdict !== 'insufficient-data' && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Cpu className="w-3 h-3" />
                        <span>CPU</span>
                        <span className="ml-auto font-mono">{s.cpu.used}/{s.cpu.capacity} {s.cpu.unit} ({s.cpu.pct}%)</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            s.cpu.verdict === 'under-provisioned' ? 'bg-red-500' :
                            s.cpu.verdict === 'over-provisioned' ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, s.cpu.pct)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {s.memory.verdict !== 'insufficient-data' && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MemoryStick className="w-3 h-3" />
                        <span>Memory</span>
                        <span className="ml-auto font-mono">{s.memory.used}/{s.memory.capacity} {s.memory.unit} ({s.memory.pct}%)</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            s.memory.verdict === 'under-provisioned' ? 'bg-red-500' :
                            s.memory.verdict === 'over-provisioned' ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, s.memory.pct)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2 mt-1">
                    <p className="text-xs text-muted-foreground">{s.recommendation}</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

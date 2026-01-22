import { useState, useMemo } from 'react'
import { Cpu, Box, ChevronRight, AlertTriangle, CheckCircle, Loader2, Search } from 'lucide-react'
import { useGPUNodes, useAllPods, useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'

interface GPUWorkloadsProps {
  config?: Record<string, unknown>
}

type SortByOption = 'status' | 'name' | 'namespace' | 'cluster'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'cluster' as const, label: 'Cluster' },
]

// Check if any container in the pod requests GPUs
function hasGPUResourceRequest(containers?: { gpuRequested?: number }[]): boolean {
  if (!containers) return false
  return containers.some(c => (c.gpuRequested ?? 0) > 0)
}

// Normalize cluster name for matching (handle kubeconfig/xxx format)
function normalizeClusterName(cluster: string): string {
  if (!cluster) return ''
  // If it's a path like "kubeconfig/cluster-name", extract just the cluster name
  const parts = cluster.split('/')
  return parts[parts.length - 1] || cluster
}


export function GPUWorkloads({ config: _config }: GPUWorkloadsProps) {
  const {
    nodes: gpuNodes,
    isLoading: gpuLoading,
    isRefreshing: gpuRefreshing,
    refetch: refetchGPU,
    isFailed: gpuFailed,
    consecutiveFailures: gpuFailures,
    lastRefresh: gpuLastRefresh
  } = useGPUNodes()
  const { pods: allPods, isLoading: podsLoading, refetch: refetchPods } = useAllPods()
  useClusters() // Keep hook for cache warming
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToPod } = useDrillDownActions()

  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')

  // Only show loading when no cached data exists
  const isLoading = (gpuLoading && gpuNodes.length === 0) || (podsLoading && allPods.length === 0)
  const isRefreshing = gpuRefreshing

  // Filter pods that are actual GPU workloads
  // Only show pods that explicitly request GPU resources - this is the most accurate indicator
  const gpuWorkloads = useMemo(() => {
    let filtered = allPods.filter(pod => {
      // Must have a cluster
      if (!pod.cluster) return false

      // Primary check: does the pod explicitly request GPU resources?
      // This is the only reliable indicator of an actual GPU workload
      if (hasGPUResourceRequest(pod.containers)) return true

      // Secondary check: specific GPU workload labels (not just affinity)
      // Look for labels that explicitly indicate this is a GPU/ML workload
      if (pod.labels) {
        const gpuWorkloadLabels = [
          'nvidia.com/gpu.workload',
          'app.kubernetes.io/component=gpu',
          'ml.intel.com/workload',
        ]
        for (const [key, value] of Object.entries(pod.labels)) {
          // Check for specific GPU workload indicators
          if (gpuWorkloadLabels.some(l => key.includes(l))) return true
          // Check for vLLM, LLM inference workloads by app label
          if (key === 'app' && /vllm|llm|inference|model/i.test(value)) return true
        }
      }

      return false
    })

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      filtered = filtered.filter(pod => {
        const normalizedPodCluster = normalizeClusterName(pod.cluster || '')
        return selectedClusters.some(c => {
          const normalizedSelectedCluster = normalizeClusterName(c)
          // Exact match after normalization
          return normalizedPodCluster === normalizedSelectedCluster
        })
      })
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      filtered = filtered.filter(pod =>
        pod.name.toLowerCase().includes(query) ||
        (pod.namespace?.toLowerCase() || '').includes(query) ||
        (pod.cluster?.toLowerCase() || '').includes(query) ||
        (pod.node?.toLowerCase() || '').includes(query)
      )
    }

    return filtered
  }, [allPods, gpuNodes, selectedClusters, isAllClustersSelected, localSearch])

  // Sort workloads
  const sortedWorkloads = useMemo(() => {
    const statusOrder: Record<string, number> = {
      CrashLoopBackOff: 0,
      Error: 1,
      ImagePullBackOff: 2,
      Pending: 3,
      Running: 4,
      Succeeded: 5,
      Completed: 6,
    }

    const sorted = [...gpuWorkloads].sort((a, b) => {
      let result = 0
      if (sortBy === 'status') {
        result = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
      } else if (sortBy === 'name') {
        result = a.name.localeCompare(b.name)
      } else if (sortBy === 'namespace') {
        result = (a.namespace || '').localeCompare(b.namespace || '')
      } else if (sortBy === 'cluster') {
        result = (a.cluster || '').localeCompare(b.cluster || '')
      }
      return sortDirection === 'asc' ? result : -result
    })
    return sorted
  }, [gpuWorkloads, sortBy, sortDirection])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: displayWorkloads,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(sortedWorkloads, effectivePerPage)

  const handleRefresh = () => {
    refetchGPU()
    refetchPods()
  }

  const handlePodClick = (pod: typeof allPods[0]) => {
    drillToPod(pod.cluster || '', pod.namespace || '', pod.name)
  }

  // Get status icon and color
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'Running':
        return { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' }
      case 'Succeeded':
      case 'Completed':
        return { icon: CheckCircle, color: 'text-blue-400', bg: 'bg-blue-500/20' }
      case 'Pending':
        return { icon: Loader2, color: 'text-yellow-400', bg: 'bg-yellow-500/20' }
      default:
        return { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20' }
    }
  }

  // Count summary
  const summary = useMemo(() => {
    const running = gpuWorkloads.filter(p => p.status === 'Running').length
    const pending = gpuWorkloads.filter(p => p.status === 'Pending').length
    const failed = gpuWorkloads.filter(p => ['CrashLoopBackOff', 'Error', 'ImagePullBackOff'].includes(p.status)).length
    return { running, pending, failed, total: gpuWorkloads.length }
  }, [gpuWorkloads])

  if (isLoading && gpuWorkloads.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-3">
          <Skeleton variant="text" width={100} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} variant="rounded" height={50} />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} variant="rounded" height={70} />
          ))}
        </div>
      </div>
    )
  }

  if (gpuNodes.length === 0) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-muted-foreground">GPU Workloads</span>
          </div>
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={gpuFailed}
            consecutiveFailures={gpuFailures}
            lastRefresh={gpuLastRefresh}
            onRefresh={handleRefresh}
          />
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-muted-foreground">GPU Workloads</span>
          {summary.failed > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              {summary.failed} failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={gpuFailed}
            consecutiveFailures={gpuFailures}
            lastRefresh={gpuLastRefresh}
            onRefresh={handleRefresh}
          />
        </div>
      </div>

      {/* Local search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search workloads..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-secondary/30 text-center" title={`${summary.total} total GPU workloads`}>
          <p className="text-lg font-bold text-foreground">{summary.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center" title={`${summary.running} running`}>
          <p className="text-lg font-bold text-green-400">{summary.running}</p>
          <p className="text-xs text-muted-foreground">Running</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center" title={`${summary.pending} pending`}>
          <p className="text-lg font-bold text-yellow-400">{summary.pending}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center" title={`${summary.failed} failed`}>
          <p className="text-lg font-bold text-red-400">{summary.failed}</p>
          <p className="text-xs text-muted-foreground">Failed</p>
        </div>
      </div>

      {/* Workload list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {displayWorkloads.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No GPU workloads found
          </div>
        ) : (
          displayWorkloads.map((pod) => {
            const statusDisplay = getStatusDisplay(pod.status)
            const clusterName = pod.cluster?.split('/').pop() || pod.cluster || 'unknown'

            return (
              <div
                key={`${pod.cluster}-${pod.namespace}-${pod.name}`}
                onClick={() => handlePodClick(pod)}
                className="p-3 rounded-lg bg-secondary/30 border border-border/50 cursor-pointer hover:bg-secondary/50 hover:border-border transition-colors group"
                title={`Click to view details for ${pod.name}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <ClusterBadge cluster={clusterName} size="sm" />
                      <span className={`px-1.5 py-0.5 rounded text-xs ${statusDisplay.bg} ${statusDisplay.color}`}>
                        {pod.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Box className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">{pod.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span title={`Namespace: ${pod.namespace}`}>{pod.namespace}</span>
                      {pod.node && (
                        <>
                          <span className="text-border">|</span>
                          <span title={`Node: ${pod.node}`}>{pod.node}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

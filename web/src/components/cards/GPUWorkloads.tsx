import { useMemo } from 'react'
import { Cpu, Box, ChevronRight, AlertTriangle, CheckCircle, Loader2, Search, Filter, ChevronDown, Server } from 'lucide-react'
import { useGPUNodes, useAllPods, useClusters } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { Skeleton } from '../ui/Skeleton'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import type { PodInfo } from '../../hooks/useMCP'

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

const STATUS_ORDER: Record<string, number> = {
  CrashLoopBackOff: 0,
  Error: 1,
  ImagePullBackOff: 2,
  Pending: 3,
  Running: 4,
  Succeeded: 5,
  Completed: 6,
}

const GPU_SORT_COMPARATORS: Record<SortByOption, (a: PodInfo, b: PodInfo) => number> = {
  status: commonComparators.statusOrder<PodInfo>('status', STATUS_ORDER),
  name: commonComparators.string<PodInfo>('name'),
  namespace: commonComparators.string<PodInfo>('namespace'),
  cluster: commonComparators.string<PodInfo>('cluster'),
}

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
  } = useGPUNodes()
  const { pods: allPods, isLoading: podsLoading } = useAllPods()
  useClusters() // Keep hook for cache warming
  const { drillToPod } = useDrillDownActions()

  // Only show loading when no cached data exists
  const isLoading = (gpuLoading && gpuNodes.length === 0) || (podsLoading && allPods.length === 0)

  // Pre-filter pods to only GPU workloads (domain-specific logic before hook)
  // Show pods that: 1) request GPU resources, 2) are assigned to GPU nodes, or 3) have GPU workload labels
  const gpuWorkloadSource = useMemo(() => {
    // Create a map of cluster+node combinations for fast lookup
    // Format: "cluster:nodename" -> true
    const gpuNodeKeys = new Set(
      gpuNodes.map(node => `${normalizeClusterName(node.cluster || '')}:${node.name}`)
    )

    return allPods.filter(pod => {
      // Must have a cluster
      if (!pod.cluster) return false

      // Primary check: does the pod explicitly request GPU resources?
      // This is the most accurate indicator of an actual GPU workload
      if (hasGPUResourceRequest(pod.containers)) return true

      // Secondary check: is the pod assigned to a GPU node?
      // Why check both GPU resource requests AND node assignment?
      // - GPU resource requests: Catches pods that explicitly declare GPU usage in their spec
      // - Node assignment: Catches pods using nodeSelector, nodeAffinity, or taints/tolerations
      //   to target GPU nodes without explicitly requesting GPU resources in their limits/requests.
      //   This is common in deployments where GPU scheduling is handled externally or through
      //   custom operators that don't set standard GPU resource requests.
      if (pod.node) {
        const podKey = `${normalizeClusterName(pod.cluster)}:${pod.node}`
        if (gpuNodeKeys.has(podKey)) return true
      }

      // Tertiary check: specific GPU workload labels (not just affinity)
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
  }, [allPods, gpuNodes])

  // Use unified card data hook for filtering, sorting, and pagination
  const {
    items: displayWorkloads,
    totalItems,
    currentPage,
    totalPages,
    goToPage,
    needsPagination,
    itemsPerPage,
    setItemsPerPage,
    filters,
    sorting,
  } = useCardData<PodInfo, SortByOption>(gpuWorkloadSource, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'node'] as (keyof PodInfo)[],
      clusterField: 'cluster' as keyof PodInfo,
      storageKey: 'gpu-workloads',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: GPU_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

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

  // Count summary (uses totalItems from hook which reflects filtered count)
  const summary = useMemo(() => {
    const running = gpuWorkloadSource.filter(p => p.status === 'Running').length
    const pending = gpuWorkloadSource.filter(p => p.status === 'Pending').length
    const failed = gpuWorkloadSource.filter(p => ['CrashLoopBackOff', 'Error', 'ImagePullBackOff'].includes(p.status)).length
    return { running, pending, failed, total: gpuWorkloadSource.length }
  }, [gpuWorkloadSource])

  if (isLoading && gpuWorkloadSource.length === 0) {
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
      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        {summary.failed > 0 ? (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
            {summary.failed} failed
          </span>
        ) : <div />}
        <div className="flex items-center gap-2">
          {/* Cluster count indicator */}
          {filters.localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {filters.localClusterFilter.length}/{filters.availableClusters.length}
            </span>
          )}

          {/* Cluster filter dropdown */}
          {filters.availableClusters.length >= 1 && (
            <div ref={filters.clusterFilterRef} className="relative">
              <button
                onClick={() => filters.setShowClusterFilter(!filters.showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  filters.localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>

              {filters.showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button
                      onClick={filters.clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        filters.localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {filters.availableClusters.map(cluster => (
                      <button
                        key={cluster.name}
                        onClick={() => filters.toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                          filters.localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
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

          <CardControls
            limit={itemsPerPage}
            onLimitChange={setItemsPerPage}
            sortBy={sorting.sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={sorting.setSortBy}
            sortDirection={sorting.sortDirection}
            onSortDirectionChange={sorting.setSortDirection}
          />
        </div>
      </div>

      {/* Local search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => filters.setSearch(e.target.value)}
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
      {needsPagination && itemsPerPage !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

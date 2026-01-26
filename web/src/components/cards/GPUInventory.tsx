import { useState, useMemo } from 'react'
import { Cpu, Server, Search, ChevronRight, Filter, ChevronDown } from 'lucide-react'
import { useGPUNodes } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'
import { useChartFilters } from '../../lib/cards'

interface GPUInventoryProps {
  config?: Record<string, unknown>
}

type SortByOption = 'utilization' | 'name' | 'cluster' | 'gpuType'

const SORT_OPTIONS = [
  { value: 'utilization' as const, label: 'Utilization' },
  { value: 'name' as const, label: 'Name' },
  { value: 'cluster' as const, label: 'Cluster' },
  { value: 'gpuType' as const, label: 'GPU Type' },
]

export function GPUInventory({ config }: GPUInventoryProps) {
  const cluster = config?.cluster as string | undefined
  const {
    nodes: rawNodes,
    isLoading: hookLoading,
    isRefreshing,
    error,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = useGPUNodes(cluster)
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToGPUNode } = useDrillDownActions()

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({
    storageKey: 'gpu-inventory',
  })

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && rawNodes.length === 0

  const [sortBy, setSortBy] = useState<SortByOption>('utilization')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')

  // Filter nodes by global cluster selection, local cluster filter, and local search
  const filteredNodes = useMemo(() => {
    let result = rawNodes

    if (!isAllClustersSelected) {
      result = result.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
    }

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(n => localClusterFilter.some(c => n.cluster.startsWith(c)))
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(n =>
        n.name.toLowerCase().includes(query) ||
        n.cluster.toLowerCase().includes(query) ||
        n.gpuType.toLowerCase().includes(query)
      )
    }

    return result
  }, [rawNodes, selectedClusters, isAllClustersSelected, localClusterFilter, localSearch])

  // Sort nodes
  const sortedNodes = useMemo(() => {
    return [...filteredNodes].sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'utilization':
          compare = (a.gpuAllocated / a.gpuCount) - (b.gpuAllocated / b.gpuCount)
          break
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'cluster':
          compare = a.cluster.localeCompare(b.cluster)
          break
        case 'gpuType':
          compare = a.gpuType.localeCompare(b.gpuType)
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })
  }, [filteredNodes, sortBy, sortDirection])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: nodes,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(sortedNodes, effectivePerPage)

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-3">
          <Skeleton variant="text" width={100} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[1, 2, 3].map(i => (
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

  const totalGPUs = filteredNodes.reduce((sum, n) => sum + n.gpuCount, 0)
  const allocatedGPUs = filteredNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
  const availableGPUs = totalGPUs - allocatedGPUs

  if (filteredNodes.length === 0) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex items-center justify-end mb-3">
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={() => refetch()}
          />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <Cpu className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">No GPU Nodes</p>
          <p className="text-sm text-muted-foreground">No GPU resources detected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
            {totalGPUs} GPUs
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster count indicator */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}

          {/* Cluster filter dropdown */}
          {availableClusters.length >= 1 && (
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
                <ChevronDown className="w-3 h-3" />
              </button>

              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button
                      onClick={clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {availableClusters.map(cluster => (
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
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={() => refetch()}
          />
        </div>
      </div>

      {/* Local Search */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search GPU nodes..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-foreground">{totalGPUs}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-purple-400">{allocatedGPUs}</p>
          <p className="text-xs text-muted-foreground">In Use</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-green-400">{availableGPUs}</p>
          <p className="text-xs text-muted-foreground">Available</p>
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {nodes.map((node) => (
          <div
            key={`${node.cluster}-${node.name}`}
            onClick={() => drillToGPUNode(node.cluster, node.name, {
              gpuType: node.gpuType,
              gpuCount: node.gpuCount,
              gpuAllocated: node.gpuAllocated,
              utilization: (node.gpuAllocated / node.gpuCount) * 100,
            })}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2 mb-2 min-w-0">
              <Server className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground truncate min-w-0 flex-1 group-hover:text-purple-400">{node.name}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center justify-between text-xs gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <ClusterBadge cluster={node.cluster} size="sm" />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-purple-400 truncate max-w-[80px]">{node.gpuType}</span>
                <span className="font-mono shrink-0 whitespace-nowrap">
                  {node.gpuAllocated}/{node.gpuCount}
                </span>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${(node.gpuAllocated / node.gpuCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
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

      {error && (
        <div className="mt-2 text-xs text-yellow-400">Using simulated data</div>
      )}
    </div>
  )
}

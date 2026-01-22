import { useState, useMemo } from 'react'
import { Cpu, Server, Search } from 'lucide-react'
import { useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'

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

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && rawNodes.length === 0

  const [sortBy, setSortBy] = useState<SortByOption>('utilization')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')

  // Filter nodes by global cluster selection and local search
  const filteredNodes = useMemo(() => {
    let result = rawNodes

    if (!isAllClustersSelected) {
      result = result.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
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
  }, [rawNodes, selectedClusters, isAllClustersSelected, localSearch])

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
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">GPU Inventory</span>
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
    <div className="h-full flex flex-col content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-muted-foreground">GPU Inventory</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
            {totalGPUs} GPUs
          </span>
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
            className="p-3 rounded-lg bg-secondary/30"
          >
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground truncate">{node.name}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <ClusterBadge cluster={node.cluster} size="sm" />
              <div className="flex items-center gap-2">
                <span className="text-purple-400">{node.gpuType}</span>
                <span className="font-mono">
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

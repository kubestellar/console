import { useState, useMemo } from 'react'
import { Activity, ChevronRight, Filter, ChevronDown, Server } from 'lucide-react'
import { useGPUNodes } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'
import { useChartFilters } from '../../lib/cards'

interface GPUStatusProps {
  config?: Record<string, unknown>
}

type SortByOption = 'utilization' | 'cluster' | 'gpuCount'

const SORT_OPTIONS = [
  { value: 'utilization' as const, label: 'Utilization' },
  { value: 'cluster' as const, label: 'Cluster' },
  { value: 'gpuCount' as const, label: 'GPU Count' },
]

export function GPUStatus({ config }: GPUStatusProps) {
  const cluster = config?.cluster as string | undefined
  const {
    nodes: rawNodes,
    isLoading: hookLoading,
    isRefreshing,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = useGPUNodes(cluster)
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToCluster } = useDrillDownActions()

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
    storageKey: 'gpu-status',
  })

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && rawNodes.length === 0

  const [sortBy, setSortBy] = useState<SortByOption>('utilization')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [selectedGpuType, setSelectedGpuType] = useState<string>('all')

  // Get all unique GPU types for filter dropdown
  const gpuTypes = useMemo(() => {
    const types = new Set<string>()
    rawNodes.forEach(n => types.add(n.gpuType))
    return Array.from(types).sort()
  }, [rawNodes])

  // Filter nodes by global cluster selection, local filter, and GPU type
  const filteredNodes = useMemo(() => {
    let result = rawNodes
    if (!isAllClustersSelected) {
      result = result.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(n => localClusterFilter.some(c => n.cluster.startsWith(c)))
    }
    if (selectedGpuType !== 'all') {
      result = result.filter(n => n.gpuType.toLowerCase().includes(selectedGpuType.toLowerCase()))
    }
    return result
  }, [rawNodes, selectedClusters, isAllClustersSelected, selectedGpuType, localClusterFilter])

  // Calculate cluster-level stats from filtered nodes
  const clusterStatsList = useMemo(() => {
    const clusterStats = filteredNodes.reduce((acc, node) => {
      if (!acc[node.cluster]) {
        acc[node.cluster] = { total: 0, used: 0, types: new Set<string>() }
      }
      acc[node.cluster].total += node.gpuCount
      acc[node.cluster].used += node.gpuAllocated
      acc[node.cluster].types.add(node.gpuType)
      return acc
    }, {} as Record<string, { total: number; used: number; types: Set<string> }>)

    // Convert to array for sorting and pagination
    const list = Object.entries(clusterStats).map(([clusterName, stats]) => ({
      clusterName,
      total: stats.total,
      used: stats.used,
      types: Array.from(stats.types),
      utilization: stats.total > 0 ? (stats.used / stats.total) * 100 : 0,
    }))

    // Sort
    return list.sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'utilization':
          compare = a.utilization - b.utilization
          break
        case 'cluster':
          compare = a.clusterName.localeCompare(b.clusterName)
          break
        case 'gpuCount':
          compare = a.total - b.total
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })
  }, [filteredNodes, sortBy, sortDirection])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: displayStats,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(clusterStatsList, effectivePerPage)

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-3">
          <Skeleton variant="text" width={100} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} variant="rounded" height={80} />
          ))}
        </div>
      </div>
    )
  }

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
            <Activity className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">No GPU Data</p>
          <p className="text-sm text-muted-foreground">GPU metrics not available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
            {totalItems} clusters
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

      {/* GPU Type Filter */}
      {gpuTypes.length > 1 && (
        <select
          value={selectedGpuType}
          onChange={(e) => setSelectedGpuType(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground mb-3"
        >
          <option value="all">All GPU Types</option>
          {gpuTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      )}

      {/* Cluster GPU status */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {displayStats.map((stats) => (
          <div
            key={stats.clusterName}
            onClick={() => drillToCluster(stats.clusterName, {
              gpuTypes: stats.types,
              totalGPUs: stats.total,
              usedGPUs: stats.used,
              gpuUtilization: stats.utilization,
            })}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2 gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <ClusterBadge cluster={stats.clusterName} size="sm" />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                  stats.utilization > 80 ? 'bg-red-500/20 text-red-400' :
                  stats.utilization > 50 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {stats.utilization.toFixed(0)}% used
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 gap-2 min-w-0">
              <span className="truncate min-w-0 flex-1">{stats.types.join(', ')}</span>
              <span className="shrink-0">{stats.used}/{stats.total} GPUs</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  stats.utilization > 80 ? 'bg-red-500' :
                  stats.utilization > 50 ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${stats.utilization}%` }}
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
    </div>
  )
}

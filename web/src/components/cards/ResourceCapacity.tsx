import { useState, useMemo } from 'react'
import { Cpu, HardDrive, Zap, Loader2, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters, useGPUNodes, GPUNode } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useChartFilters } from '../../lib/cards'

interface ResourceCapacityProps {
  config?: Record<string, unknown>
}

interface ResourceItem {
  id: string
  icon: 'cpu' | 'memory' | 'gpu'
  label: string
  requested: number
  capacity: number
  unit: string
  color: 'blue' | 'purple' | 'yellow'
  format?: (v: number) => string
}

type SortByOption = 'name' | 'requested' | 'percent'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'requested' as const, label: 'Requested' },
  { value: 'percent' as const, label: 'Usage %' },
]

export function ResourceCapacity({ config: _config }: ResourceCapacityProps) {
  const { clusters: allClusters, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { drillToResources } = useDrillDownActions()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
  } = useGlobalFilters()

  const [sortBy, setSortBy] = useState<SortByOption>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(10)

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
    storageKey: 'resource-capacity',
  })

  // Filter clusters by global selection first, then apply local filter
  const clusters = useMemo(() => {
    let result = allClusters
    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(c => localClusterFilter.includes(c.name))
    }
    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, localClusterFilter])

  // Filter GPU nodes by selection
  const filteredGPUNodes = useMemo(() => {
    let result = gpuNodes
    if (!isAllClustersSelected) {
      result = result.filter(n => globalSelectedClusters.includes(n.cluster))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(n => localClusterFilter.includes(n.cluster))
    }
    return result
  }, [gpuNodes, globalSelectedClusters, isAllClustersSelected, localClusterFilter])

  // Calculate real totals from cluster data
  const totals = useMemo(() => {
    const clusterTotals = clusters.reduce(
      (acc, c) => ({
        nodes: acc.nodes + (c.nodeCount || 0),
        pods: acc.pods + (c.podCount || 0),
        cpuCores: acc.cpuCores + (c.cpuCores || 0),
        cpuRequestsCores: acc.cpuRequestsCores + (c.cpuRequestsCores || 0),
        memoryGB: acc.memoryGB + (c.memoryGB || 0),
        memoryRequestsGB: acc.memoryRequestsGB + (c.memoryRequestsGB || 0),
        storageGB: acc.storageGB + (c.storageGB || 0),
        pvcCount: acc.pvcCount + (c.pvcCount || 0),
      }),
      { nodes: 0, pods: 0, cpuCores: 0, cpuRequestsCores: 0, memoryGB: 0, memoryRequestsGB: 0, storageGB: 0, pvcCount: 0 }
    )

    // Calculate GPU totals from GPU nodes
    const gpuTotals = filteredGPUNodes.reduce(
      (acc: { totalGPUs: number; allocatedGPUs: number; gpuMemoryGB: number }, n: GPUNode) => ({
        totalGPUs: acc.totalGPUs + (n.gpuCount || 0),
        allocatedGPUs: acc.allocatedGPUs + (n.gpuAllocated || 0),
        gpuMemoryGB: acc.gpuMemoryGB + ((n.gpuMemoryMB || 0) / 1024),
      }),
      { totalGPUs: 0, allocatedGPUs: 0, gpuMemoryGB: 0 }
    )

    return { ...clusterTotals, ...gpuTotals }
  }, [clusters, filteredGPUNodes])

  // Estimate pod capacity (110 pods per node is the default Kubernetes limit)
  const podCapacity = totals.nodes * 110

  // Build resource items list
  const resourceItems = useMemo(() => {
    const formatBytes = (v: number) => v >= 1024 ? `${(v / 1024).toFixed(1)} TB` : `${Math.round(v)} GB`

    const items: ResourceItem[] = [
      {
        id: 'cpu',
        icon: 'cpu',
        label: 'CPU',
        requested: totals.cpuRequestsCores,
        capacity: totals.cpuCores,
        unit: 'cores',
        color: 'blue',
      },
      {
        id: 'memory',
        icon: 'memory',
        label: 'Memory',
        requested: totals.memoryRequestsGB,
        capacity: totals.memoryGB,
        unit: 'GB',
        color: 'purple',
        format: formatBytes,
      },
    ]

    // Add GPU if available
    if (totals.totalGPUs > 0) {
      items.splice(2, 0, {
        id: 'gpu',
        icon: 'gpu',
        label: 'GPUs',
        requested: totals.allocatedGPUs,
        capacity: totals.totalGPUs,
        unit: 'GPUs',
        color: 'yellow',
      })
    }

    // Sort items
    const sorted = [...items].sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'name':
          compare = a.label.localeCompare(b.label)
          break
        case 'requested':
          compare = a.requested - b.requested
          break
        case 'percent':
          const pctA = a.capacity > 0 ? (a.requested / a.capacity) * 100 : 0
          const pctB = b.capacity > 0 ? (b.requested / b.capacity) * 100 : 0
          compare = pctA - pctB
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })

    return sorted
  }, [totals, podCapacity, sortBy, sortDirection])

  // Pagination
  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const pagination = usePagination(resourceItems, effectivePerPage)

  // Check if we have real data
  const hasRealData = totals.cpuCores > 0 || totals.memoryGB > 0 || totals.nodes > 0

  if (isLoading && clusters.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={28} height={28} />
        </div>
        <div className="flex-1 space-y-3">
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
        </div>
      </div>
    )
  }

  const getIcon = (type: ResourceItem['icon']) => {
    switch (type) {
      case 'cpu': return <Cpu className="w-4 h-4" />
      case 'memory': return <HardDrive className="w-4 h-4" />
      case 'gpu': return <Zap className="w-4 h-4" />
    }
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isRefreshing && (
            <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
          )}
          {/* Cluster count indicator */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Resource metrics */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {hasRealData ? (
          pagination.paginatedItems.map((item) => {
            const percentage = item.capacity > 0 ? Math.round((item.requested / item.capacity) * 100) : 0
            const colorClasses: Record<string, string> = {
              blue: 'bg-blue-500',
              purple: 'bg-purple-500',
              green: 'bg-green-500',
              yellow: 'bg-yellow-500',
              orange: 'bg-orange-500',
            }
            const textClasses: Record<string, string> = {
              blue: 'text-blue-400',
              purple: 'text-purple-400',
              green: 'text-green-400',
              yellow: 'text-yellow-400',
              orange: 'text-orange-400',
            }

            const formatValue = (v: number) => {
              if (item.format) return item.format(v)
              return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${item.unit}`
            }

            return (
              <div key={item.id} className="p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={textClasses[item.color]}>{getIcon(item.icon)}</span>
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatValue(item.requested)} / {formatValue(item.capacity)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colorClasses[item.color]} transition-all duration-300 rounded-full`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs w-10 text-right ${percentage > 80 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {percentage}%
                  </span>
                </div>
              </div>
            )
          })
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm py-8">
            <p>Waiting for cluster metrics...</p>
            <p className="text-xs mt-1">Connect to clusters to see capacity</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            itemsPerPage={pagination.itemsPerPage}
            onPageChange={pagination.goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}

      {/* Summary */}
      {/* Summary footer */}
      <div
        className={`mt-3 pt-3 border-t border-border/50 grid ${totals.totalGPUs > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-2 text-center cursor-pointer hover:bg-secondary/30 rounded-lg transition-colors`}
        onClick={() => drillToResources()}
      >
        <div>
          <p className="text-xl font-bold text-foreground">{clusters.length}</p>
          <p className="text-xs text-muted-foreground">Clusters</p>
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{totals.nodes}</p>
          <p className="text-xs text-muted-foreground">Nodes</p>
        </div>
        <div>
          <p className="text-xl font-bold text-green-400">{totals.pods.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Pods</p>
        </div>
        {totals.totalGPUs > 0 && (
          <div>
            <p className="text-xl font-bold text-yellow-400">{totals.totalGPUs}</p>
            <p className="text-xs text-muted-foreground">GPUs</p>
          </div>
        )}
      </div>
    </div>
  )
}

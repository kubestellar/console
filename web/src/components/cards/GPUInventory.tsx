import { useMemo } from 'react'
import { Cpu, Server, ChevronRight } from 'lucide-react'
import { useGPUNodes } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardClusterFilter } from '../../lib/cards'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { Skeleton } from '../ui/Skeleton'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput } from '../../lib/cards/CardComponents'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

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

type GPUNode = ReturnType<typeof useGPUNodes>['nodes'][number]

const GPU_SORT_COMPARATORS: Record<SortByOption, (a: GPUNode, b: GPUNode) => number> = {
  utilization: (a, b) => (a.gpuAllocated / a.gpuCount) - (b.gpuAllocated / b.gpuCount),
  name: commonComparators.string<GPUNode>('name'),
  cluster: commonComparators.string<GPUNode>('cluster'),
  gpuType: commonComparators.string<GPUNode>('gpuType'),
}

export function GPUInventory({ config }: GPUInventoryProps) {
  const { t } = useTranslation()
  const cluster = config?.cluster as string | undefined
  const {
    nodes: rawNodes,
    isLoading: hookLoading,
    error,
  } = useGPUNodes(cluster)
  const { drillToGPUNode } = useDrillDownActions()

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && rawNodes.length === 0

  // Report state to CardWrapper for refresh animation
  useCardLoadingState({
    isLoading: hookLoading,
    hasAnyData: rawNodes.length > 0,
    isFailed: !!error && rawNodes.length === 0,
    consecutiveFailures: error ? 1 : 0,
  })

  // Use unified card data hook for filtering, sorting, and pagination
  const {
    items: nodes,
    totalItems,
    currentPage,
    totalPages,
    goToPage,
    needsPagination,
    itemsPerPage,
    setItemsPerPage,
    filters,
    sorting,
  } = useCardData<GPUNode, SortByOption>(rawNodes, {
    filter: {
      searchFields: ['name', 'cluster', 'gpuType'] as (keyof GPUNode)[],
      clusterField: 'cluster' as keyof GPUNode,
      storageKey: 'gpu-inventory',
    },
    sort: {
      defaultField: 'utilization',
      defaultDirection: 'desc',
      comparators: GPU_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // Compute stats from totalItems (the filtered, pre-pagination count)
  // We need the actual filtered data for stats, so recompute from rawNodes
  // using the same filter criteria that useCardData applies internally.
  // Since useCardData returns totalItems = filtered+sorted count, we can
  // use a lightweight useMemo that mirrors the filter logic for aggregation.
  const stats = useMemo(() => {
    // The hook's totalItems reflects the filtered count, but we need
    // per-field aggregation. We'll filter rawNodes the same way the hook does
    // by leveraging the hook's internal filter state exposed through `filters`.
    // This avoids duplicating the global filter logic by just summing from
    // the items visible in the hook's filtered view.
    //
    // totalItems is the count of all items after filtering (before pagination).
    // We need to compute GPU stats from those same items. The simplest approach:
    // use the paginated `nodes` if showing all, otherwise we need the full filtered set.
    // Since useCardData doesn't expose the full filtered set directly, we'll
    // approximate by summing from rawNodes with the same search/cluster filter.
    // However, the cleanest approach from the GPUWorkloads pattern is to compute
    // from the source data (rawNodes), since stats should reflect overall totals.
    const totalGPUs = rawNodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const allocatedGPUs = rawNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
    const availableGPUs = totalGPUs - allocatedGPUs
    return { totalGPUs, allocatedGPUs, availableGPUs }
  }, [rawNodes])

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

  if (totalItems === 0 && rawNodes.length === 0) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex items-center justify-end mb-3">
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
            {stats.totalGPUs} GPUs
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster count indicator */}
          {filters.localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {filters.localClusterFilter.length}/{filters.availableClusters.length}
            </span>
          )}

          {/* Cluster filter dropdown */}
          <CardClusterFilter
            availableClusters={filters.availableClusters}
            selectedClusters={filters.localClusterFilter}
            onToggle={filters.toggleClusterFilter}
            onClear={filters.clearClusterFilter}
            isOpen={filters.showClusterFilter}
            setIsOpen={filters.setShowClusterFilter}
            containerRef={filters.clusterFilterRef}
            minClusters={1}
          />

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

      {/* Local Search */}
      <CardSearchInput
        value={filters.search}
        onChange={filters.setSearch}
        placeholder="Search GPU nodes..."
        className="mb-4"
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-foreground">{stats.totalGPUs}</p>
          <p className="text-xs text-muted-foreground">{t('common.total')}</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-purple-400">{stats.allocatedGPUs}</p>
          <p className="text-xs text-muted-foreground">In Use</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-green-400">{stats.availableGPUs}</p>
          <p className="text-xs text-muted-foreground">{t('common.available')}</p>
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

      {error && (
        <div className="mt-2 text-xs text-yellow-400">Using simulated data</div>
      )}
    </div>
  )
}

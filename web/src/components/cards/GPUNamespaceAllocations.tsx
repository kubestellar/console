import { useMemo } from 'react'
import { Box, ChevronRight, Server } from 'lucide-react'
import { useGPUNodes, useAllPods } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardClusterFilter, CardSearchInput } from '../../lib/cards'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { Skeleton } from '../ui/Skeleton'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

interface GPUNamespaceAllocationsProps {
  config?: Record<string, unknown>
}

type SortByOption = 'gpuCount' | 'namespace' | 'podCount'

const SORT_OPTIONS = [
  { value: 'gpuCount' as const, label: 'GPUs' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'podCount' as const, label: 'Pods' },
]

interface NamespaceGPUAllocation {
  namespace: string
  gpuRequested: number
  podCount: number
  clusters: string[]
}

// Check if any container in the pod requests GPUs
function hasGPUResourceRequest(containers?: { gpuRequested?: number }[]): boolean {
  if (!containers) return false
  return containers.some(c => (c.gpuRequested ?? 0) > 0)
}

// Normalize cluster name for matching
function normalizeClusterName(cluster: string): string {
  if (!cluster) return ''
  const parts = cluster.split('/')
  return parts[parts.length - 1] || cluster
}

const NAMESPACE_SORT_COMPARATORS: Record<SortByOption, (a: NamespaceGPUAllocation, b: NamespaceGPUAllocation) => number> = {
  gpuCount: (a, b) => a.gpuRequested - b.gpuRequested,
  namespace: commonComparators.string<NamespaceGPUAllocation>('namespace'),
  podCount: (a, b) => a.podCount - b.podCount,
}

export function GPUNamespaceAllocations({ config: _config }: GPUNamespaceAllocationsProps) {
  const { t } = useTranslation()
  const { nodes: gpuNodes, isLoading: gpuLoading } = useGPUNodes()
  const { pods: allPods, isLoading: podsLoading } = useAllPods()
  const { drillToGPUNamespace } = useDrillDownActions()

  const isLoading = (gpuLoading && gpuNodes.length === 0) || (podsLoading && allPods.length === 0)

  useCardLoadingState({
    isLoading: gpuLoading || podsLoading,
    hasAnyData: gpuNodes.length > 0 || allPods.length > 0,
  })

  // Compute per-namespace GPU allocations
  const namespaceAllocations = useMemo(() => {
    const gpuNodeKeys = new Set(
      gpuNodes.map(node => `${normalizeClusterName(node.cluster || '')}:${node.name}`)
    )

    // Filter to GPU pods
    const gpuPods = allPods.filter(pod => {
      if (!pod.cluster) return false
      if (hasGPUResourceRequest(pod.containers)) return true
      if (pod.node) {
        const podKey = `${normalizeClusterName(pod.cluster)}:${pod.node}`
        if (gpuNodeKeys.has(podKey)) return true
      }
      return false
    })

    // Group by namespace
    const nsMap = new Map<string, { gpuRequested: number; podCount: number; clusters: Set<string> }>()
    for (const pod of gpuPods) {
      const ns = pod.namespace || 'default'
      const existing = nsMap.get(ns) || { gpuRequested: 0, podCount: 0, clusters: new Set<string>() }

      const podGPUs = pod.containers?.reduce((sum, c) => sum + (c.gpuRequested ?? 0), 0) ?? 0
      existing.gpuRequested += podGPUs
      existing.podCount += 1
      if (pod.cluster) existing.clusters.add(pod.cluster)

      nsMap.set(ns, existing)
    }

    return Array.from(nsMap.entries()).map(([namespace, data]) => ({
      namespace,
      gpuRequested: data.gpuRequested,
      podCount: data.podCount,
      clusters: Array.from(data.clusters),
    }))
  }, [allPods, gpuNodes])

  const {
    items: displayItems,
    totalItems,
    currentPage,
    totalPages,
    goToPage,
    needsPagination,
    itemsPerPage,
    setItemsPerPage,
    filters,
    sorting,
  } = useCardData<NamespaceGPUAllocation, SortByOption>(namespaceAllocations, {
    filter: {
      searchFields: ['namespace'] as (keyof NamespaceGPUAllocation)[],
      storageKey: 'gpu-namespace-allocations',
    },
    sort: {
      defaultField: 'gpuCount',
      defaultDirection: 'desc',
      comparators: NAMESPACE_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  const totalGPUs = useMemo(() =>
    namespaceAllocations.reduce((sum, ns) => sum + ns.gpuRequested, 0),
    [namespaceAllocations]
  )

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-3">
          <Skeleton variant="text" width={120} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} variant="rounded" height={60} />
          ))}
        </div>
      </div>
    )
  }

  if (namespaceAllocations.length === 0) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <Box className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">No GPU Workloads</p>
          <p className="text-sm text-muted-foreground">No namespaces with GPU allocations detected</p>
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
            {totalGPUs} GPUs across {namespaceAllocations.length} ns
          </span>
        </div>
        <div className="flex items-center gap-2">
          {filters.localClusterFilter && filters.localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {filters.localClusterFilter.length}/{filters.availableClusters.length}
            </span>
          )}

          {filters.availableClusters && filters.availableClusters.length > 0 && (
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

      {/* Search */}
      <CardSearchInput
        value={filters.search}
        onChange={filters.setSearch}
        placeholder={t('common.searchNamespaces')}
        className="mb-4"
      />

      {/* Namespace list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {displayItems.map((ns) => (
          <div
            key={ns.namespace}
            onClick={() => drillToGPUNamespace(ns.namespace, {
              gpuRequested: ns.gpuRequested,
              podCount: ns.podCount,
              clusters: ns.clusters,
            })}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2 mb-2 min-w-0">
              <Box className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-sm font-medium text-foreground truncate min-w-0 flex-1 group-hover:text-purple-400">
                {ns.namespace}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-2">
                {ns.clusters.slice(0, 2).map(c => (
                  <ClusterBadge key={c} cluster={c} size="sm" />
                ))}
                {ns.clusters.length > 2 && (
                  <span className="text-muted-foreground">+{ns.clusters.length - 2}</span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-muted-foreground">{ns.podCount} pods</span>
                <span className="font-mono text-purple-400 font-medium">{ns.gpuRequested} GPUs</span>
              </div>
            </div>
            {/* Proportion bar */}
            {totalGPUs > 0 && (
              <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${(ns.gpuRequested / totalGPUs) * 100}%` }}
                />
              </div>
            )}
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
    </div>
  )
}

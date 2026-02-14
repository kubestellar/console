import { useState, useMemo } from 'react'
import { Activity, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGPUNodes } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardLoadingState } from './CardDataContext'

interface GPUStatusProps {
  config?: Record<string, unknown>
}

type SortByOption = 'utilization' | 'cluster' | 'gpuCount'

const SORT_OPTIONS = [
  { value: 'utilization' as const, label: 'Utilization' },
  { value: 'cluster' as const, label: 'Cluster' },
  { value: 'gpuCount' as const, label: 'GPU Count' },
]

interface ClusterGPUStats {
  clusterName: string
  total: number
  used: number
  types: string[]
  utilization: number
}

export function GPUStatus({ config }: GPUStatusProps) {
  const { t } = useTranslation('common')
  const cluster = config?.cluster as string | undefined
  const {
    nodes: rawNodes,
    isLoading: hookLoading,
  } = useGPUNodes(cluster)
  const { drillToCluster } = useDrillDownActions()

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: hookLoading,
    hasAnyData: rawNodes.length > 0,
  })

  // Card-specific GPU type filter (not handled by useCardData)
  const [selectedGpuType, setSelectedGpuType] = useState<string>('all')

  // Get all unique GPU types for filter dropdown
  const gpuTypes = useMemo(() => {
    const types = new Set<string>()
    rawNodes.forEach(n => types.add(n.gpuType))
    return Array.from(types).sort()
  }, [rawNodes])

  // Step 1: Pre-filter nodes by GPU type (card-specific filter)
  const preFilteredNodes = useMemo(() => {
    if (selectedGpuType === 'all') return rawNodes
    return rawNodes.filter(n => n.gpuType.toLowerCase().includes(selectedGpuType.toLowerCase()))
  }, [rawNodes, selectedGpuType])

  // Step 2: Aggregate to cluster-level stats
  // Don't apply cluster/search filters here - useCardData handles that
  const clusterStatsList = useMemo(() => {
    const clusterStats = preFilteredNodes.reduce((acc, node) => {
      if (!acc[node.cluster]) {
        acc[node.cluster] = { total: 0, used: 0, types: new Set<string>() }
      }
      acc[node.cluster].total += node.gpuCount
      acc[node.cluster].used += node.gpuAllocated
      acc[node.cluster].types.add(node.gpuType)
      return acc
    }, {} as Record<string, { total: number; used: number; types: Set<string> }>)

    return Object.entries(clusterStats).map(([clusterName, stats]) => ({
      clusterName,
      total: stats.total,
      used: stats.used,
      types: Array.from(stats.types),
      utilization: stats.total > 0 ? (stats.used / stats.total) * 100 : 0,
    }))
  }, [preFilteredNodes])

  // Step 3: useCardData for search/cluster filter/sort/pagination
  const {
    items: displayStats,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters: availableClustersForFilter,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
  } = useCardData<ClusterGPUStats, SortByOption>(clusterStatsList, {
    filter: {
      searchFields: ['clusterName'],
      clusterField: 'clusterName',
      storageKey: 'gpu-status',
    },
    sort: {
      defaultField: 'utilization',
      defaultDirection: 'desc',
      comparators: {
        utilization: (a, b) => a.utilization - b.utilization,
        cluster: commonComparators.string('clusterName'),
        gpuCount: (a, b) => a.total - b.total,
      },
    },
    defaultLimit: 5,
  })

  if (showSkeleton) {
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

  if (showEmptyState || (!hookLoading && preFilteredNodes.length === 0)) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex items-center justify-end mb-3">
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
        <CardControlsRow
          clusterIndicator={{
            selectedCount: localClusterFilter.length,
            totalCount: availableClustersForFilter.length,
          }}
          clusterFilter={{
            availableClusters: availableClustersForFilter,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search GPU clusters..."
        className="mb-2"
      />

      {/* GPU Type Filter */}
      {gpuTypes.length > 1 && (
        <select
          value={selectedGpuType}
          onChange={(e) => setSelectedGpuType(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground mb-3"
        >
          <option value="all">{t('selectors.allGpuTypes')}</option>
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
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />
    </div>
  )
}

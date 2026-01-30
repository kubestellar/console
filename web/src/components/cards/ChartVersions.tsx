import { useMemo } from 'react'
import { Package } from 'lucide-react'
import { useClusters, useHelmReleases } from '../../hooks/useMCP'
import { ClusterBadge } from '../ui/ClusterBadge'
import {
  useCardData, commonComparators,
  CardSkeleton, CardSearchInput, CardControlsRow, CardPaginationFooter,
} from '../../lib/cards'

interface ChartVersionsProps {
  config?: {
    cluster?: string
  }
}

interface ChartInfo {
  name: string
  chart: string
  version: string
  namespace: string
  cluster?: string
}

type SortByOption = 'name' | 'chart' | 'namespace'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'chart' as const, label: 'Chart' },
  { value: 'namespace' as const, label: 'Namespace' },
]

export function ChartVersions({ config: _config }: ChartVersionsProps) {
  const { isLoading: clustersLoading } = useClusters()

  // Fetch ALL Helm releases once - filter locally
  const {
    releases: allHelmReleases,
    isLoading: releasesLoading,
  } = useHelmReleases()

  // Only show skeleton when no cached data exists
  const isLoading = (clustersLoading || releasesLoading) && allHelmReleases.length === 0

  // Transform Helm releases to chart info
  const allCharts: ChartInfo[] = useMemo(() => {
    return allHelmReleases.map(r => {
      // Parse chart name and version (e.g., "prometheus-25.8.0" -> chart: "prometheus", version: "25.8.0")
      const chartParts = r.chart.match(/^(.+)-(\d+\.\d+\.\d+.*)$/)
      const chartName = chartParts ? chartParts[1] : r.chart
      const chartVersion = chartParts ? chartParts[2] : ''

      return {
        name: r.name,
        chart: chartName,
        version: chartVersion,
        namespace: r.namespace,
        cluster: r.cluster,
      }
    })
  }, [allHelmReleases])

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: charts,
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
  } = useCardData<ChartInfo, SortByOption>(allCharts, {
    filter: {
      searchFields: ['name', 'chart', 'namespace', 'version'],
      clusterField: 'cluster',
      storageKey: 'chart-versions',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string('name'),
        chart: commonComparators.string('chart'),
        namespace: commonComparators.string('namespace'),
      },
    },
    defaultLimit: 5,
  })

  // Count unique charts
  const uniqueCharts = new Set(allCharts.map(c => c.chart)).size

  if (isLoading) {
    return <CardSkeleton type="list" rows={3} showHeader rowHeight={50} />
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2" />
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

      {availableClustersForFilter.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No clusters available
        </div>
      ) : (
        <>
          {/* Local Search */}
          <CardSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="Search charts..."
            className="mb-4"
          />

          {/* Summary */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 p-2 rounded-lg bg-emerald-500/10 text-center">
              <span className="text-lg font-bold text-emerald-400">{allCharts.length}</span>
              <p className="text-xs text-muted-foreground">Releases</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center">
              <span className="text-lg font-bold text-blue-400">{uniqueCharts}</span>
              <p className="text-xs text-muted-foreground">Unique Charts</p>
            </div>
          </div>

          {/* Charts list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {charts.length === 0 ? (
              <div className="flex items-center justify-center text-muted-foreground text-sm py-4">
                No Helm releases found
              </div>
            ) : (
              charts.map((chart, idx) => (
                <div
                  key={`${chart.cluster}-${chart.namespace}-${chart.name}-${idx}`}
                  className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Package className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-sm text-foreground font-medium truncate">{chart.name}</span>
                    </div>
                    {chart.cluster && <ClusterBadge cluster={chart.cluster} size="sm" />}
                  </div>
                  <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground min-w-0 overflow-hidden">
                    <span className="truncate" title={`Chart: ${chart.chart}`}>{chart.chart}</span>
                    {chart.version && <span className="shrink-0" title={`Version: ${chart.version}`}>v{chart.version}</span>}
                    <span className="truncate" title={`Namespace: ${chart.namespace}`}>{chart.namespace}</span>
                  </div>
                </div>
              ))
            )}
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

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {totalItems} releases{localClusterFilter.length > 0 ? ` in ${localClusterFilter.length} cluster${localClusterFilter.length > 1 ? 's' : ''}` : ' across all clusters'}
          </div>
        </>
      )}
    </div>
  )
}

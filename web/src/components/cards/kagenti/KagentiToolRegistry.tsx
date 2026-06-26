import { Wrench, Shield, ShieldOff, Server } from 'lucide-react'
import { useKagentiTools } from '../../../hooks/useMCP'
import { useCardLoadingState } from '../CardDataContext'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { Skeleton } from '../../ui/Skeleton'

interface KagentiToolRegistryProps {
  config?: { cluster?: string }
}

type SortField = 'name' | 'cluster'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'cluster', label: 'Cluster' },
]

export function KagentiToolRegistry({ config }: KagentiToolRegistryProps) {
  const {
    data: tools,
    isLoading,
    isRefreshing,
    isDemoFallback,
    consecutiveFailures,
  } = useKagentiTools({ cluster: config?.cluster })

  const hasData = tools.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  const {
    items: paginatedItems,
    filters,
    sorting,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    needsPagination,
    itemsPerPage,
    setItemsPerPage,
    containerRef,
    containerStyle,
  } = useCardData(tools, {
    filter: {
      searchFields: ['name', 'namespace', 'toolPrefix', 'targetRef', 'cluster'],
      clusterField: 'cluster',
    },
    sort: {
      defaultField: 'name' as SortField,
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string('name'),
        cluster: commonComparators.string('cluster'),
      } as Record<SortField, (a: typeof tools[number], b: typeof tools[number]) => number>,
    },
    defaultLimit: 10,
  })

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Wrench className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No MCP Tools Registered</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Deploy MCPServer CRDs to register tools</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      <CardControlsRow
        clusterIndicator={{
          selectedCount: filters.localClusterFilter.length,
          totalCount: filters.availableClusters.length,
        }}
        clusterFilter={{
          availableClusters: filters.availableClusters,
          selectedClusters: filters.localClusterFilter,
          onToggle: filters.toggleClusterFilter,
          onClear: filters.clearClusterFilter,
          isOpen: filters.showClusterFilter,
          setIsOpen: filters.setShowClusterFilter,
          containerRef: filters.clusterFilterRef,
          minClusters: 1,
        }}
        cardControls={{
          limit: itemsPerPage,
          onLimitChange: setItemsPerPage,
          sortBy: sorting.sortBy,
          sortOptions: SORT_OPTIONS,
          onSortChange: (v) => sorting.setSortBy(v as SortField),
          sortDirection: sorting.sortDirection,
          onSortDirectionChange: sorting.setSortDirection,
        }}
        extra={
          <CardSearchInput value={filters.search} onChange={filters.setSearch} placeholder="Search tools..." />
        }
      />

      <div ref={containerRef} className="space-y-1" style={containerStyle}>
        {paginatedItems.map(tool => (
          <div
            key={`${tool.cluster}-${tool.namespace}-${tool.name}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <Wrench className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{tool.name}</div>
              <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                {tool.cluster}
                {tool.toolPrefix && <span className="text-cyan-400/60">prefix: {tool.toolPrefix}</span>}
              </div>
            </div>
            {tool.targetRef && (
              <span className="text-xs text-muted-foreground/50 truncate max-w-[80px]">
                {tool.targetRef}
              </span>
            )}
            {tool.hasCredential ? (
              <Shield className="w-3 h-3 text-green-400" />
            ) : (
              <ShieldOff className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}

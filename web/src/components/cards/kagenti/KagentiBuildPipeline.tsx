import { Hammer, CheckCircle, XCircle, Clock, Server } from 'lucide-react'
import { useKagentiBuilds } from '../../../hooks/useMCP'
import { useCardLoadingState } from '../CardDataContext'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { Skeleton } from '../../ui/Skeleton'
import { formatTimeAgo } from '../../../lib/formatters'

interface KagentiBuildPipelineProps {
  config?: { cluster?: string }
}

function BuildStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'Succeeded':
      return <CheckCircle className="w-3.5 h-3.5 text-green-400" />
    case 'Failed':
      return <XCircle className="w-3.5 h-3.5 text-red-400" />
    case 'Building':
      return <Hammer className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
    case 'Pending':
      return <Clock className="w-3.5 h-3.5 text-yellow-400" />
    default:
      return <Clock className="w-3.5 h-3.5 text-muted-foreground" />
  }
}

type SortField = 'name' | 'status' | 'cluster'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'cluster', label: 'Cluster' },
]

export function KagentiBuildPipeline({ config }: KagentiBuildPipelineProps) {
  const {
    data: builds,
    isLoading,
    isDemoFallback,
    consecutiveFailures } = useKagentiBuilds({ cluster: config?.cluster })

  const hasData = builds.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    hasAnyData: hasData,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    isDemoData: isDemoFallback })

  const stats = {
    active: builds.filter(b => b.status === 'Building' || b.status === 'Pending').length,
    succeeded: builds.filter(b => b.status === 'Succeeded').length,
    failed: builds.filter(b => b.status === 'Failed').length }

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
    containerStyle } = useCardData(builds, {
    filter: {
      searchFields: ['name', 'namespace', 'source', 'pipeline', 'status', 'cluster'],
      clusterField: 'cluster' },
    sort: {
      defaultField: 'status' as SortField,
      defaultDirection: 'desc',
      comparators: {
        name: commonComparators.string('name'),
        status: (a, b) => {
          const order: Record<string, number> = { Building: 0, Pending: 1, Failed: 2, Succeeded: 3 }
          return (order[a.status] ?? 99) - (order[b.status] ?? 99)
        },
        cluster: commonComparators.string('cluster') } as Record<SortField, (a: typeof builds[number], b: typeof builds[number]) => number> },
    defaultLimit: 8 })

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        <div className="flex gap-4 mb-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-16 rounded" />)}
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Hammer className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No Agent Builds</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Create an AgentBuild to start building agents</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      {/* Summary stats */}
      <div className="flex items-center gap-3 text-xs px-1">
        {stats.active > 0 && (
          <div className="flex items-center gap-1 text-blue-400">
            <Hammer className="w-3 h-3 animate-pulse" /> {stats.active} active
          </div>
        )}
        <div className="flex items-center gap-1 text-green-400">
          <CheckCircle className="w-3 h-3" /> {stats.succeeded}
        </div>
        {stats.failed > 0 && (
          <div className="flex items-center gap-1 text-red-400">
            <XCircle className="w-3 h-3" /> {stats.failed}
          </div>
        )}
        <div className="flex-1" />
        <span className="text-muted-foreground/50">{builds.length} total</span>
      </div>

      <CardControlsRow
        clusterIndicator={{
          selectedCount: filters.localClusterFilter.length,
          totalCount: filters.availableClusters.length }}
        clusterFilter={{
          availableClusters: filters.availableClusters,
          selectedClusters: filters.localClusterFilter,
          onToggle: filters.toggleClusterFilter,
          onClear: filters.clearClusterFilter,
          isOpen: filters.showClusterFilter,
          setIsOpen: filters.setShowClusterFilter,
          containerRef: filters.clusterFilterRef,
          minClusters: 1 }}
        cardControls={{
          limit: itemsPerPage,
          onLimitChange: setItemsPerPage,
          sortBy: sorting.sortBy,
          sortOptions: SORT_OPTIONS,
          onSortChange: (v) => sorting.setSortBy(v as SortField),
          sortDirection: sorting.sortDirection,
          onSortDirectionChange: sorting.setSortDirection }}
        extra={
          <CardSearchInput value={filters.search} onChange={filters.setSearch} placeholder="Search builds..." />
        }
      />

      <div ref={containerRef} className="space-y-1" style={containerStyle}>
        {paginatedItems.map(build => (
          <div
            key={`${build.cluster}-${build.namespace}-${build.name}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <BuildStatusIcon status={build.status} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{build.name}</div>
              <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                {build.cluster}
                {build.pipeline && <span>/ {build.pipeline}</span>}
                {build.mode && <span className="text-blue-400/60">({build.mode})</span>}
              </div>
            </div>
            <div className="text-xs text-muted-foreground/40">
              {formatTimeAgo(build.startTime || build.completionTime)}
            </div>
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

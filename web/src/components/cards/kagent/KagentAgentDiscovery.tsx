import { Radar, Tag, Server, Wrench } from 'lucide-react'
import { useKagentCRDAgents } from '../../../hooks/mcp/kagent_crds'
import { useCardLoadingState } from '../CardDataContext'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { Skeleton } from '../../ui/Skeleton'

interface KagentAgentDiscoveryProps {
  config?: { cluster?: string }
}

type SortField = 'name' | 'cluster'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'cluster', label: 'Cluster' },
]

// #6216 part 2: wrapped at the bottom in DynamicCardErrorBoundary.
function KagentAgentDiscoveryInternal({ config }: KagentAgentDiscoveryProps) {
  const {
    data: agents,
    isLoading,
    isRefreshing,
    isDemoFallback,
    consecutiveFailures } = useKagentCRDAgents({ cluster: config?.cluster })

  const hasAnyData = agents.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    isDemoData: isDemoFallback })

  // Agent type distribution
  const typeDistribution = (() => {
    const counts: Record<string, number> = {}
    for (const a of agents) {
      counts[a.agentType] = (counts[a.agentType] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  })()

  // A2A enabled agents
  const a2aAgents = agents.filter(a => a.a2aEnabled)

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
    containerStyle } = useCardData(agents, {
    filter: {
      searchFields: ['name', 'namespace', 'agentType', 'cluster', 'modelConfigRef'],
      clusterField: 'cluster' },
    sort: {
      defaultField: 'name' as SortField,
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string('name'),
        cluster: commonComparators.string('cluster') } as Record<SortField, (a: typeof agents[number], b: typeof agents[number]) => number> },
    defaultLimit: 8 })

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        <Skeleton className="h-16 rounded-lg" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Radar className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No Agents Discovered</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Deploy kagent Agent CRDs with A2A enabled</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      {/* Agent type distribution tags */}
      {typeDistribution.length > 0 && (
        <div className="px-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1">Agent Types</div>
          <div className="flex flex-wrap gap-1">
            {typeDistribution.map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-2xs rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
              >
                <Tag className="w-2.5 h-2.5" />
                {type}
                <span className="text-blue-400/60">({count})</span>
              </span>
            ))}
            {a2aAgents.length > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-2xs rounded bg-green-500/10 text-green-400 border border-green-500/20">
                A2A enabled ({a2aAgents.length})
              </span>
            )}
          </div>
        </div>
      )}

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
          <CardSearchInput value={filters.search} onChange={filters.setSearch} placeholder="Search agents..." />
        }
      />

      <div ref={containerRef} className="space-y-1" style={containerStyle}>
        {paginatedItems.map(agent => (
          <div
            key={`${agent.cluster}-${agent.namespace}-${agent.name}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <Radar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{agent.name}</div>
              <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                {agent.cluster}
                {agent.modelConfigRef && <span>/ {agent.modelConfigRef}</span>}
              </div>
            </div>
            {agent.a2aEnabled && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border bg-green-500/10 text-green-400 border-green-500/20">
                A2A
              </span>
            )}
            {agent.toolCount > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Wrench className="w-2.5 h-2.5" />
                {agent.toolCount}
              </span>
            )}
            <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${
              agent.agentType === 'Declarative'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                : 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
            }`}>
              {agent.agentType}
            </span>
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

export function KagentAgentDiscovery(props: KagentAgentDiscoveryProps) {
  return (
    <DynamicCardErrorBoundary cardId="KagentAgentDiscovery">
      <KagentAgentDiscoveryInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}

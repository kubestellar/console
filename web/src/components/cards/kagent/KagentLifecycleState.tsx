import { useMemo } from 'react'
import { Activity, ArrowRight, Bot, CheckCircle, Clock, XCircle, Server } from 'lucide-react'
import { useKagentCRDAgents } from '../../../hooks/useMCP'
import { useCardLoadingState } from '../CardDataContext'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { Skeleton } from '../../ui/Skeleton'

interface KagentLifecycleStateProps {
  config?: { cluster?: string }
}

const LIFECYCLE_STATES = ['Pending', 'Accepted', 'Ready', 'Failed'] as const
type LifecycleState = typeof LIFECYCLE_STATES[number]

const STATE_ORDER: Record<string, number> = {
  Pending: 0,
  Accepted: 1,
  Ready: 2,
  Failed: 3,
}

const STATE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  Pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', dot: 'bg-yellow-400' },
  Accepted: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-400' },
  Ready: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-400' },
  Failed: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-400' },
}

const STATE_ICONS: Record<string, typeof Clock> = {
  Pending: Clock,
  Accepted: Activity,
  Ready: CheckCircle,
  Failed: XCircle,
}

const CONSECUTIVE_FAILURE_THRESHOLD = 3

function StateNode({ state, count, isActive }: { state: LifecycleState; count: number; isActive: boolean }) {
  const colors = STATE_COLORS[state] || STATE_COLORS.Pending
  const Icon = STATE_ICONS[state] || Clock

  return (
    <div
      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-all ${
        isActive
          ? `${colors.bg} ${colors.border} ${colors.text}`
          : 'bg-secondary/30 border-border/30 text-muted-foreground/50'
      }`}
      role="status"
      aria-label={`${state}: ${count} agents`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-xs font-medium">{state}</span>
      <span className={`text-lg font-bold ${isActive ? colors.text : 'text-muted-foreground/30'}`}>{count}</span>
    </div>
  )
}

function StateTransitionArrow({ active }: { active: boolean }) {
  return (
    <ArrowRight
      className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-muted-foreground/60' : 'text-muted-foreground/20'}`}
      aria-hidden
    />
  )
}

type SortField = 'name' | 'status' | 'cluster'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Lifecycle State' },
  { value: 'cluster', label: 'Cluster' },
]

function KagentLifecycleStateInternal({ config }: KagentLifecycleStateProps) {
  const {
    data: agents,
    isLoading,
    isRefreshing,
    isDemoFallback,
    consecutiveFailures,
  } = useKagentCRDAgents({ cluster: config?.cluster })

  const hasAnyData = agents.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed: consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = { Pending: 0, Accepted: 0, Ready: 0, Failed: 0 }
    for (const agent of agents || []) {
      const state = agent.status || 'Unknown'
      if (state in counts) {
        counts[state]++
      }
    }
    return counts
  }, [agents])

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
  } = useCardData(agents, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'status', 'agentType'],
      clusterField: 'cluster',
    },
    sort: {
      defaultField: 'status' as SortField,
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string('name'),
        status: (a, b) => (STATE_ORDER[a.status] ?? 99) - (STATE_ORDER[b.status] ?? 99),
        cluster: commonComparators.string('cluster'),
      } as Record<SortField, (a: typeof agents[number], b: typeof agents[number]) => number>,
    },
    defaultLimit: 6,
  })

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <div className="flex items-center justify-center gap-2">
          {LIFECYCLE_STATES.map(s => <Skeleton key={s} className="h-20 w-20 rounded-lg" />)}
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Activity className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No Agent Lifecycle Data</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Deploy kagent Agent CRDs to track lifecycle states</div>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-1">
      {/* State machine visualization */}
      <div className="flex items-center justify-center gap-1.5 py-2" role="group" aria-label="Agent lifecycle states">
        {LIFECYCLE_STATES.map((state, idx) => (
          <div key={state} className="contents">
            <StateNode state={state} count={stateCounts[state]} isActive={stateCounts[state] > 0} />
            {idx < LIFECYCLE_STATES.length - 1 && (
              <StateTransitionArrow active={stateCounts[state] > 0 || stateCounts[LIFECYCLE_STATES[idx + 1]] > 0} />
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
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
          <CardSearchInput value={filters.search} onChange={filters.setSearch} placeholder="Search agents..." />
        }
      />

      {/* Agent list with lifecycle indicators */}
      <div ref={containerRef} className="space-y-1" style={containerStyle}>
        {(paginatedItems || []).map(agent => {
          const colors = STATE_COLORS[agent.status] || STATE_COLORS.Pending
          return (
            <div
              key={`${agent.cluster}-${agent.namespace}-${agent.name}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <div className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
              <Bot className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{agent.name}</div>
                <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                  <Server className="w-2.5 h-2.5" />
                  {agent.cluster}
                  <span className="text-muted-foreground/40">/</span>
                  {agent.namespace}
                </div>
              </div>
              <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                {agent.status}
              </span>
              <div className="text-xs text-muted-foreground/40">
                {agent.readyReplicas != null && agent.replicas != null
                  ? `${agent.readyReplicas}/${agent.replicas}`
                  : '—'}
              </div>
            </div>
          )
        })}
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

export function KagentLifecycleState(props: KagentLifecycleStateProps) {
  return (
    <DynamicCardErrorBoundary cardId="KagentLifecycleState">
      <KagentLifecycleStateInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}

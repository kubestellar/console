import { Bot, ChevronRight, Server } from 'lucide-react'
import { useKagentCRDAgents } from '../../../hooks/mcp/kagent_crds'
import { useCardLoadingState } from '../CardDataContext'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { Skeleton } from '../../ui/Skeleton'
import { useTranslation } from 'react-i18next'

interface KagentAgentFleetProps {
  config?: { cluster?: string }
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === 'Ready'
      ? 'bg-green-500/15 text-green-400 border-green-500/20'
      : status === 'Accepted'
        ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
        : status === 'Pending'
          ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20'
          : status === 'Failed'
            ? 'bg-red-500/15 text-red-400 border-red-500/20'
            : 'bg-gray-500/15 text-muted-foreground border-gray-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${classes}`}>
      {status}
    </span>
  )
}

function TypeBadge({ agentType }: { agentType: string }) {
  const classes = agentType === 'Declarative'
    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${classes}`}>
      {agentType}
    </span>
  )
}

function RuntimeBadge({ runtime }: { runtime: string }) {
  if (!runtime) return null
  const classes = runtime === 'python'
    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${classes}`}>
      {runtime}
    </span>
  )
}

type SortField = 'name' | 'status' | 'agentType' | 'cluster'

export function KagentAgentFleet({ config }: KagentAgentFleetProps) {
  const { t: _t } = useTranslation()
  const {
    data: agents,
    isLoading,
    isDemoFallback,
    consecutiveFailures,
  } = useKagentCRDAgents({ cluster: config?.cluster })

  const hasAnyData = agents.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    hasAnyData,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  const {
    items: paginatedItems,
    filters,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    needsPagination,
    itemsPerPage,
    containerRef,
    containerStyle,
  } = useCardData(agents, {
    filter: {
      searchFields: ['name', 'namespace', 'agentType', 'runtime', 'cluster', 'status', 'modelConfigRef'],
      clusterField: 'cluster',
    },
    sort: {
      defaultField: 'status' as SortField,
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string('name'),
        status: (a, b) => {
          const order: Record<string, number> = { Failed: 0, Pending: 1, Accepted: 2, Ready: 3 }
          return (order[a.status] ?? 99) - (order[b.status] ?? 99)
        },
        agentType: commonComparators.string('agentType'),
        cluster: commonComparators.string('cluster'),
      } as Record<SortField, (a: typeof agents[number], b: typeof agents[number]) => number>,
    },
    defaultLimit: 8,
  })

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No Kagent Agents</div>
        <div className="text-xs text-muted-foreground mt-1">Deploy kagent Agent CRDs to see them here</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      <CardControlsRow
        extra={
          <CardSearchInput value={filters.search} onChange={filters.setSearch} placeholder="Search agents..." />
        }
      />

      <div ref={containerRef} className="space-y-1" style={containerStyle}>
        {paginatedItems.map(agent => (
          <div
            key={`${agent.cluster}-${agent.namespace}-${agent.name}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors group"
          >
            <Bot className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{agent.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                {agent.cluster}
                {agent.modelConfigRef && <span className="text-blue-400/60">/ {agent.modelConfigRef}</span>}
              </div>
            </div>
            <TypeBadge agentType={agent.agentType} />
            <RuntimeBadge runtime={agent.runtime} />
            <div className="text-xs text-muted-foreground">
              {agent.readyReplicas}/{agent.replicas}
            </div>
            <StatusBadge status={agent.status} />
            <ChevronRight className="w-3 h-3 text-muted-foreground/20 group-hover:text-muted-foreground" />
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

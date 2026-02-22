import { Bot, ChevronRight, Server } from 'lucide-react'
import { useKagentiAgents } from '../../../hooks/useMCP'
import { useCardLoadingState } from '../CardDataContext'
import { useCardData, commonComparators, CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards'
import { Skeleton } from '../../ui/Skeleton'
import { useTranslation } from 'react-i18next'

interface KagentiAgentFleetProps {
  config?: { cluster?: string }
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === 'Running' || status === 'Ready'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
      : status === 'Pending'
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
        : status === 'Failed'
          ? 'bg-red-500/15 text-red-400 border-red-500/20'
          : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${classes}`}>
      {status}
    </span>
  )
}

type SortField = 'name' | 'status' | 'framework' | 'cluster'

export function KagentiAgentFleet({ config }: KagentiAgentFleetProps) {
  const { t: _t } = useTranslation()
  const {
    data: agents,
    isLoading,
    consecutiveFailures,
  } = useKagentiAgents({ cluster: config?.cluster })

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: agents.length > 0,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
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
  } = useCardData(agents, {
    filter: {
      searchFields: ['name', 'namespace', 'framework', 'cluster', 'status'],
      clusterField: 'cluster',
    },
    sort: {
      defaultField: 'status' as SortField,
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string('name'),
        status: (a, b) => {
          const order: Record<string, number> = { Failed: 0, Pending: 1, Running: 2, Ready: 3 }
          return (order[a.status] ?? 99) - (order[b.status] ?? 99)
        },
        framework: commonComparators.string('framework'),
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
        <div className="text-sm font-medium text-muted-foreground">No Agents Deployed</div>
        <div className="text-xs text-muted-foreground mt-1">Deploy kagenti agents to see them here</div>
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

      <div className="space-y-1">
        {paginatedItems.map(agent => (
          <div
            key={`${agent.cluster}-${agent.namespace}-${agent.name}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors group"
          >
            <Bot className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{agent.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                {agent.cluster}
                {agent.framework && <span className="text-violet-400/60">/ {agent.framework}</span>}
              </div>
            </div>
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

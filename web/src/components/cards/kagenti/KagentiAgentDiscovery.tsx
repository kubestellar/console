import { useMemo } from 'react'
import { Radar, Shield, Tag, Server } from 'lucide-react'
import { useKagentiCards } from '../../../hooks/useMCP'
import { useCardLoadingState } from '../CardDataContext'
import { useCardData, commonComparators, CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards'
import { Skeleton } from '../../ui/Skeleton'
import { useTranslation } from 'react-i18next'

interface KagentiAgentDiscoveryProps {
  config?: { cluster?: string }
}

type SortField = 'name' | 'cluster'

export function KagentiAgentDiscovery({ config }: KagentiAgentDiscoveryProps) {
  const { t: _t } = useTranslation()
  const {
    data: cards,
    isLoading,
    consecutiveFailures,
  } = useKagentiCards({ cluster: config?.cluster })

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: cards.length > 0,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
  })

  // Aggregate skill counts
  const skillSummary = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const card of cards) {
      for (const skill of card.skills || []) {
        counts[skill] = (counts[skill] || 0) + 1
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [cards])

  const {
    items: paginatedItems,
    filters,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    needsPagination,
    itemsPerPage,
  } = useCardData(cards, {
    filter: {
      searchFields: ['name', 'agentName', 'namespace', 'cluster'],
      clusterField: 'cluster',
    },
    sort: {
      defaultField: 'name' as SortField,
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string('name'),
        cluster: commonComparators.string('cluster'),
      } as Record<SortField, (a: typeof cards[number], b: typeof cards[number]) => number>,
    },
    defaultLimit: 8,
  })

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
        <div className="text-sm font-medium text-muted-foreground">No Agent Cards</div>
        <div className="text-xs text-muted-foreground/60 mt-1">AgentCards cache agent metadata from /.well-known/agent.json</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      {/* Skill tags summary */}
      {skillSummary.length > 0 && (
        <div className="px-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1">Top Skills</div>
          <div className="flex flex-wrap gap-1">
            {skillSummary.map(([skill, count]) => (
              <span
                key={skill}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-violet-500/10 text-violet-400 border border-violet-500/20"
              >
                <Tag className="w-2.5 h-2.5" />
                {skill}
                {count > 1 && <span className="text-violet-400/60">({count})</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <CardControlsRow
        extra={
          <CardSearchInput value={filters.search} onChange={filters.setSearch} placeholder="Search cards..." />
        }
      />

      <div className="space-y-1">
        {paginatedItems.map(card => (
          <div
            key={`${card.cluster}-${card.namespace}-${card.name}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <Radar className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{card.name}</div>
              <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                {card.cluster}
                {card.agentName && <span>/ {card.agentName}</span>}
              </div>
            </div>
            {card.identityBinding ? (
              <Shield className="w-3 h-3 text-emerald-400" />
            ) : (
              <span className="text-xs text-zinc-500">No ID</span>
            )}
            {(card.skills || []).length > 0 && (
              <span className="text-xs text-muted-foreground/40">
                {card.skills.length} skill{card.skills.length !== 1 ? 's' : ''}
              </span>
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

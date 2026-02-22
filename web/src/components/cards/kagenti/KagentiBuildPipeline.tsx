import { useMemo } from 'react'
import { Hammer, CheckCircle, XCircle, Clock, Server } from 'lucide-react'
import { useKagentiBuilds } from '../../../hooks/useMCP'
import { useCardLoadingState } from '../CardDataContext'
import { useCardData, commonComparators, CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards'
import { Skeleton } from '../../ui/Skeleton'
import { useTranslation } from 'react-i18next'

interface KagentiBuildPipelineProps {
  config?: { cluster?: string }
}

function BuildStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'Succeeded':
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
    case 'Failed':
      return <XCircle className="w-3.5 h-3.5 text-red-400" />
    case 'Building':
      return <Hammer className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
    case 'Pending':
      return <Clock className="w-3.5 h-3.5 text-amber-400" />
    default:
      return <Clock className="w-3.5 h-3.5 text-zinc-400" />
  }
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

type SortField = 'name' | 'status' | 'cluster'

export function KagentiBuildPipeline({ config }: KagentiBuildPipelineProps) {
  const { t: _t } = useTranslation()
  const {
    data: builds,
    isLoading,
    consecutiveFailures,
  } = useKagentiBuilds({ cluster: config?.cluster })

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: builds.length > 0,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
  })

  const stats = useMemo(() => ({
    active: builds.filter(b => b.status === 'Building' || b.status === 'Pending').length,
    succeeded: builds.filter(b => b.status === 'Succeeded').length,
    failed: builds.filter(b => b.status === 'Failed').length,
  }), [builds])

  const {
    items: paginatedItems,
    filters,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    needsPagination,
    itemsPerPage,
  } = useCardData(builds, {
    filter: {
      searchFields: ['name', 'namespace', 'source', 'pipeline', 'status', 'cluster'],
      clusterField: 'cluster',
    },
    sort: {
      defaultField: 'status' as SortField,
      defaultDirection: 'desc',
      comparators: {
        name: commonComparators.string('name'),
        status: (a, b) => {
          const order: Record<string, number> = { Building: 0, Pending: 1, Failed: 2, Succeeded: 3 }
          return (order[a.status] ?? 99) - (order[b.status] ?? 99)
        },
        cluster: commonComparators.string('cluster'),
      } as Record<SortField, (a: typeof builds[number], b: typeof builds[number]) => number>,
    },
    defaultLimit: 8,
  })

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
        <div className="flex items-center gap-1 text-emerald-400">
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
        extra={
          <CardSearchInput value={filters.search} onChange={filters.setSearch} placeholder="Search builds..." />
        }
      />

      <div className="space-y-1">
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
              {timeAgo(build.startTime || build.completionTime)}
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

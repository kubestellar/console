import { useMemo } from 'react'
import { AlertCircle, Bot, Server } from 'lucide-react'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useCachedKagentStatus } from '../../hooks/useCachedKagentStatus'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import type { KagentStatusData } from '../../lib/demo/kagent'

type SortByOption = 'agentName' | 'namespace' | 'status'

const STATUS_ORDER: Record<string, number> = { error: 0, stopped: 1, running: 2 }

const SORT_COMPARATORS = {
  agentName: commonComparators.string<KagentStatusData>('agentName'),
  namespace: commonComparators.string<KagentStatusData>('namespace'),
  status: (a: KagentStatusData, b: KagentStatusData) =>
    (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3),
}

const SORT_OPTIONS_KEYS = [
  { value: 'agentName' as const, labelKey: 'common:common.name' as const },
  { value: 'status' as const, labelKey: 'common:common.status' as const },
  { value: 'namespace' as const, labelKey: 'common:common.namespace' as const },
]

interface KagentStatusProps {
  config?: Record<string, unknown>
}

function StatusBadge({ status }: { status: KagentStatusData['status'] }) {
  const colors =
    status === 'running'
      ? 'bg-green-500/20 text-green-400'
      : status === 'stopped'
      ? 'bg-yellow-500/20 text-yellow-400'
      : 'bg-red-500/20 text-red-400'
  return <span className={`px-1.5 py-0.5 rounded text-2xs ${colors}`}>{status}</span>
}

function formatHeartbeat(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function KagentStatusInternal({ config: _config }: KagentStatusProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = SORT_OPTIONS_KEYS.map(opt => ({ value: opt.value, label: String(t(opt.labelKey)) }))

  const {
    data: allAgents,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
    refetch,
  } = useCachedKagentStatus()

  const hasData = (allAgents ?? []).length > 0

  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
  })

  const stats = useMemo(() => {
    const agents = allAgents ?? []
    return {
      total: agents.length,
      running: agents.filter(a => a.status === 'running').length,
      stopped: agents.filter(a => a.status === 'stopped').length,
      error: agents.filter(a => a.status === 'error').length,
    }
  }, [allAgents])

  const {
    items: paginatedAgents,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: { search: localSearch, setSearch: setLocalSearch },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
    containerRef,
    containerStyle,
  } = useCardData<KagentStatusData, SortByOption>(allAgents ?? [], {
    filter: {
      searchFields: ['agentName', 'namespace', 'status', 'providerName'],
      storageKey: 'kagent-agent-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
          <Skeleton variant="text" width={120} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  if (isFailed) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card p-6">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-sm text-muted-foreground mb-4">
          {t('kagentAgentStatus.loadFailed', 'Failed to load kagent agent status')}
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm"
        >
          {t('common:common.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            {t('kagentAgentStatus.nAgents', { count: totalItems, defaultValue: '{{count}} agents' })}
          </span>
        </div>
        <CardControlsRow
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

      {/* Demo badge */}
      {isDemoData && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-blue-400 font-medium">
            {t(
              'kagentAgentStatus.demoNotice',
              'Showing demo data — connect a cluster with kagent installed to see live agents',
            )}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-2xs text-green-400">{t('kagentAgentStatus.running', 'Running')}</p>
          <p className="text-lg font-bold text-foreground">{stats.running}</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-2xs text-yellow-400">{t('kagentAgentStatus.stopped', 'Stopped')}</p>
          <p className="text-lg font-bold text-foreground">{stats.stopped}</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-2xs text-red-400">{t('kagentAgentStatus.error', 'Error')}</p>
          <p className="text-lg font-bold text-foreground">{stats.error}</p>
        </div>
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('kagentAgentStatus.searchAgents', 'Search agents...')}
        className="mb-3"
      />

      {/* Agent list */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2" style={containerStyle}>
        {paginatedAgents.map((agent, idx) => (
          <div
            key={`${agent.agentName}-${agent.namespace}-${idx}`}
            className="p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex flex-wrap items-center justify-between gap-y-1 mb-1">
              <div className="flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-sm font-medium text-foreground truncate">{agent.agentName}</span>
                <StatusBadge status={agent.status} />
              </div>
              <span className="text-xs text-muted-foreground">
                {t('kagentAgentStatus.missions', {
                  count: agent.activeMissions,
                  defaultValue: '{{count}} missions',
                })}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Server className="w-3 h-3" />
                <span>{agent.namespace}</span>
                {agent.providerName && (
                  <span className="px-1.5 py-0.5 rounded bg-secondary text-2xs">{agent.providerName}</span>
                )}
              </div>
              {agent.lastHeartbeatAt && (
                <span className="text-2xs">{formatHeartbeat(agent.lastHeartbeatAt)}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />
    </div>
  )
}

export function KagentStatus(props: KagentStatusProps) {
  return (
    <DynamicCardErrorBoundary cardId="KagentStatus">
      <KagentStatusInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}

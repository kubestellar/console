/**
 * DrasiPipelines — Dashboard card showing Drasi reactive pipeline statuses.
 *
 * Displays a searchable, sortable list of Drasi pipelines with their
 * operational status, continuous query count, reaction count, and last
 * event timestamp. Falls back to demo data when no live endpoint is
 * available.
 *
 * Upstream issue: kubestellar/console#19915
 */

import { useMemo } from 'react'
import { AlertCircle, Activity, StopCircle, XCircle } from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useCachedDrasiPipelines } from '../../hooks/useCachedDrasiPipelines'
import type { DrasiPipelineData } from '../../lib/demo/drasi'

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type SortByOption = 'name' | 'status' | 'queries' | 'reactions' | 'lastEvent'

const SORT_OPTIONS: ReadonlyArray<{ value: SortByOption; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'queries', label: 'Queries' },
  { value: 'reactions', label: 'Reactions' },
  { value: 'lastEvent', label: 'Last Event' },
]

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  stopped: 1,
  error: 2,
}

const PIPELINE_SORT_COMPARATORS: Record<SortByOption, (a: DrasiPipelineData, b: DrasiPipelineData) => number> = {
  name: commonComparators.string<DrasiPipelineData>('pipelineName'),
  status: commonComparators.statusOrder<DrasiPipelineData>('status', STATUS_ORDER),
  queries: commonComparators.number<DrasiPipelineData>('continuousQueriesCount'),
  reactions: commonComparators.number<DrasiPipelineData>('reactionsCount'),
  lastEvent: commonComparators.date<DrasiPipelineData>('lastEventAt'),
}

// ---------------------------------------------------------------------------
// Status display config
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  running: {
    label: 'Running',
    Icon: Activity,
    textColor: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
  },
  stopped: {
    label: 'Stopped',
    Icon: StopCircle,
    textColor: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
  },
  error: {
    label: 'Error',
    Icon: XCircle,
    textColor: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
  },
} as const

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60_000) return 'Just now'
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DrasiPipelinesProps {
  config?: Record<string, unknown>
}

export function DrasiPipelines({ config: _config }: DrasiPipelinesProps) {
  const {
    data: allPipelines,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
    refetch,
  } = useCachedDrasiPipelines()

  const stats = useMemo(() => {
    const pipelines = allPipelines || []
    return {
      total: pipelines.length,
      running: pipelines.filter(p => p.status === 'running').length,
      stopped: pipelines.filter(p => p.status === 'stopped').length,
      error: pipelines.filter(p => p.status === 'error').length,
    }
  }, [allPipelines])

  const hasData = (allPipelines || []).length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  const {
    items: paginatedPipelines,
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
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
    containerRef,
    containerStyle,
  } = useCardData<DrasiPipelineData, SortByOption>(allPipelines || [], {
    filter: {
      searchFields: ['pipelineName', 'status'],
      storageKey: 'drasi-pipelines',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: PIPELINE_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  if (isLoading && !hasData) {
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

  if (isFailed && !hasData) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card p-6">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-sm text-muted-foreground mb-4">Failed to load Drasi pipelines</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <span className="text-sm font-medium text-muted-foreground">
          {totalItems} pipeline{totalItems !== 1 ? 's' : ''}
        </span>
        <CardControlsRow
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS.map(o => ({ value: o.value, label: o.label })),
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search pipelines..."
        className="mb-3"
      />

      {/* Demo data notice */}
      {isDemoData && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-400 font-medium">Demo Data</p>
            <p className="text-muted-foreground">
              Showing simulated Drasi pipeline data. Connect a cluster with Drasi installed to see live status.
            </p>
          </div>
        </div>
      )}

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-2xs text-green-400">Running</p>
          <p className="text-lg font-bold text-foreground">{stats.running}</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-2xs text-yellow-400">Stopped</p>
          <p className="text-lg font-bold text-foreground">{stats.stopped}</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-2xs text-red-400">Error</p>
          <p className="text-lg font-bold text-foreground">{stats.error}</p>
        </div>
      </div>

      {/* Pipelines list */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2" style={containerStyle}>
        {paginatedPipelines.map((pipeline) => {
          const cfg = STATUS_CONFIG[pipeline.status]
          const { Icon } = cfg
          return (
            <div
              key={pipeline.pipelineName}
              className="p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-y-1 mb-1">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${cfg.textColor}`} />
                  <span className="text-sm font-medium text-foreground truncate">{pipeline.pipelineName}</span>
                  <span className={`px-1.5 py-0.5 rounded text-2xs ${cfg.bgColor} ${cfg.textColor}`}>
                    {cfg.label}
                  </span>
                </div>
                <span className="text-2xs text-muted-foreground/60">
                  {formatRelativeTime(pipeline.lastEventAt)}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  {pipeline.continuousQueriesCount}{' '}
                  {pipeline.continuousQueriesCount === 1 ? 'query' : 'queries'}
                </span>
                <span>
                  {pipeline.reactionsCount}{' '}
                  {pipeline.reactionsCount === 1 ? 'reaction' : 'reactions'}
                </span>
              </div>
            </div>
          )
        })}
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

import { useState, useMemo } from 'react'
import {
  CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink,
  Play
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { CardControls } from '../../ui/CardControls'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { StatusBadge } from '../../ui/StatusBadge'
import { CardSearchInput, CardAIActions } from '../../../lib/cards/CardComponents'
import { Pagination } from '../../ui/Pagination'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import type { SortDirection } from '../../../lib/cards/cardHooks'
import { useCachedProwJobs } from '../../../hooks/useCachedData'
import type { ProwJob } from '../../../hooks/useProw'
import { useCardLoadingState, useCardDemoState } from '../CardDataContext'

interface ProwJobsProps {
  config?: Record<string, unknown>
}

export function ProwJobs({ config: _config }: ProwJobsProps) {
  const { t } = useTranslation('common')
  // Check if we should use demo data
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })

  // Fetch ProwJobs from the prow cluster with caching (returns demo data in demo mode)
  const {
    jobs,
    isLoading,
    isRefreshing,
    lastRefresh,
    isFailed,
    consecutiveFailures,
    formatTimeAgo,
  } = useCachedProwJobs('prow', 'prow')

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading,
    hasAnyData: jobs.length > 0,
    isFailed,
    consecutiveFailures: consecutiveFailures ?? 0,
    isDemoData: shouldUseDemoData,
  })

  const [typeFilter, setTypeFilter] = useState<ProwJob['type'] | 'all'>('all')
  const [stateFilter, setStateFilter] = useState<ProwJob['state'] | 'all'>('all')

  // Pre-filter by type and state before passing to useCardData
  const preFilteredJobs = useMemo(() => {
    let filtered = jobs
    if (typeFilter !== 'all') {
      filtered = filtered.filter(j => j.type === typeFilter)
    }
    if (stateFilter !== 'all') {
      filtered = filtered.filter(j => j.state === stateFilter)
    }
    return filtered
  }, [jobs, typeFilter, stateFilter])

  const {
    items,
    totalItems,
    currentPage,
    totalPages,
    goToPage,
    needsPagination,
    itemsPerPage,
    setItemsPerPage,
    filters,
    sorting,
    containerRef,
    containerStyle,
  } = useCardData<ProwJob, 'name' | 'state' | 'started'>(preFilteredJobs, {
    filter: {
      searchFields: ['name', 'state', 'type'] as (keyof ProwJob)[],
      customPredicate: (j, q) => !!(j.pr && String(j.pr).includes(q)),
    },
    sort: {
      defaultField: 'started',
      defaultDirection: 'desc' as SortDirection,
      comparators: {
        name: commonComparators.string<ProwJob>('name'),
        state: commonComparators.string<ProwJob>('state'),
        started: (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      },
    },
    defaultLimit: 5,
  })

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'success': return <CheckCircle className="w-3.5 h-3.5 text-green-400" />
      case 'failure':
      case 'error': return <XCircle className="w-3.5 h-3.5 text-red-400" />
      case 'pending':
      case 'triggered': return <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
      case 'running': return <Play className="w-3.5 h-3.5 text-blue-400" />
      case 'aborted': return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
      default: return <Clock className="w-3.5 h-3.5 text-muted-foreground" />
    }
  }

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      presubmit: 'bg-blue-500/20 text-blue-400',
      postsubmit: 'bg-green-500/20 text-green-400',
      periodic: 'bg-purple-500/20 text-purple-400',
      batch: 'bg-cyan-500/20 text-cyan-400',
    }
    return colors[type] || 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground'
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  const effectivePerPage = itemsPerPage === 'unlimited' ? 100 : itemsPerPage

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
            size="sm"
            showLabel={true}
            staleThresholdMinutes={5}
          />
          <StatusBadge color="orange">
            {totalItems} jobs
          </StatusBadge>
          {jobs.filter(j => j.state === 'running').length > 0 && (
            <StatusBadge color="blue" icon={<Play className="w-3 h-3" />}>
              {jobs.filter(j => j.state === 'running').length} running
            </StatusBadge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ProwJob['type'] | 'all')}
            className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground"
          >
            <option value="all">{t('selectors.allTypes')}</option>
            <option value="periodic">{t('prowJobs.periodic')}</option>
            <option value="presubmit">{t('prowJobs.presubmit')}</option>
            <option value="postsubmit">{t('prowJobs.postsubmit')}</option>
          </select>
          {/* State Filter */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as ProwJob['state'] | 'all')}
            className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground"
          >
            <option value="all">{t('selectors.allStates')}</option>
            <option value="success">{t('common.success')}</option>
            <option value="failure">{t('common.failure')}</option>
            <option value="running">{t('common.running')}</option>
            <option value="pending">{t('common.pending')}</option>
          </select>
          <CardControls
            limit={itemsPerPage}
            onLimitChange={setItemsPerPage}
            sortBy={sorting.sortBy}
            sortOptions={[
              { value: 'name', label: 'Name' },
              { value: 'state', label: 'State' },
              { value: 'started', label: 'Started' },
            ]}
            onSortChange={sorting.setSortBy}
            sortDirection={sorting.sortDirection}
            onSortDirectionChange={sorting.setSortDirection}
          />
        </div>
      </div>

      {/* Search input */}
      <CardSearchInput
        value={filters.search}
        onChange={filters.setSearch}
        placeholder={t('common.searchJobs')}
        className="mb-2"
      />

      {/* Jobs list */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2" style={containerStyle}>
        {items.map((job) => (
          <div key={job.id} className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStateIcon(job.state)}
                <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{job.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeBadge(job.type)}`}>
                  {job.type}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{formatTimeAgo(job.startTime)}</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              {job.pr && <span>PR: #{job.pr}</span>}
              <span>Duration: {job.duration}</span>
              {job.url && (
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline flex items-center gap-2 min-h-11 min-w-11">
                  Logs <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {(job.state === 'failure' || job.state === 'error' || job.state === 'aborted') && (
              <CardAIActions
                resource={{ kind: 'ProwJob', name: job.name, status: job.state }}
                issues={[{ name: `Job ${job.state}`, message: `PROW job "${job.name}" (${job.type}) ended with state: ${job.state}` }]}
                className="mt-1"
              />
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {needsPagination && itemsPerPage !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

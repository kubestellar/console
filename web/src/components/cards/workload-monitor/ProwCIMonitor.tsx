import { useMemo } from 'react'
import {
  Activity, AlertTriangle, CheckCircle, XCircle,
  Clock, RefreshCw, Loader2, Play, Pause,
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { Pagination } from '../../ui/Pagination'
import { CardControls } from '../../ui/CardControls'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { CardSearchInput } from '../../../lib/cards'
import type { SortDirection } from '../../../lib/cards/cardHooks'
import { useCachedProwJobs } from '../../../hooks/useCachedData'
import { cn } from '../../../lib/cn'
import { WorkloadMonitorAlerts } from './WorkloadMonitorAlerts'
import { WorkloadMonitorDiagnose } from './WorkloadMonitorDiagnose'
import type { MonitorIssue, MonitoredResource } from '../../../types/workloadMonitor'
import { useCardLoadingState, useCardDemoState } from '../../cards/CardDataContext'
import { useTranslation } from 'react-i18next'

const SORT_OPTIONS = [
  { value: 'state', label: 'State' },
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
  { value: 'duration', label: 'Duration' },
]

interface ProwCIMonitorProps {
  config?: Record<string, unknown>
}

type SortField = 'name' | 'state' | 'type' | 'duration'

const STATE_ORDER: Record<string, number> = {
  failure: 0,
  error: 1,
  aborted: 2,
  running: 3,
  pending: 4,
  triggered: 5,
  success: 6,
}

const STATE_BADGE: Record<string, string> = {
  success: 'bg-green-500/20 text-green-400',
  failure: 'bg-red-500/20 text-red-400',
  error: 'bg-red-500/20 text-red-400',
  running: 'bg-blue-500/20 text-blue-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
  triggered: 'bg-purple-500/20 text-purple-400',
  aborted: 'bg-gray-500/20 text-gray-400',
}

const STATE_ICON: Record<string, typeof CheckCircle> = {
  success: CheckCircle,
  failure: XCircle,
  error: AlertTriangle,
  running: Play,
  pending: Clock,
  triggered: Activity,
  aborted: Pause,
}

const TYPE_BADGE: Record<string, string> = {
  presubmit: 'bg-blue-500/20 text-blue-400',
  postsubmit: 'bg-green-500/20 text-green-400',
  periodic: 'bg-purple-500/20 text-purple-400',
  batch: 'bg-cyan-500/20 text-cyan-400',
}

export function ProwCIMonitor({ config: _config }: ProwCIMonitorProps) {
  const { t } = useTranslation()
  // Check if we should use demo data
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })

  const { jobs, status: prowStatus, isLoading, isRefreshing, isFailed, consecutiveFailures, refetch, formatTimeAgo } = useCachedProwJobs()

  // Report loading state to CardWrapper
  useCardLoadingState({
    isLoading,
    hasAnyData: jobs.length > 0,
    isFailed,
    consecutiveFailures: consecutiveFailures ?? 0,
    isDemoData: shouldUseDemoData,
  })

  // Stats
  const stats = useMemo(() => {
    const total = jobs.length
    const failed = jobs.filter(j => j.state === 'failure' || j.state === 'error').length
    const running = jobs.filter(j => j.state === 'running').length
    const pending = jobs.filter(j => j.state === 'pending' || j.state === 'triggered').length
    const succeeded = jobs.filter(j => j.state === 'success').length
    const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0
    return { total, failed, running, pending, succeeded, successRate }
  }, [jobs])

  // useCardData for search, sort, pagination
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
  } = useCardData(jobs, {
    filter: {
      searchFields: ['name', 'state', 'type', 'cluster'] as (keyof typeof jobs[0])[],
    },
    sort: {
      defaultField: 'state' as SortField,
      defaultDirection: 'asc' as SortDirection,
      comparators: {
        name: commonComparators.string('name'),
        state: (a, b) => (STATE_ORDER[a.state] ?? 5) - (STATE_ORDER[b.state] ?? 5),
        type: commonComparators.string('type'),
        duration: commonComparators.string('duration'),
      },
    },
    defaultLimit: 8,
  })

  // Synthesize monitor issues from failed jobs
  const issues = useMemo<MonitorIssue[]>(() => {
    return jobs
      .filter(j => j.state === 'failure' || j.state === 'error')
      .map(j => ({
        id: `prow-${j.id}`,
        resource: {
          id: `ProwJob/${j.name}`,
          kind: 'ProwJob',
          name: j.name,
          namespace: 'prow',
          cluster: j.cluster || 'prow',
          status: 'unhealthy' as const,
          category: 'workload' as const,
          lastChecked: j.startTime,
          optional: false,
          order: 0,
        },
        severity: j.state === 'error' ? 'critical' as const : 'warning' as const,
        title: `${j.type} job "${j.name}" ${j.state}`,
        description: `Job started ${formatTimeAgo(j.startTime)}${j.pr ? ` for PR #${j.pr}` : ''}. Duration: ${j.duration}`,
        detectedAt: j.startTime,
      }))
  }, [jobs, formatTimeAgo])

  // Synthesize resources for diagnose
  const monitorResources = useMemo<MonitoredResource[]>(() => {
    return jobs.slice(0, 20).map((j, idx) => ({
      id: `ProwJob/${j.name}/${j.id}`,
      kind: 'ProwJob',
      name: j.name,
      namespace: 'prow',
      cluster: j.cluster || 'prow',
      status: j.state === 'success' ? 'healthy' as const :
              (j.state === 'failure' || j.state === 'error') ? 'unhealthy' as const :
              j.state === 'running' ? 'degraded' as const : 'unknown' as const,
      category: 'workload' as const,
      lastChecked: j.startTime,
      optional: false,
      order: idx,
    }))
  }, [jobs])

  // Overall health
  const overallHealth = useMemo(() => {
    if (prowStatus.healthy === false) return 'unhealthy'
    if (stats.failed > 0) return 'degraded'
    return 'healthy'
  }, [prowStatus.healthy, stats.failed])

  if (isLoading && jobs.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={140} height={20} />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={48} />
          ))}
        </div>
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  if (jobs.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Activity className="w-8 h-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          No Prow jobs detected. Deploy Prow to see CI monitoring data.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="rounded-lg bg-card/50 border border-border p-2.5 mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="text-sm font-medium text-foreground">Prow CI</span>
        <span className="text-xs text-muted-foreground">{stats.total} jobs</span>
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded ml-auto',
          overallHealth === 'healthy' ? 'bg-green-500/20 text-green-400' :
          overallHealth === 'degraded' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-red-500/20 text-red-400',
        )}>
          {overallHealth}
        </span>
        <button
          onClick={refetch}
          disabled={isRefreshing}
          className="p-1 rounded hover:bg-secondary transition-colors"
          title={t('common.refresh')}
        >
          {isRefreshing
            ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-green-400">{stats.successRate}%</p>
          <p className="text-[10px] text-muted-foreground">Success Rate</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-red-400">{stats.failed}</p>
          <p className="text-[10px] text-muted-foreground">{t('common.failed')}</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-blue-400">{stats.running}</p>
          <p className="text-[10px] text-muted-foreground">{t('common.running')}</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-yellow-400">{stats.pending}</p>
          <p className="text-[10px] text-muted-foreground">{t('common.pending')}</p>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-end mb-2">
        <CardControls
          limit={itemsPerPage}
          onLimitChange={setItemsPerPage}
          sortBy={sorting.sortBy}
          sortOptions={SORT_OPTIONS}
          onSortChange={(v) => sorting.setSortBy(v as SortField)}
          sortDirection={sorting.sortDirection}
          onSortDirectionChange={sorting.setSortDirection}
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={filters.search}
        onChange={filters.setSearch}
        placeholder={t('common.searchJobs')}
        className="mb-2"
      />

      {/* Job list */}
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {items.map(job => {
          const StateIcon = STATE_ICON[job.state] || Activity
          return (
            <div
              key={job.id}
              className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-card/30 transition-colors"
            >
              <StateIcon className={cn(
                'w-3.5 h-3.5 shrink-0',
                job.state === 'success' ? 'text-green-400' :
                job.state === 'failure' || job.state === 'error' ? 'text-red-400' :
                job.state === 'running' ? 'text-blue-400' : 'text-muted-foreground',
              )} />
              <span className="text-xs text-foreground truncate flex-1">{job.name}</span>
              <span className={cn('text-[10px] px-1 py-0.5 rounded shrink-0', TYPE_BADGE[job.type] || 'bg-gray-500/20 text-gray-400')}>
                {job.type}
              </span>
              <span className={cn('text-[10px] px-1 py-0.5 rounded shrink-0', STATE_BADGE[job.state] || 'bg-gray-500/20 text-gray-400')}>
                {job.state}
              </span>
              {job.pr && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  #{job.pr}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground shrink-0">
                {job.duration}
              </span>
            </div>
          )
        })}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No matching jobs.</p>
        )}
      </div>

      {/* Pagination */}
      {needsPagination && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
            onPageChange={goToPage}
          />
        </div>
      )}

      {/* Alerts */}
      <WorkloadMonitorAlerts issues={issues} />

      {/* AI Diagnose & Repair */}
      <WorkloadMonitorDiagnose
        resources={monitorResources}
        issues={issues}
        monitorType="prow"
        diagnosable={true}
        repairable={true}
        workloadContext={{
          prowCluster: 'prow',
          totalJobs: stats.total,
          failedJobs: stats.failed,
          successRate: stats.successRate,
          runningJobs: stats.running,
          pendingJobs: stats.pending,
        }}
      />
    </div>
  )
}

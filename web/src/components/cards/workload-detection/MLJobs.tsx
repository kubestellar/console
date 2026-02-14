import {
  CheckCircle, XCircle, Clock, ExternalLink, Cpu,
  AlertCircle, Play, Server
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { CardClusterFilter, CardSearchInput } from '../../../lib/cards'
import { Pagination } from '../../ui/Pagination'
import { CardControls } from '../../ui/CardControls'
import { useCardData } from '../../../lib/cards/cardHooks'
import { DEMO_ML_JOBS } from './shared'
import { useDemoData } from './shared'
import { useCardLoadingState } from '../CardDataContext'
import { useTranslation } from 'react-i18next'

type MLJob = typeof DEMO_ML_JOBS[number]
type SortByOption = 'name' | 'status' | 'framework' | 'gpus'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'status' as const, label: 'Status' },
  { value: 'framework' as const, label: 'Framework' },
  { value: 'gpus' as const, label: 'GPUs' },
]

interface MLJobsProps {
  config?: Record<string, unknown>
}

export function MLJobs({ config: _config }: MLJobsProps) {
  const { t } = useTranslation()
  const { data: jobs, isLoading } = useDemoData(DEMO_ML_JOBS)

  useCardLoadingState({
    isLoading,
    hasAnyData: jobs.length > 0,
  })

  const statusOrder: Record<string, number> = { running: 0, queued: 1, completed: 2, failed: 3 }

  const { items, totalItems, currentPage, totalPages, goToPage, needsPagination, itemsPerPage, setItemsPerPage, filters, sorting } = useCardData<MLJob, SortByOption>(jobs, {
    filter: {
      searchFields: ['name', 'framework', 'status', 'cluster'] as (keyof MLJob)[],
      clusterField: 'cluster' as keyof MLJob,
      storageKey: 'ml-jobs',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        name: (a, b) => a.name.localeCompare(b.name),
        status: (a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99),
        framework: (a, b) => a.framework.localeCompare(b.framework),
        gpus: (a, b) => a.gpus - b.gpus,
      },
    },
    defaultLimit: 5,
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 flex items-center gap-1"><Play className="w-2.5 h-2.5" /> Running</span>
      case 'queued':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Queued</span>
      case 'completed':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> Done</span>
      case 'failed':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-1"><XCircle className="w-2.5 h-2.5" /> Failed</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {filters.localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {filters.localClusterFilter.length}/{filters.availableClusters.length}
            </span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
            {jobs.filter(j => j.status === 'running').length} running
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CardClusterFilter
            availableClusters={filters.availableClusters}
            selectedClusters={filters.localClusterFilter}
            onToggle={filters.toggleClusterFilter}
            onClear={filters.clearClusterFilter}
            isOpen={filters.showClusterFilter}
            setIsOpen={filters.setShowClusterFilter}
            containerRef={filters.clusterFilterRef}
            minClusters={1}
          />
          <CardControls
            limit={itemsPerPage}
            onLimitChange={setItemsPerPage}
            sortBy={sorting.sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={(v) => sorting.setSortBy(v as SortByOption)}
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

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-yellow-400 font-medium">ML Job Detection</p>
          <p className="text-muted-foreground">
            Auto-detects Kubeflow, Ray, and custom ML training jobs.{' '}
            <a href="https://www.kubeflow.org/docs/started/installing-kubeflow/" target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline">
              Kubeflow docs <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Jobs list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {items.map((job, idx) => (
          <div key={idx} className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{job.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  {job.framework}
                </span>
              </div>
              {getStatusBadge(job.status)}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
              <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {job.gpus} GPUs</span>
              {job.eta !== '-' && <span>ETA: {job.eta}</span>}
            </div>
            {job.status === 'running' && (
              <div className="w-full bg-secondary rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-yellow-500 to-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
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
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 100}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

import {
  CheckCircle, XCircle, Clock, ExternalLink, Cpu,
  AlertCircle, Play, Filter, ChevronDown, Server, Search
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { CardControls } from '../../ui/CardControls'
import { Pagination } from '../../ui/Pagination'
import { useCardData } from '../../../lib/cards/cardHooks'
import { DEMO_ML_JOBS } from './shared'
import { useDemoData } from './shared'

type MLJob = typeof DEMO_ML_JOBS[number]

interface MLJobsProps {
  config?: Record<string, unknown>
}

export function MLJobs({ config: _config }: MLJobsProps) {
  const { data: jobs, isLoading } = useDemoData(DEMO_ML_JOBS)

  const { items, totalItems, currentPage, totalPages, goToPage, needsPagination, itemsPerPage, setItemsPerPage, filters } = useCardData<MLJob, 'name'>(jobs, {
    filter: {
      searchFields: ['name', 'framework', 'status', 'cluster'] as (keyof MLJob)[],
      clusterField: 'cluster' as keyof MLJob,
      storageKey: 'ml-jobs',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: {
        name: (a, b) => a.name.localeCompare(b.name),
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
          {filters.availableClusters.length >= 1 && (
            <div ref={filters.clusterFilterRef} className="relative">
              <button
                onClick={() => filters.setShowClusterFilter(!filters.showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  filters.localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {filters.showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button onClick={filters.clearClusterFilter} className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${filters.localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'}`}>All clusters</button>
                    {filters.availableClusters.map(cluster => (
                      <button key={cluster.name} onClick={() => filters.toggleClusterFilter(cluster.name)} className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${filters.localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'}`}>{cluster.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <CardControls limit={itemsPerPage} onLimitChange={setItemsPerPage} />
        </div>
      </div>

      {/* Search input */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => filters.setSearch(e.target.value)}
          placeholder="Search jobs..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

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

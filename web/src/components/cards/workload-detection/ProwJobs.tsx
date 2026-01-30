import { useState, useMemo } from 'react'
import {
  CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink,
  Play, Search
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { CardControls, SortDirection } from '../../ui/CardControls'
import { usePagination, Pagination } from '../../ui/Pagination'
import { useCachedProwJobs } from '../../../hooks/useCachedData'
import type { ProwJob } from '../../../hooks/useProw'

interface ProwJobsProps {
  config?: Record<string, unknown>
}

export function ProwJobs({ config: _config }: ProwJobsProps) {
  // Fetch real ProwJobs from the prow cluster with caching
  const {
    jobs,
    isLoading,
    isRefreshing,
    isFailed,
    formatTimeAgo,
    error,
  } = useCachedProwJobs('prow', 'prow')

  // Debug logging
  console.log('[ProwJobs] render:', { jobsCount: jobs.length, isLoading, isRefreshing, isFailed, error })

  const [sortBy, setSortBy] = useState<'name' | 'state' | 'started'>('started')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [typeFilter, setTypeFilter] = useState<ProwJob['type'] | 'all'>('all')
  const [stateFilter, setStateFilter] = useState<ProwJob['state'] | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Filter and sort jobs
  const sortedJobs = useMemo(() => {
    let filtered = [...jobs]

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(j =>
        j.name.toLowerCase().includes(q) ||
        j.state.toLowerCase().includes(q) ||
        j.type.toLowerCase().includes(q) ||
        (j.pr && String(j.pr).includes(q))
      )
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(j => j.type === typeFilter)
    }

    // Apply state filter
    if (stateFilter !== 'all') {
      filtered = filtered.filter(j => j.state === stateFilter)
    }

    return filtered.sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'state':
          compare = a.state.localeCompare(b.state)
          break
        case 'started':
          compare = new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })
  }, [jobs, sortBy, sortDirection, typeFilter, stateFilter, searchQuery])

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(sortedJobs, effectivePerPage)

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'success': return <CheckCircle className="w-3.5 h-3.5 text-green-400" />
      case 'failure':
      case 'error': return <XCircle className="w-3.5 h-3.5 text-red-400" />
      case 'pending':
      case 'triggered': return <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
      case 'running': return <Play className="w-3.5 h-3.5 text-blue-400" />
      case 'aborted': return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
      default: return <Clock className="w-3.5 h-3.5 text-gray-400" />
    }
  }

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      presubmit: 'bg-blue-500/20 text-blue-400',
      postsubmit: 'bg-green-500/20 text-green-400',
      periodic: 'bg-purple-500/20 text-purple-400',
      batch: 'bg-cyan-500/20 text-cyan-400',
    }
    return colors[type] || 'bg-gray-500/20 text-gray-400'
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

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
            {sortedJobs.length} jobs
          </span>
          {jobs.filter(j => j.state === 'running').length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1">
              <Play className="w-3 h-3" />
              {jobs.filter(j => j.state === 'running').length} running
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ProwJob['type'] | 'all')}
            className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground"
          >
            <option value="all">All Types</option>
            <option value="periodic">Periodic</option>
            <option value="presubmit">Presubmit</option>
            <option value="postsubmit">Postsubmit</option>
          </select>
          {/* State Filter */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as ProwJob['state'] | 'all')}
            className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground"
          >
            <option value="all">All States</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
          </select>
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={[
              { value: 'name', label: 'Name' },
              { value: 'state', label: 'State' },
              { value: 'started', label: 'Started' },
            ]}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
        </div>
      </div>

      {/* Search input */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search jobs..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Jobs list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {paginatedItems.map((job) => (
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
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline flex items-center gap-1">
                  Logs <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
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

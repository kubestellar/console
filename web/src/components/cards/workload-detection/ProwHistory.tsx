import { useState, useMemo } from 'react'
import {
  CheckCircle, XCircle, AlertTriangle, ExternalLink, Search
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { CardControls } from '../../ui/CardControls'
import { usePagination, Pagination } from '../../ui/Pagination'
import { useCachedProwJobs } from '../../../hooks/useCachedData'

interface ProwHistoryProps {
  config?: Record<string, unknown>
}

export function ProwHistory({ config: _config }: ProwHistoryProps) {
  const { jobs, isLoading, formatTimeAgo } = useCachedProwJobs('prow', 'prow')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter to only completed jobs for history view
  const completedJobs = useMemo(() => {
    let filtered = jobs.filter(j => j.state === 'success' || j.state === 'failure' || j.state === 'error' || j.state === 'aborted')

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(j =>
        j.name.toLowerCase().includes(q) ||
        j.state.toLowerCase().includes(q) ||
        j.type.toLowerCase().includes(q) ||
        j.duration.toLowerCase().includes(q)
      )
    }

    return filtered
  }, [jobs, searchQuery])

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(completedJobs, effectivePerPage)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
          {completedJobs.length} revisions
        </span>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
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
          placeholder="Search history..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
        <div className="space-y-2">
          {paginatedItems.map((job) => (
            <div key={job.id} className="relative pl-6 group">
              <div className={`absolute left-0 top-2 w-4 h-4 rounded-full flex items-center justify-center ${
                job.state === 'success' ? 'bg-green-500' : job.state === 'aborted' ? 'bg-yellow-500' : 'bg-red-500'
              }`}>
                {job.state === 'success' ? (
                  <CheckCircle className="w-2.5 h-2.5 text-white" />
                ) : job.state === 'aborted' ? (
                  <AlertTriangle className="w-2.5 h-2.5 text-white" />
                ) : (
                  <XCircle className="w-2.5 h-2.5 text-white" />
                )}
              </div>
              <div className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate">{job.name}</span>
                  <span className="text-xs text-muted-foreground">{formatTimeAgo(job.startTime)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{job.duration}</span>
                  {job.url && (
                    <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline flex items-center gap-1">
                      Logs <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
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

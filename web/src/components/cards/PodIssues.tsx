import { useState, useMemo, useEffect } from 'react'
import { MemoryStick, ImageOff, Clock, RefreshCw, ChevronRight } from 'lucide-react'
import { usePodIssues, PodIssue } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { LimitedAccessWarning } from '../ui/LimitedAccessWarning'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'

type SortByOption = 'status' | 'name' | 'restarts' | 'cluster'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'restarts' as const, label: 'Restarts' },
  { value: 'cluster' as const, label: 'Cluster' },
]

// Format relative time (e.g., "2m ago", "1h ago")
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const getIssueIcon = (status: string): { icon: typeof MemoryStick; tooltip: string } => {
  if (status.includes('OOM')) return { icon: MemoryStick, tooltip: 'Out of Memory - Pod exceeded memory limits' }
  if (status.includes('Image')) return { icon: ImageOff, tooltip: 'Image Pull Error - Failed to pull container image' }
  if (status.includes('Pending')) return { icon: Clock, tooltip: 'Pending - Pod is waiting to be scheduled' }
  return { icon: RefreshCw, tooltip: 'Restart Loop - Pod is repeatedly crashing' }
}

const getStatusColors = (status: string) => {
  const lowerStatus = status.toLowerCase()
  if (lowerStatus.includes('failed') || lowerStatus.includes('error') || lowerStatus.includes('crashloop') || lowerStatus.includes('oom')) {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/20', iconBg: 'bg-red-500/20' }
  }
  if (lowerStatus.includes('pending') || lowerStatus.includes('waiting') || lowerStatus.includes('creating')) {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/20', iconBg: 'bg-yellow-500/20' }
  }
  if (lowerStatus.includes('running')) {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/20', iconBg: 'bg-green-500/20' }
  }
  // Default to orange for unknown/warning states
  return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/20', iconBg: 'bg-orange-500/20' }
}

export function PodIssues() {
  const {
    issues: rawIssues,
    isLoading: hookLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = usePodIssues()

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && rawIssues.length === 0
  const { drillToPod } = useDrillDownActions()
  const { filterByCluster, filterByStatus, customFilter } = useGlobalFilters()
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(5)
  const [loadingTooLong, setLoadingTooLong] = useState(false)

  // Track if loading is taking too long
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setLoadingTooLong(true), 10000)
      return () => clearTimeout(timer)
    } else {
      setLoadingTooLong(false)
    }
  }, [isLoading])

  // Filter and sort issues
  const filteredAndSorted = useMemo(() => {
    // Apply global filters
    let filtered = filterByCluster(rawIssues)
    filtered = filterByStatus(filtered)

    // Apply custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      filtered = filtered.filter(issue =>
        issue.name.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        (issue.cluster || '').toLowerCase().includes(query) ||
        issue.status.toLowerCase().includes(query)
      )
    }

    const sorted = [...filtered].sort((a, b) => {
      let result = 0
      if (sortBy === 'status') result = a.status.localeCompare(b.status)
      else if (sortBy === 'name') result = a.name.localeCompare(b.name)
      else if (sortBy === 'restarts') result = b.restarts - a.restarts
      else if (sortBy === 'cluster') result = (a.cluster || '').localeCompare(b.cluster || '')
      return sortDirection === 'asc' ? result : -result
    })
    return sorted
  }, [rawIssues, sortBy, sortDirection, filterByCluster, filterByStatus, customFilter])

  // Use pagination hook
  const effectivePerPage = itemsPerPage === 'unlimited' ? 1000 : itemsPerPage
  const {
    paginatedItems: issues,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-3">
          <Skeleton variant="text" width={80} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
        </div>
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <div className="h-full flex flex-col content-loaded">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">Pod Issues</span>
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={() => refetch()}
          />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3" title="All pods are healthy">
            <svg
              className="w-6 h-6 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-foreground font-medium">All pods healthy</p>
          <p className="text-sm text-muted-foreground">No issues detected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Pod Issues</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400" title={`${rawIssues.length} pods with issues`}>
            {rawIssues.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CardControls
            limit={itemsPerPage}
            onLimitChange={setItemsPerPage}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={() => refetch()}
          />
        </div>
      </div>

      {/* Issues list */}
      <div className="flex-1 space-y-2 overflow-y-auto min-h-card-content">
        {issues.map((issue: PodIssue, idx: number) => {
          const { icon: Icon, tooltip: iconTooltip } = getIssueIcon(issue.status)
          const colors = getStatusColors(issue.status)
          return (
            <div
              key={`${issue.name}-${idx}`}
              data-tour={idx === 0 ? 'drilldown' : undefined}
              className={`p-3 rounded-lg ${colors.bg} border ${colors.border} cursor-pointer hover:opacity-80 transition-all`}
              onClick={() => drillToPod(issue.cluster || 'default', issue.namespace, issue.name, {
                status: issue.status,
                restarts: issue.restarts,
                issues: issue.issues,
              })}
              title={`Click to view details for ${issue.name}`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${colors.iconBg} flex-shrink-0`} title={iconTooltip}>
                  <Icon className={`w-4 h-4 ${colors.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ClusterBadge cluster={issue.cluster || 'default'} />
                    <span className="text-xs text-muted-foreground" title={`Namespace: ${issue.namespace}`}>{issue.namespace}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate" title={issue.name}>{issue.name}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded ${colors.bg} ${colors.text}`} title={`Status: ${issue.status}`}>
                      {issue.status}
                    </span>
                    {issue.restarts > 0 && (
                      <span className="text-xs text-muted-foreground" title={`Pod has restarted ${issue.restarts} times`}>
                        {issue.restarts} restarts
                      </span>
                    )}
                  </div>
                  {issue.issues.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 truncate" title={issue.issues.join(', ')}>
                      {issue.issues.join(', ')}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 self-center" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {needsPagination && itemsPerPage !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}

      <LimitedAccessWarning hasError={!!error} className="mt-2" />
    </div>
  )
}

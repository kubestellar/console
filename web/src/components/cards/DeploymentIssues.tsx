import { useState, useMemo } from 'react'
import { AlertTriangle, AlertCircle, Clock, Scale, ChevronRight } from 'lucide-react'
import { useDeploymentIssues, DeploymentIssue } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { Skeleton } from '../ui/Skeleton'
import { LimitedAccessWarning } from '../ui/LimitedAccessWarning'
import { RefreshButton } from '../ui/RefreshIndicator'

type SortByOption = 'status' | 'name' | 'cluster'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'cluster' as const, label: 'Cluster' },
]

interface DeploymentIssuesProps {
  config?: Record<string, unknown>
}

const getIssueIcon = (status: string): { icon: typeof AlertCircle; tooltip: string } => {
  if (status.includes('Unavailable')) return { icon: AlertCircle, tooltip: 'Deployment unavailable - Not enough replicas are ready' }
  if (status.includes('Progressing')) return { icon: Clock, tooltip: 'Deployment in progress - Rollout is ongoing' }
  if (status.includes('ReplicaFailure')) return { icon: Scale, tooltip: 'Replica failure - Failed to create or maintain replicas' }
  return { icon: AlertTriangle, tooltip: 'Deployment issue - Check deployment status' }
}

export function DeploymentIssues({ config }: DeploymentIssuesProps) {
  const cluster = config?.cluster as string | undefined
  const namespace = config?.namespace as string | undefined
  const {
    issues: rawIssues,
    isLoading: hookLoading,
    isRefreshing,
    error,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = useDeploymentIssues(cluster, namespace)

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && rawIssues.length === 0
  const { drillToDeployment } = useDrillDownActions()
  const { filterByCluster } = useGlobalFilters()
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(5)

  // Filter and sort issues
  const filteredAndSorted = useMemo(() => {
    const filtered = filterByCluster(rawIssues)
    const sorted = [...filtered].sort((a, b) => {
      let result = 0
      if (sortBy === 'status') result = (a.reason || '').localeCompare(b.reason || '')
      else if (sortBy === 'name') result = a.name.localeCompare(b.name)
      else if (sortBy === 'cluster') result = (a.cluster || '').localeCompare(b.cluster || '')
      return sortDirection === 'asc' ? result : -result
    })
    return sorted
  }, [rawIssues, sortBy, sortDirection, filterByCluster])

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

  const handleDeploymentClick = (issue: DeploymentIssue) => {
    drillToDeployment(issue.cluster || 'default', issue.namespace, issue.name, {
      replicas: issue.replicas,
      readyReplicas: issue.readyReplicas,
      reason: issue.reason,
      message: issue.message,
    })
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Skeleton variant="text" width={120} height={16} />
            <Skeleton variant="rounded" width={24} height={18} />
          </div>
          <Skeleton variant="rounded" width={120} height={28} />
        </div>
        {/* Issue items skeleton */}
        <div className="flex-1 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={100} />
          ))}
        </div>
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-card content-loaded">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">Deployment Issues</span>
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={() => refetch()}
          />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3" title="All deployments are healthy">
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
          <p className="text-foreground font-medium">All deployments healthy</p>
          <p className="text-sm text-muted-foreground">No issues detected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Deployment Issues</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400" title={`${rawIssues.length} deployments with issues`}>
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
      <div className="flex-1 space-y-3 overflow-y-auto min-h-card-content">
        {issues.map((issue, idx) => {
          const { icon: Icon, tooltip: iconTooltip } = getIssueIcon(issue.reason || '')

          return (
            <div
              key={`${issue.name}-${idx}`}
              className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/15 transition-colors"
              onClick={() => handleDeploymentClick(issue)}
              title={`Click to view details for ${issue.name}`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-orange-500/20 flex-shrink-0" title={iconTooltip}>
                  <Icon className="w-4 h-4 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ClusterBadge cluster={issue.cluster || 'default'} />
                    <span className="text-xs text-muted-foreground" title={`Namespace: ${issue.namespace}`}>{issue.namespace}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate" title={issue.name}>{issue.name}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400" title={`Issue: ${issue.reason || 'Unknown'}`}>
                      {issue.reason || 'Issue'}
                    </span>
                    <span className="text-xs text-muted-foreground" title={`${issue.readyReplicas} of ${issue.replicas} replicas are ready`}>
                      {issue.readyReplicas}/{issue.replicas} ready
                    </span>
                  </div>
                  {issue.message && (
                    <p className="text-xs text-muted-foreground mt-1 truncate" title={issue.message}>
                      {issue.message}
                    </p>
                  )}
                </div>
                <span title="Click to view details"><ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" /></span>
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

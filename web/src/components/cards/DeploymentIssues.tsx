import { AlertTriangle, AlertCircle, Clock, Scale, CheckCircle } from 'lucide-react'
import { useCachedDeploymentIssues } from '../../hooks/useCachedData'
import type { DeploymentIssue } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { LimitedAccessWarning } from '../ui/LimitedAccessWarning'
import { useReportCardDataState } from './CardDataContext'
import {
  useCardData, commonComparators,
  CardSkeleton, CardEmptyState, CardSearchInput,
  CardControlsRow, CardListItem, CardPaginationFooter,
} from '../../lib/cards'

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
  const clusterConfig = config?.cluster as string | undefined
  const namespaceConfig = config?.namespace as string | undefined
  const {
    issues: rawIssues,
    isLoading: hookLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    error
  } = useCachedDeploymentIssues(clusterConfig, namespaceConfig)

  // hasData should be true once loading completes (even with empty data)
  // This prevents skeleton showing forever when API returns empty array
  const hasData = !hookLoading || rawIssues.length > 0
  const isLoading = hookLoading && rawIssues.length === 0
  const { drillToDeployment } = useDrillDownActions()

  // Report data state to CardWrapper for failure badge rendering
  useReportCardDataState({
    isFailed,
    consecutiveFailures,
    isLoading: isLoading && !hasData,
    isRefreshing: isRefreshing || (hookLoading && hasData),
    hasData,
  })

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: issues,
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
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters: availableClustersForFilter,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
  } = useCardData<DeploymentIssue, SortByOption>(rawIssues, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'reason', 'message'],
      clusterField: 'cluster',
      storageKey: 'deployment-issues',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) => (a.reason || '').localeCompare(b.reason || ''),
        name: commonComparators.string('name'),
        cluster: (a, b) => (a.cluster || '').localeCompare(b.cluster || ''),
      },
    },
    defaultLimit: 5,
  })

  const handleDeploymentClick = (issue: DeploymentIssue) => {
    drillToDeployment(issue.cluster || 'default', issue.namespace, issue.name, {
      replicas: issue.replicas,
      readyReplicas: issue.readyReplicas,
      reason: issue.reason,
      message: issue.message,
    })
  }

  if (isLoading) {
    return <CardSkeleton type="list" rows={3} showHeader rowHeight={100} />
  }

  if (issues.length === 0 && rawIssues.length === 0) {
    return (
      <CardEmptyState
        icon={CheckCircle}
        title="All deployments healthy"
        message="No issues detected"
        variant="success"
      />
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400" title={`${rawIssues.length} deployments with issues`}>
            {rawIssues.length} issues
          </span>
        </div>
        <CardControlsRow
          clusterIndicator={{
            selectedCount: localClusterFilter.length,
            totalCount: availableClustersForFilter.length,
          }}
          clusterFilter={{
            availableClusters: availableClustersForFilter,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1,
          }}
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

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search issues..."
        className="mb-3"
      />

      {/* Issues list */}
      <div className="flex-1 space-y-3 overflow-y-auto min-h-card-content">
        {issues.map((issue, idx) => {
          const { icon: Icon, tooltip: iconTooltip } = getIssueIcon(issue.reason || '')

          return (
            <CardListItem
              key={`${issue.name}-${idx}`}
              onClick={() => handleDeploymentClick(issue)}
              bgClass="bg-orange-500/10"
              borderClass="border-orange-500/20"
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
              </div>
            </CardListItem>
          )
        })}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      <LimitedAccessWarning hasError={!!error} className="mt-2" />
    </div>
  )
}

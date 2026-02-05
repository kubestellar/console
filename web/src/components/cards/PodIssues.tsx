import { MemoryStick, ImageOff, Clock, RefreshCw, CheckCircle } from 'lucide-react'
import { useCachedPodIssues } from '../../hooks/useCachedData'
import type { PodIssue } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { LimitedAccessWarning } from '../ui/LimitedAccessWarning'
import { useCardLoadingState } from './CardDataContext'
import {
  useCardData, commonComparators, getStatusColors,
  CardSkeleton, CardEmptyState, CardSearchInput,
  CardControlsRow, CardListItem, CardPaginationFooter,
} from '../../lib/cards'

type SortByOption = 'status' | 'name' | 'restarts' | 'cluster'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'restarts' as const, label: 'Restarts' },
  { value: 'cluster' as const, label: 'Cluster' },
]

const getIssueIcon = (status: string): { icon: typeof MemoryStick; tooltip: string } => {
  if (status.includes('OOM')) return { icon: MemoryStick, tooltip: 'Out of Memory - Pod exceeded memory limits' }
  if (status.includes('Image')) return { icon: ImageOff, tooltip: 'Image Pull Error - Failed to pull container image' }
  if (status.includes('Pending')) return { icon: Clock, tooltip: 'Pending - Pod is waiting to be scheduled' }
  return { icon: RefreshCw, tooltip: 'Restart Loop - Pod is repeatedly crashing' }
}

export function PodIssues() {
  const {
    issues: rawIssues,
    isLoading: hookLoading,
    isFailed,
    consecutiveFailures,
    error
  } = useCachedPodIssues()

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: hookLoading,
    hasAnyData: rawIssues.length > 0,
    isFailed,
    consecutiveFailures,
  })
  const { drillToPod } = useDrillDownActions()

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
  } = useCardData<PodIssue, SortByOption>(rawIssues, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'status'],
      clusterField: 'cluster',
      statusField: 'status',
      customPredicate: (issue, query) => issue.issues.some(i => i.toLowerCase().includes(query)),
      storageKey: 'pod-issues',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: commonComparators.string('status'),
        name: commonComparators.string('name'),
        restarts: (a, b) => b.restarts - a.restarts, // Higher restarts first
        cluster: (a, b) => (a.cluster || '').localeCompare(b.cluster || ''),
      },
    },
    defaultLimit: 5,
  })

  if (showSkeleton) {
    return <CardSkeleton type="list" rows={3} showHeader rowHeight={80} />
  }

  if (issues.length === 0 && rawIssues.length === 0) {
    return (
      <CardEmptyState
        icon={CheckCircle}
        title="All pods healthy"
        message="No issues detected"
        variant="success"
      />
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No pod issues</p>
        <p className="text-xs mt-1">All pods are healthy</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400" title={`${rawIssues.length} pods with issues`}>
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
      <div className="flex-1 space-y-2 overflow-y-auto min-h-card-content">
        {issues.map((issue: PodIssue, idx: number) => {
          const { icon: Icon, tooltip: iconTooltip } = getIssueIcon(issue.status)
          const colors = getStatusColors(issue.status)
          return (
            <CardListItem
              key={`${issue.name}-${idx}`}
              dataTour={idx === 0 ? 'drilldown' : undefined}
              onClick={() => issue.cluster && drillToPod(issue.cluster, issue.namespace, issue.name, {
                status: issue.status,
                restarts: issue.restarts,
                issues: issue.issues,
              })}
              bgClass={colors.bg}
              borderClass={colors.border}
              title={`Click to view details for ${issue.name}`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${colors.iconBg} flex-shrink-0`} title={iconTooltip}>
                  <Icon className={`w-4 h-4 ${colors.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ClusterBadge cluster={issue.cluster || 'unknown'} />
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

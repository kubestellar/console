import { useMemo } from 'react'
import { Clock, AlertTriangle, Settings, ChevronRight } from 'lucide-react'
import { useClusters, useOperatorSubscriptions, OperatorSubscription } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useCardLoadingState } from './CardDataContext'
import {
  useCardData,
  useCardFilters,
  commonComparators,
  type SortDirection,
} from '../../lib/cards'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../lib/cards/CardComponents'

interface OperatorSubscriptionsProps {
  config?: {
    cluster?: string
  }
}

type SortByOption = 'pending' | 'name' | 'approval' | 'channel'

const SORT_OPTIONS = [
  { value: 'pending' as const, label: 'Pending First' },
  { value: 'name' as const, label: 'Name' },
  { value: 'approval' as const, label: 'Approval' },
  { value: 'channel' as const, label: 'Channel' },
]

const SUBSCRIPTION_SORT_COMPARATORS = {
  pending: (a: OperatorSubscription, b: OperatorSubscription) =>
    (a.pendingUpgrade ? 0 : 1) - (b.pendingUpgrade ? 0 : 1),
  name: commonComparators.string<OperatorSubscription>('name'),
  approval: commonComparators.string<OperatorSubscription>('installPlanApproval'),
  channel: commonComparators.string<OperatorSubscription>('channel'),
}

// Shared filter config for counting and display
const FILTER_CONFIG = {
  searchFields: ['name', 'namespace', 'channel', 'currentCSV'] as (keyof OperatorSubscription)[],
  clusterField: 'cluster' as keyof OperatorSubscription,
  storageKey: 'operator-subscriptions',
}

export function OperatorSubscriptions({ config: _config }: OperatorSubscriptionsProps) {
  const { isLoading: clustersLoading } = useClusters()
  const { drillToOperator } = useDrillDownActions()

  // Fetch subscriptions - pass undefined to get all clusters
  const { subscriptions: rawSubscriptions, isLoading: subscriptionsLoading, consecutiveFailures, isFailed } = useOperatorSubscriptions(undefined)

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading || subscriptionsLoading,
    hasAnyData: rawSubscriptions.length > 0,
    isFailed,
    consecutiveFailures,
  })

  // Use useCardFilters for summary counts (globally filtered, before local search/pagination)
  const { filtered: globalFilteredSubscriptions } = useCardFilters(rawSubscriptions, FILTER_CONFIG)

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: subscriptions,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: searchQuery,
      setSearch: setSearchQuery,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
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
  } = useCardData<OperatorSubscription, SortByOption>(rawSubscriptions, {
    filter: {
      searchFields: ['name', 'namespace', 'channel', 'currentCSV'] as (keyof OperatorSubscription)[],
      clusterField: 'cluster',
      storageKey: 'operator-subscriptions',
    },
    sort: {
      defaultField: 'pending',
      defaultDirection: 'asc' as SortDirection,
      comparators: SUBSCRIPTION_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // Summary counts from globally filtered data (before local search/pagination)
  const { autoCount, manualCount, pendingCount } = useMemo(() => ({
    autoCount: globalFilteredSubscriptions.filter(s => s.installPlanApproval === 'Automatic').length,
    manualCount: globalFilteredSubscriptions.filter(s => s.installPlanApproval === 'Manual').length,
    pendingCount: globalFilteredSubscriptions.filter(s => s.pendingUpgrade).length,
  }), [globalFilteredSubscriptions])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={150} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No subscriptions</p>
        <p className="text-xs mt-1">Operator subscriptions will appear here</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Controls - single row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              {pendingCount} pending
            </span>
          )}
        </div>
        <CardControlsRow
          clusterIndicator={localClusterFilter.length > 0 ? {
            selectedCount: localClusterFilter.length,
            totalCount: availableClusters.length,
          } : undefined}
          clusterFilter={{
            availableClusters,
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

      {availableClusters.length > 0 && (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            {localClusterFilter.length === 1 ? (
              <ClusterBadge cluster={localClusterFilter[0]} />
            ) : localClusterFilter.length > 1 ? (
              <span className="text-xs px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-400">
                {localClusterFilter.length} clusters selected
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-400">
                All Clusters ({availableClusters.length})
              </span>
            )}
          </div>

          {/* Local Search */}
          <CardSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search subscriptions..."
            className="mb-4"
          />

          {/* Summary badges */}
          <div className="flex gap-2 mb-4 text-xs">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400">
              <Settings className="w-3 h-3" />
              <span>{autoCount} Auto</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-400">
              <Clock className="w-3 h-3" />
              <span>{manualCount} Manual</span>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/10 text-orange-400">
                <AlertTriangle className="w-3 h-3" />
                <span>{pendingCount} Pending</span>
              </div>
            )}
          </div>

          {/* Subscriptions list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {subscriptions.map((sub) => (
              <div
                key={`${sub.cluster || 'unknown'}-${sub.namespace}-${sub.name}`}
                onClick={() => sub.cluster && drillToOperator(sub.cluster, sub.namespace, sub.name, {
                  channel: sub.channel,
                  currentCSV: sub.currentCSV,
                  installPlanApproval: sub.installPlanApproval,
                  pendingUpgrade: sub.pendingUpgrade,
                })}
                className={`p-3 rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors group ${sub.pendingUpgrade ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-secondary/30'}`}
                title={`Click to view operator ${sub.name} details`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {sub.cluster && (
                      <ClusterBadge cluster={sub.cluster} size="sm" />
                    )}
                    <span className="text-sm text-foreground font-medium">{sub.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      sub.installPlanApproval === 'Automatic'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {sub.installPlanApproval}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span>Channel: {sub.channel}</span>
                    <span>{sub.namespace}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="truncate">{sub.currentCSV}</span>
                  </div>
                  {sub.pendingUpgrade && (
                    <div className="flex items-center gap-1 text-orange-400 mt-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Upgrade pending: {sub.pendingUpgrade}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <CardPaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
            onPageChange={goToPage}
            needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
          />

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {totalItems} subscription{totalItems !== 1 ? 's' : ''} {localClusterFilter.length === 1 ? `on ${localClusterFilter[0]}` : `across ${availableClusters.length} cluster${availableClusters.length !== 1 ? 's' : ''}`}
          </div>
        </>
      )}
    </div>
  )
}

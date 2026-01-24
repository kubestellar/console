import { useState, useMemo } from 'react'
import { Newspaper, Clock, AlertTriangle, Settings, Search, ChevronRight, AlertCircle } from 'lucide-react'
import { useClusters, useOperatorSubscriptions } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { usePersistedClusterSelection } from '../../hooks/usePersistedClusterSelection'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

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

export function OperatorSubscriptions({ config }: OperatorSubscriptionsProps) {
  const { isLoading: clustersLoading, isRefreshing: clustersRefreshing, refetch: refetchClusters, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  // Use persisted cluster selection - survives global filter changes
  const {
    selectedCluster,
    setSelectedCluster,
    availableClusters: clusters,
    isOutsideGlobalFilter,
  } = usePersistedClusterSelection({
    storageKey: 'operator-subscriptions',
    defaultValue: config?.cluster || 'all',
    allowAll: true,
  })
  const [sortBy, setSortBy] = useState<SortByOption>('pending')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
  } = useGlobalFilters()
  const { drillToOperator } = useDrillDownActions()

  // Fetch subscriptions - pass undefined when 'all' to get all clusters
  const { subscriptions: rawSubscriptions, isLoading: subscriptionsLoading, isRefreshing: subscriptionsRefreshing, refetch: refetchSubscriptions } = useOperatorSubscriptions(selectedCluster === 'all' ? undefined : selectedCluster || undefined)

  const isRefreshing = clustersRefreshing || subscriptionsRefreshing
  const refetch = () => {
    refetchClusters()
    if (selectedCluster) refetchSubscriptions()
  }

  // Filter and sort subscriptions
  const sortedSubscriptions = useMemo(() => {
    let result = [...rawSubscriptions]

    // Apply global cluster filter when showing all clusters
    if (selectedCluster === 'all' && !isAllClustersSelected) {
      result = result.filter(sub => {
        const clusterName = sub.cluster?.split('/')[0] || ''
        return globalSelectedClusters.includes(clusterName) || globalSelectedClusters.includes(sub.cluster || '')
      })
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(sub =>
        sub.name.toLowerCase().includes(query) ||
        sub.namespace.toLowerCase().includes(query) ||
        sub.channel.toLowerCase().includes(query) ||
        sub.currentCSV.toLowerCase().includes(query)
      )
    }

    return result.sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'pending':
          compare = (a.pendingUpgrade ? 0 : 1) - (b.pendingUpgrade ? 0 : 1)
          break
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'approval':
          compare = a.installPlanApproval.localeCompare(b.installPlanApproval)
          break
        case 'channel':
          compare = a.channel.localeCompare(b.channel)
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })
  }, [rawSubscriptions, sortBy, sortDirection, localSearch, selectedCluster, isAllClustersSelected, globalSelectedClusters])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: subscriptions,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(sortedSubscriptions, effectivePerPage)

  const isLoading = clustersLoading || subscriptionsLoading
  const showSkeleton = isLoading && rawSubscriptions.length === 0

  // Use sortedSubscriptions for total counts (after filtering, not raw data)
  const autoCount = sortedSubscriptions.filter(s => s.installPlanApproval === 'Automatic').length
  const manualCount = sortedSubscriptions.filter(s => s.installPlanApproval === 'Manual').length
  const pendingCount = sortedSubscriptions.filter(s => s.pendingUpgrade).length

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

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-muted-foreground">Operator Subscriptions</span>
          {pendingCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
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
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Cluster selector */}
      <div className="mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className={`w-full px-3 py-1.5 rounded-lg bg-secondary border text-sm text-foreground ${
            isOutsideGlobalFilter ? 'border-orange-500/50' : 'border-border'
          }`}
        >
          <option value="all">All Clusters</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
          {/* Show the selected cluster even if outside global filter */}
          {isOutsideGlobalFilter && (
            <option value={selectedCluster}>{selectedCluster} (filtered out)</option>
          )}
        </select>
        {isOutsideGlobalFilter && (
          <div className="flex items-center gap-1 mt-1 text-xs text-orange-400">
            <AlertCircle className="w-3 h-3" />
            <span>Selection outside global filter</span>
          </div>
        )}
      </div>

      {selectedCluster && (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            {selectedCluster === 'all' ? (
              <span className="text-xs px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-400">
                All Clusters {!isAllClustersSelected && `(${globalSelectedClusters.length} selected)`}
              </span>
            ) : (
              <ClusterBadge cluster={selectedCluster} />
            )}
          </div>

          {/* Local Search */}
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search subscriptions..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

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
                key={`${sub.cluster || 'default'}-${sub.namespace}-${sub.name}`}
                onClick={() => drillToOperator(sub.cluster || selectedCluster || 'default', sub.namespace, sub.name, {
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
          {needsPagination && limit !== 'unlimited' && (
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

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {totalItems} subscriptions {selectedCluster === 'all' ? 'across all clusters' : `on ${selectedCluster}`}
          </div>
        </>
      )}
    </div>
  )
}

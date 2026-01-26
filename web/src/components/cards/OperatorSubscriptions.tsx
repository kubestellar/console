import { useState, useMemo } from 'react'
import { Clock, AlertTriangle, Settings, Search, ChevronRight, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters, useOperatorSubscriptions } from '../../hooks/useMCP'
import { useChartFilters } from '../../lib/cards'
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

export function OperatorSubscriptions({ config: _config }: OperatorSubscriptionsProps) {
  const { isLoading: clustersLoading, isRefreshing: clustersRefreshing, refetch: refetchClusters, isFailed, consecutiveFailures, lastRefresh } = useClusters()

  // Use chart filters hook for cluster filtering
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    filteredClusters: clusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({ storageKey: 'operator-subscriptions' })

  const [sortBy, setSortBy] = useState<SortByOption>('pending')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')
  const { drillToOperator } = useDrillDownActions()

  // Fetch subscriptions - pass undefined to get all clusters
  const { subscriptions: rawSubscriptions, isLoading: subscriptionsLoading, isRefreshing: subscriptionsRefreshing, refetch: refetchSubscriptions } = useOperatorSubscriptions(undefined)

  const isRefreshing = clustersRefreshing || subscriptionsRefreshing
  const refetch = () => {
    refetchClusters()
    refetchSubscriptions()
  }

  // Filter and sort subscriptions
  const sortedSubscriptions = useMemo(() => {
    let result = [...rawSubscriptions]

    // Apply cluster filter (from useChartFilters)
    const clusterNames = new Set(clusters.map(c => c.name))
    result = result.filter(sub => {
      const clusterName = sub.cluster?.split('/')[0] || ''
      return clusterNames.has(clusterName) || clusterNames.has(sub.cluster || '')
    })

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
  }, [rawSubscriptions, clusters, sortBy, sortDirection, localSearch])

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
      {/* Controls - single row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {clusters.length}/{availableClusters.length}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster Filter */}
          {availableClusters.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>

              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button
                      onClick={clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {availableClusters.map(cluster => (
                      <button
                        key={cluster.name}
                        onClick={() => toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                          localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        {cluster.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
                All Clusters ({clusters.length})
              </span>
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
                onClick={() => drillToOperator(sub.cluster || 'default', sub.namespace, sub.name, {
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
            {totalItems} subscription{totalItems !== 1 ? 's' : ''} {localClusterFilter.length === 1 ? `on ${localClusterFilter[0]}` : `across ${clusters.length} cluster${clusters.length !== 1 ? 's' : ''}`}
          </div>
        </>
      )}
    </div>
  )
}

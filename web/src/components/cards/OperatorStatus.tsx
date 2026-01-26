import { useState, useMemo } from 'react'
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, ArrowUpCircle, Search, ChevronRight, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters, useOperators, Operator } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useChartFilters } from '../../lib/cards'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

interface OperatorStatusProps {
  config?: {
    cluster?: string
  }
}

type SortByOption = 'status' | 'name' | 'namespace' | 'version'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'version' as const, label: 'Version' },
]

export function OperatorStatus({ config: _config }: OperatorStatusProps) {
  const { isLoading: clustersLoading, isRefreshing: clustersRefreshing, refetch: refetchClusters, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { drillToOperator } = useDrillDownActions()

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
  } = useChartFilters({ storageKey: 'operator-status' })

  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')
  const {
    customFilter,
    filterByStatus,
  } = useGlobalFilters()

  // Fetch operators - pass undefined to get all clusters
  const { operators: rawOperators, isLoading: operatorsLoading, isRefreshing: operatorsRefreshing, refetch: refetchOperators } = useOperators(undefined)

  const isRefreshing = clustersRefreshing || operatorsRefreshing
  const refetch = () => {
    refetchClusters()
    refetchOperators()
  }

  // Apply filters and sorting to operators
  const filteredAndSorted = useMemo(() => {
    let result = rawOperators

    // Apply cluster filter (from useChartFilters)
    const clusterNames = new Set(clusters.map(c => c.name))
    result = result.filter(op => {
      const clusterName = op.cluster?.split('/')[0] || ''
      return clusterNames.has(clusterName) || clusterNames.has(op.cluster || '')
    })

    // Apply status filter
    result = filterByStatus(result)

    // Apply custom text filter (global)
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(op =>
        op.name.toLowerCase().includes(query) ||
        op.namespace.toLowerCase().includes(query) ||
        op.version.toLowerCase().includes(query)
      )
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(op =>
        op.name.toLowerCase().includes(query) ||
        op.namespace.toLowerCase().includes(query) ||
        op.version.toLowerCase().includes(query)
      )
    }

    // Sort
    const statusOrder: Record<string, number> = { Failed: 0, Installing: 1, Upgrading: 2, Succeeded: 3 }
    result = [...result].sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'status':
          compare = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
          break
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'namespace':
          compare = a.namespace.localeCompare(b.namespace)
          break
        case 'version':
          compare = a.version.localeCompare(b.version)
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })

    return result
  }, [rawOperators, clusters, filterByStatus, customFilter, localSearch, sortBy, sortDirection])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: operators,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

  const isLoading = clustersLoading || operatorsLoading
  const showSkeleton = isLoading && rawOperators.length === 0

  const getStatusIcon = (status: Operator['status']) => {
    switch (status) {
      case 'Succeeded': return CheckCircle
      case 'Failed': return XCircle
      case 'Installing': return RefreshCw
      case 'Upgrading': return ArrowUpCircle
      default: return AlertTriangle
    }
  }

  const getStatusColor = (status: Operator['status']) => {
    switch (status) {
      case 'Succeeded': return 'green'
      case 'Failed': return 'red'
      case 'Installing': return 'blue'
      case 'Upgrading': return 'purple'
      default: return 'orange'
    }
  }

  // Use filteredAndSorted for total counts (not paginated 'operators')
  const statusCounts = {
    succeeded: filteredAndSorted.filter(o => o.status === 'Succeeded').length,
    failed: filteredAndSorted.filter(o => o.status === 'Failed').length,
    other: filteredAndSorted.filter(o => !['Succeeded', 'Failed'].includes(o.status)).length,
  }

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
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
          {totalItems > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
              {totalItems} operators
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
              <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">
                {localClusterFilter.length} clusters selected
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">
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
              placeholder="Search operators..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          {/* Summary */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{statusCounts.succeeded}</span>
              <p className="text-xs text-muted-foreground">Running</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-red-500/10 text-center">
              <span className="text-lg font-bold text-red-400">{statusCounts.failed}</span>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center">
              <span className="text-lg font-bold text-blue-400">{statusCounts.other}</span>
              <p className="text-xs text-muted-foreground">Other</p>
            </div>
          </div>

          {/* Operators list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {operators.map((op) => {
              const StatusIcon = getStatusIcon(op.status)
              const color = getStatusColor(op.status)

              return (
                <div
                  key={`${op.cluster || 'default'}-${op.namespace}-${op.name}`}
                  onClick={() => drillToOperator(op.cluster || '', op.namespace, op.name, {
                    status: op.status,
                    version: op.version,
                    upgradeAvailable: op.upgradeAvailable,
                  })}
                  className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 text-${color}-400 ${op.status === 'Installing' ? 'animate-spin' : ''}`} />
                      {op.cluster && (
                        <ClusterBadge cluster={op.cluster} size="sm" />
                      )}
                      <span className="text-sm text-foreground group-hover:text-purple-400">{op.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`}>
                        {op.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-1 ml-6 text-xs text-muted-foreground">
                    <span>{op.namespace}</span>
                    <span>{op.version}</span>
                    {op.upgradeAvailable && (
                      <span className="flex items-center gap-1 text-cyan-400">
                        <ArrowUpCircle className="w-3 h-3" />
                        {op.upgradeAvailable}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
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
            {totalItems} operator{totalItems !== 1 ? 's' : ''} {localClusterFilter.length === 1 ? `on ${localClusterFilter[0]}` : `across ${clusters.length} cluster${clusters.length !== 1 ? 's' : ''}`}
          </div>
        </>
      )}
    </div>
  )
}

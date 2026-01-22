import { useState, useMemo } from 'react'
import { Package, CheckCircle, AlertTriangle, XCircle, RefreshCw, ArrowUpCircle, Search } from 'lucide-react'
import { useClusters, useOperators, Operator } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
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

export function OperatorStatus({ config }: OperatorStatusProps) {
  const { clusters: allClusters, isLoading: clustersLoading, isRefreshing: clustersRefreshing, refetch: refetchClusters, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
    filterByStatus,
  } = useGlobalFilters()

  // Apply global filters
  const clusters = useMemo(() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Fetch operators for selected cluster
  const { operators: rawOperators, isLoading: operatorsLoading, isRefreshing: operatorsRefreshing, refetch: refetchOperators } = useOperators(selectedCluster || undefined)

  const isRefreshing = clustersRefreshing || operatorsRefreshing
  const refetch = () => {
    refetchClusters()
    if (selectedCluster) refetchOperators()
  }

  // Apply filters and sorting to operators
  const filteredAndSorted = useMemo(() => {
    let result = rawOperators

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
  }, [rawOperators, filterByStatus, customFilter, localSearch, sortBy, sortDirection])

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

  const statusCounts = {
    succeeded: operators.filter(o => o.status === 'Succeeded').length,
    failed: operators.filter(o => o.status === 'Failed').length,
    other: operators.filter(o => !['Succeeded', 'Failed'].includes(o.status)).length,
  }

  if (isLoading) {
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-muted-foreground">OLM Operators</span>
          {totalItems > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
              {totalItems}
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
      <select
        value={selectedCluster}
        onChange={(e) => setSelectedCluster(e.target.value)}
        className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground mb-4"
      >
        <option value="">Select cluster...</option>
        {clusters.map(c => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>

      {!selectedCluster ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster to view operators
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
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
            {operators.map((op, idx) => {
              const StatusIcon = getStatusIcon(op.status)
              const color = getStatusColor(op.status)

              return (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 text-${color}-400 ${op.status === 'Installing' ? 'animate-spin' : ''}`} />
                      <span className="text-sm text-foreground">{op.name}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`}>
                      {op.status}
                    </span>
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
            {totalItems} operators via Operator Lifecycle Manager
          </div>
        </>
      )}
    </div>
  )
}

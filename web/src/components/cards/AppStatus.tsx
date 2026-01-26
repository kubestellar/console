import { useState, useMemo } from 'react'
import { Box, CheckCircle, AlertTriangle, Clock, ChevronRight, Loader2, Search, Filter, ChevronDown, Server } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useCachedDeployments } from '../../hooks/useCachedData'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useChartFilters } from '../../lib/cards'

type SortByOption = 'status' | 'name' | 'clusters'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'clusters' as const, label: 'Clusters' },
]

interface AppStatusProps {
  config?: any
}

interface AppData {
  name: string
  namespace: string
  clusters: string[]
  status: { healthy: number; warning: number; pending: number }
}

export function AppStatus(_props: AppStatusProps) {
  const { drillToDeployment } = useDrillDownActions()
  const { deployments, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useCachedDeployments()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({
    storageKey: 'app-status',
  })

  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')

  // Transform deployments into app data grouped by name
  const rawApps = useMemo((): AppData[] => {
    const appMap = new Map<string, AppData>()

    deployments.forEach(dep => {
      const key = dep.name
      if (!appMap.has(key)) {
        appMap.set(key, {
          name: dep.name,
          namespace: dep.namespace,
          clusters: [],
          status: { healthy: 0, warning: 0, pending: 0 },
        })
      }
      const app = appMap.get(key)!
      const clusterName = dep.cluster?.split('/').pop() || dep.cluster || 'unknown'
      if (!app.clusters.includes(clusterName)) {
        app.clusters.push(clusterName)
      }
      // Determine status based on deployment state
      if (dep.status === 'running' && dep.readyReplicas === dep.replicas) {
        app.status.healthy++
      } else if (dep.status === 'deploying' || dep.readyReplicas < dep.replicas) {
        app.status.pending++
      } else if (dep.status === 'failed') {
        app.status.warning++
      } else {
        app.status.healthy++
      }
    })

    return Array.from(appMap.values())
  }, [deployments])

  const filteredAndSorted = useMemo(() => {
    // Apply global filters first
    let filtered = rawApps

    // Filter by selected clusters
    if (!isAllClustersSelected) {
      filtered = filtered.map(app => ({
        ...app,
        clusters: app.clusters.filter(c => globalSelectedClusters.some(gc => gc.includes(c) || c.includes(gc.split('/').pop() || gc)))
      })).filter(app => app.clusters.length > 0)
    }

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      filtered = filtered.map(app => ({
        ...app,
        clusters: app.clusters.filter(c => localClusterFilter.includes(c))
      })).filter(app => app.clusters.length > 0)
    }

    // Apply custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      filtered = filtered.filter(app =>
        app.name.toLowerCase().includes(query) ||
        app.clusters.some(c => c.toLowerCase().includes(query))
      )
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      filtered = filtered.filter(app =>
        app.name.toLowerCase().includes(query) ||
        app.namespace.toLowerCase().includes(query) ||
        app.clusters.some(c => c.toLowerCase().includes(query))
      )
    }

    const sorted = [...filtered].sort((a, b) => {
      let result = 0
      if (sortBy === 'status') {
        // Sort by warning count (most warnings first)
        const aScore = a.status.warning * 10 + a.status.pending
        const bScore = b.status.warning * 10 + b.status.pending
        result = bScore - aScore
      } else if (sortBy === 'name') result = a.name.localeCompare(b.name)
      else if (sortBy === 'clusters') result = b.clusters.length - a.clusters.length
      return sortDirection === 'asc' ? -result : result
    })
    return sorted
  }, [rawApps, sortBy, sortDirection, globalSelectedClusters, isAllClustersSelected, customFilter, localSearch, localClusterFilter])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: apps,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

  const handleAppClick = (app: AppData, cluster: string) => {
    // Drill down to the deployment in the specified cluster
    drillToDeployment(cluster, app.namespace, app.name)
  }

  if (isLoading && rawApps.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
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

      {/* Local Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search workloads..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
      {apps.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          No workloads found
        </div>
      ) : apps.map((app) => {
        const total = app.status.healthy + app.status.warning + app.status.pending

        return (
          <div
            key={`${app.name}-${app.namespace}`}
            onClick={() => handleAppClick(app, app.clusters[0])}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
            title={`Click to view details for ${app.name}`}
          >
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span title="Workload"><Box className="w-4 h-4 text-purple-400 shrink-0" /></span>
                <span className="text-sm font-medium text-foreground truncate" title={app.name}>{app.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground" title={`Deployed to ${total} cluster${total !== 1 ? 's' : ''}`}>
                  {total} cluster{total !== 1 ? 's' : ''}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-4">
              {app.status.healthy > 0 && (
                <div className="flex items-center gap-1" title={`${app.status.healthy} healthy instance${app.status.healthy !== 1 ? 's' : ''}`}>
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs text-green-400">{app.status.healthy}</span>
                </div>
              )}
              {app.status.warning > 0 && (
                <div className="flex items-center gap-1" title={`${app.status.warning} instance${app.status.warning !== 1 ? 's' : ''} with warnings`}>
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs text-yellow-400">{app.status.warning}</span>
                </div>
              )}
              {app.status.pending > 0 && (
                <div className="flex items-center gap-1" title={`${app.status.pending} pending instance${app.status.pending !== 1 ? 's' : ''}`}>
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-blue-400">{app.status.pending}</span>
                </div>
              )}
            </div>

            {/* Cluster badges */}
            <div className="flex flex-wrap gap-1 mt-2 overflow-hidden">
              {app.clusters.map((cluster) => (
                <ClusterBadge key={cluster} cluster={cluster} showIcon={false} />
              ))}
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
    </div>
  )
}

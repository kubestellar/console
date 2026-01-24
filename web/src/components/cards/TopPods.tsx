import { Loader2, AlertTriangle, ChevronRight, Search, Filter, ChevronDown, Server } from 'lucide-react'
import { usePods } from '../../hooks/useMCP'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useCardData, commonComparators } from '../../lib/cards'

type SortByOption = 'restarts' | 'name'

interface TopPodsProps {
  config?: {
    cluster?: string
    namespace?: string
    sortBy?: SortByOption
    limit?: number
  }
}

const SORT_OPTIONS = [
  { value: 'restarts' as const, label: 'Restarts' },
  { value: 'name' as const, label: 'Name' },
]

export function TopPods({ config }: TopPodsProps) {
  const clusterConfig = config?.cluster
  const namespaceConfig = config?.namespace
  const { drillToPod } = useDrillDownActions()

  // Fetch more pods to allow client-side filtering and pagination
  const { pods: rawPods, isLoading, isRefreshing, error, refetch, isFailed, consecutiveFailures, lastRefresh } = usePods(clusterConfig, namespaceConfig, 'restarts', 100)

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: pods,
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
  } = useCardData<(typeof rawPods)[0], SortByOption>(rawPods, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'status'],
      clusterField: 'cluster',
      storageKey: 'top-pods',
    },
    sort: {
      defaultField: config?.sortBy || 'restarts',
      defaultDirection: 'desc',
      comparators: {
        restarts: (a, b) => b.restarts - a.restarts,
        name: commonComparators.string('name'),
      },
    },
    defaultLimit: config?.limit || 5,
  })

  if (isLoading && pods.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && pods.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {error}
      </div>
    )
  }

  // Find the max restarts for visual scaling
  const maxRestarts = Math.max(...pods.map(p => p.restarts), 1)

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Top Pods</span>
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster Filter */}
          {availableClustersForFilter.length > 1 && (
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
                    {availableClustersForFilter.map(cluster => (
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
          placeholder="Search pods..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Pods list */}
      {pods.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No pods found
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto min-h-card-content">
          {pods.map((pod, index) => {
            const effectivePerPage = typeof itemsPerPage === 'number' ? itemsPerPage : 5
            const displayIndex = (currentPage - 1) * effectivePerPage + index + 1
            return (
            <div
              key={`${pod.cluster}-${pod.namespace}-${pod.name}`}
              className="group p-2 rounded-lg bg-secondary/30 border border-border/50 hover:border-border transition-colors cursor-pointer"
              onClick={() => drillToPod(pod.cluster || 'default', pod.namespace, pod.name, {
                status: pod.status,
                restarts: pod.restarts,
              })}
              title={`Click to view details for ${pod.name}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs text-muted-foreground w-5">{displayIndex}.</span>
                  <span className="text-sm font-medium text-foreground truncate" title={pod.name}>
                    {pod.name}
                  </span>
                </div>
                {pod.restarts > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <AlertTriangle className={`w-3 h-3 ${
                      pod.restarts >= 10 ? 'text-red-400' :
                      pod.restarts >= 5 ? 'text-orange-400' :
                      'text-yellow-400'
                    }`} />
                    <span className={`text-xs font-medium ${
                      pod.restarts >= 10 ? 'text-red-400' :
                      pod.restarts >= 5 ? 'text-orange-400' :
                      'text-yellow-400'
                    }`}>
                      {pod.restarts}
                    </span>
                  </div>
                )}
                {pod.restarts === 0 && (
                  <span className="text-xs text-green-400 font-medium">0</span>
                )}
              </div>

              {/* Progress bar for restarts visualization */}
              {sortBy === 'restarts' && pod.restarts > 0 && (
                <div className="h-1 bg-secondary rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full transition-all duration-300 ${
                      pod.restarts >= 10 ? 'bg-red-500' :
                      pod.restarts >= 5 ? 'bg-orange-500' :
                      'bg-yellow-500'
                    }`}
                    style={{ width: `${(pod.restarts / maxRestarts) * 100}%` }}
                  />
                </div>
              )}

              {/* Cluster and namespace - prominent */}
              <div className="flex items-center gap-2 mt-1 mb-1">
                <ClusterBadge cluster={pod.cluster || 'default'} />
                <span className="text-xs text-muted-foreground truncate">{pod.namespace}</span>
              </div>

              {/* Details row */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0">{pod.status}</span>
                  <span className="flex-shrink-0">{pod.ready}</span>
                  <span className="flex-shrink-0">{pod.age}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          )})}
        </div>
      )}

      {/* Pagination */}
      {needsPagination && itemsPerPage !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

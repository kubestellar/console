import { useState, useMemo } from 'react'
import { RefreshCw, Loader2, AlertTriangle, ChevronRight } from 'lucide-react'
import { usePods } from '../../hooks/useMCP'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'

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
  const cluster = config?.cluster
  const namespace = config?.namespace
  const [sortBy, setSortBy] = useState<SortByOption>(config?.sortBy || 'restarts')
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(config?.limit || 5)

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()
  const { drillToPod } = useDrillDownActions()

  // Fetch more pods to allow client-side filtering and pagination
  const { pods: rawPods, isLoading, error, refetch } = usePods(cluster, namespace, sortBy, 100)

  // Apply global filters (without limit - pagination handles that)
  const filteredPods = useMemo(() => {
    let filtered = rawPods

    // Filter by global cluster selection (if card doesn't have a specific cluster configured)
    if (!cluster && !isAllClustersSelected) {
      filtered = filtered.filter(pod => globalSelectedClusters.includes(pod.cluster || ''))
    }

    // Apply custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      filtered = filtered.filter(pod =>
        pod.name.toLowerCase().includes(query) ||
        pod.namespace.toLowerCase().includes(query) ||
        (pod.cluster || '').toLowerCase().includes(query)
      )
    }

    return filtered
  }, [rawPods, cluster, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Use pagination hook
  const effectivePerPage = itemsPerPage === 'unlimited' ? 1000 : itemsPerPage
  const {
    paginatedItems: pods,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredPods, effectivePerPage)

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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">Top Pods</span>
        <div className="flex items-center gap-2">
          <CardControls
            limit={itemsPerPage}
            onLimitChange={setItemsPerPage}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
          />
          <button
            onClick={() => refetch()}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pods list */}
      {pods.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No pods found
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto min-h-card-content">
          {pods.map((pod, index) => {
            const displayIndex = (currentPage - 1) * perPage + index + 1
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
            itemsPerPage={perPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

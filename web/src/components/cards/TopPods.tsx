import { Loader2, AlertTriangle, ChevronRight, Server, Cpu, MemoryStick, Zap } from 'lucide-react'
import { useCachedPods } from '../../hooks/useCachedData'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useCardLoadingState } from './CardDataContext'
import { useCardData, commonComparators, CardClusterFilter, CardSearchInput } from '../../lib/cards'

type SortByOption = 'restarts' | 'name' | 'cpu' | 'memory' | 'gpu'

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
  { value: 'cpu' as const, label: 'CPU' },
  { value: 'memory' as const, label: 'Memory' },
  { value: 'gpu' as const, label: 'GPU' },
  { value: 'name' as const, label: 'Name' },
]

// Format CPU millicores to human readable
const formatCpu = (millis: number | undefined): string => {
  if (!millis) return '-'
  if (millis >= 1000) {
    return `${(millis / 1000).toFixed(1)}c`
  }
  return `${millis}m`
}

// Format memory bytes to human readable
const formatMemory = (bytes: number | undefined): string => {
  if (!bytes) return '-'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) {
    return `${gb.toFixed(1)}Gi`
  }
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) {
    return `${mb.toFixed(0)}Mi`
  }
  return `${(bytes / 1024).toFixed(0)}Ki`
}

// Get effective CPU value (prefer actual usage over request)
const getEffectiveCpu = (pod: { cpuUsageMillis?: number; cpuRequestMillis?: number; metricsAvailable?: boolean }) => {
  return pod.metricsAvailable && pod.cpuUsageMillis ? pod.cpuUsageMillis : (pod.cpuRequestMillis || 0)
}

// Get effective memory value (prefer actual usage over request)
const getEffectiveMemory = (pod: { memoryUsageBytes?: number; memoryRequestBytes?: number; metricsAvailable?: boolean }) => {
  return pod.metricsAvailable && pod.memoryUsageBytes ? pod.memoryUsageBytes : (pod.memoryRequestBytes || 0)
}

export function TopPods({ config }: TopPodsProps) {
  const clusterConfig = config?.cluster
  const namespaceConfig = config?.namespace
  const { drillToPod } = useDrillDownActions()

  // Fetch more pods to allow client-side filtering and pagination (using unified cache)
  const {
    pods: rawPods,
    isLoading,
    isFailed,
    consecutiveFailures,
    error
  } = useCachedPods(clusterConfig, namespaceConfig, { limit: 100, category: 'pods' })

  // Report data state to CardWrapper for failure badge rendering
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: rawPods.length > 0,
    isFailed,
    consecutiveFailures,
  })

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
        cpu: (a, b) => getEffectiveCpu(b) - getEffectiveCpu(a),
        memory: (a, b) => getEffectiveMemory(b) - getEffectiveMemory(a),
        gpu: (a, b) => (b.gpuRequest || 0) - (a.gpuRequest || 0),
        name: commonComparators.string('name'),
      },
    },
    defaultLimit: config?.limit || 5,
  })

  if (showSkeleton) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No pods</p>
        <p className="text-xs mt-1">Pods will appear when running</p>
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

  // Find max values for visual scaling based on current sort
  const maxRestarts = Math.max(...pods.map(p => p.restarts), 1)
  const maxCpu = Math.max(...pods.map(p => getEffectiveCpu(p)), 1)
  const maxMemory = Math.max(...pods.map(p => getEffectiveMemory(p)), 1)
  const maxGpu = Math.max(...pods.map(p => p.gpuRequest || 0), 1)

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster Filter */}
          <CardClusterFilter
            availableClusters={availableClustersForFilter}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={clearClusterFilter}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={1}
          />
          <CardControls
            limit={itemsPerPage}
            onLimitChange={setItemsPerPage}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search pods..."
        className="mb-3"
      />

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
              onClick={() => pod.cluster && drillToPod(pod.cluster, pod.namespace, pod.name, {
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
                {/* Metric badge based on sort */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {sortBy === 'restarts' && (
                    <>
                      {pod.restarts > 0 ? (
                        <>
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
                        </>
                      ) : (
                        <span className="text-xs text-green-400 font-medium">0</span>
                      )}
                    </>
                  )}
                  {sortBy === 'cpu' && (
                    <>
                      <Cpu className="w-3 h-3 text-blue-400" />
                      <span className="text-xs font-medium text-blue-400">
                        {formatCpu(getEffectiveCpu(pod))}
                      </span>
                      {pod.metricsAvailable && <span className="text-[10px] text-blue-400/60">▲</span>}
                    </>
                  )}
                  {sortBy === 'memory' && (
                    <>
                      <MemoryStick className="w-3 h-3 text-purple-400" />
                      <span className="text-xs font-medium text-purple-400">
                        {formatMemory(getEffectiveMemory(pod))}
                      </span>
                      {pod.metricsAvailable && <span className="text-[10px] text-purple-400/60">▲</span>}
                    </>
                  )}
                  {sortBy === 'gpu' && (
                    <>
                      <Zap className="w-3 h-3 text-green-400" />
                      <span className="text-xs font-medium text-green-400">
                        {pod.gpuRequest || 0} GPU
                      </span>
                    </>
                  )}
                  {sortBy === 'name' && pod.restarts > 0 && (
                    <span className={`text-xs ${
                      pod.restarts >= 10 ? 'text-red-400' :
                      pod.restarts >= 5 ? 'text-orange-400' :
                      'text-yellow-400'
                    }`}>
                      {pod.restarts}
                    </span>
                  )}
                </div>
              </div>

              {/* Progress bar for current sort metric visualization */}
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
              {sortBy === 'cpu' && getEffectiveCpu(pod) > 0 && (
                <div className="h-1 bg-secondary rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full transition-all duration-300 bg-blue-500"
                    style={{ width: `${(getEffectiveCpu(pod) / maxCpu) * 100}%` }}
                  />
                </div>
              )}
              {sortBy === 'memory' && getEffectiveMemory(pod) > 0 && (
                <div className="h-1 bg-secondary rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full transition-all duration-300 bg-purple-500"
                    style={{ width: `${(getEffectiveMemory(pod) / maxMemory) * 100}%` }}
                  />
                </div>
              )}
              {sortBy === 'gpu' && (pod.gpuRequest || 0) > 0 && (
                <div className="h-1 bg-secondary rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full transition-all duration-300 bg-green-500"
                    style={{ width: `${((pod.gpuRequest || 0) / maxGpu) * 100}%` }}
                  />
                </div>
              )}

              {/* Cluster and namespace - prominent */}
              <div className="flex items-center gap-2 mt-1 mb-1">
                <ClusterBadge cluster={pod.cluster || 'unknown'} />
                <span className="text-xs text-muted-foreground truncate">{pod.namespace}</span>
              </div>

              {/* Resource metrics row - shows actual usage if available, otherwise requests */}
              {(getEffectiveCpu(pod) > 0 || getEffectiveMemory(pod) > 0 || pod.gpuRequest) ? (
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  {getEffectiveCpu(pod) > 0 ? (
                    <span
                      className={`flex items-center gap-1 ${pod.metricsAvailable ? 'text-blue-400' : ''}`}
                      title={pod.metricsAvailable
                        ? `CPU Usage: ${formatCpu(pod.cpuUsageMillis)}${pod.cpuRequestMillis ? ` (Request: ${formatCpu(pod.cpuRequestMillis)})` : ''}`
                        : `CPU Request: ${formatCpu(pod.cpuRequestMillis)}`}
                    >
                      <Cpu className="w-3 h-3" />
                      {formatCpu(getEffectiveCpu(pod))}
                      {pod.metricsAvailable && <span className="text-[10px] opacity-60">▲</span>}
                    </span>
                  ) : null}
                  {getEffectiveMemory(pod) > 0 ? (
                    <span
                      className={`flex items-center gap-1 ${pod.metricsAvailable ? 'text-purple-400' : ''}`}
                      title={pod.metricsAvailable
                        ? `Memory Usage: ${formatMemory(pod.memoryUsageBytes)}${pod.memoryRequestBytes ? ` (Request: ${formatMemory(pod.memoryRequestBytes)})` : ''}`
                        : `Memory Request: ${formatMemory(pod.memoryRequestBytes)}`}
                    >
                      <MemoryStick className="w-3 h-3" />
                      {formatMemory(getEffectiveMemory(pod))}
                      {pod.metricsAvailable && <span className="text-[10px] opacity-60">▲</span>}
                    </span>
                  ) : null}
                  {pod.gpuRequest ? (
                    <span className="flex items-center gap-1" title={`GPU Request: ${pod.gpuRequest}`}>
                      <Zap className="w-3 h-3" />
                      {pod.gpuRequest}
                    </span>
                  ) : null}
                </div>
              ) : null}

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

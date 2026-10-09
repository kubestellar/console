import { memo, useMemo } from 'react'
import { AlertTriangle, ChevronRight, Server, Cpu, MemoryStick, Zap } from 'lucide-react'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useCachedPods } from '../../hooks/useCachedData'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useCardLoadingState } from './CardDataContext'
import { CardClusterFilter, CardSearchInput, CardSkeleton, CardAIActions, CardEmptyState } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'

import {
  SORT_OPTIONS,
  formatCpu,
  formatMemory,
  getEffectiveCpu,
  getEffectiveMemory,
  type SortByOption,
} from './TopPods.utils'
import { TopPodResourceMetrics } from './TopPodResourceMetrics'

interface TopPodsProps {
  config?: {
    cluster?: string
    namespace?: string
    sortBy?: SortByOption
    limit?: number
  }
}

function TopPodsInternal({ config }: TopPodsProps) {
  const { t } = useTranslation()
  const clusterConfig = config?.cluster
  const namespaceConfig = config?.namespace
  const { isDemoMode } = useDemoMode()
  const { drillToPod } = useDrillDownActions()

  // Fetch more pods to allow client-side filtering and pagination (using unified cache)
  const {
    pods: rawPods,
    isLoading,
    isDemoFallback,
    isRefreshing,
    lastRefresh,
    isFailed,
    consecutiveFailures,
    error
  } = useCachedPods(clusterConfig, namespaceConfig, { limit: 100, category: 'pods' })

  // Report data state to CardWrapper for failure badge rendering
  const hasData = rawPods.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    isDemoData: isDemoMode || isDemoFallback,
    hasAnyData: hasData,
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
    containerRef,
    containerStyle,
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

  // Find max values for visual scaling based on current sort
  // Must be called before any conditional returns to comply with Rules of Hooks
  const { maxRestarts, maxCpu, maxMemory, maxGpu } = useMemo(() => ({
    maxRestarts: Math.max(...pods.map(p => p.restarts), 1),
    maxCpu: Math.max(...pods.map(p => getEffectiveCpu(p)), 1),
    maxMemory: Math.max(...pods.map(p => getEffectiveMemory(p)), 1),
    maxGpu: Math.max(...pods.map(p => p.gpuRequest || 0), 1),
  }), [pods])

  if (showSkeleton) {
    return <CardSkeleton rows={5} type="list" showHeader showSearch />
  }

  if (showEmptyState) {
    return (
      <CardEmptyState
        icon={Cpu}
        title="No pods"
        message="Pods will appear when running on your clusters."
      />
    )
  }

  if (error && pods.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
            size="sm"
            showLabel={true}
            staleThresholdMinutes={5}
          />
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
        placeholder={t('common.searchPods')}
        className="mb-3"
      />

      {/* Pods list */}
      {pods.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No pods found
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 space-y-2 overflow-y-auto min-h-card-content" style={containerStyle}>
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
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs text-muted-foreground w-5">{displayIndex}.</span>
                  <span className="text-sm font-medium text-foreground truncate" title={pod.name}>
                    {pod.name}
                  </span>
                </div>
                {/* Metric badge based on sort */}
                <div className="flex items-center gap-1 shrink-0">
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
                      {pod.metricsAvailable && <span className="text-2xs text-blue-400/60">▲</span>}
                    </>
                  )}
                  {sortBy === 'memory' && (
                    <>
                      <MemoryStick className="w-3 h-3 text-purple-400" />
                      <span className="text-xs font-medium text-purple-400">
                        {formatMemory(getEffectiveMemory(pod))}
                      </span>
                      {pod.metricsAvailable && <span className="text-2xs text-purple-400/60">▲</span>}
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
              <TopPodResourceMetrics pod={pod} />

              {/* Details row */}
              <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="shrink-0">{pod.status}</span>
                  <span className="shrink-0">{pod.ready}</span>
                  <span className="shrink-0">{pod.age}</span>
                </div>
                <div className="flex items-center gap-1">
                  {(pod.restarts >= 1 || (pod.status !== 'Running' && pod.status !== 'Succeeded' && pod.status !== 'Completed')) && (
                    <CardAIActions
                      resource={{ kind: 'Pod', name: pod.name, namespace: pod.namespace, cluster: pod.cluster, status: pod.status }}
                      issues={[
                        ...(pod.restarts >= 1 ? [{ name: 'High restarts', message: `Pod has restarted ${pod.restarts} time${pod.restarts !== 1 ? 's' : ''}` }] : []),
                        ...(pod.status !== 'Running' && pod.status !== 'Succeeded' && pod.status !== 'Completed' ? [{ name: `Pod ${pod.status}`, message: `Pod is in ${pod.status} state` }] : []),
                      ]}
                    />
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
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

export const TopPods = memo(function TopPods(props: TopPodsProps) {
  return (
    <DynamicCardErrorBoundary cardId="TopPods">
      <TopPodsInternal {...props} />
    </DynamicCardErrorBoundary>
  )
})

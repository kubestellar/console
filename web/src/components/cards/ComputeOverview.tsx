import { useMemo } from 'react'
import { Cpu, MemoryStick, Zap, Server, Box, Activity } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedGPUNodes } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { formatStat, formatMemoryStat } from '../../lib/formatStats'
import { CardClusterFilter } from '../../lib/cards/CardComponents'
import { useChartFilters } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { ClusterStatusDot } from '../ui/ClusterStatusBadge'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'

export function ComputeOverview() {
  const { t } = useTranslation(['cards', 'common'])
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: clustersRefreshing, isFailed: clustersFailed, consecutiveFailures: clustersConsecutiveFailures } = useClusters()
  const { nodes: gpuNodes, isLoading: gpuLoading, isRefreshing: gpuRefreshing, isDemoFallback } = useCachedGPUNodes()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToResources } = useDrillDownActions()
  const { isDemoMode } = useDemoMode()

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef } = useChartFilters({
    storageKey: 'compute-overview' })

  // Memoize filtered arrays to avoid new references on every render (#5774)
  const globalFilteredClusters = useMemo(() => {
    if (isAllClustersSelected) return clusters
    return clusters.filter(c => selectedClusters.includes(c.name))
  }, [clusters, isAllClustersSelected, selectedClusters])

  const filteredClusters = useMemo(() => {
    if (localClusterFilter.length === 0) return globalFilteredClusters
    return globalFilteredClusters.filter(c => localClusterFilter.includes(c.name))
  }, [globalFilteredClusters, localClusterFilter])

  const filteredGPUNodes = useMemo(() => {
    let result = gpuNodes
    if (!isAllClustersSelected) {
      result = result.filter(n => {
        const clusterName = (n.cluster ?? '').split('/')[0]
        return selectedClusters.includes(clusterName)
      })
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(n => {
        const clusterName = (n.cluster ?? '').split('/')[0]
        return localClusterFilter.includes(clusterName)
      })
    }
    return result
  }, [gpuNodes, isAllClustersSelected, selectedClusters, localClusterFilter])

  // Calculate compute stats
  const stats = useMemo(() => {
    const totalCPUs = filteredClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const totalMemoryGB = filteredClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
    const totalNodes = filteredClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
    const totalPods = filteredClusters.reduce((sum, c) => sum + (c.podCount || 0), 0)

    // GPU stats
    const totalGPUs = filteredGPUNodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const allocatedGPUs = filteredGPUNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
    const gpuUtilization = totalGPUs > 0 ? Math.round((allocatedGPUs / totalGPUs) * 100) : 0

    // Group GPU types
    const gpuTypes = new Map<string, number>()
    filteredGPUNodes.forEach(n => {
      const type = n.gpuType || 'Unknown'
      gpuTypes.set(type, (gpuTypes.get(type) || 0) + n.gpuCount)
    })

    // Calculate cluster health stats
    const healthyClusters = filteredClusters.filter(c => c.healthy && c.reachable !== false).length
    const degradedClusters = filteredClusters.filter(c => !c.healthy && c.reachable !== false).length
    const offlineClusters = filteredClusters.filter(c => c.reachable === false).length

    return {
      totalCPUs,
      totalMemoryGB,
      totalNodes,
      totalPods,
      totalGPUs,
      allocatedGPUs,
      availableGPUs: totalGPUs - allocatedGPUs,
      gpuUtilization,
      gpuTypes: Array.from(gpuTypes.entries()).sort((a, b) => b[1] - a[1]),
      clustersWithGPU: new Set(filteredGPUNodes.map(n => (n.cluster ?? '').split('/')[0])).size,
      healthyClusters,
      degradedClusters,
      offlineClusters }
  }, [filteredClusters, filteredGPUNodes])

  // Check if we have real data from reachable clusters
  // A cluster counts as having data as soon as nodeCount is reported — even 0
  // is a valid value for a newly provisioned cluster (#7354)
  const hasRealData = !isLoading && filteredClusters.length > 0 &&
    filteredClusters.some(c => c.reachable !== false && c.cpuCores !== undefined && c.nodeCount !== undefined)

  // Report state to CardWrapper for refresh animation
  const hasData = clusters.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: (isLoading || gpuLoading) && !hasData,
    isRefreshing: clustersRefreshing || gpuRefreshing,
    hasAnyData: hasData,
    isFailed: clustersFailed,
    consecutiveFailures: clustersConsecutiveFailures,
    isDemoData: isDemoMode || isDemoFallback })

  if (showSkeleton) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t('computeOverview.loadingComputeData')}</div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('computeOverview.noComputeData')}</p>
        <p className="text-xs mt-1">{t('computeOverview.connectToClusters')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Health Indicator */}
      {filteredClusters.length > 0 && (
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-secondary/30 rounded-lg">
          <Activity className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t('computeOverview.clusterHealth')}:</span>
          {stats.healthyClusters > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <ClusterStatusDot state="healthy" size="sm" />
              <span className="text-green-400">{t('computeOverview.healthyCount', { count: stats.healthyClusters })}</span>
            </span>
          )}
          {stats.degradedClusters > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <ClusterStatusDot state="degraded" size="sm" />
              <span className="text-orange-400">{t('computeOverview.degradedCount', { count: stats.degradedClusters })}</span>
            </span>
          )}
          {stats.offlineClusters > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <ClusterStatusDot state="unreachable-timeout" size="sm" />
              <span className="text-yellow-400">{t('computeOverview.offlineCount', { count: stats.offlineClusters })}</span>
            </span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-2">
          {/* Cluster count indicator */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}

          {/* Cluster filter dropdown */}
          <CardClusterFilter
            availableClusters={availableClusters}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={clearClusterFilter}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={1}
          />

        </div>
      </div>

      {/* Main resources */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors"
          onClick={drillToResources}
          title={hasRealData ? t('computeOverview.cpuCoresTitle', { count: stats.totalCPUs }) : t('computeOverview.noDataOffline')}
        >
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-400">{t('computeOverview.cpuCores')}</span>
          </div>
          <span className="text-2xl font-bold text-foreground">
            {hasRealData ? formatStat(stats.totalCPUs) : '-'}
          </span>
          <div className="text-xs text-muted-foreground mt-1">{t('computeOverview.allocatable')}</div>
        </div>

        <div
          className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 cursor-pointer hover:bg-green-500/20 transition-colors"
          onClick={drillToResources}
          title={hasRealData ? t('computeOverview.memoryTitle', { memory: formatMemoryStat(stats.totalMemoryGB) }) : t('computeOverview.noDataOffline')}
        >
          <div className="flex items-center gap-2 mb-1">
            <MemoryStick className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400">{t('common:common.memory')}</span>
          </div>
          <span className="text-2xl font-bold text-foreground">
            {formatMemoryStat(stats.totalMemoryGB, hasRealData)}
          </span>
          <div className="text-xs text-muted-foreground mt-1">{t('computeOverview.allocatable')}</div>
        </div>
      </div>

      {/* Infrastructure counts */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div
          className="p-2 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary/70 transition-colors"
          onClick={drillToResources}
          title={hasRealData ? t('computeOverview.nodesTitle', { count: stats.totalNodes }) : t('common:common.noData')}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Server className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('common:common.nodes')}</span>
          </div>
          <span className="text-lg font-bold text-foreground">
            {hasRealData ? formatStat(stats.totalNodes) : '-'}
          </span>
        </div>
        <div
          className="p-2 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary/70 transition-colors"
          onClick={drillToResources}
          title={hasRealData ? t('computeOverview.podsTitle', { count: stats.totalPods }) : t('common:common.noData')}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Box className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('common:common.pods')}</span>
          </div>
          <span className="text-lg font-bold text-foreground">
            {hasRealData ? formatStat(stats.totalPods) : '-'}
          </span>
        </div>
      </div>

      {/* GPU Section */}
      <div
        className={`p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 ${stats.totalGPUs > 0 ? 'cursor-pointer hover:bg-purple-500/20' : 'cursor-default'} transition-colors`}
        onClick={() => stats.totalGPUs > 0 && drillToResources()}
        title={stats.totalGPUs > 0 ? t('computeOverview.gpuAllocatedTitle', { allocated: stats.allocatedGPUs, total: stats.totalGPUs, percent: stats.gpuUtilization }) : t('computeOverview.noGPUsInClusters')}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-purple-400">{t('computeOverview.gpus')}</span>
          </div>
          {stats.totalGPUs > 0 && (
            <span className="text-xs text-muted-foreground" title={t('computeOverview.gpuUtilizationTooltip', { percent: stats.gpuUtilization })}>
              {t('computeOverview.utilizedPercent', { percent: stats.gpuUtilization })}
            </span>
          )}
        </div>

        {stats.totalGPUs > 0 ? (
          <>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-foreground">{formatStat(stats.allocatedGPUs)}</span>
              <span className="text-sm text-muted-foreground">/ {formatStat(stats.totalGPUs)} {t('computeOverview.allocated')}</span>
            </div>

            {/* GPU utilization bar */}
            <div className="h-2 bg-secondary rounded-full overflow-hidden mb-2" title={t('computeOverview.gpuBarTooltip', { percent: stats.gpuUtilization })}>
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${stats.gpuUtilization}%` }}
              />
            </div>

            {/* GPU types */}
            {stats.gpuTypes.length > 0 && (
              <div className="space-y-1">
                {stats.gpuTypes.slice(0, 3).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-xs cursor-default" title={t('computeOverview.gpuTypeCountTitle', { count, type })}>
                    <span className="text-muted-foreground truncate" title={type}>{type}</span>
                    <span className="text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">{t('computeOverview.noGPUsDetected')}</div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {gpuLoading ? t('computeOverview.loadingGPUData') :
          stats.totalGPUs > 0
            ? t('computeOverview.gpusAcrossClusters', { gpus: stats.totalGPUs, clusters: stats.clustersWithGPU })
            : t('computeOverview.clustersNoGPUs', { count: filteredClusters.length })
        }
      </div>
    </div>
  )
}

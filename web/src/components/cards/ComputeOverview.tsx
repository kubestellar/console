import { useMemo } from 'react'
import { Cpu, MemoryStick, Zap, Server, Box, Filter, ChevronDown } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { formatStat, formatMemoryStat } from '../../lib/formatStats'
import { useChartFilters } from '../../lib/cards'

export function ComputeOverview() {
  const { clusters, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { nodes: gpuNodes, isLoading: gpuLoading } = useGPUNodes()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToResources } = useDrillDownActions()

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
    storageKey: 'compute-overview',
  })

  // Filter clusters by global selection first
  const globalFilteredClusters = useMemo(() => {
    if (isAllClustersSelected) return clusters
    return clusters.filter(c => selectedClusters.includes(c.name))
  }, [clusters, selectedClusters, isAllClustersSelected])

  // Apply local cluster filter
  const filteredClusters = useMemo(() => {
    if (localClusterFilter.length === 0) return globalFilteredClusters
    return globalFilteredClusters.filter(c => localClusterFilter.includes(c.name))
  }, [globalFilteredClusters, localClusterFilter])

  // Filter GPU nodes by selection
  const filteredGPUNodes = useMemo(() => {
    let result = gpuNodes
    if (!isAllClustersSelected) {
      result = result.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(n => localClusterFilter.some(c => n.cluster.startsWith(c)))
    }
    return result
  }, [gpuNodes, selectedClusters, isAllClustersSelected, localClusterFilter])

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
      clustersWithGPU: new Set(filteredGPUNodes.map(n => n.cluster.split('/')[0])).size,
    }
  }, [filteredClusters, filteredGPUNodes])

  // Check if we have real data from reachable clusters
  const hasRealData = !isLoading && filteredClusters.length > 0 &&
    filteredClusters.some(c => c.reachable !== false && c.cpuCores !== undefined && c.nodeCount !== undefined && c.nodeCount > 0)

  if (isLoading && !clusters.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading compute data...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
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

      {/* Main resources */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors"
          onClick={drillToResources}
          title={hasRealData ? `${stats.totalCPUs} CPU cores allocatable across all nodes - Click for details` : 'No data available - clusters may be offline'}
        >
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-400">CPU Cores</span>
          </div>
          <span className="text-2xl font-bold text-foreground">
            {hasRealData ? formatStat(stats.totalCPUs) : '-'}
          </span>
          <div className="text-xs text-muted-foreground mt-1">allocatable</div>
        </div>

        <div
          className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 cursor-pointer hover:bg-green-500/20 transition-colors"
          onClick={drillToResources}
          title={hasRealData ? `${formatMemoryStat(stats.totalMemoryGB)} memory allocatable across all nodes - Click for details` : 'No data available - clusters may be offline'}
        >
          <div className="flex items-center gap-2 mb-1">
            <MemoryStick className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400">Memory</span>
          </div>
          <span className="text-2xl font-bold text-foreground">
            {formatMemoryStat(stats.totalMemoryGB, hasRealData)}
          </span>
          <div className="text-xs text-muted-foreground mt-1">allocatable</div>
        </div>
      </div>

      {/* Infrastructure counts */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div
          className="p-2 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary/70 transition-colors"
          onClick={drillToResources}
          title={hasRealData ? `${stats.totalNodes} worker nodes across all clusters - Click for details` : 'No data available'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Server className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Nodes</span>
          </div>
          <span className="text-lg font-bold text-foreground">
            {hasRealData ? formatStat(stats.totalNodes) : '-'}
          </span>
        </div>
        <div
          className="p-2 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary/70 transition-colors"
          onClick={drillToResources}
          title={hasRealData ? `${stats.totalPods} running pods across all clusters - Click for details` : 'No data available'}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Box className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Pods</span>
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
        title={stats.totalGPUs > 0 ? `${stats.allocatedGPUs} of ${stats.totalGPUs} GPUs allocated (${stats.gpuUtilization}% utilization) - Click for details` : 'No GPUs detected in selected clusters'}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-purple-400">GPUs</span>
          </div>
          {stats.totalGPUs > 0 && (
            <span className="text-xs text-muted-foreground" title={`GPU utilization: ${stats.gpuUtilization}%`}>
              {stats.gpuUtilization}% utilized
            </span>
          )}
        </div>

        {stats.totalGPUs > 0 ? (
          <>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-foreground">{formatStat(stats.allocatedGPUs)}</span>
              <span className="text-sm text-muted-foreground">/ {formatStat(stats.totalGPUs)} allocated</span>
            </div>

            {/* GPU utilization bar */}
            <div className="h-2 bg-secondary rounded-full overflow-hidden mb-2" title={`${stats.gpuUtilization}% of GPUs allocated`}>
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${stats.gpuUtilization}%` }}
              />
            </div>

            {/* GPU types */}
            {stats.gpuTypes.length > 0 && (
              <div className="space-y-1">
                {stats.gpuTypes.slice(0, 3).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-xs cursor-default" title={`${count} ${type} GPU${count !== 1 ? 's' : ''}`}>
                    <span className="text-muted-foreground truncate" title={type}>{type}</span>
                    <span className="text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No GPUs detected</div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {gpuLoading ? 'Loading GPU data...' :
          stats.totalGPUs > 0
            ? `${stats.totalGPUs} GPUs across ${stats.clustersWithGPU} clusters`
            : `${filteredClusters.length} clusters, no GPUs detected`
        }
      </div>
    </div>
  )
}

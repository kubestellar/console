import { useMemo } from 'react'
import { Gauge } from '../charts'
import { Cpu, MemoryStick, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useChartFilters } from '../../lib/cards'
import { RefreshButton } from '../ui/RefreshIndicator'

export function ResourceUsage() {
  const { isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { nodes: allGPUNodes } = useGPUNodes()
  const { drillToResources } = useDrillDownActions()

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
  } = useChartFilters({ storageKey: 'resource-usage' })

  // Filter GPU nodes to match the currently displayed clusters
  const gpuNodes = useMemo(() => {
    const clusterNames = new Set(clusters.map(c => c.name))
    return allGPUNodes.filter(n => clusterNames.has(n.cluster.split('/')[0]))
  }, [allGPUNodes, clusters])

  // Calculate totals from real cluster data
  const totals = useMemo(() => {
    const totalCPUs = clusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const totalGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const allocatedGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)

    // For now, use estimates for memory and storage (would need node metrics in production)
    // Estimate: ~32GB RAM per CPU core on average for cloud nodes
    const totalMemoryGB = totalCPUs * 4 // Conservative estimate
    const usedMemoryGB = Math.round(totalMemoryGB * 0.65) // Estimate 65% usage

    return {
      cpu: { total: totalCPUs, used: Math.round(totalCPUs * 0.67) }, // Estimate 67% usage
      memory: { total: totalMemoryGB, used: usedMemoryGB },
      gpu: { total: totalGPUs, used: allocatedGPUs },
    }
  }, [clusters, gpuNodes])

  // Open resources drill down showing all clusters
  const handleDrillDown = () => {
    drillToResources()
  }

  const showSkeleton = isLoading && clusters.length === 0

  if (showSkeleton) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  const cpuPercent = totals.cpu.total > 0 ? Math.round((totals.cpu.used / totals.cpu.total) * 100) : 0
  const memoryPercent = totals.memory.total > 0 ? Math.round((totals.memory.used / totals.memory.total) * 100) : 0
  const gpuPercent = totals.gpu.total > 0 ? Math.round((totals.gpu.used / totals.gpu.total) * 100) : 0

  return (
    <div className="h-full flex flex-col">
      {/* Controls - single row: Cluster count → Cluster Filter → Refresh */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {clusters.length}/{availableClusters.length}
            </span>
          )}
          {localClusterFilter.length === 0 && (
            <span className="text-xs text-muted-foreground">
              {clusters.length} cluster{clusters.length !== 1 ? 's' : ''}
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

      <div
        className="flex-1 flex items-center justify-around cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handleDrillDown}
      >
        <div className="flex flex-col items-center">
          <Gauge
            value={cpuPercent}
            max={100}
            size="md"
            thresholds={{ warning: 70, critical: 90 }}
          />
          <div className="flex items-center gap-1.5 mt-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-muted-foreground">CPU</span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <Gauge
            value={memoryPercent}
            max={100}
            size="md"
            thresholds={{ warning: 75, critical: 90 }}
          />
          <div className="flex items-center gap-1.5 mt-2">
            <MemoryStick className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-muted-foreground">Memory</span>
          </div>
        </div>

        {totals.gpu.total > 0 && (
          <div className="flex flex-col items-center">
            <Gauge
              value={gpuPercent}
              max={100}
              size="md"
              thresholds={{ warning: 80, critical: 95 }}
            />
            <div className="flex items-center gap-1.5 mt-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-muted-foreground">GPU</span>
            </div>
          </div>
        )}
      </div>

      <div className={`mt-4 pt-3 border-t border-border/50 grid ${totals.gpu.total > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-2 text-center`}>
        <div>
          <p className="text-xs text-muted-foreground">Total CPU</p>
          <p className="text-sm font-medium text-foreground">{totals.cpu.total} cores</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total RAM</p>
          <p className="text-sm font-medium text-foreground">{totals.memory.total} GB</p>
        </div>
        {totals.gpu.total > 0 && (
          <div>
            <p className="text-xs text-muted-foreground">Total GPU</p>
            <p className="text-sm font-medium text-foreground">
              <span className="text-purple-400">{totals.gpu.used}</span>/{totals.gpu.total}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

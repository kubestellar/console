import { useMemo } from 'react'
import { Gauge } from '../charts'
import { Cpu, MemoryStick, Server } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useChartFilters, CardClusterFilter } from '../../lib/cards'
import { useCardLoadingState } from './CardDataContext'
import { Skeleton } from '../ui/Skeleton'

export function ResourceUsage() {
  const { isLoading: clustersLoading } = useClusters()
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
    // Sum capacity from all clusters
    const totalCPUs = clusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const totalMemoryGB = clusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)

    // Sum requests (allocated resources) from all clusters
    const usedCPUs = clusters.reduce((sum, c) => sum + (c.cpuRequestsCores || 0), 0)
    const usedMemoryGB = clusters.reduce((sum, c) => sum + (c.memoryRequestsGB || 0), 0)

    // GPU data from GPU nodes
    const totalGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const allocatedGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)

    return {
      cpu: { total: totalCPUs, used: Math.round(usedCPUs) },
      memory: { total: Math.round(totalMemoryGB), used: Math.round(usedMemoryGB) },
      gpu: { total: totalGPUs, used: allocatedGPUs },
    }
  }, [clusters, gpuNodes])

  // Open resources drill down showing all clusters
  const handleDrillDown = () => {
    drillToResources()
  }

  // Report state to CardWrapper for refresh animation
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading,
    hasAnyData: clusters.length > 0,
  })

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-[200px]">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={80} height={16} />
          <Skeleton variant="rounded" width={60} height={24} />
        </div>
        <div className="flex-1 flex items-center justify-around">
          <div className="flex flex-col items-center">
            <Skeleton variant="circular" width={80} height={80} />
            <Skeleton variant="text" width={40} height={16} className="mt-2" />
          </div>
          <div className="flex flex-col items-center">
            <Skeleton variant="circular" width={80} height={80} />
            <Skeleton variant="text" width={50} height={16} className="mt-2" />
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-2 gap-2">
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No clusters available</p>
        <p className="text-xs mt-1">Connect to clusters to see resource usage</p>
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

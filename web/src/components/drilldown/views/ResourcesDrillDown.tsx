import { useMemo } from 'react'
import { useClusters, useGPUNodes } from '../../../hooks/useMCP'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { Gauge } from '../../charts/Gauge'
import { Cpu, MemoryStick, Server, ChevronRight } from 'lucide-react'
import { StatusIndicator } from '../../charts/StatusIndicator'

interface Props {
  data: Record<string, unknown>
}

export function ResourcesDrillDown({ data: _data }: Props) {
  const { clusters, isLoading } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { drillToCluster } = useDrillDownActions()

  // Calculate per-cluster GPU data
  const clusterGPUs = useMemo(() => {
    const map: Record<string, { total: number; allocated: number }> = {}
    gpuNodes.forEach(node => {
      const cluster = node.cluster || 'unknown'
      if (!map[cluster]) {
        map[cluster] = { total: 0, allocated: 0 }
      }
      map[cluster].total += node.gpuCount
      map[cluster].allocated += node.gpuAllocated
    })
    return map
  }, [gpuNodes])

  // Calculate totals
  const totals = useMemo(() => {
    const totalCPUs = clusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const totalNodes = clusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
    const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
    const totalGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const allocatedGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
    // Estimate memory based on CPU (would need actual metrics in production)
    const totalMemoryGB = totalCPUs * 4

    return {
      cpus: totalCPUs,
      nodes: totalNodes,
      pods: totalPods,
      memoryGB: totalMemoryGB,
      gpus: totalGPUs,
      gpusAllocated: allocatedGPUs,
    }
  }, [clusters, gpuNodes])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-muted-foreground">Clusters</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{clusters.length}</div>
        </div>

        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-muted-foreground">Nodes</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{totals.nodes}</div>
        </div>

        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-muted-foreground">CPU Cores</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{totals.cpus.toLocaleString()}</div>
        </div>

        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <MemoryStick className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-muted-foreground">Memory</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{totals.memoryGB} GB</div>
          <div className="text-xs text-muted-foreground">estimated</div>
        </div>

        {totals.gpus > 0 && (
          <div className="p-4 rounded-lg bg-card/50 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-muted-foreground">GPUs</span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              <span className="text-purple-400">{totals.gpusAllocated}</span>
              <span className="text-muted-foreground">/{totals.gpus}</span>
            </div>
          </div>
        )}
      </div>

      {/* Cluster List */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Clusters ({clusters.length})
        </h3>
        <div className="space-y-3">
          {clusters.map((cluster) => {
            const cpuPercent = cluster.cpuCores ? Math.round((cluster.cpuCores * 0.67) / cluster.cpuCores * 100) : 0
            const memoryGB = (cluster.cpuCores || 0) * 4
            const memoryPercent = 65 // Estimated
            const gpuData = clusterGPUs[cluster.name] || { total: 0, allocated: 0 }
            const gpuPercent = gpuData.total > 0 ? Math.round((gpuData.allocated / gpuData.total) * 100) : 0

            return (
              <div
                key={cluster.name}
                onClick={() => drillToCluster(cluster.name, {
                  healthy: cluster.healthy,
                  nodeCount: cluster.nodeCount,
                  podCount: cluster.podCount,
                  cpuCores: cluster.cpuCores,
                })}
                className="p-4 rounded-lg bg-card/50 border border-border cursor-pointer hover:bg-card hover:border-primary/50 transition-colors group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <StatusIndicator status={cluster.healthy ? 'healthy' : 'error'} />
                    <div>
                      <div className="font-medium text-foreground">{cluster.name.split('/').pop()}</div>
                      <div className="text-xs text-muted-foreground">
                        {cluster.nodeCount} nodes • {cluster.podCount} pods
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Resource gauges - fixed 3-column grid for alignment */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col items-center">
                    <Gauge
                      value={cpuPercent}
                      max={100}
                      size="sm"
                      thresholds={{ warning: 70, critical: 90 }}
                    />
                    <div className="flex items-center gap-1 mt-1">
                      <Cpu className="w-3 h-3 text-purple-400" />
                      <span className="text-xs text-muted-foreground">{cluster.cpuCores || 0}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <Gauge
                      value={memoryPercent}
                      max={100}
                      size="sm"
                      thresholds={{ warning: 75, critical: 90 }}
                    />
                    <div className="flex items-center gap-1 mt-1">
                      <MemoryStick className="w-3 h-3 text-blue-400" />
                      <span className="text-xs text-muted-foreground">{memoryGB} GB</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    {gpuData.total > 0 ? (
                      <>
                        <Gauge
                          value={gpuPercent}
                          max={100}
                          size="sm"
                          thresholds={{ warning: 80, critical: 95 }}
                        />
                        <div className="flex items-center gap-1 mt-1">
                          <Cpu className="w-3 h-3 text-purple-400" />
                          <span className="text-xs text-muted-foreground">
                            {gpuData.allocated}/{gpuData.total}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
                        <Cpu className="w-6 h-6" />
                        <span className="text-xs mt-1">No GPUs</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

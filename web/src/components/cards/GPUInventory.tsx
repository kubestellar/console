import { useMemo } from 'react'
import { RefreshCw, Cpu, Server } from 'lucide-react'
import { useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'

interface GPUInventoryProps {
  config?: Record<string, unknown>
}

export function GPUInventory({ config }: GPUInventoryProps) {
  const cluster = config?.cluster as string | undefined
  const { nodes: rawNodes, isLoading, error, refetch } = useGPUNodes(cluster)
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Filter nodes by global cluster selection
  const nodes = useMemo(() => {
    if (isAllClustersSelected) return rawNodes
    return rawNodes.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
  }, [rawNodes, selectedClusters, isAllClustersSelected])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  const totalGPUs = nodes.reduce((sum, n) => sum + n.gpuCount, 0)
  const allocatedGPUs = nodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
  const availableGPUs = totalGPUs - allocatedGPUs

  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">GPU Inventory</span>
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <Cpu className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-white font-medium">No GPU Nodes</p>
          <p className="text-sm text-muted-foreground">No GPU resources detected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">GPU Inventory</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
            {totalGPUs} GPUs
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-white">{totalGPUs}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-purple-400">{allocatedGPUs}</p>
          <p className="text-xs text-muted-foreground">In Use</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-green-400">{availableGPUs}</p>
          <p className="text-xs text-muted-foreground">Available</p>
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {nodes.map((node) => (
          <div
            key={`${node.cluster}-${node.name}`}
            className="p-3 rounded-lg bg-secondary/30"
          >
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-white truncate">{node.name}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <ClusterBadge cluster={node.cluster} size="sm" />
              <div className="flex items-center gap-2">
                <span className="text-purple-400">{node.gpuType}</span>
                <span className="font-mono">
                  {node.gpuAllocated}/{node.gpuCount}
                </span>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${(node.gpuAllocated / node.gpuCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-2 text-xs text-yellow-400">Using simulated data</div>
      )}
    </div>
  )
}

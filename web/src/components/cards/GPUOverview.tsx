import { useMemo } from 'react'
import { RefreshCw, Zap } from 'lucide-react'
import { useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'

interface GPUOverviewProps {
  config?: Record<string, unknown>
}

export function GPUOverview({ config: _config }: GPUOverviewProps) {
  const { nodes: rawNodes, isLoading, refetch } = useGPUNodes()
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
  const gpuUtilization = totalGPUs > 0 ? (allocatedGPUs / totalGPUs) * 100 : 0

  // Group by type
  const gpuTypes = nodes.reduce((acc, n) => {
    if (!acc[n.gpuType]) acc[n.gpuType] = 0
    acc[n.gpuType] += n.gpuCount
    return acc
  }, {} as Record<string, number>)

  const clusterCount = new Set(nodes.map(n => n.cluster)).size

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-medium text-muted-foreground">GPU Overview</span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Main gauge */}
      <div className="flex justify-center mb-4">
        <div className="relative w-32 h-32">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-secondary"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${gpuUtilization * 3.52} 352`}
              className={`${
                gpuUtilization > 80 ? 'text-red-500' :
                gpuUtilization > 50 ? 'text-yellow-500' :
                'text-green-500'
              }`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white">{gpuUtilization.toFixed(0)}%</span>
            <span className="text-xs text-muted-foreground">Utilized</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center">
          <p className="text-lg font-bold text-white">{totalGPUs}</p>
          <p className="text-xs text-muted-foreground">Total GPUs</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-purple-400">{allocatedGPUs}</p>
          <p className="text-xs text-muted-foreground">Allocated</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-green-400">{clusterCount}</p>
          <p className="text-xs text-muted-foreground">Clusters</p>
        </div>
      </div>

      {/* GPU Types */}
      {Object.keys(gpuTypes).length > 0 && (
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-2">GPU Types</p>
          <div className="space-y-1">
            {Object.entries(gpuTypes).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="text-white">{type}</span>
                <span className="text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

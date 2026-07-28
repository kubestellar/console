import { Cpu, Zap, Layers } from 'lucide-react'

const GPU_UTIL_HIGH = 90
const GPU_UTIL_WARN = 70

function getUtilizationColor(percentage: number): string {
  if (percentage >= GPU_UTIL_HIGH) return 'text-red-400'
  if (percentage >= GPU_UTIL_WARN) return 'text-yellow-400'
  return 'text-green-400'
}

interface GPUTypeInfo {
  type: string
  manufacturer: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  nodeCount: number
  clusters: string[]
}

interface ClusterGPUInfo {
  cluster: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  nodeCount: number
  gpuTypes: string[]
}

interface GPUMetricsChartProps {
  gpuTypeInfo: GPUTypeInfo[]
  clusterInfo: ClusterGPUInfo[]
  manufacturerBreakdown: [string, number][]
}

export function GPUMetricsChart({ gpuTypeInfo, clusterInfo, manufacturerBreakdown }: GPUMetricsChartProps) {
  return (
    <>
      {/* Manufacturer Breakdown */}
      {manufacturerBreakdown.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            Manufacturers
          </h4>
          <div className="flex flex-wrap gap-2">
            {manufacturerBreakdown.map(([mfg, count]) => (
              <span
                key={mfg}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  mfg === 'NVIDIA'
                    ? 'bg-green-500/20 text-green-400'
                    : mfg === 'AMD'
                    ? 'bg-red-500/20 text-red-400'
                    : mfg === 'Intel'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-gray-500/20 text-muted-foreground dark:bg-gray-400/20'
                }`}
              >
                {mfg}: {count} GPUs
              </span>
            ))}
          </div>
        </div>
      )}

      {/* GPU Types */}
      {gpuTypeInfo.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            GPU Types
          </h4>
          <div className="space-y-2">
            {gpuTypeInfo.map(info => {
              const utilPercent = info.totalGPUs > 0 ? Math.round((info.allocatedGPUs / info.totalGPUs) * 100) : 0
              return (
                <div key={info.type} className="glass p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground">{info.type}</span>
                    <span className={`text-sm ${getUtilizationColor(utilPercent)}`}>
                      {info.allocatedGPUs}/{info.totalGPUs} ({utilPercent}%)
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        utilPercent >= GPU_UTIL_HIGH
                          ? 'bg-red-400'
                          : utilPercent >= GPU_UTIL_WARN
                          ? 'bg-yellow-400'
                          : 'bg-green-400'
                      }`}
                      style={{ width: `${utilPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>
                      {info.nodeCount} node{info.nodeCount !== 1 ? 's' : ''}
                    </span>
                    <span>
                      {info.clusters.length} cluster{info.clusters.length !== 1 ? 's' : ''}: {info.clusters.join(', ')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Per-Cluster Breakdown */}
      {clusterInfo.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4" />
            By Cluster
          </h4>
          <div className="space-y-2">
            {clusterInfo.map(info => {
              const utilPercent = info.totalGPUs > 0 ? Math.round((info.allocatedGPUs / info.totalGPUs) * 100) : 0
              return (
                <div key={info.cluster} className="glass p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground">{info.cluster}</span>
                    <span className={`text-sm ${getUtilizationColor(utilPercent)}`}>
                      {info.allocatedGPUs}/{info.totalGPUs} allocated
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        utilPercent >= GPU_UTIL_HIGH
                          ? 'bg-red-400'
                          : utilPercent >= GPU_UTIL_WARN
                          ? 'bg-yellow-400'
                          : 'bg-green-400'
                      }`}
                      style={{ width: `${utilPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>
                      {info.nodeCount} GPU node{info.nodeCount !== 1 ? 's' : ''}
                    </span>
                    <span>{(info.gpuTypes || []).join(', ')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

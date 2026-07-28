import { Layers, Zap } from 'lucide-react'
import type { ClusterGPUInfo, GPUTypeInfo } from './GPUDetailModal.types'

interface GPUMetricsChartProps {
  gpuTypeInfo: GPUTypeInfo[]
  clusterInfo: ClusterGPUInfo[]
  getUtilizationColor: (percentage: number) => string
  gpuUtilHigh: number
  gpuUtilWarn: number
}

export function GPUMetricsChart({
  gpuTypeInfo,
  clusterInfo,
  getUtilizationColor,
  gpuUtilHigh,
  gpuUtilWarn,
}: GPUMetricsChartProps) {
  return (
    <>
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
                        utilPercent >= gpuUtilHigh ? 'bg-red-400' : utilPercent >= gpuUtilWarn ? 'bg-yellow-400' : 'bg-green-400'
                      }`}
                      style={{ width: `${utilPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>{info.nodeCount} node{info.nodeCount !== 1 ? 's' : ''}</span>
                    <span>{info.clusters.length} cluster{info.clusters.length !== 1 ? 's' : ''}: {info.clusters.join(', ')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
                        utilPercent >= gpuUtilHigh ? 'bg-red-400' : utilPercent >= gpuUtilWarn ? 'bg-yellow-400' : 'bg-green-400'
                      }`}
                      style={{ width: `${utilPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>{info.nodeCount} GPU node{info.nodeCount !== 1 ? 's' : ''}</span>
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

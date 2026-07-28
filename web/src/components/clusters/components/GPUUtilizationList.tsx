import { getUtilizationColor, GPU_UTIL_HIGH, GPU_UTIL_WARN } from './gpuDetailUtils'

interface GPUUtilizationBarProps {
  /** e.g. GPU type name or cluster name */
  title: string
  allocatedGPUs: number
  totalGPUs: number
  /** Text shown to the right of the utilization percentage, e.g. "(80%)" */
  suffix?: string
  footerLeft: string
  footerRight: string
}

/**
 * A single utilization row with a progress bar, shared by the "GPU Types"
 * and "By Cluster" breakdown sections. Extracted from GPUDetailModal.tsx
 * (#21613) to remove duplicated markup between the two sections.
 */
function GPUUtilizationBar({ title, allocatedGPUs, totalGPUs, suffix, footerLeft, footerRight }: GPUUtilizationBarProps) {
  const utilPercent = totalGPUs > 0 ? Math.round((allocatedGPUs / totalGPUs) * 100) : 0
  return (
    <div className="glass p-3 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-foreground">{title}</span>
        <span className={`text-sm ${getUtilizationColor(utilPercent)}`}>
          {allocatedGPUs}/{totalGPUs}{suffix ?? ''}
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            utilPercent >= GPU_UTIL_HIGH ? 'bg-red-400' :
            utilPercent >= GPU_UTIL_WARN ? 'bg-yellow-400' :
            'bg-green-400'
          }`}
          style={{ width: `${utilPercent}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <span>{footerLeft}</span>
        <span>{footerRight}</span>
      </div>
    </div>
  )
}

interface GPUTypeUtilizationListProps {
  gpuTypeInfo: Array<{ type: string; allocatedGPUs: number; totalGPUs: number; nodeCount: number; clusters: string[] }>
}

/** Renders the "GPU Types" utilization breakdown section. */
export function GPUTypeUtilizationList({ gpuTypeInfo }: GPUTypeUtilizationListProps) {
  return (
    <div className="space-y-2">
      {gpuTypeInfo.map(info => {
        const utilPercent = info.totalGPUs > 0 ? Math.round((info.allocatedGPUs / info.totalGPUs) * 100) : 0
        return (
          <GPUUtilizationBar
            key={info.type}
            title={info.type}
            allocatedGPUs={info.allocatedGPUs}
            totalGPUs={info.totalGPUs}
            suffix={` (${utilPercent}%)`}
            footerLeft={`${info.nodeCount} node${info.nodeCount !== 1 ? 's' : ''}`}
            footerRight={`${info.clusters.length} cluster${info.clusters.length !== 1 ? 's' : ''}: ${info.clusters.join(', ')}`}
          />
        )
      })}
    </div>
  )
}

interface GPUClusterUtilizationListProps {
  clusterInfo: Array<{ cluster: string; allocatedGPUs: number; totalGPUs: number; nodeCount: number; gpuTypes: string[] }>
}

/** Renders the "By Cluster" utilization breakdown section. */
export function GPUClusterUtilizationList({ clusterInfo }: GPUClusterUtilizationListProps) {
  return (
    <div className="space-y-2">
      {clusterInfo.map(info => (
        <GPUUtilizationBar
          key={info.cluster}
          title={info.cluster}
          allocatedGPUs={info.allocatedGPUs}
          totalGPUs={info.totalGPUs}
          suffix=" allocated"
          footerLeft={`${info.nodeCount} GPU node${info.nodeCount !== 1 ? 's' : ''}`}
          footerRight={(info.gpuTypes || []).join(', ')}
        />
      ))}
    </div>
  )
}

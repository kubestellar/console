import { Cpu, MemoryStick, Zap } from 'lucide-react'
import type { PodInfo } from '../../hooks/mcp/types'
import { formatCpu, formatMemory, getEffectiveCpu, getEffectiveMemory } from './TopPods.utils'

/** CPU / memory / GPU summary for a pod (actual usage when metrics are available, otherwise requests). */
export function TopPodResourceMetrics({ pod }: { pod: PodInfo }) {
  if (!(getEffectiveCpu(pod) > 0 || getEffectiveMemory(pod) > 0 || pod.gpuRequest)) return null
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
      {getEffectiveCpu(pod) > 0 ? (
        <span
          className={`flex items-center gap-1 ${pod.metricsAvailable ? 'text-blue-400' : ''}`}
          title={pod.metricsAvailable
            ? `CPU Usage: ${formatCpu(pod.cpuUsageMillis)}${pod.cpuRequestMillis ? ` (Request: ${formatCpu(pod.cpuRequestMillis)})` : ''}`
            : `CPU Request: ${formatCpu(pod.cpuRequestMillis)}`}
        >
          <Cpu className="w-3 h-3" />
          {formatCpu(getEffectiveCpu(pod))}
          {pod.metricsAvailable && <span className="text-2xs opacity-60">▲</span>}
        </span>
      ) : null}
      {getEffectiveMemory(pod) > 0 ? (
        <span
          className={`flex items-center gap-1 ${pod.metricsAvailable ? 'text-purple-400' : ''}`}
          title={pod.metricsAvailable
            ? `Memory Usage: ${formatMemory(pod.memoryUsageBytes)}${pod.memoryRequestBytes ? ` (Request: ${formatMemory(pod.memoryRequestBytes)})` : ''}`
            : `Memory Request: ${formatMemory(pod.memoryRequestBytes)}`}
        >
          <MemoryStick className="w-3 h-3" />
          {formatMemory(getEffectiveMemory(pod))}
          {pod.metricsAvailable && <span className="text-2xs opacity-60">▲</span>}
        </span>
      ) : null}
      {pod.gpuRequest ? (
        <span className="flex items-center gap-1" title={`GPU Request: ${pod.gpuRequest}`}>
          <Zap className="w-3 h-3" />
          {pod.gpuRequest}
        </span>
      ) : null}
    </div>
  )
}

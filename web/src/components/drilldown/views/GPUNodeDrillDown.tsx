import { useMemo } from 'react'
import { Box, ChevronRight, Server } from 'lucide-react'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useAllPods } from '../../../hooks/useMCP'
import { Gauge } from '../../charts/Gauge'
import { StatusIndicator, type Status } from '../../charts/StatusIndicator'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

// Check if any container requests GPUs
function hasGPUResourceRequest(containers?: { gpuRequested?: number }[]): boolean {
  if (!containers) return false
  return containers.some(c => (c.gpuRequested ?? 0) > 0)
}

function normalizeClusterName(cluster: string): string {
  if (!cluster) return ''
  const parts = cluster.split('/')
  return parts[parts.length - 1] || cluster
}

function podStatusToIndicator(status: string): Status {
  const lower = status.toLowerCase()
  if (lower === 'running' || lower === 'succeeded' || lower === 'completed') return 'healthy'
  if (lower === 'pending') return 'pending'
  if (lower === 'failed' || lower === 'error' || lower === 'crashloopbackoff' || lower === 'evicted') return 'error'
  return 'unknown'
}

/** Utilization percentage at or above which the indicator turns red */
const HIGH_UTILIZATION_THRESHOLD_PCT = 90
/** Utilization percentage at or above which the indicator turns yellow */
const MODERATE_UTILIZATION_THRESHOLD_PCT = 50
/** Multiplier to convert a ratio to a percentage */
const PERCENT_MULTIPLIER = 100

export function GPUNodeDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = (data.cluster as string) || ''
  const nodeName = (data.node as string) || ''
  const gpuType = (data.gpuType as string) || ''
  const gpuCount = (data.gpuCount as number) || 0
  const gpuAllocated = (data.gpuAllocated as number) || 0
  const { drillToEvents, drillToPod, drillToCluster } = useDrillDownActions()
  const clusterShort = cluster.split('/').pop() || cluster

  const utilizationPercent = gpuCount > 0 ? Math.round((gpuAllocated / gpuCount) * PERCENT_MULTIPLIER) : 0

  // Find GPU pods on this node
  const { pods: allPods } = useAllPods()
  const gpuPodsOnNode = useMemo(() => {
    const normalizedCluster = normalizeClusterName(cluster)
    return (allPods || []).filter(pod => {
      if (!pod.cluster || !pod.node) return false
      if (normalizeClusterName(pod.cluster) !== normalizedCluster) return false
      if (pod.node !== nodeName) return false
      return hasGPUResourceRequest(pod.containers)
    })
  }, [allPods, cluster, nodeName])

  return (
    <div className="space-y-6">
      {/* Contextual Navigation */}
      <div className="flex items-center gap-6 text-sm">
        <button
          onClick={() => drillToCluster(cluster)}
          className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
        >
          <Server className="w-4 h-4 text-blue-400" />
          <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
          <ClusterBadge cluster={clusterShort} size="sm" />
        </button>
      </div>

      {/* GPU Status */}
      <div className="p-6 rounded-lg bg-card/50 border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{gpuType}</h3>
            <p className="text-sm text-muted-foreground">{nodeName}</p>
          </div>
          <div className="flex items-center gap-6">
            <Gauge value={gpuAllocated} max={gpuCount} size="md" unit="" />
            <div className="text-right">
              <div className="text-3xl font-bold text-foreground">{gpuAllocated}/{gpuCount}</div>
              <div className="text-sm text-muted-foreground">GPUs Allocated</div>
              <div className={`text-sm ${utilizationPercent >= HIGH_UTILIZATION_THRESHOLD_PCT ? 'text-red-400' : utilizationPercent >= MODERATE_UTILIZATION_THRESHOLD_PCT ? 'text-yellow-400' : 'text-green-400'}`}>
                {utilizationPercent}% utilization
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GPU Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">{t('common.totalGpus')}</div>
          <div className="text-2xl font-bold text-foreground">{gpuCount}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">{t('common.allocated')}</div>
          <div className="text-2xl font-bold text-yellow-400">{gpuAllocated}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">{t('common.available')}</div>
          <div className="text-2xl font-bold text-green-400">{gpuCount - gpuAllocated}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">GPU Type</div>
          <div className="text-lg font-bold text-foreground truncate">{gpuType || 'Unknown'}</div>
        </div>
      </div>

      {/* Visual GPU Allocation */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">GPU Slots</h3>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: gpuCount }).map((_, i) => (
            <div
              key={i}
              className={`w-16 h-16 rounded-lg border-2 flex items-center justify-center text-xs font-medium ${
                i < gpuAllocated
                  ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                  : 'bg-green-500/10 border-green-500/30 text-green-400'
              }`}
            >
              GPU {i}
              <br />
              {i < gpuAllocated ? 'Used' : 'Free'}
            </div>
          ))}
        </div>
      </div>

      {/* GPU Pods on this Node */}
      {gpuPodsOnNode.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            GPU Pods on Node ({gpuPodsOnNode.length})
          </h3>
          <div className="space-y-2">
            {gpuPodsOnNode.map(pod => {
              const podGPUs = pod.containers?.reduce((s, c) => s + (c.gpuRequested ?? 0), 0) ?? 0
              const status = (pod.status || 'Unknown') as string
              return (
                <div
                  key={`${pod.namespace}:${pod.name}`}
                  onClick={() => drillToPod(pod.cluster!, pod.namespace!, pod.name, { status })}
                  className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusIndicator status={podStatusToIndicator(status)} size="sm" />
                      <span className="text-sm font-medium text-foreground truncate group-hover:text-purple-400">
                        {pod.name}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                    <span className="font-mono text-sm text-purple-400 font-medium shrink-0">
                      {podGPUs} GPU{podGPUs !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Box className="w-3 h-3" />
                    <span>{pod.namespace}</span>
                    {pod.containers && pod.containers.some(c => (c.gpuRequested ?? 0) > 0) && (
                      <span className="text-purple-400/70">
                        {pod.containers.filter(c => (c.gpuRequested ?? 0) > 0).map(c => `${c.name}: ${c.gpuRequested}`).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => drillToEvents(cluster, undefined, nodeName)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors"
        >
          View Node Events
        </button>
      </div>

      {/* Details */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Node Details</h3>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Node Name</dt>
              <dd className="font-mono text-foreground break-all">{nodeName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('common.cluster')}</dt>
              <dd className="font-mono text-foreground">{cluster.split('/').pop()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">GPU Model</dt>
              <dd className="font-mono text-foreground">{gpuType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Resource</dt>
              <dd className="font-mono text-foreground">nvidia.com/gpu</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

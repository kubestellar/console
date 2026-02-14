import { useMemo } from 'react'
import { Box, Cpu, ChevronRight } from 'lucide-react'
import { useGPUNodes, useAllPods } from '../../../hooks/useMCP'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
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

export function GPUNamespaceDrillDown({ data }: Props) {
  const { t: _t } = useTranslation()
  const namespace = data.namespace as string
  const passedGpuRequested = data.gpuRequested as number | undefined
  const passedPodCount = data.podCount as number | undefined
  const passedClusters = data.clusters as string[] | undefined

  const { nodes: gpuNodes } = useGPUNodes()
  const { pods: allPods } = useAllPods()
  const { drillToPod, drillToGPUNode } = useDrillDownActions()

  // Find GPU pods in this namespace
  const gpuPods = useMemo(() => {
    const gpuNodeKeys = new Set(
      gpuNodes.map(node => `${normalizeClusterName(node.cluster || '')}:${node.name}`)
    )

    return allPods.filter(pod => {
      if (!pod.cluster) return false
      if (pod.namespace !== namespace) return false
      if (hasGPUResourceRequest(pod.containers)) return true
      if (pod.node) {
        const podKey = `${normalizeClusterName(pod.cluster)}:${pod.node}`
        if (gpuNodeKeys.has(podKey)) return true
      }
      return false
    })
  }, [allPods, gpuNodes, namespace])

  // Compute summary stats from live data (fallback to passed data)
  const totalGPUs = useMemo(() =>
    gpuPods.reduce((sum, pod) =>
      sum + (pod.containers?.reduce((s, c) => s + (c.gpuRequested ?? 0), 0) ?? 0), 0),
    [gpuPods]
  )
  const podCount = gpuPods.length || passedPodCount || 0
  const gpuRequested = totalGPUs || passedGpuRequested || 0
  const clusters = useMemo(() => {
    const set = new Set(gpuPods.map(p => p.cluster).filter(Boolean) as string[])
    return set.size > 0 ? Array.from(set) : (passedClusters || [])
  }, [gpuPods, passedClusters])

  // Group pods by node for the node breakdown
  const podsByNode = useMemo(() => {
    const map = new Map<string, typeof gpuPods>()
    for (const pod of gpuPods) {
      const nodeKey = pod.node || 'unscheduled'
      const existing = map.get(nodeKey) || []
      existing.push(pod)
      map.set(nodeKey, existing)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [gpuPods])

  // Find GPU node data for drill-down
  const gpuNodeMap = useMemo(() => {
    const map = new Map<string, typeof gpuNodes[0]>()
    for (const node of gpuNodes) {
      map.set(node.name, node)
    }
    return map
  }, [gpuNodes])

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="p-6 rounded-lg bg-card/50 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Box className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{namespace}</h3>
            <p className="text-sm text-muted-foreground">GPU Namespace Allocations</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="text-sm text-muted-foreground">GPUs Requested</div>
            <div className="text-2xl font-bold font-mono text-purple-400">{gpuRequested}</div>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="text-sm text-muted-foreground">GPU Pods</div>
            <div className="text-2xl font-bold text-foreground">{podCount}</div>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="text-sm text-muted-foreground">Clusters</div>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {clusters.slice(0, 3).map(c => (
                <ClusterBadge key={c} cluster={c} size="sm" />
              ))}
              {clusters.length > 3 && (
                <span className="text-xs text-muted-foreground">+{clusters.length - 3}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pod list */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          GPU Pods ({gpuPods.length})
        </h3>

        {gpuPods.length === 0 ? (
          <div className="p-8 rounded-lg bg-card/50 border border-border text-center">
            <p className="text-muted-foreground">No GPU pods found in this namespace</p>
            <p className="text-xs text-muted-foreground mt-1">Data may still be loading</p>
          </div>
        ) : (
          <div className="space-y-2">
            {gpuPods.map(pod => {
              const podGPUs = pod.containers?.reduce((s, c) => s + (c.gpuRequested ?? 0), 0) ?? 0
              const status = (pod.status || 'Unknown') as string
              return (
                <div
                  key={`${pod.cluster}:${pod.namespace}:${pod.name}`}
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
                    {pod.cluster && <ClusterBadge cluster={pod.cluster} size="sm" />}
                    {pod.node && (
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        {pod.node}
                      </span>
                    )}
                    {pod.containers && pod.containers.length > 0 && (
                      <span>{pod.containers.length} container{pod.containers.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {/* Container GPU breakdown */}
                  {pod.containers && pod.containers.some(c => (c.gpuRequested ?? 0) > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pod.containers.filter(c => (c.gpuRequested ?? 0) > 0).map(c => (
                        <span
                          key={c.name}
                          className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-xs"
                        >
                          {c.name}: {c.gpuRequested} GPU{(c.gpuRequested ?? 0) !== 1 ? 's' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Node breakdown */}
      {podsByNode.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Node Distribution ({podsByNode.length} nodes)
          </h3>
          <div className="space-y-2">
            {podsByNode.map(([nodeName, pods]) => {
              const gpuNodeData = gpuNodeMap.get(nodeName)
              const nodeGPUs = pods.reduce((sum, pod) =>
                sum + (pod.containers?.reduce((s, c) => s + (c.gpuRequested ?? 0), 0) ?? 0), 0)
              const nodeCluster = pods[0]?.cluster || ''

              return (
                <div
                  key={nodeName}
                  onClick={() => {
                    if (gpuNodeData && nodeCluster) {
                      drillToGPUNode(nodeCluster, nodeName, {
                        gpuType: gpuNodeData.gpuType,
                        gpuCount: gpuNodeData.gpuCount,
                        gpuAllocated: gpuNodeData.gpuAllocated,
                      })
                    }
                  }}
                  className={`p-3 rounded-lg bg-secondary/30 transition-colors ${
                    gpuNodeData ? 'hover:bg-secondary/50 cursor-pointer group' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-medium text-foreground group-hover:text-orange-400">
                        {nodeName}
                      </span>
                      {gpuNodeData && (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{pods.length} pod{pods.length !== 1 ? 's' : ''}</span>
                      <span className="font-mono text-purple-400 font-medium">{nodeGPUs} GPUs</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

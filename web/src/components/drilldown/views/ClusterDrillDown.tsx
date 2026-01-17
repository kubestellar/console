import { useMemo } from 'react'
import { useClusterHealth, usePodIssues, useDeploymentIssues, useGPUNodes } from '../../../hooks/useMCP'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { Gauge } from '../../charts/Gauge'

interface Props {
  data: Record<string, unknown>
}

export function ClusterDrillDown({ data }: Props) {
  const clusterName = (data.cluster as string) || ''
  const { drillToNamespace, drillToNode: _drillToNode, drillToGPUNode, drillToEvents } = useDrillDownActions()

  const { health, isLoading } = useClusterHealth(clusterName)
  const { issues: podIssues } = usePodIssues(clusterName)
  const { issues: deploymentIssues } = useDeploymentIssues()
  const { nodes: allGPUNodes } = useGPUNodes()

  // Filter data for this cluster - ALL useMemo hooks must be before any early returns
  const clusterGPUNodes = useMemo(() =>
    allGPUNodes.filter(n => n.cluster === clusterName || n.cluster.includes(clusterName.split('/')[0])),
    [allGPUNodes, clusterName]
  )

  const clusterDeploymentIssues = useMemo(() =>
    deploymentIssues.filter(d => d.cluster === clusterName || d.cluster?.includes(clusterName.split('/')[0])),
    [deploymentIssues, clusterName]
  )

  // Get unique namespaces from issues
  const namespaces = useMemo(() => {
    const ns = new Set<string>()
    podIssues.forEach(p => ns.add(p.namespace))
    clusterDeploymentIssues.forEach(d => ns.add(d.namespace))
    return Array.from(ns).sort()
  }, [podIssues, clusterDeploymentIssues])

  // Group GPUs by type
  const gpuByType = useMemo(() => {
    const map: Record<string, { total: number; allocated: number; nodes: number }> = {}
    clusterGPUNodes.forEach(node => {
      const type = node.gpuType || 'Unknown'
      if (!map[type]) {
        map[type] = { total: 0, allocated: 0, nodes: 0 }
      }
      map[type].total += node.gpuCount
      map[type].allocated += node.gpuAllocated
      map[type].nodes += 1
    })
    return map
  }, [clusterGPUNodes])

  // Guard against missing cluster name (after ALL hooks)
  if (!clusterName) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No cluster selected
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const totalGPUs = clusterGPUNodes.reduce((sum, n) => sum + n.gpuCount, 0)
  const allocatedGPUs = clusterGPUNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <StatusIndicator status={health?.healthy ? 'healthy' : 'error'} />
            <span className="text-sm text-muted-foreground">Status</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {health?.healthy ? 'Healthy' : 'Unhealthy'}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Nodes</div>
          <div className="text-2xl font-bold text-foreground">{health?.nodeCount || 0}</div>
          <div className="text-xs text-green-400">{health?.readyNodes || 0} ready</div>
        </div>

        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Pods</div>
          <div className="text-2xl font-bold text-foreground">{health?.podCount || 0}</div>
        </div>

        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">GPUs</div>
          <div className="text-2xl font-bold text-foreground">{totalGPUs}</div>
          <div className="text-xs text-yellow-400">{allocatedGPUs} allocated</div>
        </div>
      </div>

      {/* GPU Type Breakdown */}
      {Object.keys(gpuByType).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3">GPU Types</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(gpuByType).map(([type, info]) => (
              <div key={type} className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="text-sm font-medium text-purple-400">{type}</div>
                <div className="text-xl font-bold text-foreground mt-1">{info.total} GPUs</div>
                <div className="text-xs text-muted-foreground">
                  {info.allocated} allocated • {info.nodes} node{info.nodes !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => drillToEvents(clusterName)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors"
        >
          View Events
        </button>
      </div>

      {/* Issues Section */}
      {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Issues ({podIssues.length + clusterDeploymentIssues.length})
          </h3>

          {/* Pod Issues */}
          {podIssues.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Pod Issues</h4>
              <div className="space-y-2">
                {podIssues.map((issue, i) => (
                  <div
                    key={i}
                    onClick={() => drillToNamespace(clusterName, issue.namespace)}
                    className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{issue.name}</span>
                      <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">{issue.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {issue.namespace} • {issue.restarts} restarts
                    </div>
                    {issue.issues.length > 0 && (
                      <div className="text-xs text-red-400 mt-1">{issue.issues.join(', ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deployment Issues */}
          {clusterDeploymentIssues.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Deployment Issues</h4>
              <div className="space-y-2">
                {clusterDeploymentIssues.map((issue, i) => (
                  <div
                    key={i}
                    onClick={() => drillToNamespace(clusterName, issue.namespace)}
                    className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{issue.name}</span>
                      <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-400">
                        {issue.readyReplicas}/{issue.replicas} ready
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{issue.namespace}</div>
                    {issue.message && (
                      <div className="text-xs text-orange-400 mt-1">{issue.message}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Namespaces with Issues */}
      {namespaces.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Namespaces with Activity</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {namespaces.map(ns => {
              const nsIssues = podIssues.filter(p => p.namespace === ns).length +
                clusterDeploymentIssues.filter(d => d.namespace === ns).length
              return (
                <button
                  key={ns}
                  onClick={() => drillToNamespace(clusterName, ns)}
                  className="p-3 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="font-medium text-foreground text-sm truncate">{ns}</div>
                  {nsIssues > 0 && (
                    <div className="text-xs text-red-400 mt-1">{nsIssues} issues</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* GPU Nodes */}
      {clusterGPUNodes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            GPU Nodes ({clusterGPUNodes.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clusterGPUNodes.map((node, i) => (
              <div
                key={i}
                onClick={() => drillToGPUNode(clusterName, node.name, { ...node })}
                className="p-4 rounded-lg bg-card/50 border border-border flex items-center justify-between cursor-pointer hover:bg-card hover:border-primary/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground text-sm truncate">{node.name}</div>
                  <div className="text-xs text-muted-foreground">{node.gpuType}</div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <Gauge
                    value={node.gpuAllocated}
                    max={node.gpuCount}
                    size="sm"
                  />
                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    {node.gpuAllocated}/{node.gpuCount} GPUs
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

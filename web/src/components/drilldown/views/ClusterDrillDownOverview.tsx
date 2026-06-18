import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type ClusterHealth, type PodIssue, type DeploymentIssue, type GPUNode } from '../../../hooks/useMCP'
import { StatusBadge } from '../../ui/StatusBadge'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { Gauge } from '../../charts/Gauge'

type OverviewTreeLens = 'nodes' | 'workloads'

interface ClusterDrillDownOverviewProps {
  health: ClusterHealth | null
  navigateToResourceTree: (lens: OverviewTreeLens) => void
  gpuByType: Record<string, { total: number; allocated: number; nodes: number }>
  podIssues: PodIssue[]
  clusterDeploymentIssues: DeploymentIssue[]
  namespaces: string[]
  clusterGPUNodes: GPUNode[]
  effectiveClusterName: string
  drillToPod: (clusterName: string, namespace: string, podName: string, data?: Record<string, unknown>) => void
  drillToNamespace: (clusterName: string, namespace: string) => void
  drillToGPUNode: (clusterName: string, nodeName: string, nodeData?: Record<string, unknown>) => void
}

export function ClusterDrillDownOverview({
  health,
  navigateToResourceTree,
  gpuByType,
  podIssues,
  clusterDeploymentIssues,
  namespaces,
  clusterGPUNodes,
  effectiveClusterName,
  drillToPod,
  drillToNamespace,
  drillToGPUNode,
}: ClusterDrillDownOverviewProps) {
  const { t } = useTranslation()
  const totalGPUs = clusterGPUNodes.reduce((sum, n) => sum + (n.gpuCount || 0), 0)
  const allocatedGPUs = clusterGPUNodes.reduce((sum, n) => sum + (n.gpuAllocated || 0), 0)

  return (
    <>
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <StatusIndicator status={
              health?.reachable === false ? 'unreachable' :
                (health?.nodeCount && health.nodeCount > 0)
                  ? (health.readyNodes === health.nodeCount ? 'healthy' : 'warning')
                  : (health?.healthy ? 'healthy' : 'error')
            } />
            <span className="text-sm text-muted-foreground">{t('common.status')}</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {health?.reachable === false ? t('common.offline', 'Offline') :
              (health?.nodeCount && health.nodeCount > 0)
                ? (health.readyNodes === health.nodeCount ? t('common.healthy', 'Healthy') : t('common.degraded', 'Degraded'))
                : (health?.healthy ? t('common.healthy', 'Healthy') : t('common.unknown', 'Unknown'))}
          </div>
        </div>

        <button
          onClick={() => navigateToResourceTree('nodes')}
          className="p-4 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors cursor-pointer w-full"
        >
          <div className="text-sm text-muted-foreground mb-2">{t('common.nodes')}</div>
          <div className="text-2xl font-bold text-foreground">{health?.nodeCount || 0}</div>
          <div className="text-xs text-green-400">{health?.readyNodes || 0} ready</div>
        </button>

        <button
          onClick={() => navigateToResourceTree('workloads')}
          className="p-4 rounded-lg bg-card/50 border border-border text-left hover:bg-card hover:border-primary/50 transition-colors cursor-pointer w-full"
        >
          <div className="text-sm text-muted-foreground mb-2">{t('common.pods')}</div>
          <div className="text-2xl font-bold text-foreground">{health?.podCount || 0}</div>
        </button>

        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">{t('common.gpus')}</div>
          <div className="text-2xl font-bold text-foreground">{totalGPUs}</div>
          <div className="text-xs text-yellow-400">{allocatedGPUs} allocated</div>
        </div>
      </div>

      {/* GPU Type Breakdown */}
      {Object.keys(gpuByType).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3">{t('common.gpuTypes')}</h3>
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
                    onClick={() => drillToPod(effectiveClusterName, issue.namespace, issue.name, { ...issue })}
                    className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{issue.name}</span>
                        <div className="text-xs text-muted-foreground mt-1">
                          {issue.namespace} • {issue.restarts} restarts
                        </div>
                        {(issue.issues || []).length > 0 && (
                          <div className="text-xs text-red-400 mt-1">{(issue.issues || []).join(', ')}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <StatusBadge color="red" size="xs">{issue.status}</StatusBadge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
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
                    onClick={() => drillToNamespace(effectiveClusterName, issue.namespace)}
                    className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{issue.name}</span>
                        <div className="text-xs text-muted-foreground mt-1">{issue.namespace}</div>
                        {issue.message && (
                          <div className="text-xs text-orange-400 mt-1">{issue.message}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <StatusBadge color="orange" size="xs">
                          {issue.readyReplicas}/{issue.replicas} ready
                        </StatusBadge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
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
                  onClick={() => drillToNamespace(effectiveClusterName, ns)}
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
                onClick={() => drillToGPUNode(effectiveClusterName, node.name, { ...node })}
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
    </>
  )
}

export default ClusterDrillDownOverview

import { AlertTriangle, Layers, Server, HardDrive, Network, FolderOpen, ChevronRight, ChevronDown, Box, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type PodIssue, type DeploymentIssue, type GPUNode, type NodeInfo, type NamespaceStats } from '../../hooks/useMCP'
import { Gauge } from '../charts/Gauge'
import { NodeListItem } from './NodeListItem'
import { NodeDetailPanel } from './NodeDetailPanel'
import { NamespaceResources } from './components'
import { StatusBadge } from '../ui/StatusBadge'

interface ClusterDetailSectionsProps {
  isUnreachable: boolean
  showPodsByNamespace: boolean
  showAllNamespaces: boolean
  setShowAllNamespaces: (v: boolean) => void
  expandedNamespace: string | null
  setExpandedNamespace: (v: string | null) => void
  namespaceStats: NamespaceStats[]
  nsLoading: boolean
  podIssues: PodIssue[]
  clusterDeploymentIssues: DeploymentIssue[]
  stableClusterGPUs: GPUNode[]
  stableGpuByType: Record<string, { total: number; allocated: number; nodes: GPUNode[] }>
  showNodeDetails: boolean
  clusterNodes: NodeInfo[]
  expandedNodes: Set<string>
  setExpandedNodes: (updater: (prev: Set<string>) => Set<string>) => void
  nodesLoading: boolean
  clusterName: string
  drillToPod: (cluster: string, namespace: string, name: string, extra: object) => void
  drillToDeployment: (cluster: string, namespace: string, name: string, extra: object) => void
  onClose: () => void
}

export function ClusterDetailSections({
  isUnreachable, showPodsByNamespace, showAllNamespaces, setShowAllNamespaces,
  expandedNamespace, setExpandedNamespace, namespaceStats, nsLoading,
  podIssues, clusterDeploymentIssues, stableClusterGPUs, stableGpuByType,
  showNodeDetails, clusterNodes, expandedNodes, setExpandedNodes, nodesLoading,
  clusterName, drillToPod, drillToDeployment, onClose,
}: ClusterDetailSectionsProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Pods by Namespace */}
      {!isUnreachable && showPodsByNamespace && namespaceStats.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            {t('clusterDetail.workloadsCount', { count: namespaceStats.length })}
          </h3>
          <div className="rounded-lg bg-card/50 border border-border overflow-hidden">
            <div className="divide-y divide-border/30">
              {(showAllNamespaces ? namespaceStats : namespaceStats.slice(0, 5)).map((ns) => {
                const isExpanded = expandedNamespace === ns.name
                return (
                  <div key={ns.name} className="overflow-hidden">
                    <button
                      onClick={() => setExpandedNamespace(isExpanded ? null : ns.name)}
                      className="w-full p-3 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        <StatusBadge color="blue" size="xs" icon={<FolderOpen className="w-3 h-3" />}>{t('clusterDetail.ns')}</StatusBadge>
                        <span className="font-mono text-sm text-foreground">{ns.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">{t('clusterDetail.podsCount', { count: ns.podCount })}</span>
                        {ns.runningPods > 0 && (
                          <span className="text-green-400">{t('clusterDetail.runningPods', { count: ns.runningPods })}</span>
                        )}
                        {ns.pendingPods > 0 && (
                          <span className="text-yellow-400">{t('clusterDetail.pendingPods', { count: ns.pendingPods })}</span>
                        )}
                        {ns.failedPods > 0 && (
                          <span className="text-red-400">{t('clusterDetail.failedPods', { count: ns.failedPods })}</span>
                        )}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="bg-card/20 border-t border-border/20 px-4 py-2">
                        <NamespaceResources clusterName={clusterName} namespace={ns.name} onClose={onClose} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {namespaceStats.length > 5 && (
              <button
                onClick={() => setShowAllNamespaces(!showAllNamespaces)}
                className="w-full p-2 text-sm text-primary hover:bg-card/30 transition-colors border-t border-border/30"
              >
                {showAllNamespaces ? t('clusterDetail.showLess') : t('clusterDetail.showAllNamespaces', { count: namespaceStats.length })}
              </button>
            )}
          </div>
          {nsLoading && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('clusterDetail.loadingNamespaceData')}
            </div>
          )}
        </div>
      )}

      {/* Issues Section */}
      {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            {t('clusterDetail.issuesCount', { count: podIssues.length + clusterDeploymentIssues.length })}
          </h3>
          <div className="space-y-2">
            {podIssues.slice(0, 5).map((issue, i) => (
              <div
                key={`pod-${i}`}
                onClick={() => {
                  drillToPod(clusterName, issue.namespace, issue.name, {
                    status: issue.status, restarts: issue.restarts,
                    issues: issue.issues, reason: issue.reason })
                  onClose()
                }}
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <StatusBadge color="blue" size="xs" icon={<Box className="w-3 h-3" />} className="shrink-0">{t('clusterDetail.pod')}</StatusBadge>
                    <span className="font-medium text-foreground truncate">{issue.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">({issue.namespace})</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <StatusBadge color="red" size="xs">{issue.status}</StatusBadge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                {issue.restarts > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground pl-14">{t('clusterDetail.restarts', { count: issue.restarts })}</div>
                )}
              </div>
            ))}
            {clusterDeploymentIssues.slice(0, 3).map((issue, i) => (
              <div
                key={`dep-${i}`}
                onClick={() => {
                  drillToDeployment(clusterName, issue.namespace, issue.name, {
                    replicas: issue.replicas, readyReplicas: issue.readyReplicas,
                    reason: issue.reason, message: issue.message })
                  onClose()
                }}
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <StatusBadge color="purple" size="xs" icon={<Layers className="w-3 h-3" />} className="shrink-0">{t('clusterDetail.deploy')}</StatusBadge>
                    <span className="font-medium text-foreground truncate">{issue.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">({issue.namespace})</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <StatusBadge color="red" size="xs">{issue.readyReplicas}/{issue.replicas} ready</StatusBadge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                {issue.message && (
                  <div className="mt-1 text-xs text-red-400 pl-16 truncate">{issue.message}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GPU Section */}
      {stableClusterGPUs.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-purple-400" />
            {t('clusterDetail.gpusByType')}
          </h3>
          <div className="space-y-4">
            {Object.entries(stableGpuByType).map(([type, info]) => (
              <div key={type} className="rounded-lg bg-card/50 border border-border overflow-hidden">
                <div className="p-3 border-b border-border/50 bg-purple-500/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{type}</span>
                      <span className="text-xs text-muted-foreground">({t('clusterDetail.nodeCount', { count: info.nodes.length })})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24">
                        <Gauge value={info.allocated} max={info.total} size="sm" unit="" />
                      </div>
                      <span className="text-sm text-muted-foreground">{info.allocated}/{info.total} {t('clusterDetail.allocated')}</span>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-border/30">
                  {info.nodes.map((node, i) => (
                    <div key={i} className="p-3 flex items-center justify-between hover:bg-card/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <Network className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm text-foreground">{node.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-16">
                          <Gauge value={node.gpuAllocated} max={node.gpuCount} size="sm" unit="" />
                        </div>
                        <span className="text-xs text-muted-foreground w-12 text-right">
                          {node.gpuAllocated}/{node.gpuCount}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node Details */}
      {!isUnreachable && showNodeDetails && clusterNodes.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            {t('clusterDetail.nodesCount', { count: clusterNodes.length })}
          </h3>
          <div className="space-y-2">
            {clusterNodes.map((node) => {
              const isExpanded = expandedNodes.has(node.name)
              return (
                <div key={node.name}>
                  <div className={`rounded-lg border overflow-hidden ${isExpanded ? 'border-cyan-500/30' : 'border-border/30'}`}>
                    <NodeListItem
                      node={node}
                      isSelected={isExpanded}
                      onClick={() => {
                        setExpandedNodes(prev => {
                          const next = new Set(prev)
                          if (next.has(node.name)) next.delete(node.name)
                          else next.add(node.name)
                          return next
                        })
                      }}
                    />
                  </div>
                  {isExpanded && (
                    <NodeDetailPanel
                      node={node}
                      clusterName={clusterName}
                      onClose={() => setExpandedNodes(prev => { const next = new Set(prev); next.delete(node.name); return next })}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {nodesLoading && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('clusterDetail.loadingNodeDetails')}
            </div>
          )}
        </div>
      )}
    </>
  )
}

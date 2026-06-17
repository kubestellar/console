import type { Dispatch, SetStateAction } from 'react'
import { AlertTriangle, WifiOff, Layers, ChevronDown, ChevronRight, FolderOpen, Box, HardDrive, Network, Server, Loader2, Trash2, Bot, Stethoscope, Wand2, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ClusterHealth, ClusterInfo, DeploymentIssue, GPUNode, NamespaceStats, NodeInfo, PodIssue } from '../../hooks/mcp/types'
import { ClusterStatusDetails } from './ClusterStatusDetails'
import { Button } from '../ui/Button'
import { StatusBadge } from '../ui/StatusBadge'
import { Gauge } from '../charts/Gauge'
import { NamespaceResources } from './components'
import { NodeListItem } from './NodeListItem'
import { NodeDetailPanel } from './NodeDetailPanel'
import { CPUDetailModal, GPUDetailModal, MemoryDetailModal, StorageDetailModal } from './ResourceDetailModals'

interface ClusterDetailModalContentProps {
  clusterDeploymentIssues: DeploymentIssue[]
  clusterInfo: ClusterInfo | undefined
  clusterName: string
  clusterNodes: NodeInfo[]
  effectiveLoading: boolean
  health: ClusterHealth | null | undefined
  healthError: string | null
  isUnreachable: boolean
  nodesLoading: boolean
  nsLoading: boolean
  namespaceStats: NamespaceStats[]
  onAsk: () => void
  onClose: () => void
  onDiagnose: () => void
  onDrillToDeployment: (clusterName: string, namespace: string, deploymentName: string, data: Record<string, unknown>) => void
  onDrillToPod: (clusterName: string, namespace: string, podName: string, data: Record<string, unknown>) => void
  onRemove?: (clusterName: string) => void
  onRepair: () => void
  podIssues: PodIssue[]
  setExpandedNamespace: Dispatch<SetStateAction<string | null>>
  setExpandedNodes: Dispatch<SetStateAction<Set<string>>>
  setShowAllNamespaces: Dispatch<SetStateAction<boolean>>
  setShowCPUDetail: Dispatch<SetStateAction<boolean>>
  setShowGPUDetail: Dispatch<SetStateAction<boolean>>
  setShowMemoryDetail: Dispatch<SetStateAction<boolean>>
  setShowStorageDetail: Dispatch<SetStateAction<boolean>>
  showAllNamespaces: boolean
  showCPUDetail: boolean
  showGPUDetail: boolean
  showMemoryDetail: boolean
  showNodeDetails: boolean
  showPodsByNamespace: boolean
  showStorageDetail: boolean
  stableClusterGPUs: GPUNode[]
  stableGpuByType: Record<string, { total: number; allocated: number; nodes: GPUNode[] }>
  expandedNamespace: string | null
  expandedNodes: Set<string>
}

export function ClusterDetailModalContent({
  clusterDeploymentIssues,
  clusterInfo,
  clusterName,
  clusterNodes,
  effectiveLoading,
  health,
  healthError,
  isUnreachable,
  nodesLoading,
  nsLoading,
  namespaceStats,
  onAsk,
  onClose,
  onDiagnose,
  onDrillToDeployment,
  onDrillToPod,
  onRemove,
  onRepair,
  podIssues,
  setExpandedNamespace,
  setExpandedNodes,
  setShowAllNamespaces,
  setShowCPUDetail,
  setShowGPUDetail,
  setShowMemoryDetail,
  setShowStorageDetail,
  showAllNamespaces,
  showCPUDetail,
  showGPUDetail,
  showMemoryDetail,
  showNodeDetails,
  showPodsByNamespace,
  showStorageDetail,
  stableClusterGPUs,
  stableGpuByType,
  expandedNamespace,
  expandedNodes,
}: ClusterDetailModalContentProps) {
  const { t } = useTranslation()
  const canRemoveCluster = onRemove && isUnreachable && (clusterInfo?.source === 'kubeconfig' || !clusterInfo?.source)

  return (
    <>
      {healthError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{healthError}</span>
        </div>
      )}

      {clusterInfo && (
        <ClusterStatusDetails cluster={clusterInfo} className="mb-4" />
      )}

      {canRemoveCluster && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
          <WifiOff className="w-5 h-5 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-foreground mb-1">
              {t('clusterDetail.offlineRemoveTitle')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('clusterDetail.offlineRemoveDesc')}
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onRemove(clusterName)}
            icon={<Trash2 className="w-3.5 h-3.5" />}
            data-testid="cluster-detail-remove-cta"
          >
            {t('cluster.removeCluster')}
          </Button>
        </div>
      )}

      <div className="mb-6 p-4 rounded-lg bg-linear-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-5 h-5 text-purple-400" />
          <span className="text-sm font-medium text-foreground">{t('clusterDetail.aiAssistant')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onDiagnose}
            disabled={isUnreachable}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('clusterDetail.diagnoseTitle')}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            {t('clusterDetail.diagnose')}
          </button>
          <button
            onClick={onRepair}
            disabled={isUnreachable || (podIssues.length === 0 && clusterDeploymentIssues.length === 0)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={podIssues.length === 0 && clusterDeploymentIssues.length === 0 ? t('clusterDetail.noIssuesToRepair') : t('clusterDetail.repairTitle')}
          >
            <Wrench className="w-3.5 h-3.5" />
            {t('clusterDetail.repair')}
            {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
              <StatusBadge color="red" size="xs">
                {podIssues.length + clusterDeploymentIssues.length}
              </StatusBadge>
            )}
          </button>
          <Button
            variant="accent"
            size="sm"
            onClick={onAsk}
            disabled={isUnreachable}
            icon={<Wand2 className="w-3.5 h-3.5" />}
            title={t('clusterDetail.askTitle')}
          >
            {t('clusterDetail.ask')}
          </Button>
        </div>
      </div>

      {!isUnreachable && showPodsByNamespace && namespaceStats.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            {t('clusterDetail.workloadsCount', { count: namespaceStats.length })}
          </h3>
          <div className="rounded-lg bg-card/50 border border-border overflow-hidden">
            <div className="divide-y divide-border/30">
              {(showAllNamespaces ? namespaceStats : namespaceStats.slice(0, 5)).map((namespaceStat) => {
                const isExpanded = expandedNamespace === namespaceStat.name
                return (
                  <div key={namespaceStat.name} className="overflow-hidden">
                    <button
                      onClick={() => setExpandedNamespace(isExpanded ? null : namespaceStat.name)}
                      className="w-full p-3 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        <StatusBadge color="blue" size="xs" icon={<FolderOpen className="w-3 h-3" />}>{t('clusterDetail.ns')}</StatusBadge>
                        <span className="font-mono text-sm text-foreground">{namespaceStat.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">{t('clusterDetail.podsCount', { count: namespaceStat.podCount })}</span>
                        {namespaceStat.runningPods > 0 && (
                          <span className="text-green-400">{t('clusterDetail.runningPods', { count: namespaceStat.runningPods })}</span>
                        )}
                        {namespaceStat.pendingPods > 0 && (
                          <span className="text-yellow-400">{t('clusterDetail.pendingPods', { count: namespaceStat.pendingPods })}</span>
                        )}
                        {namespaceStat.failedPods > 0 && (
                          <span className="text-red-400">{t('clusterDetail.failedPods', { count: namespaceStat.failedPods })}</span>
                        )}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="bg-card/20 border-t border-border/20 px-4 py-2">
                        <NamespaceResources
                          clusterName={clusterName}
                          namespace={namespaceStat.name}
                          onClose={onClose}
                        />
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
                  onDrillToPod(clusterName, issue.namespace, issue.name, {
                    status: issue.status,
                    restarts: issue.restarts,
                    issues: issue.issues,
                    reason: issue.reason,
                  })
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
                  onDrillToDeployment(clusterName, issue.namespace, issue.name, {
                    replicas: issue.replicas,
                    readyReplicas: issue.readyReplicas,
                    reason: issue.reason,
                    message: issue.message,
                  })
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
                    <StatusBadge color="red" size="xs">
                      {issue.readyReplicas}/{issue.replicas} ready
                    </StatusBadge>
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
                      onClose={() => setExpandedNodes(prev => {
                        const next = new Set(prev)
                        next.delete(node.name)
                        return next
                      })}
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

      {showCPUDetail && (
        <CPUDetailModal
          clusterName={clusterName}
          totalCores={health?.cpuCores || 0}
          allocatableCores={health?.cpuCores || 0}
          requestedCores={health?.cpuRequestsCores || health?.cpuUsageCores || 0}
          nodes={clusterNodes.map(node => ({
            name: node.name,
            cpuCapacity: parseInt(node.cpuCapacity) || 0,
            cpuAllocatable: parseInt(node.cpuCapacity) || 0,
          }))}
          isLoading={nodesLoading}
          onClose={() => setShowCPUDetail(false)}
        />
      )}

      {showMemoryDetail && (
        <MemoryDetailModal
          clusterName={clusterName}
          totalMemoryGB={health?.memoryGB || 0}
          allocatableMemoryGB={health?.memoryGB || 0}
          requestedMemoryGB={health?.memoryRequestsGB || health?.memoryUsageGB || 0}
          nodes={clusterNodes.map(node => {
            const memoryValue = node.memoryCapacity || '0'
            let memoryGB = 0
            if (memoryValue.endsWith('Gi')) {
              memoryGB = parseFloat(memoryValue.replace('Gi', ''))
            } else if (memoryValue.endsWith('Mi')) {
              memoryGB = parseFloat(memoryValue.replace('Mi', '')) / 1024
            } else if (memoryValue.endsWith('Ki')) {
              memoryGB = parseFloat(memoryValue.replace('Ki', '')) / (1024 * 1024)
            }
            return {
              name: node.name,
              memoryCapacityGB: memoryGB,
              memoryAllocatableGB: memoryGB,
            }
          })}
          isLoading={nodesLoading}
          onClose={() => setShowMemoryDetail(false)}
        />
      )}

      {showStorageDetail && (
        <StorageDetailModal
          clusterName={clusterName}
          totalStorageGB={health?.storageGB || 0}
          allocatableStorageGB={health?.storageGB || 0}
          nodes={clusterNodes.map(node => {
            const storageValue = node.storageCapacity || '0'
            let storageGB = 0
            if (storageValue.endsWith('Gi')) {
              storageGB = parseFloat(storageValue.replace('Gi', ''))
            } else if (storageValue.endsWith('Mi')) {
              storageGB = parseFloat(storageValue.replace('Mi', '')) / 1024
            } else if (storageValue.endsWith('Ti')) {
              storageGB = parseFloat(storageValue.replace('Ti', '')) * 1024
            }
            return {
              name: node.name,
              ephemeralStorageGB: storageGB,
            }
          })}
          isLoading={nodesLoading}
          onClose={() => setShowStorageDetail(false)}
        />
      )}

      {showGPUDetail && (
        <GPUDetailModal
          clusterName={clusterName}
          gpuNodes={stableClusterGPUs.map(node => ({
            name: node.name,
            gpuType: node.gpuType || 'Unknown',
            gpuCount: node.gpuCount,
            gpuAllocated: node.gpuAllocated,
          }))}
          isLoading={effectiveLoading}
          onClose={() => setShowGPUDetail(false)}
        />
      )}
    </>
  )
}

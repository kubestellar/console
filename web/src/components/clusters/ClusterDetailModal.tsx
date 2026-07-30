import { useTranslation } from 'react-i18next'
import { AlertTriangle, WifiOff, Trash2, Loader2, Server, Network, HardDrive } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { Button } from '../ui/Button'
import { NodeListItem } from './NodeListItem'
import { NodeDetailPanel } from './NodeDetailPanel'
import { CPUDetailModal, MemoryDetailModal, StorageDetailModal, GPUDetailModal } from './ResourceDetailModals'
import { ClusterStatusDetails } from './ClusterStatusDetails'
import { ClusterAIActions } from './ClusterAIActions'
import { ClusterIssuesList } from './ClusterIssuesList'
import { Gauge } from '../charts/Gauge'
import { useClusterDetail, useClusterDetailUIState } from './useClusterDetail'
import {
  ClusterDetailHeader,
  ClusterStatsCards,
  ClusterResourceMetrics,
  ClusterWorkloadsSection,
} from './ClusterDetailModal.parts'

interface ClusterDetailModalProps {
  clusterName: string
  clusterUser?: string
  onClose: () => void
  onRename?: (clusterName: string) => void
  /**
   * Invoked when the user clicks "Remove cluster" on an unreachable cluster (#5901).
   * Only rendered when the cluster is unreachable and backed by a kubeconfig context.
   */
  onRemove?: (clusterName: string) => void
}

export function ClusterDetailModal({ clusterName, clusterUser, onClose, onRename, onRemove }: ClusterDetailModalProps) {
  const { t } = useTranslation()

  const {
    clusterInfo,
    health,
    healthError,
    isLoading,
    nodesLoading,
    nsLoading,
    podIssues,
    clusterDeploymentIssues,
    clusterNodes,
    namespaceStats,
    clusterDeployments,
    stableClusterGPUs,
    stableGpuByType,
    isUnreachable,
    isHealthy,
    aliasList,
    serverAddress,
    headerAliasSummary,
    drillToPod,
    drillToDeployment,
    handleDiagnose,
    handleRepair,
    handleAsk,
  } = useClusterDetail(clusterName, onClose)

  const {
    showAllNamespaces,
    setShowAllNamespaces,
    showPodsByNamespace,
    setShowPodsByNamespace,
    showNodeDetails,
    setShowNodeDetails,
    expandedNodes,
    setExpandedNodes,
    expandedNamespace,
    setExpandedNamespace,
    showCPUDetail,
    setShowCPUDetail,
    showMemoryDetail,
    setShowMemoryDetail,
    showStorageDetail,
    setShowStorageDetail,
    showGPUDetail,
    setShowGPUDetail,
  } = useClusterDetailUIState()

  return (
    <BaseModal isOpen={true} onClose={onClose} size="xl" closeOnBackdrop={false}>
      <div className="p-6 h-[90vh] overflow-y-auto">
        <ClusterDetailHeader
          clusterName={clusterName}
          clusterUser={clusterUser}
          clusterInfo={clusterInfo}
          health={health}
          isUnreachable={isUnreachable}
          isHealthy={isHealthy}
          aliasList={aliasList}
          headerAliasSummary={headerAliasSummary}
          serverAddress={serverAddress}
          onClose={onClose}
          onRename={onRename}
          onRemove={onRemove}
        />

        {/* Error banner when cluster health fetch fails (issue 6772) */}
        {healthError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{healthError}</span>
          </div>
        )}

        {/* Status details — surfaces unreachable reason (#5925), external reachability (#5926), freshness (#5927) */}
        {clusterInfo && <ClusterStatusDetails cluster={clusterInfo} className="mb-4" />}

        {/* Remove offline cluster affordance (#5901) */}
        {onRemove && isUnreachable && (clusterInfo?.source === 'kubeconfig' || !clusterInfo?.source) && (
          <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
            <WifiOff className="w-5 h-5 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground mb-1">
                {t('clusterDetail.offlineRemoveTitle')}
              </h3>
              <p className="text-xs text-muted-foreground">{t('clusterDetail.offlineRemoveDesc')}</p>
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

        {/* AI Actions */}
        <ClusterAIActions
          isUnreachable={isUnreachable}
          podIssuesCount={podIssues.length}
          deploymentIssuesCount={clusterDeploymentIssues.length}
          onDiagnose={handleDiagnose}
          onRepair={handleRepair}
          onAsk={handleAsk}
        />

        <ClusterStatsCards
          isUnreachable={isUnreachable}
          isLoading={isLoading}
          health={health}
          namespaceStats={namespaceStats}
          clusterDeployments={clusterDeployments}
          stableClusterGPUs={stableClusterGPUs}
          showNodeDetails={showNodeDetails}
          setShowNodeDetails={setShowNodeDetails}
          showPodsByNamespace={showPodsByNamespace}
          setShowPodsByNamespace={setShowPodsByNamespace}
          setShowGPUDetail={setShowGPUDetail}
        />

        <ClusterResourceMetrics
          isUnreachable={isUnreachable}
          isLoading={isLoading}
          health={health}
          setShowCPUDetail={setShowCPUDetail}
          setShowMemoryDetail={setShowMemoryDetail}
          setShowStorageDetail={setShowStorageDetail}
        />

        <ClusterWorkloadsSection
          isUnreachable={isUnreachable}
          showPodsByNamespace={showPodsByNamespace}
          namespaceStats={namespaceStats}
          showAllNamespaces={showAllNamespaces}
          setShowAllNamespaces={setShowAllNamespaces}
          expandedNamespace={expandedNamespace}
          setExpandedNamespace={setExpandedNamespace}
          clusterName={clusterName}
          onClose={onClose}
          nsLoading={nsLoading}
        />

        {/* Issues Section */}
        <ClusterIssuesList
          podIssues={podIssues}
          deploymentIssues={clusterDeploymentIssues}
          clusterName={clusterName}
          onDrillToPod={drillToPod}
          onDrillToDeployment={drillToDeployment}
          onClose={onClose}
        />

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
                        onClose={() =>
                          setExpandedNodes(prev => {
                            const next = new Set(prev)
                            next.delete(node.name)
                            return next
                          })
                        }
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
      </div>

      {/* Resource Detail Modals */}
      {showCPUDetail && (
        <CPUDetailModal
          clusterName={clusterName}
          totalCores={health?.cpuCores || 0}
          allocatableCores={health?.cpuCores || 0}
          requestedCores={health?.cpuRequestsCores || health?.cpuUsageCores || 0}
          nodes={clusterNodes.map(n => ({
            name: n.name,
            cpuCapacity: parseInt(n.cpuCapacity) || 0,
            cpuAllocatable: parseInt(n.cpuCapacity) || 0,
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
          nodes={clusterNodes.map(n => {
            const memStr = n.memoryCapacity || '0'
            let memGB = 0
            if (memStr.endsWith('Gi')) memGB = parseFloat(memStr.replace('Gi', ''))
            else if (memStr.endsWith('Mi')) memGB = parseFloat(memStr.replace('Mi', '')) / 1024
            else if (memStr.endsWith('Ki')) memGB = parseFloat(memStr.replace('Ki', '')) / (1024 * 1024)
            return { name: n.name, memoryCapacityGB: memGB, memoryAllocatableGB: memGB }
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
          nodes={clusterNodes.map(n => {
            const storageStr = n.storageCapacity || '0'
            let storageGB = 0
            if (storageStr.endsWith('Gi')) storageGB = parseFloat(storageStr.replace('Gi', ''))
            else if (storageStr.endsWith('Mi')) storageGB = parseFloat(storageStr.replace('Mi', '')) / 1024
            else if (storageStr.endsWith('Ti')) storageGB = parseFloat(storageStr.replace('Ti', '')) * 1024
            return { name: n.name, ephemeralStorageGB: storageGB }
          })}
          isLoading={nodesLoading}
          onClose={() => setShowStorageDetail(false)}
        />
      )}

      {showGPUDetail && (
        <GPUDetailModal
          clusterName={clusterName}
          gpuNodes={stableClusterGPUs.map(n => ({
            name: n.name,
            gpuType: n.gpuType || 'Unknown',
            gpuCount: n.gpuCount,
            gpuAllocated: n.gpuAllocated,
          }))}
          isLoading={isLoading}
          onClose={() => setShowGPUDetail(false)}
        />
      )}
    </BaseModal>
  )
}

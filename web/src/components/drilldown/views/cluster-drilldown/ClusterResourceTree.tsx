import { ChevronRight, ChevronDown, Server } from 'lucide-react'
import { StatusIndicator } from '../../../charts/StatusIndicator'
import { useTranslation } from 'react-i18next'
import type { NodeInfo, NamespaceStats, ClusterHealth, Service, PodIssue, Deployment, PVC } from '../../../../hooks/useMCP'
import type { TreeLens } from './types'
import {
  ClusterTreeToolbar,
  NodesBranch,
  NamespacesBranch,
  DeploymentIssuesBranch,
  PodIssuesBranch,
  StorageBranch,
  NetworkBranch,
} from './ClusterResourceTree.parts'

export interface ClusterResourceTreeProps {
  effectiveClusterName: string
  clusterDisplayName: string
  health: ClusterHealth | null | undefined
  filteredNodes: NodeInfo[]
  filteredNamespaces: string[]
  filteredNamespaceStats: NamespaceStats[]
  unhealthyDeployments: Deployment[]
  filteredServices: Service[]
  filteredPVCs: PVC[]
  namespaceResources: {
    podIssueCounts: Record<string, number>
    deploymentIssueCounts: Record<string, number>
  }
  issueCounts: {
    nodes: number
    deployments: number
    pods: number
    pvcs: number
    total: number
  }
  hasVisibleResourceData: boolean
  activeLens: TreeLens
  setActiveLens: (lens: TreeLens) => void
  searchFilter: string
  setSearchFilter: (filter: string) => void
  expandedSections: Set<string>
  toggleSection: (section: string) => void
  podIssues: PodIssue[]
  drillToNode: (cluster: string, node: string, data?: Record<string, unknown>) => void
  drillToNamespace: (cluster: string, namespace: string) => void
  drillToPod: (cluster: string, namespace: string, pod: string, data?: Record<string, unknown>) => void
}

export function ClusterResourceTree({
  effectiveClusterName,
  clusterDisplayName,
  health,
  filteredNodes,
  filteredNamespaces,
  filteredNamespaceStats,
  unhealthyDeployments,
  filteredServices,
  filteredPVCs,
  namespaceResources,
  issueCounts,
  hasVisibleResourceData,
  activeLens,
  setActiveLens,
  searchFilter,
  setSearchFilter,
  expandedSections,
  toggleSection,
  podIssues,
  drillToNode,
  drillToNamespace,
  drillToPod,
}: ClusterResourceTreeProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <ClusterTreeToolbar
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        activeLens={activeLens}
        setActiveLens={setActiveLens}
        searchPlaceholder={t('common.searchResources')}
        counts={{
          nodes: filteredNodes.length,
          workloads: filteredNamespaceStats.length,
          storage: filteredPVCs.length,
          network: filteredServices.length,
          issues: issueCounts.total,
        }}
      />

      {/* Tree Content */}
      <div className="bg-card/30 rounded-lg border border-border p-4">
        <div className="relative">
          {/* Cluster Header */}
          <div
            onClick={() => toggleSection('cluster')}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
          >
            {expandedSections.has('cluster') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Server className="w-4 h-4 text-cyan-400" />
            <span className="font-medium text-foreground">{clusterDisplayName}</span>
            <StatusIndicator status={
              health?.reachable === false ? 'unreachable' :
              (health?.nodeCount && health.nodeCount > 0)
                ? (health.readyNodes === health.nodeCount ? 'healthy' : 'warning')
                : (health?.healthy ? 'healthy' : 'error')
            } />
          </div>

          {expandedSections.has('cluster') && (
            <div className="ml-6 border-l-2 border-cyan-500/30 pl-4 mt-2 space-y-2">
              {(activeLens === 'all' || activeLens === 'nodes' || activeLens === 'issues') && filteredNodes.length > 0 && (
                <NodesBranch
                  effectiveClusterName={effectiveClusterName}
                  nodes={filteredNodes}
                  issueCount={issueCounts.nodes}
                  expanded={expandedSections.has('nodes')}
                  toggle={() => toggleSection('nodes')}
                  drillToNode={drillToNode}
                  nodesLabel={t('common.nodes')}
                />
              )}

              {(activeLens === 'all' || activeLens === 'workloads') && filteredNamespaces.length > 0 && (
                <NamespacesBranch
                  effectiveClusterName={effectiveClusterName}
                  namespaces={filteredNamespaces}
                  namespaceStats={filteredNamespaceStats}
                  namespaceResources={namespaceResources}
                  expandedSections={expandedSections}
                  toggleSection={toggleSection}
                  drillToNamespace={drillToNamespace}
                />
              )}

              {activeLens === 'issues' && issueCounts.deployments > 0 && (
                <DeploymentIssuesBranch
                  effectiveClusterName={effectiveClusterName}
                  unhealthyDeployments={unhealthyDeployments}
                  issueCount={issueCounts.deployments}
                  expanded={expandedSections.has('deployment-issues')}
                  toggle={() => toggleSection('deployment-issues')}
                  drillToNamespace={drillToNamespace}
                />
              )}

              {activeLens === 'issues' && issueCounts.pods > 0 && (
                <PodIssuesBranch
                  effectiveClusterName={effectiveClusterName}
                  podIssues={podIssues}
                  issueCount={issueCounts.pods}
                  expanded={expandedSections.has('pod-issues')}
                  toggle={() => toggleSection('pod-issues')}
                  drillToPod={drillToPod}
                />
              )}

              {(activeLens === 'storage' || (activeLens === 'all' && filteredPVCs.length > 0)) && filteredPVCs.length > 0 && (
                <StorageBranch
                  effectiveClusterName={effectiveClusterName}
                  pvcs={filteredPVCs}
                  issueCount={issueCounts.pvcs}
                  expanded={expandedSections.has('storage')}
                  toggle={() => toggleSection('storage')}
                  drillToNamespace={drillToNamespace}
                  pvcsLabel={t('common.pvcs')}
                />
              )}

              {activeLens === 'network' && filteredServices.length > 0 && (
                <NetworkBranch
                  effectiveClusterName={effectiveClusterName}
                  services={filteredServices}
                  expanded={expandedSections.has('network')}
                  toggle={() => toggleSection('network')}
                  drillToNamespace={drillToNamespace}
                  servicesLabel={t('common.services')}
                />
              )}

              {/* Empty state for filters */}
              {!hasVisibleResourceData && (
                <div className="text-center text-muted-foreground text-sm py-4">
                  No resources match the current filter
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

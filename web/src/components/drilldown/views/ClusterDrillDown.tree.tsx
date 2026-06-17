import { ChevronRight, ChevronDown, Server, Box, Layers, Database, Network, HardDrive, Search, AlertTriangle, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ClusterHealth, NodeInfo, NamespaceStats, PVC, Service, PodIssue, Deployment } from '../../../hooks/useMCP'
import { StatusBadge } from '../../ui/StatusBadge'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { NamespaceResources } from '../../clusters/components'

export type TreeLens = 'all' | 'issues' | 'nodes' | 'workloads' | 'storage' | 'network'

interface IssueCounts {
  total: number
  nodes: number
  pods: number
  pvcs: number
  deployments: number
}

interface NamespaceResources {
  podIssueCounts: Record<string, number>
  deploymentIssueCounts: Record<string, number>
}

interface ClusterResourceTreeProps {
  activeLens: TreeLens
  setActiveLens: (lens: TreeLens) => void
  searchFilter: string
  setSearchFilter: (v: string) => void
  expandedSections: Set<string>
  toggleSection: (key: string) => void
  filteredNodes: NodeInfo[]
  filteredNamespaces: string[]
  filteredNamespaceStats: NamespaceStats[]
  filteredPVCs: PVC[]
  filteredServices: Service[]
  issueCounts: IssueCounts
  namespaceResources: NamespaceResources
  podIssues: PodIssue[]
  unhealthyDeployments: Deployment[]
  health: ClusterHealth | undefined
  clusterDisplayName: string
  effectiveClusterName: string
  hasVisibleResourceData: boolean
  drillToNode: (cluster: string, node: string, extra: object) => void
  drillToNamespace: (cluster: string, ns: string) => void
  drillToPod: (cluster: string, ns: string, pod: string, extra: object) => void
}

export function ClusterResourceTree({
  activeLens, setActiveLens, searchFilter, setSearchFilter,
  expandedSections, toggleSection,
  filteredNodes, filteredNamespaces, filteredNamespaceStats,
  filteredPVCs, filteredServices,
  issueCounts, namespaceResources, podIssues, unhealthyDeployments,
  health, clusterDisplayName, effectiveClusterName, hasVisibleResourceData,
  drillToNode, drillToNamespace, drillToPod,
}: ClusterResourceTreeProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder={t('common.searchResources')}
            className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        {/* Lens/View Buttons */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all' as TreeLens, label: 'All', icon: Layers },
            { id: 'issues' as TreeLens, label: 'Issues', icon: AlertTriangle, count: issueCounts.total },
            { id: 'nodes' as TreeLens, label: 'Nodes', icon: Server, count: filteredNodes.length },
            { id: 'workloads' as TreeLens, label: 'Workloads', icon: Box, count: filteredNamespaceStats.length },
            { id: 'storage' as TreeLens, label: 'Storage', icon: HardDrive, count: filteredPVCs.length },
            { id: 'network' as TreeLens, label: 'Network', icon: Network, count: filteredServices.length },
          ].map(lens => (
            <button
              key={lens.id}
              onClick={() => setActiveLens(lens.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                activeLens === lens.id
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <lens.icon className="w-3.5 h-3.5" />
              {lens.label}
              {lens.count !== undefined && lens.count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-2xs ${
                  lens.id === 'issues' ? 'bg-red-500/20 text-red-400' : 'bg-secondary text-muted-foreground'
                }`}>
                  {lens.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tree Content */}
      <div className="bg-card/30 rounded-lg border border-border p-4">
        {/* Cluster Root */}
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
              {/* Nodes Branch */}
              {(activeLens === 'all' || activeLens === 'nodes' || activeLens === 'issues') && filteredNodes.length > 0 && (
                <div>
                  <div
                    onClick={() => toggleSection('nodes')}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                  >
                    {expandedSections.has('nodes') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Server className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-foreground">{t('common.nodes')}</span>
                    <span className="text-xs text-muted-foreground">({filteredNodes.length})</span>
                    {issueCounts.nodes > 0 && (
                      <StatusBadge color="red" size="xs" rounded="full" className="ml-1">
                        {issueCounts.nodes} not ready
                      </StatusBadge>
                    )}
                  </div>

                  {expandedSections.has('nodes') && (
                    <div className="ml-6 border-l-2 border-blue-500/30 pl-4 mt-1 space-y-1">
                      {filteredNodes.slice(0, 20).map((node) => (
                        <button
                          key={node.name}
                          onClick={() => drillToNode(effectiveClusterName, node.name, { status: node.status, roles: node.roles, unschedulable: node.unschedulable })}
                          type="button"
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group w-full text-left bg-transparent border-none"
                        >
                          <div className={`w-2 h-2 rounded-full ${node.status === 'Ready' ? 'bg-green-400' : 'bg-red-400'}`} />
                          <span className="text-sm text-foreground group-hover:text-primary transition-colors">{node.name}</span>
                          <span className={`text-xs ${node.status === 'Ready' ? 'text-green-400' : 'text-red-400'}`}>
                            {node.status}
                          </span>
                          {node.roles?.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              [{(node.roles || []).join(', ')}]
                            </span>
                          )}
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                        </button>
                      ))}
                      {filteredNodes.length > 20 && (
                        <div className="text-xs text-muted-foreground p-2">
                          +{filteredNodes.length - 20} more nodes...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Namespaces Branch */}
              {(activeLens === 'all' || activeLens === 'workloads') && filteredNamespaces.length > 0 && (
                <div>
                  <div
                    onClick={() => toggleSection('namespaces')}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                  >
                    {expandedSections.has('namespaces') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Database className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-foreground">Namespaces</span>
                    <span className="text-xs text-muted-foreground">({filteredNamespaces.length})</span>
                  </div>

                  {expandedSections.has('namespaces') && (
                    <div className="ml-6 border-l-2 border-purple-500/30 pl-4 mt-1 space-y-1">
                      {filteredNamespaceStats.slice(0, 15).map((namespaceStat, i) => {
                        const ns = namespaceStat.name
                        const nsKey = `ns-${ns}`
                        const nsPodIssues = namespaceResources.podIssueCounts[ns] || 0
                        const nsDeploymentIssues = namespaceResources.deploymentIssueCounts[ns] || 0
                        const totalIssues = nsPodIssues + nsDeploymentIssues

                        return (
                          <div key={i}>
                            <div
                              onClick={() => toggleSection(nsKey)}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                            >
                              {expandedSections.has(nsKey) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              <span className="text-sm text-foreground">{ns}</span>
                              {namespaceStat.podCount > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {namespaceStat.runningPods}/{namespaceStat.podCount} pods
                                </span>
                              )}
                              {namespaceStat.pendingPods > 0 && (
                                <StatusBadge color="yellow" size="xs" rounded="full" className="ml-1">
                                  {namespaceStat.pendingPods} pending
                                </StatusBadge>
                              )}
                              {totalIssues > 0 && (
                                <StatusBadge color="red" size="xs" rounded="full" className="ml-1">
                                  {totalIssues}
                                </StatusBadge>
                              )}
                            </div>

                            {expandedSections.has(nsKey) && (
                              <div className="ml-6 border-l-2 border-muted/30 pl-4 mt-1 space-y-2">
                                <NamespaceResources clusterName={effectiveClusterName} namespace={ns} />
                                <button
                                  onClick={() => drillToNamespace(effectiveClusterName, ns)}
                                  className="text-xs text-purple-400 hover:text-purple-300 p-1.5 transition-colors"
                                >
                                  View all in {ns} →
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {filteredNamespaces.length > 15 && (
                        <div className="text-xs text-muted-foreground p-2">
                          +{filteredNamespaces.length - 15} more namespaces...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Deployments with Issues (when issues lens active) */}
              {activeLens === 'issues' && issueCounts.deployments > 0 && (
                <div>
                  <div
                    onClick={() => toggleSection('deployment-issues')}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                  >
                    {expandedSections.has('deployment-issues') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <AlertTriangle className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-medium text-foreground">Deployment Issues</span>
                    <StatusBadge color="orange" size="xs" rounded="full">
                      {issueCounts.deployments}
                    </StatusBadge>
                  </div>

                  {expandedSections.has('deployment-issues') && (
                    <div className="ml-6 border-l-2 border-orange-500/30 pl-4 mt-1 space-y-1">
                      {unhealthyDeployments.map((dep, i) => (
                        <div
                          key={i}
                          onClick={() => drillToNamespace(effectiveClusterName, dep.namespace)}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                        >
                          <XCircle className="w-3 h-3 text-orange-400" />
                          <span className="text-sm text-foreground">{dep.name}</span>
                          <span className="text-xs text-muted-foreground">{dep.namespace}</span>
                          <span className="text-xs text-orange-400">{dep.readyReplicas}/{dep.replicas}</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pod Issues (when issues lens active) */}
              {activeLens === 'issues' && issueCounts.pods > 0 && (
                <div>
                  <div
                    onClick={() => toggleSection('pod-issues')}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                  >
                    {expandedSections.has('pod-issues') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-medium text-foreground">Pod Issues</span>
                    <StatusBadge color="red" size="xs" rounded="full">
                      {issueCounts.pods}
                    </StatusBadge>
                  </div>

                  {expandedSections.has('pod-issues') && (
                    <div className="ml-6 border-l-2 border-red-500/30 pl-4 mt-1 space-y-1">
                      {podIssues.slice(0, 10).map((issue, i) => (
                        <div
                          key={i}
                          onClick={() => drillToPod(effectiveClusterName, issue.namespace, issue.name, { ...issue })}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                        >
                          <XCircle className="w-3 h-3 text-red-400" />
                          <span className="text-sm text-foreground">{issue.name}</span>
                          <span className="text-xs text-muted-foreground">{issue.namespace}</span>
                          <span className="text-xs text-red-400">{issue.status}</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                        </div>
                      ))}
                      {podIssues.length > 10 && (
                        <div className="text-xs text-muted-foreground p-2">
                          +{podIssues.length - 10} more pod issues...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Storage Resources */}
              {(activeLens === 'storage' || (activeLens === 'all' && filteredPVCs.length > 0)) && filteredPVCs.length > 0 && (
                <div>
                  <div
                    onClick={() => toggleSection('storage')}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                  >
                    {expandedSections.has('storage') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <HardDrive className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-foreground">{t('common.pvcs')}</span>
                    <span className="text-xs text-muted-foreground">({filteredPVCs.length})</span>
                    {issueCounts.pvcs > 0 && (
                      <StatusBadge color="yellow" size="xs" rounded="full" className="ml-1">
                        {issueCounts.pvcs} pending
                      </StatusBadge>
                    )}
                  </div>

                  {expandedSections.has('storage') && (
                    <div className="ml-6 border-l-2 border-green-500/30 pl-4 mt-1 space-y-1">
                      {filteredPVCs.slice(0, 10).map((pvc, i) => (
                        <div
                          key={i}
                          onClick={() => drillToNamespace(effectiveClusterName, pvc.namespace)}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                        >
                          <div className={`w-2 h-2 rounded-full ${pvc.status === 'Bound' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                          <span className="text-sm text-foreground">{pvc.name}</span>
                          <span className="text-xs text-muted-foreground">{pvc.namespace}</span>
                          <span className={`text-xs ${pvc.status === 'Bound' ? 'text-green-400' : 'text-yellow-400'}`}>
                            {pvc.status}
                          </span>
                          {pvc.capacity && <span className="text-xs text-muted-foreground">{pvc.capacity}</span>}
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                        </div>
                      ))}
                      {filteredPVCs.length > 10 && (
                        <div className="text-xs text-muted-foreground p-2">
                          +{filteredPVCs.length - 10} more PVCs...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Network Resources */}
              {activeLens === 'network' && filteredServices.length > 0 && (
                <div>
                  <div
                    onClick={() => toggleSection('network')}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                  >
                    {expandedSections.has('network') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Network className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-foreground">{t('common.services')}</span>
                    <span className="text-xs text-muted-foreground">({filteredServices.length})</span>
                  </div>

                  {expandedSections.has('network') && (
                    <div className="ml-6 border-l-2 border-blue-500/30 pl-4 mt-1 space-y-1">
                      {filteredServices.slice(0, 15).map((svc, i) => (
                        <div
                          key={i}
                          onClick={() => drillToNamespace(effectiveClusterName, svc.namespace)}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                        >
                          <Network className="w-3 h-3 text-blue-400" />
                          <span className="text-sm text-foreground">{svc.name}</span>
                          <span className="text-xs text-muted-foreground">{svc.namespace}</span>
                          <StatusBadge color="blue" size="xs">{svc.type}</StatusBadge>
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                        </div>
                      ))}
                      {filteredServices.length > 15 && (
                        <div className="text-xs text-muted-foreground p-2">
                          +{filteredServices.length - 15} more services...
                        </div>
                      )}
                    </div>
                  )}
                </div>
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

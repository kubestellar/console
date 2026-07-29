import { ChevronRight, ChevronDown, Server, Box, Layers, Database, Network, HardDrive, Search, AlertTriangle, XCircle } from 'lucide-react'
import { StatusBadge } from '../../../ui/StatusBadge'
import { NamespaceResources } from '../../../clusters/components'
import { Input } from '../../../ui/Input'
import { cn } from '../../../../lib/cn'
import type { NodeInfo, NamespaceStats, Service, PodIssue, Deployment, PVC } from '../../../../hooks/useMCP'
import type { TreeLens } from './types'

const MAX_VISIBLE_NODES = 20
const MAX_VISIBLE_NAMESPACES = 15
const MAX_VISIBLE_POD_ISSUES = 10
const MAX_VISIBLE_PVCS = 10
const MAX_VISIBLE_SERVICES = 15

interface LensCounts {
  nodes: number
  workloads: number
  storage: number
  network: number
  issues: number
}

/** Search box + lens filter buttons shown above the resource tree. */
export function ClusterTreeToolbar({
  searchFilter,
  setSearchFilter,
  activeLens,
  setActiveLens,
  counts,
  searchPlaceholder,
}: {
  searchFilter: string
  setSearchFilter: (filter: string) => void
  activeLens: TreeLens
  setActiveLens: (lens: TreeLens) => void
  counts: LensCounts
  searchPlaceholder: string
}) {
  return (
    <div className="flex flex-col md:flex-row gap-3">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-10"
          leadingIcon={null}
        />
      </div>

      {/* Lens/View Buttons */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all' as TreeLens, label: 'All', icon: Layers },
          { id: 'issues' as TreeLens, label: 'Issues', icon: AlertTriangle, count: counts.issues },
          { id: 'nodes' as TreeLens, label: 'Nodes', icon: Server, count: counts.nodes },
          { id: 'workloads' as TreeLens, label: 'Workloads', icon: Box, count: counts.workloads },
          { id: 'storage' as TreeLens, label: 'Storage', icon: HardDrive, count: counts.storage },
          { id: 'network' as TreeLens, label: 'Network', icon: Network, count: counts.network },
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
              <span className={cn(
                'ml-1 px-1.5 py-0.5 rounded-full text-2xs',
                lens.id === 'issues' ? 'bg-red-500/20 text-red-400' : 'bg-secondary text-muted-foreground'
              )}>
                {lens.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Nodes branch of the cluster resource tree. */
export function NodesBranch({
  effectiveClusterName,
  nodes,
  issueCount,
  expanded,
  toggle,
  drillToNode,
  nodesLabel,
}: {
  effectiveClusterName: string
  nodes: NodeInfo[]
  issueCount: number
  expanded: boolean
  toggle: () => void
  drillToNode: (cluster: string, node: string, data?: Record<string, unknown>) => void
  nodesLabel: string
}) {
  return (
    <div>
      <div onClick={toggle} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer">
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Server className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-foreground">{nodesLabel}</span>
        <span className="text-xs text-muted-foreground">({nodes.length})</span>
        {issueCount > 0 && (
          <StatusBadge color="red" size="xs" rounded="full" className="ml-1">
            {issueCount} not ready
          </StatusBadge>
        )}
      </div>

      {expanded && (
        <div className="ml-6 border-l-2 border-blue-500/30 pl-4 mt-1 space-y-1">
          {nodes.slice(0, MAX_VISIBLE_NODES).map((node) => (
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
          {nodes.length > MAX_VISIBLE_NODES && (
            <div className="text-xs text-muted-foreground p-2">
              +{nodes.length - MAX_VISIBLE_NODES} more nodes...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Namespaces branch of the cluster resource tree. */
export function NamespacesBranch({
  effectiveClusterName,
  namespaces,
  namespaceStats,
  namespaceResources,
  expandedSections,
  toggleSection,
  drillToNamespace,
}: {
  effectiveClusterName: string
  namespaces: string[]
  namespaceStats: NamespaceStats[]
  namespaceResources: {
    podIssueCounts: Record<string, number>
    deploymentIssueCounts: Record<string, number>
  }
  expandedSections: Set<string>
  toggleSection: (section: string) => void
  drillToNamespace: (cluster: string, namespace: string) => void
}) {
  return (
    <div>
      <div
        onClick={() => toggleSection('namespaces')}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
      >
        {expandedSections.has('namespaces') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Database className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">Namespaces</span>
        <span className="text-xs text-muted-foreground">({namespaces.length})</span>
      </div>

      {expandedSections.has('namespaces') && (
        <div className="ml-6 border-l-2 border-purple-500/30 pl-4 mt-1 space-y-1">
          {namespaceStats.slice(0, MAX_VISIBLE_NAMESPACES).map((namespaceStat, i) => {
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
          {namespaces.length > MAX_VISIBLE_NAMESPACES && (
            <div className="text-xs text-muted-foreground p-2">
              +{namespaces.length - MAX_VISIBLE_NAMESPACES} more namespaces...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Deployments-with-issues branch, only rendered on the "issues" lens. */
export function DeploymentIssuesBranch({
  effectiveClusterName,
  unhealthyDeployments,
  issueCount,
  expanded,
  toggle,
  drillToNamespace,
}: {
  effectiveClusterName: string
  unhealthyDeployments: Deployment[]
  issueCount: number
  expanded: boolean
  toggle: () => void
  drillToNamespace: (cluster: string, namespace: string) => void
}) {
  return (
    <div>
      <div onClick={toggle} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer">
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <AlertTriangle className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-medium text-foreground">Deployment Issues</span>
        <StatusBadge color="orange" size="xs" rounded="full">
          {issueCount}
        </StatusBadge>
      </div>

      {expanded && (
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
  )
}

/** Pod-issues branch, only rendered on the "issues" lens. */
export function PodIssuesBranch({
  effectiveClusterName,
  podIssues,
  issueCount,
  expanded,
  toggle,
  drillToPod,
}: {
  effectiveClusterName: string
  podIssues: PodIssue[]
  issueCount: number
  expanded: boolean
  toggle: () => void
  drillToPod: (cluster: string, namespace: string, pod: string, data?: Record<string, unknown>) => void
}) {
  return (
    <div>
      <div onClick={toggle} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer">
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-sm font-medium text-foreground">Pod Issues</span>
        <StatusBadge color="red" size="xs" rounded="full">
          {issueCount}
        </StatusBadge>
      </div>

      {expanded && (
        <div className="ml-6 border-l-2 border-red-500/30 pl-4 mt-1 space-y-1">
          {podIssues.slice(0, MAX_VISIBLE_POD_ISSUES).map((issue, i) => (
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
          {podIssues.length > MAX_VISIBLE_POD_ISSUES && (
            <div className="text-xs text-muted-foreground p-2">
              +{podIssues.length - MAX_VISIBLE_POD_ISSUES} more pod issues...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Storage (PVC) branch of the cluster resource tree. */
export function StorageBranch({
  effectiveClusterName,
  pvcs,
  issueCount,
  expanded,
  toggle,
  drillToNamespace,
  pvcsLabel,
}: {
  effectiveClusterName: string
  pvcs: PVC[]
  issueCount: number
  expanded: boolean
  toggle: () => void
  drillToNamespace: (cluster: string, namespace: string) => void
  pvcsLabel: string
}) {
  return (
    <div>
      <div onClick={toggle} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer">
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <HardDrive className="w-4 h-4 text-green-400" />
        <span className="text-sm font-medium text-foreground">{pvcsLabel}</span>
        <span className="text-xs text-muted-foreground">({pvcs.length})</span>
        {issueCount > 0 && (
          <StatusBadge color="yellow" size="xs" rounded="full" className="ml-1">
            {issueCount} pending
          </StatusBadge>
        )}
      </div>

      {expanded && (
        <div className="ml-6 border-l-2 border-green-500/30 pl-4 mt-1 space-y-1">
          {pvcs.slice(0, MAX_VISIBLE_PVCS).map((pvc, i) => (
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
          {pvcs.length > MAX_VISIBLE_PVCS && (
            <div className="text-xs text-muted-foreground p-2">
              +{pvcs.length - MAX_VISIBLE_PVCS} more PVCs...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Network (Service) branch of the cluster resource tree. */
export function NetworkBranch({
  effectiveClusterName,
  services,
  expanded,
  toggle,
  drillToNamespace,
  servicesLabel,
}: {
  effectiveClusterName: string
  services: Service[]
  expanded: boolean
  toggle: () => void
  drillToNamespace: (cluster: string, namespace: string) => void
  servicesLabel: string
}) {
  return (
    <div>
      <div onClick={toggle} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer">
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Network className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-foreground">{servicesLabel}</span>
        <span className="text-xs text-muted-foreground">({services.length})</span>
      </div>

      {expanded && (
        <div className="ml-6 border-l-2 border-blue-500/30 pl-4 mt-1 space-y-1">
          {services.slice(0, MAX_VISIBLE_SERVICES).map((svc, i) => (
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
          {services.length > MAX_VISIBLE_SERVICES && (
            <div className="text-xs text-muted-foreground p-2">
              +{services.length - MAX_VISIBLE_SERVICES} more services...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

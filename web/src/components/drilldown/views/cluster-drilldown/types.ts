import type { NodeInfo, NamespaceStats, ClusterHealth, Service, PodIssue, Deployment, PVC } from '../../../../hooks/useMCP'

/** Lens/view filter options for the cluster resource tree */
export type TreeLens = 'all' | 'issues' | 'nodes' | 'workloads' | 'storage' | 'network'

/** Tab IDs for the ClusterDrillDown bottom section */
export type ClusterTab = 'events' | 'resources'

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

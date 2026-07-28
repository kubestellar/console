import type {
  Deployment,
  DeploymentIssue,
  GPUNode,
  NamespaceStats,
  NodeInfo,
  PVC,
  PodIssue,
  Service,
} from '../../../../hooks/useMCP'
import type { TreeLens } from './types'

export function buildClusterLookupNames(
  clusterName: string,
  effectiveClusterName: string,
  aliases: string[] | undefined,
): Set<string> {
  const names = new Set<string>()
  if (clusterName) names.add(clusterName)
  if (effectiveClusterName) names.add(effectiveClusterName)
  ;(aliases || []).forEach((alias: string) => names.add(alias))
  return names
}

export function filterClusterGPUNodes(
  allGPUNodes: GPUNode[] | undefined,
  effectiveClusterName: string,
  clusterLookupNames: Set<string>,
  clusterPrefix: string,
): GPUNode[] {
  if (!effectiveClusterName) return []
  return (allGPUNodes || []).filter(
    (node) =>
      clusterLookupNames.has(node.cluster) ||
      node.cluster.includes(clusterPrefix),
  )
}

export function filterClusterDeploymentIssues(
  deploymentIssues: DeploymentIssue[] | undefined,
  effectiveClusterName: string,
  clusterLookupNames: Set<string>,
  clusterPrefix: string,
): DeploymentIssue[] {
  if (!effectiveClusterName) return []
  return (deploymentIssues || []).filter(
    (issue) =>
      clusterLookupNames.has(issue.cluster || '') ||
      issue.cluster?.includes(clusterPrefix),
  )
}

export function buildNamespacesFromIssues(
  podIssues: PodIssue[],
  clusterDeploymentIssues: DeploymentIssue[],
): string[] {
  const ns = new Set<string>()
  podIssues.forEach((p) => ns.add(p.namespace))
  clusterDeploymentIssues.forEach((d) => ns.add(d.namespace))
  return Array.from(ns).sort()
}

export function buildGpuByType(
  clusterGPUNodes: GPUNode[],
): Record<string, { total: number; allocated: number; nodes: number }> {
  const map: Record<string, { total: number; allocated: number; nodes: number }> = {}
  clusterGPUNodes.forEach((node) => {
    const type = node.gpuType || 'Unknown'
    if (!map[type]) {
      map[type] = { total: 0, allocated: 0, nodes: 0 }
    }
    map[type].total += node.gpuCount || 0
    map[type].allocated += node.gpuAllocated || 0
    map[type].nodes += 1
  })
  return map
}

export function filterNodesForLens(
  allNodes: NodeInfo[] | undefined,
  normalizedSearchFilter: string,
  activeLens: TreeLens,
): NodeInfo[] {
  let nodes = allNodes || []
  if (normalizedSearchFilter) {
    nodes = nodes.filter((n) =>
      n.name.toLowerCase().includes(normalizedSearchFilter),
    )
  }
  if (activeLens === 'issues') {
    nodes = nodes.filter((n) => n.status !== 'Ready')
  }
  if (activeLens === 'nodes' || activeLens === 'all') {
    return nodes
  }
  return activeLens === 'issues' ? nodes : []
}

export function buildFilteredNamespaceStats(
  namespaceStats: NamespaceStats[],
  allNamespaces: string[] | undefined,
  normalizedSearchFilter: string,
): NamespaceStats[] {
  const statsByName = new Map(namespaceStats.map((ns) => [ns.name, ns]))
  const mergedNamespaceNames = Array.from(
    new Set([
      ...namespaceStats.map((ns) => ns.name),
      ...(allNamespaces || []),
    ]),
  )

  let namespacesList = mergedNamespaceNames.map(
    (name) =>
      statsByName.get(name) || {
        name,
        podCount: 0,
        runningPods: 0,
        pendingPods: 0,
        failedPods: 0,
      },
  )

  if (normalizedSearchFilter) {
    namespacesList = namespacesList.filter((ns) =>
      ns.name.toLowerCase().includes(normalizedSearchFilter),
    )
  }

  if (!normalizedSearchFilter) {
    const nonSystemNs = namespacesList.filter(
      (ns) => !ns.name.startsWith('kube-') && ns.name !== 'default',
    )
    if (nonSystemNs.length > 0) {
      namespacesList = nonSystemNs
    }
  }

  return namespacesList
}

export function filterDeploymentsForLens(
  allDeployments: Deployment[] | undefined,
  normalizedSearchFilter: string,
  activeLens: TreeLens,
): Deployment[] {
  let deps = allDeployments || []
  if (normalizedSearchFilter) {
    deps = deps.filter(
      (d) =>
        d.name.toLowerCase().includes(normalizedSearchFilter) ||
        d.namespace.toLowerCase().includes(normalizedSearchFilter),
    )
  }
  if (activeLens === 'issues') {
    deps = deps.filter(
      (d) => d.readyReplicas < d.replicas || d.status === 'failed',
    )
  }
  if (
    activeLens === 'workloads' ||
    activeLens === 'all' ||
    activeLens === 'issues'
  ) {
    return deps
  }
  return []
}

export function filterServicesForLens(
  allServices: Service[] | undefined,
  normalizedSearchFilter: string,
  activeLens: TreeLens,
): Service[] {
  let svcs = allServices || []
  if (normalizedSearchFilter) {
    svcs = svcs.filter(
      (s) =>
        s.name.toLowerCase().includes(normalizedSearchFilter) ||
        s.namespace.toLowerCase().includes(normalizedSearchFilter),
    )
  }
  if (activeLens === 'network' || activeLens === 'all') {
    return svcs
  }
  return []
}

export function filterPVCsForLens(
  allPVCs: PVC[] | undefined,
  normalizedSearchFilter: string,
  activeLens: TreeLens,
): PVC[] {
  let pvcs = allPVCs || []
  if (normalizedSearchFilter) {
    pvcs = pvcs.filter(
      (p) =>
        p.name.toLowerCase().includes(normalizedSearchFilter) ||
        p.namespace.toLowerCase().includes(normalizedSearchFilter),
    )
  }
  if (activeLens === 'issues') {
    pvcs = pvcs.filter((p) => p.status !== 'Bound')
  }
  if (
    activeLens === 'storage' ||
    activeLens === 'all' ||
    activeLens === 'issues'
  ) {
    return pvcs
  }
  return []
}

export function buildNamespaceResources(
  podIssues: PodIssue[],
  clusterDeploymentIssues: DeploymentIssue[],
): {
  podIssueCounts: Record<string, number>
  deploymentIssueCounts: Record<string, number>
} {
  const podIssueCounts: Record<string, number> = {}
  const deploymentIssueCounts: Record<string, number> = {}

  podIssues.forEach((issue) => {
    podIssueCounts[issue.namespace] = (podIssueCounts[issue.namespace] || 0) + 1
  })

  clusterDeploymentIssues.forEach((issue) => {
    deploymentIssueCounts[issue.namespace] =
      (deploymentIssueCounts[issue.namespace] || 0) + 1
  })

  return {
    podIssueCounts,
    deploymentIssueCounts,
  }
}

export function computeIssueCounts(
  allNodes: NodeInfo[] | undefined,
  allDeployments: Deployment[] | undefined,
  podIssues: PodIssue[],
  allPVCs: PVC[] | undefined,
): {
  nodes: number
  deployments: number
  pods: number
  pvcs: number
  total: number
} {
  const nodes = (allNodes || []).filter((n) => n.status !== 'Ready').length
  const deployments = (allDeployments || []).filter(
    (d) => d.readyReplicas < d.replicas,
  ).length
  const pods = podIssues.length
  const pvcs = (allPVCs || []).filter((p) => p.status !== 'Bound').length
  return {
    nodes,
    deployments,
    pods,
    pvcs,
    total: nodes + deployments + pods + pvcs,
  }
}

export function sumGpuTotals(clusterGPUNodes: GPUNode[]): {
  totalGPUs: number
  allocatedGPUs: number
} {
  const totalGPUs = clusterGPUNodes.reduce(
    (sum, n) => sum + (n.gpuCount || 0),
    0,
  )
  const allocatedGPUs = clusterGPUNodes.reduce(
    (sum, n) => sum + (n.gpuAllocated || 0),
    0,
  )
  return { totalGPUs, allocatedGPUs }
}

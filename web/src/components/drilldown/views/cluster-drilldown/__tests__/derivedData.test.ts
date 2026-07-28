/**
 * Coverage for cluster-drilldown/derivedData.ts.
 *
 * These pure derivation helpers back the ClusterDrillDown resource tree —
 * every lens (all/issues/nodes/workloads/storage/network) drives its filter
 * decisions through this module. Any regression here silently mis-renders
 * the drill-down: wrong node counts, missing namespaces, or GPU totals that
 * don't match reality. The functions are pure so testing is inexpensive.
 */
import { describe, it, expect } from 'vitest'
import {
  buildClusterLookupNames,
  filterClusterGPUNodes,
  filterClusterDeploymentIssues,
  buildNamespacesFromIssues,
  buildGpuByType,
  filterNodesForLens,
  buildFilteredNamespaceStats,
  filterDeploymentsForLens,
  filterServicesForLens,
  filterPVCsForLens,
  buildNamespaceResources,
  computeIssueCounts,
  sumGpuTotals,
} from '../derivedData'
import type {
  Deployment,
  DeploymentIssue,
  GPUNode,
  NamespaceStats,
  NodeInfo,
  PVC,
  PodIssue,
  Service,
} from '../../../../../hooks/useMCP'

// ── Test fixtures ──────────────────────────────────────────────

function makeGPUNode(overrides: Partial<GPUNode> = {}): GPUNode {
  return {
    name: 'gpu-node-1',
    cluster: 'cluster-a',
    gpuType: 'NVIDIA A100',
    gpuCount: 4,
    gpuAllocated: 2,
    ...overrides,
  } as GPUNode
}

function makeDeploymentIssue(overrides: Partial<DeploymentIssue> = {}): DeploymentIssue {
  return {
    name: 'dep-1',
    namespace: 'default',
    cluster: 'cluster-a',
    replicas: 3,
    readyReplicas: 1,
    ...overrides,
  } as DeploymentIssue
}

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    name: 'dep-1',
    namespace: 'default',
    cluster: 'cluster-a',
    status: 'running',
    replicas: 3,
    readyReplicas: 3,
    updatedReplicas: 3,
    ...overrides,
  } as Deployment
}

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    name: 'svc-1',
    namespace: 'default',
    cluster: 'cluster-a',
    type: 'ClusterIP',
    ...overrides,
  } as Service
}

function makePVC(overrides: Partial<PVC> = {}): PVC {
  return {
    name: 'pvc-1',
    namespace: 'default',
    cluster: 'cluster-a',
    status: 'Bound',
    ...overrides,
  } as PVC
}

function makePodIssue(overrides: Partial<PodIssue> = {}): PodIssue {
  return {
    name: 'pod-1',
    namespace: 'default',
    cluster: 'cluster-a',
    status: 'CrashLoopBackOff',
    issues: [],
    restarts: 3,
    ...overrides,
  } as PodIssue
}

function makeNode(overrides: Partial<NodeInfo> = {}): NodeInfo {
  return {
    name: 'node-1',
    cluster: 'cluster-a',
    status: 'Ready',
    roles: ['worker'],
    kubeletVersion: 'v1.30.0',
    ...overrides,
  } as NodeInfo
}

function makeNamespaceStats(name: string, overrides: Partial<NamespaceStats> = {}): NamespaceStats {
  return { name, podCount: 0, runningPods: 0, pendingPods: 0, failedPods: 0, ...overrides }
}

// ── buildClusterLookupNames ────────────────────────────────────

describe('buildClusterLookupNames', () => {
  it('collects the cluster name, effective name, and aliases into one set', () => {
    const names = buildClusterLookupNames('cluster-a', 'cluster-a-effective', ['alias1', 'alias2'])
    expect(names).toEqual(new Set(['cluster-a', 'cluster-a-effective', 'alias1', 'alias2']))
  })

  it('deduplicates when cluster name equals effective name', () => {
    const names = buildClusterLookupNames('cluster-a', 'cluster-a', ['alias1'])
    expect(names).toEqual(new Set(['cluster-a', 'alias1']))
  })

  it('handles undefined aliases without throwing', () => {
    const names = buildClusterLookupNames('cluster-a', 'cluster-a', undefined)
    expect(names).toEqual(new Set(['cluster-a']))
  })

  it('omits empty-string cluster names', () => {
    const names = buildClusterLookupNames('', '', ['alias1'])
    expect(names).toEqual(new Set(['alias1']))
  })

  it('returns an empty set when nothing is provided', () => {
    const names = buildClusterLookupNames('', '', undefined)
    expect(names.size).toBe(0)
  })
})

// ── filterClusterGPUNodes ──────────────────────────────────────

describe('filterClusterGPUNodes', () => {
  const lookup = new Set(['cluster-a', 'cluster-a-alias'])

  it('returns [] when effectiveClusterName is empty (early return)', () => {
    expect(filterClusterGPUNodes([makeGPUNode()], '', lookup, 'cluster-a')).toEqual([])
  })

  it('handles undefined input without throwing', () => {
    expect(filterClusterGPUNodes(undefined, 'cluster-a', lookup, 'cluster-a')).toEqual([])
  })

  it('matches by exact lookup-name membership', () => {
    const nodes = [makeGPUNode({ cluster: 'cluster-a' }), makeGPUNode({ cluster: 'cluster-b' })]
    const result = filterClusterGPUNodes(nodes, 'cluster-a', lookup, 'cluster-a')
    expect(result).toHaveLength(1)
    expect(result[0].cluster).toBe('cluster-a')
  })

  it('matches by prefix substring even when not in the lookup set', () => {
    const nodes = [makeGPUNode({ cluster: 'other-cluster-a-suffix' })]
    const result = filterClusterGPUNodes(nodes, 'cluster-a', new Set(), 'cluster-a')
    expect(result).toHaveLength(1)
  })

  it('excludes nodes that match neither lookup nor prefix', () => {
    const nodes = [makeGPUNode({ cluster: 'cluster-z' })]
    expect(filterClusterGPUNodes(nodes, 'cluster-a', lookup, 'cluster-a')).toEqual([])
  })
})

// ── filterClusterDeploymentIssues ──────────────────────────────

describe('filterClusterDeploymentIssues', () => {
  const lookup = new Set(['cluster-a'])

  it('returns [] when effectiveClusterName is empty', () => {
    expect(
      filterClusterDeploymentIssues([makeDeploymentIssue()], '', lookup, 'cluster-a'),
    ).toEqual([])
  })

  it('handles undefined input', () => {
    expect(filterClusterDeploymentIssues(undefined, 'cluster-a', lookup, 'cluster-a')).toEqual([])
  })

  it('treats an undefined cluster field as an empty string for lookup', () => {
    const issue = makeDeploymentIssue({ cluster: undefined })
    // Empty '' is not in lookup and undefined has no .includes match → filtered out
    expect(
      filterClusterDeploymentIssues([issue], 'cluster-a', lookup, 'cluster-a'),
    ).toEqual([])
  })

  it('matches by prefix inclusion in the cluster name', () => {
    const issue = makeDeploymentIssue({ cluster: 'prod-cluster-a-1' })
    const result = filterClusterDeploymentIssues([issue], 'cluster-a', new Set(), 'cluster-a')
    expect(result).toHaveLength(1)
  })
})

// ── buildNamespacesFromIssues ──────────────────────────────────

describe('buildNamespacesFromIssues', () => {
  it('merges and dedupes namespaces from both sources', () => {
    const pods = [makePodIssue({ namespace: 'ns-b' }), makePodIssue({ namespace: 'ns-a' })]
    const deps = [makeDeploymentIssue({ namespace: 'ns-a' }), makeDeploymentIssue({ namespace: 'ns-c' })]
    expect(buildNamespacesFromIssues(pods, deps)).toEqual(['ns-a', 'ns-b', 'ns-c'])
  })

  it('sorts result alphabetically', () => {
    const pods = [makePodIssue({ namespace: 'zeta' }), makePodIssue({ namespace: 'alpha' })]
    expect(buildNamespacesFromIssues(pods, [])).toEqual(['alpha', 'zeta'])
  })

  it('returns [] for empty inputs', () => {
    expect(buildNamespacesFromIssues([], [])).toEqual([])
  })
})

// ── buildGpuByType ─────────────────────────────────────────────

describe('buildGpuByType', () => {
  it('aggregates counts, allocations, and node count by GPU type', () => {
    const nodes = [
      makeGPUNode({ gpuType: 'A100', gpuCount: 4, gpuAllocated: 2 }),
      makeGPUNode({ gpuType: 'A100', gpuCount: 8, gpuAllocated: 6 }),
      makeGPUNode({ gpuType: 'H100', gpuCount: 2, gpuAllocated: 1 }),
    ]
    const result = buildGpuByType(nodes)
    expect(result).toEqual({
      A100: { total: 12, allocated: 8, nodes: 2 },
      H100: { total: 2, allocated: 1, nodes: 1 },
    })
  })

  it('coerces missing gpuType to "Unknown"', () => {
    const nodes = [makeGPUNode({ gpuType: '' as unknown as string, gpuCount: 1, gpuAllocated: 0 })]
    expect(buildGpuByType(nodes)).toEqual({ Unknown: { total: 1, allocated: 0, nodes: 1 } })
  })

  it('treats undefined counts as zero', () => {
    const nodes = [
      makeGPUNode({ gpuType: 'A100', gpuCount: undefined as unknown as number, gpuAllocated: undefined as unknown as number }),
    ]
    expect(buildGpuByType(nodes)).toEqual({ A100: { total: 0, allocated: 0, nodes: 1 } })
  })

  it('returns empty object for no nodes', () => {
    expect(buildGpuByType([])).toEqual({})
  })
})

// ── filterNodesForLens ─────────────────────────────────────────

describe('filterNodesForLens', () => {
  const nodes = [
    makeNode({ name: 'worker-1', status: 'Ready' }),
    makeNode({ name: 'worker-2', status: 'NotReady' }),
    makeNode({ name: 'master-1', status: 'Ready' }),
  ]

  it('returns [] for lens types other than nodes/all/issues', () => {
    expect(filterNodesForLens(nodes, '', 'workloads')).toEqual([])
    expect(filterNodesForLens(nodes, '', 'storage')).toEqual([])
    expect(filterNodesForLens(nodes, '', 'network')).toEqual([])
  })

  it('returns all nodes for lens=all when no search filter', () => {
    expect(filterNodesForLens(nodes, '', 'all')).toHaveLength(3)
  })

  it('returns all nodes for lens=nodes', () => {
    expect(filterNodesForLens(nodes, '', 'nodes')).toHaveLength(3)
  })

  it('filters to only non-Ready nodes for lens=issues', () => {
    const result = filterNodesForLens(nodes, '', 'issues')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('worker-2')
  })

  it('applies a case-insensitive substring name filter', () => {
    expect(filterNodesForLens(nodes, 'worker', 'all')).toHaveLength(2)
    expect(filterNodesForLens(nodes, 'master', 'all')).toHaveLength(1)
  })

  it('combines search filter with the issues lens', () => {
    const result = filterNodesForLens(nodes, 'worker', 'issues')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('worker-2')
  })

  it('handles undefined nodes input', () => {
    expect(filterNodesForLens(undefined, '', 'all')).toEqual([])
  })
})

// ── buildFilteredNamespaceStats ────────────────────────────────

describe('buildFilteredNamespaceStats', () => {
  it('merges stats with allNamespaces, defaulting missing entries to zero', () => {
    const stats = [makeNamespaceStats('app', { podCount: 5, runningPods: 5 })]
    const result = buildFilteredNamespaceStats(stats, ['app', 'infra'], '')
    const infra = result.find((n) => n.name === 'infra')
    expect(infra).toEqual({ name: 'infra', podCount: 0, runningPods: 0, pendingPods: 0, failedPods: 0 })
  })

  it('hides system namespaces (kube-* and default) when non-system exist and no filter', () => {
    const stats = [
      makeNamespaceStats('kube-system'),
      makeNamespaceStats('default'),
      makeNamespaceStats('app'),
    ]
    const result = buildFilteredNamespaceStats(stats, [], '')
    expect(result.map((n) => n.name)).toEqual(['app'])
  })

  it('falls back to system namespaces if no non-system namespaces exist', () => {
    const stats = [makeNamespaceStats('kube-system'), makeNamespaceStats('default')]
    const result = buildFilteredNamespaceStats(stats, [], '')
    expect(result.map((n) => n.name).sort()).toEqual(['default', 'kube-system'])
  })

  it('shows system namespaces when a matching search filter is supplied', () => {
    const stats = [makeNamespaceStats('kube-system'), makeNamespaceStats('app')]
    const result = buildFilteredNamespaceStats(stats, [], 'kube')
    expect(result.map((n) => n.name)).toEqual(['kube-system'])
  })

  it('search filter is case-insensitive (caller lowercases input)', () => {
    const stats = [makeNamespaceStats('MyNamespace')]
    const result = buildFilteredNamespaceStats(stats, [], 'mynamespace')
    expect(result).toHaveLength(1)
  })

  it('handles undefined allNamespaces', () => {
    const stats = [makeNamespaceStats('app')]
    expect(buildFilteredNamespaceStats(stats, undefined, '')).toEqual([stats[0]])
  })
})

// ── filterDeploymentsForLens ───────────────────────────────────

describe('filterDeploymentsForLens', () => {
  const deps = [
    makeDeployment({ name: 'api', namespace: 'app', replicas: 3, readyReplicas: 3 }),
    makeDeployment({ name: 'worker', namespace: 'app', replicas: 3, readyReplicas: 1 }),
    makeDeployment({ name: 'db', namespace: 'infra', status: 'failed', replicas: 1, readyReplicas: 1 }),
  ]

  it('returns [] for storage/network/nodes lenses', () => {
    expect(filterDeploymentsForLens(deps, '', 'storage')).toEqual([])
    expect(filterDeploymentsForLens(deps, '', 'network')).toEqual([])
    expect(filterDeploymentsForLens(deps, '', 'nodes')).toEqual([])
  })

  it('returns all deployments for lens=workloads', () => {
    expect(filterDeploymentsForLens(deps, '', 'workloads')).toHaveLength(3)
  })

  it('returns all deployments for lens=all', () => {
    expect(filterDeploymentsForLens(deps, '', 'all')).toHaveLength(3)
  })

  it('filters to under-replicated or failed for lens=issues', () => {
    const result = filterDeploymentsForLens(deps, '', 'issues')
    expect(result.map((d) => d.name).sort()).toEqual(['db', 'worker'])
  })

  it('applies search across name and namespace', () => {
    expect(filterDeploymentsForLens(deps, 'infra', 'all').map((d) => d.name)).toEqual(['db'])
    expect(filterDeploymentsForLens(deps, 'api', 'all').map((d) => d.name)).toEqual(['api'])
  })

  it('handles undefined input', () => {
    expect(filterDeploymentsForLens(undefined, '', 'all')).toEqual([])
  })
})

// ── filterServicesForLens ──────────────────────────────────────

describe('filterServicesForLens', () => {
  const svcs = [
    makeService({ name: 'api-svc', namespace: 'app' }),
    makeService({ name: 'db-svc', namespace: 'infra' }),
  ]

  it('returns [] for non-network/non-all lenses', () => {
    expect(filterServicesForLens(svcs, '', 'workloads')).toEqual([])
    expect(filterServicesForLens(svcs, '', 'storage')).toEqual([])
    expect(filterServicesForLens(svcs, '', 'nodes')).toEqual([])
    expect(filterServicesForLens(svcs, '', 'issues')).toEqual([])
  })

  it('returns all services for lens=network', () => {
    expect(filterServicesForLens(svcs, '', 'network')).toHaveLength(2)
  })

  it('returns all services for lens=all', () => {
    expect(filterServicesForLens(svcs, '', 'all')).toHaveLength(2)
  })

  it('filters by name or namespace substring', () => {
    expect(filterServicesForLens(svcs, 'infra', 'all').map((s) => s.name)).toEqual(['db-svc'])
    expect(filterServicesForLens(svcs, 'api', 'all').map((s) => s.name)).toEqual(['api-svc'])
  })

  it('handles undefined input', () => {
    expect(filterServicesForLens(undefined, '', 'all')).toEqual([])
  })
})

// ── filterPVCsForLens ──────────────────────────────────────────

describe('filterPVCsForLens', () => {
  const pvcs = [
    makePVC({ name: 'bound-pvc', namespace: 'app', status: 'Bound' }),
    makePVC({ name: 'pending-pvc', namespace: 'app', status: 'Pending' }),
    makePVC({ name: 'infra-pvc', namespace: 'infra', status: 'Bound' }),
  ]

  it('returns [] for workloads/network/nodes lenses', () => {
    expect(filterPVCsForLens(pvcs, '', 'workloads')).toEqual([])
    expect(filterPVCsForLens(pvcs, '', 'network')).toEqual([])
    expect(filterPVCsForLens(pvcs, '', 'nodes')).toEqual([])
  })

  it('returns all PVCs for lens=storage or lens=all', () => {
    expect(filterPVCsForLens(pvcs, '', 'storage')).toHaveLength(3)
    expect(filterPVCsForLens(pvcs, '', 'all')).toHaveLength(3)
  })

  it('filters to non-Bound for lens=issues', () => {
    const result = filterPVCsForLens(pvcs, '', 'issues')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('pending-pvc')
  })

  it('applies search by name or namespace', () => {
    expect(filterPVCsForLens(pvcs, 'infra', 'all').map((p) => p.name)).toEqual(['infra-pvc'])
  })

  it('handles undefined input', () => {
    expect(filterPVCsForLens(undefined, '', 'all')).toEqual([])
  })
})

// ── buildNamespaceResources ────────────────────────────────────

describe('buildNamespaceResources', () => {
  it('counts pod and deployment issues per namespace', () => {
    const pods = [
      makePodIssue({ namespace: 'app' }),
      makePodIssue({ namespace: 'app' }),
      makePodIssue({ namespace: 'infra' }),
    ]
    const deps = [
      makeDeploymentIssue({ namespace: 'app' }),
      makeDeploymentIssue({ namespace: 'infra' }),
      makeDeploymentIssue({ namespace: 'infra' }),
    ]
    const result = buildNamespaceResources(pods, deps)
    expect(result).toEqual({
      podIssueCounts: { app: 2, infra: 1 },
      deploymentIssueCounts: { app: 1, infra: 2 },
    })
  })

  it('returns empty maps for empty input', () => {
    expect(buildNamespaceResources([], [])).toEqual({
      podIssueCounts: {},
      deploymentIssueCounts: {},
    })
  })
})

// ── computeIssueCounts ─────────────────────────────────────────

describe('computeIssueCounts', () => {
  it('counts non-Ready nodes, under-replicated deployments, all pod issues, non-Bound PVCs', () => {
    const nodes = [makeNode({ status: 'Ready' }), makeNode({ status: 'NotReady' })]
    const deps = [
      makeDeployment({ replicas: 3, readyReplicas: 3 }),
      makeDeployment({ replicas: 3, readyReplicas: 1 }),
      makeDeployment({ replicas: 1, readyReplicas: 0 }),
    ]
    const pods = [makePodIssue(), makePodIssue()]
    const pvcs = [makePVC({ status: 'Bound' }), makePVC({ status: 'Pending' })]

    expect(computeIssueCounts(nodes, deps, pods, pvcs)).toEqual({
      nodes: 1,
      deployments: 2,
      pods: 2,
      pvcs: 1,
      total: 6,
    })
  })

  it('handles all-undefined inputs (except podIssues) as zero counts', () => {
    expect(computeIssueCounts(undefined, undefined, [], undefined)).toEqual({
      nodes: 0,
      deployments: 0,
      pods: 0,
      pvcs: 0,
      total: 0,
    })
  })
})

// ── sumGpuTotals ───────────────────────────────────────────────

describe('sumGpuTotals', () => {
  it('sums gpuCount and gpuAllocated across nodes', () => {
    const nodes = [
      makeGPUNode({ gpuCount: 4, gpuAllocated: 2 }),
      makeGPUNode({ gpuCount: 8, gpuAllocated: 5 }),
      makeGPUNode({ gpuCount: 2, gpuAllocated: 0 }),
    ]
    expect(sumGpuTotals(nodes)).toEqual({ totalGPUs: 14, allocatedGPUs: 7 })
  })

  it('treats undefined counts as zero', () => {
    const nodes = [
      makeGPUNode({ gpuCount: undefined as unknown as number, gpuAllocated: undefined as unknown as number }),
      makeGPUNode({ gpuCount: 4, gpuAllocated: 3 }),
    ]
    expect(sumGpuTotals(nodes)).toEqual({ totalGPUs: 4, allocatedGPUs: 3 })
  })

  it('returns zeros for empty input', () => {
    expect(sumGpuTotals([])).toEqual({ totalGPUs: 0, allocatedGPUs: 0 })
  })
})

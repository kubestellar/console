/**
 * Tests for TreeBuilder — pure logic functions that build, filter, and
 * query the namespace resource tree. No React rendering needed.
 */
import { describe, it, expect } from 'vitest'
import {
  buildNamespaceResources,
  getVisibleNamespaces,
  getIssueCounts,
  getPodsForDeployment,
} from '../TreeBuilder'
import type { ClusterDataCache } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyClusterData(): ClusterDataCache {
  return {
    nodes: [],
    namespaces: [],
    deployments: [],
    services: [],
    pvcs: [],
    pods: [],
    configmaps: [],
    secrets: [],
    serviceaccounts: [],
    jobs: [],
    hpas: [],
    replicasets: [],
    statefulsets: [],
    daemonsets: [],
    cronjobs: [],
    ingresses: [],
    networkpolicies: [],
    podIssues: [],
  }
}

function sampleClusterData(): ClusterDataCache {
  return {
    ...emptyClusterData(),
    namespaces: ['default', 'production', 'kube-system'],
    nodes: [
      { name: 'node-1', status: 'Ready' },
      { name: 'node-2', status: 'NotReady' },
    ],
    deployments: [
      { name: 'web', namespace: 'production', replicas: 3, readyReplicas: 3 },
      { name: 'api', namespace: 'production', replicas: 2, readyReplicas: 1 },
      { name: 'dns', namespace: 'kube-system', replicas: 1, readyReplicas: 1 },
    ],
    services: [
      { name: 'web-svc', namespace: 'production', type: 'ClusterIP' },
    ],
    pvcs: [
      { name: 'data-vol', namespace: 'production', status: 'Bound' },
      { name: 'logs-vol', namespace: 'default', status: 'Pending' },
    ],
    pods: [
      { name: 'web-abc12', namespace: 'production', status: 'Running', restarts: 0 },
      { name: 'api-def34', namespace: 'production', status: 'CrashLoopBackOff', restarts: 5 },
    ],
    configmaps: [
      { name: 'app-config', namespace: 'production', dataCount: 3 },
    ],
    secrets: [
      { name: 'tls-cert', namespace: 'production', type: 'kubernetes.io/tls' },
    ],
    serviceaccounts: [
      { name: 'default', namespace: 'production' },
    ],
    jobs: [
      { name: 'migrate', namespace: 'production', status: 'Complete', completions: '1/1' },
    ],
    hpas: [
      { name: 'web-hpa', namespace: 'production', reference: 'Deployment/web', minReplicas: 2, maxReplicas: 10, currentReplicas: 3 },
    ],
    replicasets: [
      { name: 'web-abc12', namespace: 'production', replicas: 3, readyReplicas: 3 },
    ],
    statefulsets: [],
    daemonsets: [],
    cronjobs: [],
    ingresses: [
      { name: 'web-ing', namespace: 'production', hosts: ['app.example.com'], class: 'nginx' },
    ],
    networkpolicies: [
      { name: 'deny-all', namespace: 'production', policyTypes: ['Ingress'], podSelector: '{}' },
    ],
    podIssues: [
      { name: 'worker-xyz', namespace: 'production', status: 'Error', reason: 'OOMKilled' },
    ],
  }
}

// ---------------------------------------------------------------------------
// buildNamespaceResources
// ---------------------------------------------------------------------------
describe('buildNamespaceResources', () => {
  it('returns an empty map for empty cluster data', () => {
    const result = buildNamespaceResources(emptyClusterData(), '')
    expect(result.size).toBe(0)
  })

  it('creates entries for each namespace', () => {
    const data = sampleClusterData()
    const result = buildNamespaceResources(data, '')
    expect(result.has('default')).toBe(true)
    expect(result.has('production')).toBe(true)
    expect(result.has('kube-system')).toBe(true)
  })

  it('groups deployments into correct namespaces', () => {
    const data = sampleClusterData()
    const result = buildNamespaceResources(data, '')
    const prod = result.get('production')!
    expect(prod.deployments).toHaveLength(2)
    expect(prod.deployments[0].name).toBe('web')
    expect(prod.deployments[1].name).toBe('api')

    const system = result.get('kube-system')!
    expect(system.deployments).toHaveLength(1)
    expect(system.deployments[0].name).toBe('dns')
  })

  it('groups pods into correct namespaces', () => {
    const data = sampleClusterData()
    const result = buildNamespaceResources(data, '')
    const prod = result.get('production')!
    // 2 regular pods + 1 merged podIssue (worker-xyz)
    expect(prod.pods.length).toBeGreaterThanOrEqual(2)
  })

  it('merges podIssues into namespace pods without duplicates', () => {
    const data = sampleClusterData()
    // Add a podIssue with same name as an existing pod
    data.podIssues.push({ name: 'api-def34', namespace: 'production', status: 'CrashLoopBackOff' })
    const result = buildNamespaceResources(data, '')
    const prod = result.get('production')!
    const apiPods = prod.pods.filter(p => p.name === 'api-def34')
    expect(apiPods).toHaveLength(1)
  })

  it('creates namespace entries for podIssue-only namespaces', () => {
    const data = emptyClusterData()
    data.namespaces = ['default']
    data.podIssues = [{ name: 'orphan-pod', namespace: 'orphan-ns', status: 'Error' }]
    const result = buildNamespaceResources(data, '')
    expect(result.has('orphan-ns')).toBe(true)
    expect(result.get('orphan-ns')!.pods).toHaveLength(1)
  })

  it('filters namespaces by search query', () => {
    const data = sampleClusterData()
    const result = buildNamespaceResources(data, 'prod')
    expect(result.has('production')).toBe(true)
    expect(result.has('default')).toBe(false)
    expect(result.has('kube-system')).toBe(false)
  })

  it('groups services, pvcs, configmaps, secrets, serviceaccounts', () => {
    const data = sampleClusterData()
    const result = buildNamespaceResources(data, '')
    const prod = result.get('production')!
    expect(prod.services).toHaveLength(1)
    expect(prod.pvcs).toHaveLength(1)
    expect(prod.configmaps).toHaveLength(1)
    expect(prod.secrets).toHaveLength(1)
    expect(prod.serviceaccounts).toHaveLength(1)
  })

  it('groups jobs, hpas, replicasets, ingresses, networkpolicies', () => {
    const data = sampleClusterData()
    const result = buildNamespaceResources(data, '')
    const prod = result.get('production')!
    expect(prod.jobs).toHaveLength(1)
    expect(prod.hpas).toHaveLength(1)
    expect(prod.replicasets).toHaveLength(1)
    expect(prod.ingresses).toHaveLength(1)
    expect(prod.networkpolicies).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// getVisibleNamespaces
// ---------------------------------------------------------------------------
describe('getVisibleNamespaces', () => {
  it('hides system namespaces when not searching', () => {
    const data = sampleClusterData()
    const nsMap = buildNamespaceResources(data, '')
    const visible = getVisibleNamespaces(nsMap, 'all', '')
    expect(visible).toContain('default')
    expect(visible).toContain('production')
    expect(visible).not.toContain('kube-system')
  })

  it('shows system namespaces when searching', () => {
    const data = sampleClusterData()
    const nsMap = buildNamespaceResources(data, 'kube')
    const visible = getVisibleNamespaces(nsMap, 'all', 'kube')
    expect(visible).toContain('kube-system')
  })

  it('issues lens filters to namespaces with issues only', () => {
    const data = sampleClusterData()
    const nsMap = buildNamespaceResources(data, '')
    const visible = getVisibleNamespaces(nsMap, 'issues', '')
    // production has CrashLoopBackOff pod + degraded deployment (api: 1/2 ready)
    expect(visible).toContain('production')
    // default has a pending PVC
    expect(visible).toContain('default')
  })

  it('workloads lens filters to namespaces with deployments or pods', () => {
    const data = sampleClusterData()
    const nsMap = buildNamespaceResources(data, '')
    const visible = getVisibleNamespaces(nsMap, 'workloads', '')
    expect(visible).toContain('production')
    // default has no deployments or pods
    expect(visible).not.toContain('default')
  })

  it('storage lens filters to namespaces with PVCs', () => {
    const data = sampleClusterData()
    const nsMap = buildNamespaceResources(data, '')
    const visible = getVisibleNamespaces(nsMap, 'storage', '')
    expect(visible).toContain('production')
    expect(visible).toContain('default')
  })

  it('network lens filters to namespaces with services', () => {
    const data = sampleClusterData()
    const nsMap = buildNamespaceResources(data, '')
    const visible = getVisibleNamespaces(nsMap, 'network', '')
    expect(visible).toContain('production')
    expect(visible).not.toContain('default')
  })

  it('returns sorted results', () => {
    const data = sampleClusterData()
    const nsMap = buildNamespaceResources(data, '')
    const visible = getVisibleNamespaces(nsMap, 'all', '')
    const sorted = [...visible].sort()
    expect(visible).toEqual(sorted)
  })
})

// ---------------------------------------------------------------------------
// getIssueCounts
// ---------------------------------------------------------------------------
describe('getIssueCounts', () => {
  it('returns zero counts for healthy cluster', () => {
    const data = emptyClusterData()
    data.nodes = [{ name: 'n1', status: 'Ready' }]
    const counts = getIssueCounts(data)
    expect(counts.nodes).toBe(0)
    expect(counts.deployments).toBe(0)
    expect(counts.pods).toBe(0)
    expect(counts.pvcs).toBe(0)
    expect(counts.total).toBe(0)
  })

  it('counts NotReady nodes', () => {
    const data = sampleClusterData()
    const counts = getIssueCounts(data)
    expect(counts.nodes).toBe(1) // node-2 is NotReady
  })

  it('counts degraded deployments', () => {
    const data = sampleClusterData()
    const counts = getIssueCounts(data)
    expect(counts.deployments).toBe(1) // api: 1/2 ready
  })

  it('counts pod issues', () => {
    const data = sampleClusterData()
    const counts = getIssueCounts(data)
    expect(counts.pods).toBe(1) // worker-xyz in podIssues
  })

  it('counts unbound PVCs', () => {
    const data = sampleClusterData()
    const counts = getIssueCounts(data)
    expect(counts.pvcs).toBe(1) // logs-vol is Pending
  })

  it('total equals sum of all issue types', () => {
    const data = sampleClusterData()
    const counts = getIssueCounts(data)
    expect(counts.total).toBe(counts.nodes + counts.deployments + counts.pods + counts.pvcs)
  })
})

// ---------------------------------------------------------------------------
// getPodsForDeployment
// ---------------------------------------------------------------------------
describe('getPodsForDeployment', () => {
  it('returns pods matching deployment name prefix', () => {
    const data = sampleClusterData()
    const nsMap = buildNamespaceResources(data, '')
    const pods = getPodsForDeployment(nsMap, 'web', 'production')
    expect(pods).toHaveLength(1)
    expect(pods[0].name).toBe('web-abc12')
  })

  it('returns empty array for non-existent namespace', () => {
    const data = sampleClusterData()
    const nsMap = buildNamespaceResources(data, '')
    const pods = getPodsForDeployment(nsMap, 'web', 'nonexistent')
    expect(pods).toHaveLength(0)
  })

  it('returns empty array when no pods match', () => {
    const data = sampleClusterData()
    const nsMap = buildNamespaceResources(data, '')
    const pods = getPodsForDeployment(nsMap, 'nonexistent-deploy', 'production')
    expect(pods).toHaveLength(0)
  })
})

import { describe, it, expect } from 'vitest'
import {
  filterClusters,
  hasAnyClusterResourceData,
  hasCrossClusterTagMismatch,
  normalizeClusterDataCache,
  getTotalIssueCounts,
  evictOfflineClusterCacheEntries,
} from '../ClusterResourceTree.utils'
import type { ClusterDataCache } from '../types'

// ─── filterClusters ──────────────────────────────────────────────────────────

describe('filterClusters', () => {
  const clusters = [
    { name: 'prod-us', healthy: true },
    { name: 'prod-eu', healthy: true },
    { name: 'staging', healthy: true },
    { name: 'dev', healthy: false },
  ] as any[]

  it('returns all clusters when all selected and no filters', () => {
    const result = filterClusters({
      clusters,
      isAllClustersSelected: true,
      selectedClusters: [],
      localClusterFilter: [],
      searchFilter: '',
    })
    expect(result).toHaveLength(4)
  })

  it('filters by selectedClusters when not all selected', () => {
    const result = filterClusters({
      clusters,
      isAllClustersSelected: false,
      selectedClusters: ['prod-us', 'dev'],
      localClusterFilter: [],
      searchFilter: '',
    })
    expect(result).toHaveLength(2)
    expect(result.map((c: any) => c.name)).toEqual(['prod-us', 'dev'])
  })

  it('applies localClusterFilter', () => {
    const result = filterClusters({
      clusters,
      isAllClustersSelected: true,
      selectedClusters: [],
      localClusterFilter: ['prod-us', 'prod-eu'],
      searchFilter: '',
    })
    expect(result).toHaveLength(2)
  })

  it('applies search filter case-insensitively', () => {
    const result = filterClusters({
      clusters,
      isAllClustersSelected: true,
      selectedClusters: [],
      localClusterFilter: [],
      searchFilter: 'PROD',
    })
    expect(result).toHaveLength(2)
    expect(result.every((c: any) => c.name.startsWith('prod'))).toBe(true)
  })

  it('combines all filters', () => {
    const result = filterClusters({
      clusters,
      isAllClustersSelected: false,
      selectedClusters: ['prod-us', 'prod-eu', 'staging'],
      localClusterFilter: ['prod-us', 'prod-eu'],
      searchFilter: 'eu',
    })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('prod-eu')
  })

  it('returns empty when no clusters match', () => {
    const result = filterClusters({
      clusters,
      isAllClustersSelected: true,
      selectedClusters: [],
      localClusterFilter: [],
      searchFilter: 'nonexistent',
    })
    expect(result).toHaveLength(0)
  })
})

// ─── hasAnyClusterResourceData ───────────────────────────────────────────────

describe('hasAnyClusterResourceData', () => {
  it('returns false when all arrays are empty or undefined', () => {
    expect(hasAnyClusterResourceData({})).toBe(false)
    expect(hasAnyClusterResourceData({ allNodes: [], allNamespaces: [], allDeployments: [], allPods: [] })).toBe(false)
  })

  it('returns true when nodes has data', () => {
    expect(hasAnyClusterResourceData({ allNodes: [{ name: 'node-1', status: 'Ready' }] })).toBe(true)
  })

  it('returns true when namespaces has data', () => {
    expect(hasAnyClusterResourceData({ allNamespaces: ['default'] })).toBe(true)
  })

  it('returns true when deployments has data', () => {
    expect(hasAnyClusterResourceData({
      allDeployments: [{ name: 'api', namespace: 'default', replicas: 1, readyReplicas: 1 }],
    })).toBe(true)
  })

  it('returns true when pods has data', () => {
    expect(hasAnyClusterResourceData({
      allPods: [{ name: 'pod-1', namespace: 'default', status: 'Running', restarts: 0 }],
    })).toBe(true)
  })
})

// ─── hasCrossClusterTagMismatch ──────────────────────────────────────────────

describe('hasCrossClusterTagMismatch', () => {
  it('returns false when no resources', () => {
    expect(hasCrossClusterTagMismatch('cluster-a', {})).toBe(false)
  })

  it('returns false when cluster tags match', () => {
    expect(hasCrossClusterTagMismatch('cluster-a', {
      allNodes: [{ name: 'n1', status: 'Ready', cluster: 'cluster-a' }],
      allPods: [{ name: 'p1', namespace: 'ns', status: 'Running', restarts: 0, cluster: 'cluster-a' }],
    })).toBe(false)
  })

  it('returns false when cluster tag is undefined', () => {
    expect(hasCrossClusterTagMismatch('cluster-a', {
      allNodes: [{ name: 'n1', status: 'Ready' }],
    })).toBe(false)
  })

  it('returns true when node cluster tag mismatches', () => {
    expect(hasCrossClusterTagMismatch('cluster-a', {
      allNodes: [{ name: 'n1', status: 'Ready', cluster: 'cluster-b' }],
    })).toBe(true)
  })

  it('returns true when pod cluster tag mismatches', () => {
    expect(hasCrossClusterTagMismatch('cluster-a', {
      allPods: [{ name: 'p1', namespace: 'ns', status: 'Running', restarts: 0, cluster: 'other' }],
    })).toBe(true)
  })

  it('returns true when deployment cluster tag mismatches', () => {
    expect(hasCrossClusterTagMismatch('cluster-a', {
      allDeployments: [{ name: 'd1', namespace: 'ns', replicas: 1, readyReplicas: 1, cluster: 'wrong' }],
    })).toBe(true)
  })

  it('returns true when service cluster tag mismatches', () => {
    expect(hasCrossClusterTagMismatch('cluster-a', {
      allServices: [{ name: 's1', namespace: 'ns', type: 'ClusterIP', cluster: 'different' }],
    })).toBe(true)
  })
})

// ─── normalizeClusterDataCache ───────────────────────────────────────────────

describe('normalizeClusterDataCache', () => {
  it('returns all empty arrays when no data provided', () => {
    const result = normalizeClusterDataCache({ maxItems: 100, allNodes: [] })
    expect(result.nodes).toEqual([])
    expect(result.namespaces).toEqual([])
    expect(result.deployments).toEqual([])
    expect(result.pods).toEqual([])
    expect(result.services).toEqual([])
    expect(result.pvcs).toEqual([])
    expect(result.configmaps).toEqual([])
    expect(result.secrets).toEqual([])
    expect(result.jobs).toEqual([])
    expect(result.hpas).toEqual([])
    expect(result.replicasets).toEqual([])
    expect(result.statefulsets).toEqual([])
    expect(result.daemonsets).toEqual([])
    expect(result.cronjobs).toEqual([])
    expect(result.ingresses).toEqual([])
    expect(result.networkpolicies).toEqual([])
    expect(result.podIssues).toEqual([])
  })

  it('slices resources at maxItems', () => {
    const allNodes = Array.from({ length: 50 }, (_, i) => ({ name: `node-${i}`, status: 'Ready' }))
    const result = normalizeClusterDataCache({ maxItems: 10, allNodes })
    expect(result.nodes).toHaveLength(10)
    expect(result.nodes[0].name).toBe('node-0')
    expect(result.nodes[9].name).toBe('node-9')
  })

  it('maps deployment fields correctly', () => {
    const result = normalizeClusterDataCache({
      maxItems: 100,
      allNodes: [],
      allDeployments: [{ name: 'api', namespace: 'prod', replicas: 3, readyReplicas: 2, status: 'Available', image: 'nginx:latest' }],
    })
    expect(result.deployments[0]).toEqual({
      name: 'api',
      namespace: 'prod',
      replicas: 3,
      readyReplicas: 2,
      status: 'Available',
      image: 'nginx:latest',
    })
  })

  it('applies defaults for missing optional fields', () => {
    const result = normalizeClusterDataCache({
      maxItems: 100,
      allNodes: [],
      allConfigMaps: [{ name: 'cm-1', namespace: 'ns' }],
      allSecrets: [{ name: 'sec-1', namespace: 'ns' }],
      allIngresses: [{ name: 'ing-1', namespace: 'ns' }],
      allNetworkPolicies: [{ name: 'np-1', namespace: 'ns', podSelector: 'app=web' }],
    })
    expect(result.configmaps[0].dataCount).toBe(0)
    expect(result.secrets[0].type).toBe('Opaque')
    expect(result.ingresses[0].hosts).toEqual([])
    expect(result.networkpolicies[0].policyTypes).toEqual([])
  })

  it('handles all resource types in one call', () => {
    const result = normalizeClusterDataCache({
      maxItems: 5,
      allNodes: [{ name: 'n1', status: 'Ready' }],
      allNamespaces: ['default', 'kube-system'],
      allDeployments: [{ name: 'd1', namespace: 'ns', replicas: 1, readyReplicas: 1 }],
      allServices: [{ name: 's1', namespace: 'ns', type: 'ClusterIP' }],
      allPVCs: [{ name: 'pvc-1', namespace: 'ns', status: 'Bound', capacity: '10Gi' }],
      allPods: [{ name: 'p1', namespace: 'ns', status: 'Running', restarts: 0 }],
      allConfigMaps: [{ name: 'cm-1', namespace: 'ns', dataCount: 3 }],
      allSecrets: [{ name: 'sec-1', namespace: 'ns', type: 'kubernetes.io/tls' }],
      allServiceAccounts: [{ name: 'sa-1', namespace: 'ns' }],
      allJobs: [{ name: 'j1', namespace: 'ns', status: 'Complete', completions: '1/1', duration: '30s' }],
      allHPAs: [{ name: 'hpa-1', namespace: 'ns', reference: 'Deployment/api', minReplicas: 1, maxReplicas: 5, currentReplicas: 2 }],
      allReplicaSets: [{ name: 'rs-1', namespace: 'ns', replicas: 3, readyReplicas: 3, ownerName: 'api' }],
      allStatefulSets: [{ name: 'sts-1', namespace: 'ns', replicas: 3, readyReplicas: 3, status: 'Running' }],
      allDaemonSets: [{ name: 'ds-1', namespace: 'ns', desiredScheduled: 3, ready: 3, status: 'Running' }],
      allCronJobs: [{ name: 'cj-1', namespace: 'ns', schedule: '*/5 * * * *', suspend: false, active: 0, lastSchedule: '2026-01-01' }],
      allIngresses: [{ name: 'ing-1', namespace: 'ns', class: 'nginx', hosts: ['example.com'], address: '10.0.0.1' }],
      allNetworkPolicies: [{ name: 'np-1', namespace: 'ns', policyTypes: ['Ingress'], podSelector: 'app=web' }],
      podIssues: [{ name: 'bad-pod', namespace: 'ns', status: 'CrashLoopBackOff', reason: 'OOMKilled' }],
    })
    expect(result.nodes).toHaveLength(1)
    expect(result.namespaces).toEqual(['default', 'kube-system'])
    expect(result.services).toHaveLength(1)
    expect(result.pvcs[0].capacity).toBe('10Gi')
    expect(result.jobs[0].duration).toBe('30s')
    expect(result.hpas[0].reference).toBe('Deployment/api')
    expect(result.replicasets[0].ownerName).toBe('api')
    expect(result.statefulsets[0].status).toBe('Running')
    expect(result.daemonsets[0].desiredScheduled).toBe(3)
    expect(result.cronjobs[0].schedule).toBe('*/5 * * * *')
    expect(result.ingresses[0].hosts).toEqual(['example.com'])
    expect(result.networkpolicies[0].policyTypes).toEqual(['Ingress'])
    expect(result.podIssues[0].reason).toBe('OOMKilled')
  })
})

// ─── getTotalIssueCounts ─────────────────────────────────────────────────────

describe('getTotalIssueCounts', () => {
  function makeCache(overrides: Partial<ClusterDataCache> = {}): ClusterDataCache {
    return {
      nodes: [], namespaces: [], deployments: [], services: [], pvcs: [],
      pods: [], configmaps: [], secrets: [], serviceaccounts: [], jobs: [],
      hpas: [], replicasets: [], statefulsets: [], daemonsets: [], cronjobs: [],
      ingresses: [], networkpolicies: [], podIssues: [],
      ...overrides,
    }
  }

  it('returns all zeros for empty cache', () => {
    const cache = new Map<string, ClusterDataCache>()
    expect(getTotalIssueCounts(cache)).toEqual({ nodes: 0, deployments: 0, pods: 0, pvcs: 0, total: 0 })
  })

  it('counts unhealthy nodes', () => {
    const cache = new Map([
      ['c1', makeCache({ nodes: [{ name: 'n1', status: 'NotReady' }, { name: 'n2', status: 'Ready' }] })],
    ])
    const result = getTotalIssueCounts(cache)
    expect(result.nodes).toBe(1)
    expect(result.total).toBe(1)
  })

  it('counts deployments with replica mismatch', () => {
    const cache = new Map([
      ['c1', makeCache({
        deployments: [
          { name: 'd1', namespace: 'ns', replicas: 3, readyReplicas: 1 },
          { name: 'd2', namespace: 'ns', replicas: 2, readyReplicas: 2 },
        ],
      })],
    ])
    const result = getTotalIssueCounts(cache)
    expect(result.deployments).toBe(1)
  })

  it('counts pod issues', () => {
    const cache = new Map([
      ['c1', makeCache({
        podIssues: [
          { name: 'bad-1', namespace: 'ns', status: 'CrashLoopBackOff' },
          { name: 'bad-2', namespace: 'ns', status: 'Error' },
        ],
      })],
    ])
    const result = getTotalIssueCounts(cache)
    expect(result.pods).toBe(2)
  })

  it('counts unbound PVCs', () => {
    const cache = new Map([
      ['c1', makeCache({
        pvcs: [
          { name: 'pvc-1', namespace: 'ns', status: 'Pending' },
          { name: 'pvc-2', namespace: 'ns', status: 'Bound' },
        ],
      })],
    ])
    const result = getTotalIssueCounts(cache)
    expect(result.pvcs).toBe(1)
  })

  it('aggregates across multiple clusters', () => {
    const cache = new Map([
      ['c1', makeCache({ nodes: [{ name: 'n1', status: 'NotReady' }] })],
      ['c2', makeCache({
        nodes: [{ name: 'n2', status: 'NotReady' }],
        podIssues: [{ name: 'p1', namespace: 'ns', status: 'Error' }],
      })],
    ])
    const result = getTotalIssueCounts(cache)
    expect(result.nodes).toBe(2)
    expect(result.pods).toBe(1)
    expect(result.total).toBe(3)
  })
})

// ─── evictOfflineClusterCacheEntries ─────────────────────────────────────────

describe('evictOfflineClusterCacheEntries', () => {
  function makeCache(overrides: Partial<ClusterDataCache> = {}): ClusterDataCache {
    return {
      nodes: [], namespaces: [], deployments: [], services: [], pvcs: [],
      pods: [], configmaps: [], secrets: [], serviceaccounts: [], jobs: [],
      hpas: [], replicasets: [], statefulsets: [], daemonsets: [], cronjobs: [],
      ingresses: [], networkpolicies: [], podIssues: [],
      ...overrides,
    }
  }

  it('returns null when no clusters are offline', () => {
    const cache = new Map([['c1', makeCache()]])
    const clusters = [{ name: 'c1', healthy: true }] as any[]
    expect(evictOfflineClusterCacheEntries(cache, clusters)).toBeNull()
  })

  it('returns null when offline cluster is not in cache', () => {
    const cache = new Map([['c1', makeCache()]])
    const clusters = [
      { name: 'c1', healthy: true },
      { name: 'c2', healthy: false },
    ] as any[]
    expect(evictOfflineClusterCacheEntries(cache, clusters)).toBeNull()
  })

  it('evicts offline cluster from cache', () => {
    const cache = new Map([
      ['c1', makeCache()],
      ['c2', makeCache()],
    ])
    const clusters = [
      { name: 'c1', healthy: true },
      { name: 'c2', healthy: false },
    ] as any[]
    const result = evictOfflineClusterCacheEntries(cache, clusters)
    expect(result).not.toBeNull()
    expect(result!.has('c1')).toBe(true)
    expect(result!.has('c2')).toBe(false)
  })

  it('evicts multiple offline clusters', () => {
    const cache = new Map([
      ['c1', makeCache()],
      ['c2', makeCache()],
      ['c3', makeCache()],
    ])
    const clusters = [
      { name: 'c1', healthy: false },
      { name: 'c2', healthy: false },
      { name: 'c3', healthy: true },
    ] as any[]
    const result = evictOfflineClusterCacheEntries(cache, clusters)
    expect(result!.size).toBe(1)
    expect(result!.has('c3')).toBe(true)
  })

  it('does not mutate original cache', () => {
    const cache = new Map([['c1', makeCache()]])
    const clusters = [{ name: 'c1', healthy: false }] as any[]
    evictOfflineClusterCacheEntries(cache, clusters)
    expect(cache.has('c1')).toBe(true)
  })
})

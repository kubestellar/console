import { describe, it, expect } from 'vitest'
import type { ClusterInfo } from '../types'
import {
  shareMetricsBetweenSameServerClusters,
  deduplicateClustersByServer,
} from '../dedup'

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'test-cluster',
    context: 'test-context',
    ...overrides,
  }
}

describe('shareMetricsBetweenSameServerClusters', () => {
  it('returns empty array for empty input', () => {
    expect(shareMetricsBetweenSameServerClusters([])).toEqual([])
  })

  it('passes through clusters without a server field unchanged', () => {
    const cluster = makeCluster({ name: 'no-server' })
    const result = shareMetricsBetweenSameServerClusters([cluster])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('no-server')
  })

  it('copies node metrics from a metrics-bearing cluster to a bare alias', () => {
    const withMetrics = makeCluster({
      name: 'full',
      server: 'https://api.example.com',
      nodeCount: 5,
      podCount: 20,
      cpuCores: 16,
      cpuRequestsCores: 8,
      healthy: true,
      reachable: true,
    })
    const bare = makeCluster({
      name: 'alias',
      server: 'https://api.example.com',
    })
    const result = shareMetricsBetweenSameServerClusters([bare, withMetrics])
    const aliasResult = result.find(c => c.name === 'alias')!
    expect(aliasResult.nodeCount).toBe(5)
    expect(aliasResult.podCount).toBe(20)
    expect(aliasResult.cpuCores).toBe(16)
    expect(aliasResult.healthy).toBe(true)
    expect(aliasResult.reachable).toBe(true)
  })

  it('does not overwrite existing metrics on a cluster', () => {
    const a = makeCluster({
      name: 'a',
      server: 'https://api.example.com',
      nodeCount: 3,
      podCount: 10,
      cpuCores: 8,
    })
    const b = makeCluster({
      name: 'b',
      server: 'https://api.example.com',
      nodeCount: 5,
      podCount: 20,
      cpuCores: 16,
    })
    const result = shareMetricsBetweenSameServerClusters([a, b])
    expect(result.find(c => c.name === 'a')!.nodeCount).toBe(3)
    expect(result.find(c => c.name === 'b')!.nodeCount).toBe(5)
  })

  it('prefers the cluster with the highest metric score', () => {
    const nodesOnly = makeCluster({
      name: 'nodes-only',
      server: 'https://api.example.com',
      nodeCount: 2,
    })
    const full = makeCluster({
      name: 'full',
      server: 'https://api.example.com',
      nodeCount: 5,
      cpuCores: 16,
      cpuRequestsCores: 8,
    })
    const bare = makeCluster({
      name: 'bare',
      server: 'https://api.example.com',
    })
    const result = shareMetricsBetweenSameServerClusters([nodesOnly, full, bare])
    const bareResult = result.find(c => c.name === 'bare')!
    expect(bareResult.nodeCount).toBe(5)
    expect(bareResult.cpuCores).toBe(16)
  })

  it('copies memory, storage, and metricsAvailable fields', () => {
    const source = makeCluster({
      name: 'source',
      server: 'https://api.example.com',
      nodeCount: 3,
      cpuCores: 8,
      memoryBytes: 1024,
      memoryGB: 1,
      memoryRequestsBytes: 512,
      memoryRequestsGB: 0.5,
      memoryUsageGB: 0.3,
      storageBytes: 2048,
      storageGB: 2,
      metricsAvailable: true,
    })
    const target = makeCluster({
      name: 'target',
      server: 'https://api.example.com',
    })
    const result = shareMetricsBetweenSameServerClusters([target, source])
    const t = result.find(c => c.name === 'target')!
    expect(t.memoryBytes).toBe(1024)
    expect(t.memoryGB).toBe(1)
    expect(t.storageBytes).toBe(2048)
    expect(t.storageGB).toBe(2)
    expect(t.metricsAvailable).toBe(true)
  })

  it('handles clusters on different servers independently', () => {
    const a = makeCluster({ name: 'a', server: 'https://server1.com', nodeCount: 3, cpuCores: 8 })
    const b = makeCluster({ name: 'b', server: 'https://server2.com', nodeCount: 5, cpuCores: 16 })
    const bareA = makeCluster({ name: 'bare-a', server: 'https://server1.com' })
    const result = shareMetricsBetweenSameServerClusters([a, b, bareA])
    expect(result.find(c => c.name === 'bare-a')!.nodeCount).toBe(3)
  })
})

describe('deduplicateClustersByServer', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateClustersByServer([])).toEqual([])
  })

  it('handles null/undefined input safely', () => {
    expect(deduplicateClustersByServer(null as unknown as ClusterInfo[])).toEqual([])
  })

  it('passes through a single cluster with aliases array', () => {
    const cluster = makeCluster({ name: 'solo', server: 'https://api.example.com' })
    const result = deduplicateClustersByServer([cluster])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('solo')
    expect(result[0].aliases).toEqual([])
  })

  it('deduplicates two clusters pointing to the same server', () => {
    const a = makeCluster({ name: 'short', context: 'short', server: 'https://api.example.com' })
    const b = makeCluster({ name: 'long-auto-generated-name-with-many-chars', context: 'long', server: 'https://api.example.com' })
    const result = deduplicateClustersByServer([a, b])
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toHaveLength(1)
  })

  it('preserves clusters without server URL', () => {
    const noServer = makeCluster({ name: 'no-server' })
    const withServer = makeCluster({ name: 'with-server', server: 'https://api.example.com' })
    const result = deduplicateClustersByServer([noServer, withServer])
    expect(result).toHaveLength(2)
    const noServerResult = result.find(c => c.name === 'no-server')!
    expect(noServerResult.aliases).toEqual([])
  })

  it('prefers user-friendly names over auto-generated OpenShift context names', () => {
    const friendly = makeCluster({ name: 'prow', server: 'https://api.example.com' })
    const autoGen = makeCluster({
      name: 'default/api-prow.openshiftapps.com:6443/kube:admin',
      server: 'https://api.example.com',
    })
    const result = deduplicateClustersByServer([autoGen, friendly])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('prow')
    expect(result[0].aliases).toContain('default/api-prow.openshiftapps.com:6443/kube:admin')
  })

  it('detects auto-generated names with /api- pattern', () => {
    const friendly = makeCluster({ name: 'my-cluster', server: 'https://api.test.com' })
    const auto = makeCluster({ name: '/api-test/admin', server: 'https://api.test.com' })
    const result = deduplicateClustersByServer([auto, friendly])
    expect(result[0].name).toBe('my-cluster')
  })

  it('detects auto-generated names with :6443/ pattern', () => {
    const friendly = makeCluster({ name: 'prod', server: 'https://api.test.com' })
    const auto = makeCluster({ name: 'context:6443/admin', server: 'https://api.test.com' })
    const result = deduplicateClustersByServer([auto, friendly])
    expect(result[0].name).toBe('prod')
  })

  it('detects auto-generated names with :443/ pattern', () => {
    const friendly = makeCluster({ name: 'staging', server: 'https://api.test.com' })
    const auto = makeCluster({ name: 'context:443/admin', server: 'https://api.test.com' })
    const result = deduplicateClustersByServer([auto, friendly])
    expect(result[0].name).toBe('staging')
  })

  it('detects auto-generated long names with slashes and colons', () => {
    const friendly = makeCluster({ name: 'dev', server: 'https://api.test.com' })
    const longName = 'a'.repeat(51) + '/some:thing'
    const auto = makeCluster({ name: longName, server: 'https://api.test.com' })
    const result = deduplicateClustersByServer([auto, friendly])
    expect(result[0].name).toBe('dev')
  })

  it('prefers cluster with metrics over one without', () => {
    const withMetrics = makeCluster({
      name: 'metrics-cluster',
      server: 'https://api.example.com',
      cpuCores: 16,
    })
    const bare = makeCluster({ name: 'bare-cluster', server: 'https://api.example.com' })
    const result = deduplicateClustersByServer([bare, withMetrics])
    expect(result[0].name).toBe('metrics-cluster')
  })

  it('prefers cluster with more namespaces', () => {
    const many = makeCluster({
      name: 'many-ns',
      server: 'https://api.example.com',
      namespaces: ['default', 'kube-system', 'app'],
    })
    const few = makeCluster({
      name: 'few-ns',
      server: 'https://api.example.com',
      namespaces: ['default'],
    })
    const result = deduplicateClustersByServer([few, many])
    expect(result[0].name).toBe('many-ns')
  })

  it('prefers current context cluster', () => {
    const current = makeCluster({
      name: 'current',
      server: 'https://api.example.com',
      isCurrent: true,
    })
    const other = makeCluster({ name: 'other', server: 'https://api.example.com' })
    const result = deduplicateClustersByServer([other, current])
    expect(result[0].name).toBe('current')
  })

  it('prefers shorter name when all else is equal', () => {
    const short = makeCluster({ name: 'ab', server: 'https://api.example.com' })
    const longer = makeCluster({ name: 'abcdef', server: 'https://api.example.com' })
    const result = deduplicateClustersByServer([longer, short])
    expect(result[0].name).toBe('ab')
  })

  it('merges best metrics from all duplicates', () => {
    const a = makeCluster({
      name: 'a',
      server: 'https://api.example.com',
      cpuCores: 16,
      memoryBytes: 1024,
      memoryGB: 1,
    })
    const b = makeCluster({
      name: 'b',
      server: 'https://api.example.com',
      cpuRequestsCores: 8,
      cpuRequestsMillicores: 8000,
    })
    const result = deduplicateClustersByServer([a, b])
    expect(result[0].cpuCores).toBe(16)
    expect(result[0].cpuRequestsCores).toBe(8)
  })

  it('uses primary nodeCount/podCount over alias values', () => {
    const primary = makeCluster({
      name: 'primary',
      server: 'https://api.example.com',
      nodeCount: 3,
      podCount: 10,
      cpuCores: 16,
    })
    const alias = makeCluster({
      name: 'zzz-alias',
      server: 'https://api.example.com',
      nodeCount: 100,
      podCount: 500,
    })
    const result = deduplicateClustersByServer([primary, alias])
    expect(result[0].nodeCount).toBe(3)
    expect(result[0].podCount).toBe(10)
  })

  it('falls back to alias nodeCount when primary has none', () => {
    const primary = makeCluster({
      name: 'primary',
      server: 'https://api.example.com',
      cpuCores: 16,
    })
    const alias = makeCluster({
      name: 'zzz-alias',
      server: 'https://api.example.com',
      nodeCount: 5,
      podCount: 20,
    })
    const result = deduplicateClustersByServer([primary, alias])
    expect(result[0].nodeCount).toBe(5)
    expect(result[0].podCount).toBe(20)
  })

  it('merges memory request metrics from separate clusters', () => {
    const a = makeCluster({
      name: 'a',
      server: 'https://api.example.com',
      cpuCores: 16,
    })
    const b = makeCluster({
      name: 'b-long-name-alias',
      server: 'https://api.example.com',
      memoryRequestsGB: 4,
      memoryRequestsBytes: 4294967296,
    })
    const result = deduplicateClustersByServer([a, b])
    expect(result[0].memoryRequestsGB).toBe(4)
    expect(result[0].memoryRequestsBytes).toBe(4294967296)
  })

  it('sets healthy=true if any cluster in group is healthy', () => {
    const unhealthy = makeCluster({
      name: 'down',
      server: 'https://api.example.com',
      healthy: false,
    })
    const healthy = makeCluster({
      name: 'up-alias',
      server: 'https://api.example.com',
      healthy: true,
    })
    const result = deduplicateClustersByServer([unhealthy, healthy])
    expect(result[0].healthy).toBe(true)
  })

  it('sets reachable=true if any cluster in group is reachable', () => {
    const unreachable = makeCluster({
      name: 'unreachable',
      server: 'https://api.example.com',
      reachable: false,
    })
    const reachable = makeCluster({
      name: 'reachable-alias',
      server: 'https://api.example.com',
      reachable: true,
    })
    const result = deduplicateClustersByServer([unreachable, reachable])
    expect(result[0].reachable).toBe(true)
  })

  it('handles multiple server groups independently', () => {
    const a1 = makeCluster({ name: 'a1', server: 'https://server-a.com' })
    const a2 = makeCluster({ name: 'a2', server: 'https://server-a.com' })
    const b1 = makeCluster({ name: 'b1', server: 'https://server-b.com' })
    const result = deduplicateClustersByServer([a1, a2, b1])
    expect(result).toHaveLength(2)
  })

  it('detects openshiftapps.com in name as auto-generated', () => {
    const friendly = makeCluster({ name: 'ocp', server: 'https://api.test.com' })
    const auto = makeCluster({
      name: 'ctx/cluster.openshiftapps.com:6443/admin',
      server: 'https://api.test.com',
    })
    const result = deduplicateClustersByServer([auto, friendly])
    expect(result[0].name).toBe('ocp')
  })

  it('detects openshift.com in name as auto-generated', () => {
    const friendly = makeCluster({ name: 'managed', server: 'https://api.test.com' })
    const auto = makeCluster({
      name: 'ctx/api.openshift.com/admin',
      server: 'https://api.test.com',
    })
    const result = deduplicateClustersByServer([auto, friendly])
    expect(result[0].name).toBe('managed')
  })
})

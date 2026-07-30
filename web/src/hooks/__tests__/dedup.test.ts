import { describe, it, expect } from 'vitest'
import { shareMetricsBetweenSameServerClusters, deduplicateClustersByServer } from '../mcp/dedup'
import type { ClusterInfo } from '../mcp/types'

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'cluster-1',
    context: 'cluster-1',
    server: 'https://k8s.example.com',
    user: 'admin',
    ...overrides,
  }
}

describe('shareMetricsBetweenSameServerClusters', () => {
  it('returns empty array for null input', () => {
    expect(shareMetricsBetweenSameServerClusters(null)).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    expect(shareMetricsBetweenSameServerClusters(undefined)).toEqual([])
  })

  it('returns clusters unchanged when no server overlap', () => {
    const clusters = [
      makeCluster({ name: 'a', server: 'https://a.example.com', cpuCores: 8 }),
      makeCluster({ name: 'b', server: 'https://b.example.com', cpuCores: 4 }),
    ]
    const result = shareMetricsBetweenSameServerClusters(clusters)
    expect(result).toHaveLength(2)
    expect(result[0].cpuCores).toBe(8)
    expect(result[1].cpuCores).toBe(4)
  })

  it('shares cpu/memory metrics to a cluster missing them on the same server', () => {
    const clusters = [
      makeCluster({ name: 'alias', server: 'https://shared.example.com' }),
      makeCluster({
        name: 'full',
        server: 'https://shared.example.com',
        cpuCores: 16,
        nodeCount: 3,
        memoryGB: 64,
      }),
    ]
    const result = shareMetricsBetweenSameServerClusters(clusters)
    const alias = result.find(c => c.name === 'alias')!
    expect(alias.cpuCores).toBe(16)
    expect(alias.memoryGB).toBe(64)
  })

  it('does not overwrite metrics the cluster already has', () => {
    const clusters = [
      makeCluster({ name: 'a', server: 'https://shared.example.com', cpuCores: 4 }),
      makeCluster({ name: 'b', server: 'https://shared.example.com', cpuCores: 8, nodeCount: 2 }),
    ]
    const result = shareMetricsBetweenSameServerClusters(clusters)
    const a = result.find(c => c.name === 'a')!
    expect(a.cpuCores).toBe(4) // own value preserved
  })

  it('handles clusters without a server URL', () => {
    const clusters = [makeCluster({ name: 'no-server', server: undefined })]
    const result = shareMetricsBetweenSameServerClusters(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('no-server')
  })

  it('returns a single cluster unchanged', () => {
    const clusters = [makeCluster({ name: 'solo', server: 'https://solo.example.com', cpuCores: 4 })]
    const result = shareMetricsBetweenSameServerClusters(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].cpuCores).toBe(4)
  })
})

describe('deduplicateClustersByServer', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateClustersByServer([])).toEqual([])
  })

  it('keeps a single cluster as-is and adds empty aliases', () => {
    const cluster = makeCluster({ name: 'solo', server: 'https://solo.example.com' })
    const result = deduplicateClustersByServer([cluster])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('solo')
    expect(result[0].aliases).toEqual([])
  })

  it('deduplicates two clusters on the same server into one', () => {
    const clusters = [
      makeCluster({ name: 'ctx-a', server: 'https://shared.example.com' }),
      makeCluster({ name: 'ctx-b', server: 'https://shared.example.com' }),
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toHaveLength(1)
  })

  it('keeps clusters without server URL separate (cannot be deduplicated)', () => {
    const clusters = [
      makeCluster({ name: 'no-server-1', server: undefined }),
      makeCluster({ name: 'no-server-2', server: undefined }),
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(2)
  })

  it('prefers user-friendly name over auto-generated OpenShift context name', () => {
    const clusters = [
      makeCluster({
        name: 'default/api-mycluster.openshiftapps.com:6443/kube:admin',
        server: 'https://api.example.com',
      }),
      makeCluster({ name: 'my-cluster', server: 'https://api.example.com' }),
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('my-cluster')
  })

  it('prefers reachable cluster over unreachable one with the same server', () => {
    const clusters = [
      makeCluster({ name: 'unreachable', server: 'https://api.example.com', reachable: false }),
      makeCluster({ name: 'reachable', server: 'https://api.example.com', reachable: true }),
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('reachable')
  })

  it('merges best cpu/memory metrics from duplicate clusters', () => {
    const clusters = [
      makeCluster({ name: 'primary', server: 'https://api.example.com' }),
      makeCluster({ name: 'alias', server: 'https://api.example.com', cpuCores: 8, memoryGB: 32, nodeCount: 2 }),
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].cpuCores).toBe(8)
    expect(result[0].memoryGB).toBe(32)
  })

  it('keeps clusters with different servers as separate entries', () => {
    const clusters = [
      makeCluster({ name: 'a', server: 'https://a.example.com' }),
      makeCluster({ name: 'b', server: 'https://b.example.com' }),
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(2)
  })

  it('prefers cluster with more namespaces as primary', () => {
    const clusters = [
      makeCluster({ name: 'few-ns', server: 'https://api.example.com', namespaces: ['default'] }),
      makeCluster({ name: 'many-ns', server: 'https://api.example.com', namespaces: ['default', 'kube-system', 'prod'] }),
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('many-ns')
  })

  it('tracks aliases from deduplicated clusters', () => {
    const clusters = [
      makeCluster({ name: 'primary', server: 'https://api.example.com' }),
      makeCluster({ name: 'alias-1', server: 'https://api.example.com' }),
      makeCluster({ name: 'alias-2', server: 'https://api.example.com' }),
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toHaveLength(2)
  })
})

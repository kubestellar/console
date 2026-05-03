/**
 * Extended coverage tests for hooks/mcp/dedup.ts
 *
 * Covers: OpenShift name detection, metric merge with primary authority for
 * nodeCount/podCount, alias fallback, request metric merge, health status merge,
 * edge cases with empty/null clusters.
 */

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

describe('dedup.ts extended coverage', () => {
  // ==========================================================================
  // shareMetricsBetweenSameServerClusters — edge cases
  // ==========================================================================

  describe('shareMetricsBetweenSameServerClusters edge cases', () => {
    it('handles null/undefined input gracefully', () => {
      expect(shareMetricsBetweenSameServerClusters(null as unknown as ClusterInfo[])).toEqual([])
      expect(shareMetricsBetweenSameServerClusters(undefined as unknown as ClusterInfo[])).toEqual([])
    })

    it('copies pod count from source when target has zero', () => {
      const withPods = makeCluster({
        name: 'full',
        server: 'https://api.example.com',
        nodeCount: 3,
        podCount: 50,
        cpuCores: 8,
      })
      const noPods = makeCluster({
        name: 'alias',
        server: 'https://api.example.com',
        podCount: 0,
      })
      const result = shareMetricsBetweenSameServerClusters([noPods, withPods])
      const alias = result.find(c => c.name === 'alias')!
      expect(alias.podCount).toBe(50)
    })

    it('copies memory and storage metrics via nullish coalescing', () => {
      const source = makeCluster({
        name: 'source',
        server: 'https://api.test',
        nodeCount: 2,
        cpuCores: 4,
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
        server: 'https://api.test',
      })
      const result = shareMetricsBetweenSameServerClusters([target, source])
      const t = result.find(c => c.name === 'target')!
      expect(t.memoryGB).toBe(1)
      expect(t.storageGB).toBe(2)
      expect(t.metricsAvailable).toBe(true)
    })

    it('does not copy when target already has capacity metrics', () => {
      const source = makeCluster({
        name: 'source',
        server: 'https://api.test',
        nodeCount: 5,
        cpuCores: 16,
        memoryGB: 64,
      })
      const target = makeCluster({
        name: 'target',
        server: 'https://api.test',
        nodeCount: 3,
        cpuCores: 8,
        memoryGB: 32,
      })
      const result = shareMetricsBetweenSameServerClusters([target, source])
      const t = result.find(c => c.name === 'target')!
      expect(t.cpuCores).toBe(8)
      expect(t.memoryGB).toBe(32)
    })

    it('handles multiple server groups independently', () => {
      const a1 = makeCluster({ name: 'a1', server: 'https://server-a', nodeCount: 2, cpuCores: 4 })
      const a2 = makeCluster({ name: 'a2', server: 'https://server-a' })
      const b1 = makeCluster({ name: 'b1', server: 'https://server-b', nodeCount: 5, cpuCores: 16 })
      const b2 = makeCluster({ name: 'b2', server: 'https://server-b' })

      const result = shareMetricsBetweenSameServerClusters([a1, a2, b1, b2])
      expect(result.find(c => c.name === 'a2')!.nodeCount).toBe(2)
      expect(result.find(c => c.name === 'b2')!.nodeCount).toBe(5)
    })
  })

  // ==========================================================================
  // deduplicateClustersByServer — extended paths
  // ==========================================================================

  describe('deduplicateClustersByServer extended', () => {
    it('handles null/undefined input gracefully', () => {
      expect(deduplicateClustersByServer(null as unknown as ClusterInfo[])).toEqual([])
      expect(deduplicateClustersByServer(undefined as unknown as ClusterInfo[])).toEqual([])
    })

    it('preserves clusters without server URL', () => {
      const noServer = makeCluster({ name: 'no-server' })
      const result = deduplicateClustersByServer([noServer])
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('no-server')
      expect(result[0].aliases).toEqual([])
    })

    it('detects OpenShift auto-generated names with /api- pattern', () => {
      const autoGen = makeCluster({
        name: 'default/api-cluster.openshiftapps.com:6443/kube:admin',
        server: 'https://api.cluster.openshiftapps.com:6443',
      })
      const friendly = makeCluster({
        name: 'my-cluster',
        server: 'https://api.cluster.openshiftapps.com:6443',
      })
      const result = deduplicateClustersByServer([autoGen, friendly])
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('my-cluster')
      expect(result[0].aliases).toContain('default/api-cluster.openshiftapps.com:6443/kube:admin')
    })

    it('detects auto-generated names with :6443/ pattern', () => {
      const autoGen = makeCluster({
        name: 'context/server.example.com:6443/admin',
        server: 'https://server.example.com:6443',
      })
      const friendly = makeCluster({
        name: 'prod',
        server: 'https://server.example.com:6443',
      })
      const result = deduplicateClustersByServer([autoGen, friendly])
      expect(result[0].name).toBe('prod')
    })

    it('detects auto-generated names with :443/ pattern', () => {
      const autoGen = makeCluster({
        name: 'context/server.example.com:443/admin',
        server: 'https://server.example.com',
      })
      const friendly = makeCluster({
        name: 'staging',
        server: 'https://server.example.com',
      })
      const result = deduplicateClustersByServer([autoGen, friendly])
      expect(result[0].name).toBe('staging')
    })

    it('prefers cluster with metrics over one without', () => {
      const withMetrics = makeCluster({
        name: 'with-metrics',
        server: 'https://api.test',
        cpuCores: 16,
      })
      const noMetrics = makeCluster({
        name: 'ab',
        server: 'https://api.test',
      })
      const result = deduplicateClustersByServer([noMetrics, withMetrics])
      expect(result[0].name).toBe('with-metrics')
    })

    it('prefers cluster with more namespaces', () => {
      const moreNs = makeCluster({
        name: 'more-ns',
        server: 'https://api.test',
        namespaces: ['default', 'kube-system', 'app'],
      })
      const lessNs = makeCluster({
        name: 'less-ns',
        server: 'https://api.test',
        namespaces: ['default'],
      })
      const result = deduplicateClustersByServer([lessNs, moreNs])
      expect(result[0].name).toBe('more-ns')
    })

    it('prefers current context when all else is equal', () => {
      const current = makeCluster({
        name: 'current-ctx',
        server: 'https://api.test',
        isCurrent: true,
      })
      const notCurrent = makeCluster({
        name: 'other-ctx',
        server: 'https://api.test',
        isCurrent: false,
      })
      const result = deduplicateClustersByServer([notCurrent, current])
      expect(result[0].name).toBe('current-ctx')
    })

    it('uses primary nodeCount when defined (not alias)', () => {
      const primary = makeCluster({
        name: 'primary',
        server: 'https://api.test',
        cpuCores: 16,
        nodeCount: 3,
      })
      const alias = makeCluster({
        name: 'long-auto-generated-name-that-is-quite-verbose-and-exceeds-threshold',
        server: 'https://api.test',
        nodeCount: 10,
      })
      const result = deduplicateClustersByServer([primary, alias])
      // primary has cpuCores so it wins sorting, and its nodeCount should be used
      expect(result[0].nodeCount).toBe(3)
    })

    it('falls back to alias nodeCount when primary has undefined', () => {
      const primary = makeCluster({
        name: 'primary',
        server: 'https://api.test',
        cpuCores: 16,
      })
      const alias = makeCluster({
        name: 'alias-long-name-that-is-auto-generated-definitely-over-fifty-chars-threshold-easily',
        server: 'https://api.test',
        nodeCount: 7,
      })
      const result = deduplicateClustersByServer([primary, alias])
      expect(result[0].nodeCount).toBe(7)
    })

    it('uses primary podCount when defined', () => {
      const primary = makeCluster({
        name: 'primary',
        server: 'https://api.test',
        cpuCores: 16,
        podCount: 42,
      })
      const alias = makeCluster({
        name: 'generated-context/api-server:6443/user',
        server: 'https://api.test',
        podCount: 100,
      })
      const result = deduplicateClustersByServer([primary, alias])
      expect(result[0].podCount).toBe(42)
    })

    it('merges request metrics from alias if primary has none', () => {
      const primary = makeCluster({
        name: 'primary',
        server: 'https://api.test',
        cpuCores: 16,
      })
      const alias = makeCluster({
        name: 'generated-context/api-server:6443/user',
        server: 'https://api.test',
        cpuRequestsCores: 4.5,
        cpuRequestsMillicores: 4500,
        memoryRequestsGB: 8,
        memoryRequestsBytes: 8589934592,
      })
      const result = deduplicateClustersByServer([primary, alias])
      expect(result[0].cpuRequestsCores).toBe(4.5)
      expect(result[0].memoryRequestsGB).toBe(8)
    })

    it('merges health: anyHealthy is true if any cluster is healthy', () => {
      const unhealthy = makeCluster({
        name: 'primary',
        server: 'https://api.test',
        cpuCores: 16,
        healthy: false,
        reachable: false,
      })
      const healthy = makeCluster({
        name: 'generated-context/api-server:6443/user',
        server: 'https://api.test',
        healthy: true,
        reachable: true,
      })
      const result = deduplicateClustersByServer([unhealthy, healthy])
      expect(result[0].healthy).toBe(true)
      expect(result[0].reachable).toBe(true)
    })

    it('handles single-cluster groups (no dedup needed)', () => {
      const solo = makeCluster({
        name: 'solo',
        server: 'https://unique.server',
        nodeCount: 5,
      })
      const result = deduplicateClustersByServer([solo])
      expect(result).toHaveLength(1)
      expect(result[0].aliases).toEqual([])
    })

    it('handles mix of server and no-server clusters', () => {
      const withServer = makeCluster({ name: 'with-server', server: 'https://api.test' })
      const noServer1 = makeCluster({ name: 'no-server-1' })
      const noServer2 = makeCluster({ name: 'no-server-2' })
      const result = deduplicateClustersByServer([withServer, noServer1, noServer2])
      expect(result).toHaveLength(3)
    })

    it('detects OpenShift domain in name via regex', () => {
      const openshiftName = makeCluster({
        name: 'admin/api-prod.openshift.com:6443',
        server: 'https://api.test',
      })
      const friendly = makeCluster({
        name: 'prod',
        server: 'https://api.test',
      })
      const result = deduplicateClustersByServer([openshiftName, friendly])
      expect(result[0].name).toBe('prod')
    })

    it('prefers shorter name when all other criteria equal', () => {
      const short = makeCluster({ name: 'ab', server: 'https://api.test' })
      const longer = makeCluster({ name: 'abcdef', server: 'https://api.test' })
      const result = deduplicateClustersByServer([longer, short])
      expect(result[0].name).toBe('ab')
      expect(result[0].aliases).toContain('abcdef')
    })
  })
})

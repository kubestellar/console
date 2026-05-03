/**
 * Tests for hooks/mcp/clusterUtils.ts
 *
 * Covers: deduplicateClustersByServer usage metric merging,
 * request metric merging, metricsAvailable flag, 0-value preservation
 * (nullish checks), distribution detection helpers.
 *
 * These complement dedup-coverage.test.ts (which targets dedup.ts) —
 * clusterUtils.ts is the production path re-exported via shared.ts.
 */

import { describe, it, expect } from 'vitest'
import type { ClusterInfo } from '../types'
import {
  deduplicateClustersByServer,
  shareMetricsBetweenSameServerClusters,
  detectDistributionFromNamespaces,
  detectDistributionFromServer,
} from '../clusterUtils'

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'test-cluster',
    context: 'test-context',
    ...overrides,
  }
}

// =============================================================================
// deduplicateClustersByServer — usage metric merging
// =============================================================================

describe('clusterUtils.deduplicateClustersByServer', () => {
  it('returns empty array for null/undefined input', () => {
    expect(deduplicateClustersByServer(null as unknown as ClusterInfo[])).toEqual([])
    expect(deduplicateClustersByServer(undefined as unknown as ClusterInfo[])).toEqual([])
    expect(deduplicateClustersByServer([])).toEqual([])
  })

  it('adds aliases: [] to single-cluster groups', () => {
    const solo = makeCluster({ name: 'solo', server: 'https://api.example.com', cpuCores: 4 })
    const result = deduplicateClustersByServer([solo])
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toEqual([])
  })

  it('adds aliases: [] to clusters without server URL', () => {
    const noServer = makeCluster({ name: 'no-server' })
    const result = deduplicateClustersByServer([noServer])
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toEqual([])
  })

  it('merges cpuUsage metrics from alias when primary has none', () => {
    const primary = makeCluster({
      name: 'primary',
      server: 'https://api.test',
      cpuCores: 16,
    })
    const alias = makeCluster({
      name: 'generated-context/api-server:6443/user',
      server: 'https://api.test',
      cpuUsageCores: 2.5,
      cpuUsageMillicores: 2500,
    })
    const result = deduplicateClustersByServer([primary, alias])
    expect(result).toHaveLength(1)
    expect(result[0].cpuUsageCores).toBe(2.5)
    expect(result[0].cpuUsageMillicores).toBe(2500)
  })

  it('merges memoryUsage metrics from alias when primary has none', () => {
    const primary = makeCluster({
      name: 'primary',
      server: 'https://api.test',
      cpuCores: 16,
    })
    const alias = makeCluster({
      name: 'generated-context/api-server:6443/user',
      server: 'https://api.test',
      memoryUsageGB: 12.3,
      memoryUsageBytes: 13_210_150_912,
    })
    const result = deduplicateClustersByServer([primary, alias])
    expect(result).toHaveLength(1)
    expect(result[0].memoryUsageGB).toBe(12.3)
    expect(result[0].memoryUsageBytes).toBe(13_210_150_912)
  })

  it('merges metricsAvailable flag from alias when primary lacks it', () => {
    const primary = makeCluster({
      name: 'primary',
      server: 'https://api.test',
      cpuCores: 16,
    })
    const alias = makeCluster({
      name: 'generated-context/api-server:6443/user',
      server: 'https://api.test',
      metricsAvailable: true,
    })
    const result = deduplicateClustersByServer([primary, alias])
    expect(result).toHaveLength(1)
    expect(result[0].metricsAvailable).toBe(true)
  })

  it('does not overwrite metricsAvailable if primary already has it', () => {
    const primary = makeCluster({
      name: 'primary',
      server: 'https://api.test',
      cpuCores: 16,
      metricsAvailable: true,
    })
    const alias = makeCluster({
      name: 'generated-context/api-server:6443/user',
      server: 'https://api.test',
      metricsAvailable: false,
    })
    const result = deduplicateClustersByServer([primary, alias])
    expect(result[0].metricsAvailable).toBe(true)
  })

  it('preserves cpuUsageCores value of 0 (nullish check, not truthy)', () => {
    // cpuUsageCores=0 is valid (idle cluster); truthy check would skip it
    const primary = makeCluster({
      name: 'primary',
      server: 'https://api.test',
      cpuCores: 16,
    })
    const alias = makeCluster({
      name: 'generated-context/api-server:6443/user',
      server: 'https://api.test',
      cpuUsageCores: 0,
      cpuUsageMillicores: 0,
    })
    const result = deduplicateClustersByServer([primary, alias])
    // 0 is a valid number and should be merged (not skipped by falsy check)
    expect(result[0].cpuUsageCores).toBe(0)
    expect(result[0].cpuUsageMillicores).toBe(0)
  })

  it('preserves cpuRequestsCores value of 0 (nullish check, not truthy)', () => {
    const primary = makeCluster({
      name: 'primary',
      server: 'https://api.test',
      cpuCores: 16,
    })
    const alias = makeCluster({
      name: 'generated-context/api-server:6443/user',
      server: 'https://api.test',
      cpuRequestsCores: 0,
      cpuRequestsMillicores: 0,
    })
    const result = deduplicateClustersByServer([primary, alias])
    expect(result[0].cpuRequestsCores).toBe(0)
    expect(result[0].cpuRequestsMillicores).toBe(0)
  })

  it('does not overwrite existing cpuUsage from primary with alias value', () => {
    const primary = makeCluster({
      name: 'primary',
      server: 'https://api.test',
      cpuCores: 16,
      cpuUsageCores: 8,
      cpuUsageMillicores: 8000,
    })
    const alias = makeCluster({
      name: 'generated-context/api-server:6443/user',
      server: 'https://api.test',
      cpuUsageCores: 4,
      cpuUsageMillicores: 4000,
    })
    const result = deduplicateClustersByServer([primary, alias])
    // Primary's usage should win
    expect(result[0].cpuUsageCores).toBe(8)
  })

  it('merges both request and usage metrics from same alias cluster', () => {
    const primary = makeCluster({
      name: 'primary',
      server: 'https://api.test',
      cpuCores: 32,
      memoryGB: 128,
    })
    const alias = makeCluster({
      name: 'generated-context/api-server:6443/user',
      server: 'https://api.test',
      cpuRequestsCores: 12,
      cpuRequestsMillicores: 12000,
      memoryRequestsGB: 64,
      memoryRequestsBytes: 68_719_476_736,
      cpuUsageCores: 6,
      cpuUsageMillicores: 6000,
      memoryUsageGB: 48,
      memoryUsageBytes: 51_539_607_552,
      metricsAvailable: true,
    })
    const result = deduplicateClustersByServer([primary, alias])
    expect(result).toHaveLength(1)
    expect(result[0].cpuRequestsCores).toBe(12)
    expect(result[0].memoryRequestsGB).toBe(64)
    expect(result[0].cpuUsageCores).toBe(6)
    expect(result[0].memoryUsageGB).toBe(48)
    expect(result[0].metricsAvailable).toBe(true)
  })
})

// =============================================================================
// shareMetricsBetweenSameServerClusters (clusterUtils.ts version)
// =============================================================================

describe('clusterUtils.shareMetricsBetweenSameServerClusters', () => {
  it('returns empty array for empty input', () => {
    expect(shareMetricsBetweenSameServerClusters([])).toEqual([])
  })

  it('copies cpuCores from source cluster to alias cluster with same server', () => {
    const withMetrics = makeCluster({
      name: 'source',
      server: 'https://api.test',
      nodeCount: 4,
      cpuCores: 16,
      memoryGB: 64,
    })
    const withoutMetrics = makeCluster({
      name: 'alias',
      server: 'https://api.test',
    })
    const result = shareMetricsBetweenSameServerClusters([withoutMetrics, withMetrics])
    const alias = result.find(c => c.name === 'alias')!
    expect(alias.cpuCores).toBe(16)
    expect(alias.memoryGB).toBe(64)
  })

  it('does not overwrite existing metrics on target cluster', () => {
    const source = makeCluster({
      name: 'source',
      server: 'https://api.test',
      cpuCores: 32,
      memoryGB: 128,
    })
    const target = makeCluster({
      name: 'target',
      server: 'https://api.test',
      cpuCores: 8,
      memoryGB: 32,
    })
    const result = shareMetricsBetweenSameServerClusters([target, source])
    const t = result.find(c => c.name === 'target')!
    expect(t.cpuCores).toBe(8)
    expect(t.memoryGB).toBe(32)
  })

  it('handles clusters without server URL gracefully', () => {
    const noServer = makeCluster({ name: 'no-server', cpuCores: 4 })
    const result = shareMetricsBetweenSameServerClusters([noServer])
    expect(result).toHaveLength(1)
    expect(result[0].cpuCores).toBe(4)
  })
})

// =============================================================================
// detectDistributionFromNamespaces
// =============================================================================

describe('clusterUtils.detectDistributionFromNamespaces', () => {
  it('detects openshift from openshift- namespaces', () => {
    expect(detectDistributionFromNamespaces(['openshift-monitoring', 'default'])).toBe('openshift')
  })

  it('detects openshift from exact openshift namespace', () => {
    expect(detectDistributionFromNamespaces(['openshift', 'default'])).toBe('openshift')
  })

  it('detects gke from gke- namespace prefix', () => {
    expect(detectDistributionFromNamespaces(['gke-system', 'default'])).toBe('gke')
  })

  it('detects gke from config-management-system namespace', () => {
    expect(detectDistributionFromNamespaces(['config-management-system', 'default'])).toBe('gke')
  })

  it('returns undefined for generic namespaces', () => {
    expect(detectDistributionFromNamespaces(['default', 'kube-system', 'my-app'])).toBeUndefined()
  })

  it('returns undefined for empty array', () => {
    expect(detectDistributionFromNamespaces([])).toBeUndefined()
  })
})

// =============================================================================
// detectDistributionFromServer
// =============================================================================

describe('clusterUtils.detectDistributionFromServer', () => {
  it('detects eks from amazonaws.com server URL', () => {
    expect(detectDistributionFromServer('https://api.eks.amazonaws.com')).toBe('eks')
  })

  it('detects gke from googleapis.com server URL', () => {
    expect(detectDistributionFromServer('https://container.googleapis.com')).toBe('gke')
  })

  it('detects openshift from openshiftapps.com server URL', () => {
    expect(detectDistributionFromServer('https://api.cluster.openshiftapps.com:6443')).toBe('openshift')
  })

  it('returns undefined for unknown server URL', () => {
    expect(detectDistributionFromServer('https://my-private-cluster.internal')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(detectDistributionFromServer(undefined)).toBeUndefined()
  })
})

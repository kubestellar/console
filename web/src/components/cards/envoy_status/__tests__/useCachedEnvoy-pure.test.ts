import { describe, it, expect } from 'vitest'
import { __testables } from '../useCachedEnvoy'
import type { EnvoyListener, EnvoyUpstreamCluster } from '../demoData'

const { summarize, deriveHealth, buildEnvoyStatus } = __testables

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zero counts for empty arrays', () => {
    const result = summarize([], [])
    expect(result).toEqual({
      totalListeners: 0,
      activeListeners: 0,
      totalClusters: 0,
      healthyClusters: 0,
    })
  })

  it('counts active listeners', () => {
    const listeners: EnvoyListener[] = [
      { name: 'l1', address: '0.0.0.0', port: 80, status: 'active', routeCount: 2 },
      { name: 'l2', address: '0.0.0.0', port: 443, status: 'draining', routeCount: 1 },
      { name: 'l3', address: '0.0.0.0', port: 8080, status: 'active', routeCount: 3 },
    ]
    const result = summarize(listeners, [])
    expect(result.totalListeners).toBe(3)
    expect(result.activeListeners).toBe(2)
  })

  it('counts healthy clusters (all endpoints healthy)', () => {
    const clusters: EnvoyUpstreamCluster[] = [
      { name: 'c1', type: 'EDS', endpointsTotal: 3, endpointsHealthy: 3, status: 'healthy' },
      { name: 'c2', type: 'EDS', endpointsTotal: 2, endpointsHealthy: 1, status: 'degraded' },
      { name: 'c3', type: 'STATIC', endpointsTotal: 1, endpointsHealthy: 1, status: 'healthy' },
    ]
    const result = summarize([], clusters)
    expect(result.totalClusters).toBe(3)
    expect(result.healthyClusters).toBe(2)
  })

  it('does not count clusters with zero total endpoints as healthy', () => {
    const clusters: EnvoyUpstreamCluster[] = [
      { name: 'c1', type: 'EDS', endpointsTotal: 0, endpointsHealthy: 0, status: 'unknown' },
    ]
    const result = summarize([], clusters)
    expect(result.healthyClusters).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when both arrays are empty', () => {
    expect(deriveHealth([], [])).toBe('not-installed')
  })

  it('returns healthy when all listeners active and all clusters fully healthy', () => {
    const listeners: EnvoyListener[] = [
      { name: 'l1', address: '0.0.0.0', port: 80, status: 'active', routeCount: 2 },
    ]
    const clusters: EnvoyUpstreamCluster[] = [
      { name: 'c1', type: 'EDS', endpointsTotal: 3, endpointsHealthy: 3, status: 'healthy' },
    ]
    expect(deriveHealth(listeners, clusters)).toBe('healthy')
  })

  it('returns degraded when a cluster has unhealthy endpoints', () => {
    const listeners: EnvoyListener[] = [
      { name: 'l1', address: '0.0.0.0', port: 80, status: 'active', routeCount: 2 },
    ]
    const clusters: EnvoyUpstreamCluster[] = [
      { name: 'c1', type: 'EDS', endpointsTotal: 3, endpointsHealthy: 2, status: 'degraded' },
    ]
    expect(deriveHealth(listeners, clusters)).toBe('degraded')
  })

  it('returns degraded when a listener is inactive', () => {
    const listeners: EnvoyListener[] = [
      { name: 'l1', address: '0.0.0.0', port: 80, status: 'draining', routeCount: 1 },
    ]
    const clusters: EnvoyUpstreamCluster[] = [
      { name: 'c1', type: 'EDS', endpointsTotal: 3, endpointsHealthy: 3, status: 'healthy' },
    ]
    expect(deriveHealth(listeners, clusters)).toBe('degraded')
  })

  it('returns healthy when cluster has zero total endpoints (not considered unhealthy)', () => {
    const listeners: EnvoyListener[] = [
      { name: 'l1', address: '0.0.0.0', port: 80, status: 'active', routeCount: 2 },
    ]
    const clusters: EnvoyUpstreamCluster[] = [
      { name: 'c1', type: 'EDS', endpointsTotal: 0, endpointsHealthy: 0, status: 'unknown' },
    ]
    expect(deriveHealth(listeners, clusters)).toBe('healthy')
  })

  it('returns healthy with only listeners and no clusters', () => {
    const listeners: EnvoyListener[] = [
      { name: 'l1', address: '0.0.0.0', port: 80, status: 'active', routeCount: 2 },
    ]
    expect(deriveHealth(listeners, [])).toBe('healthy')
  })

  it('returns healthy with only clusters and no listeners', () => {
    const clusters: EnvoyUpstreamCluster[] = [
      { name: 'c1', type: 'EDS', endpointsTotal: 1, endpointsHealthy: 1, status: 'healthy' },
    ]
    expect(deriveHealth([], clusters)).toBe('healthy')
  })

  it('returns degraded when listener status is warming', () => {
    const listeners: EnvoyListener[] = [
      { name: 'l1', address: '0.0.0.0', port: 80, status: 'warming', routeCount: 0 },
    ]
    expect(deriveHealth(listeners, [])).toBe('degraded')
  })
})

// ---------------------------------------------------------------------------
// buildEnvoyStatus
// ---------------------------------------------------------------------------

describe('buildEnvoyStatus', () => {
  const stats = {
    requestsPerSecond: 100,
    activeConnections: 50,
    totalRequests: 10000,
    http5xxRate: 0.01,
  }

  it('builds a complete status object', () => {
    const listeners: EnvoyListener[] = [
      { name: 'l1', address: '0.0.0.0', port: 80, status: 'active', routeCount: 2 },
    ]
    const clusters: EnvoyUpstreamCluster[] = [
      { name: 'c1', type: 'EDS', endpointsTotal: 3, endpointsHealthy: 3, status: 'healthy' },
    ]
    const result = buildEnvoyStatus(listeners, clusters, stats)

    expect(result.health).toBe('healthy')
    expect(result.listeners).toBe(listeners)
    expect(result.clusters).toBe(clusters)
    expect(result.stats).toBe(stats)
    expect(result.summary.totalListeners).toBe(1)
    expect(result.summary.activeListeners).toBe(1)
    expect(result.summary.totalClusters).toBe(1)
    expect(result.summary.healthyClusters).toBe(1)
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('derives degraded health when applicable', () => {
    const listeners: EnvoyListener[] = [
      { name: 'l1', address: '0.0.0.0', port: 80, status: 'draining', routeCount: 1 },
    ]
    const result = buildEnvoyStatus(listeners, [], stats)
    expect(result.health).toBe('degraded')
  })

  it('derives not-installed health for empty arrays', () => {
    const result = buildEnvoyStatus([], [], stats)
    expect(result.health).toBe('not-installed')
  })

  it('includes lastCheckTime as ISO string', () => {
    const result = buildEnvoyStatus([], [], stats)
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).getTime()).toBeGreaterThan(0)
  })
})

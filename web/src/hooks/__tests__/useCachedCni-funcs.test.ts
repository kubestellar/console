/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedCni.ts.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: false,
}))

vi.mock('../../lib/cache', () => ({
  useCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })),
}))

import { __testables } from '../useCachedCni'
import type { CniStats, CniNodeStatus } from '../../lib/demo/cni'

const { summarize, deriveHealth, buildCniStatus } = __testables

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeStats(overrides: Partial<CniStats> = {}): CniStats {
  return {
    activePlugin: 'cilium',
    pluginVersion: '1.15.1',
    podNetworkCidr: '10.244.0.0/16',
    serviceNetworkCidr: '10.96.0.0/12',
    nodeCount: 3,
    nodesCniReady: 3,
    networkPolicyCount: 5,
    servicesWithNetworkPolicy: 2,
    totalServices: 10,
    podsWithIp: 50,
    totalPods: 50,
    ...overrides,
  }
}

function makeNode(overrides: Partial<CniNodeStatus> = {}): CniNodeStatus {
  return {
    node: 'worker-1',
    cluster: 'cluster-1',
    state: 'ready',
    plugin: 'cilium',
    pluginVersion: '1.15.1',
    podCidr: '10.244.1.0/24',
    lastHeartbeat: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('extracts summary fields from stats', () => {
    const stats = makeStats()
    const result = summarize(stats)
    expect(result).toEqual({
      activePlugin: 'cilium',
      pluginVersion: '1.15.1',
      podNetworkCidr: '10.244.0.0/16',
      nodesCniReady: 3,
      nodeCount: 3,
      networkPolicyCount: 5,
      servicesWithNetworkPolicy: 2,
    })
  })

  it('reflects unknown plugin', () => {
    const stats = makeStats({ activePlugin: 'unknown', pluginVersion: 'unknown' })
    const result = summarize(stats)
    expect(result.activePlugin).toBe('unknown')
    expect(result.pluginVersion).toBe('unknown')
  })

  it('reflects zero counts', () => {
    const stats = makeStats({
      nodeCount: 0,
      nodesCniReady: 0,
      networkPolicyCount: 0,
      servicesWithNetworkPolicy: 0,
    })
    const result = summarize(stats)
    expect(result.nodeCount).toBe(0)
    expect(result.nodesCniReady).toBe(0)
    expect(result.networkPolicyCount).toBe(0)
    expect(result.servicesWithNetworkPolicy).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when plugin is unknown and no nodes', () => {
    const stats = makeStats({ activePlugin: 'unknown' })
    expect(deriveHealth(stats, [])).toBe('not-installed')
  })

  it('returns healthy when all nodes are ready and counts match', () => {
    const stats = makeStats({ nodeCount: 2, nodesCniReady: 2 })
    const nodes = [makeNode(), makeNode({ node: 'worker-2' })]
    expect(deriveHealth(stats, nodes)).toBe('healthy')
  })

  it('returns degraded when a node is not-ready', () => {
    const stats = makeStats({ nodeCount: 2, nodesCniReady: 1 })
    const nodes = [makeNode(), makeNode({ node: 'worker-2', state: 'not-ready' })]
    expect(deriveHealth(stats, nodes)).toBe('degraded')
  })

  it('returns degraded when a node state is unknown', () => {
    const stats = makeStats()
    const nodes = [makeNode({ state: 'unknown' })]
    expect(deriveHealth(stats, nodes)).toBe('degraded')
  })

  it('returns degraded when nodesCniReady < nodeCount (even if all node states are ready)', () => {
    // This tests the second degraded condition
    const stats = makeStats({ nodeCount: 3, nodesCniReady: 2 })
    const nodes = [makeNode(), makeNode({ node: 'w2' }), makeNode({ node: 'w3' })]
    // All nodes have state: 'ready', but stats say only 2 of 3 are CNI ready
    expect(deriveHealth(stats, nodes)).toBe('degraded')
  })

  it('returns healthy when nodeCount is 0 but plugin is known', () => {
    const stats = makeStats({ activePlugin: 'cilium', nodeCount: 0, nodesCniReady: 0 })
    const nodes = [makeNode()]
    // activePlugin !== 'unknown' so not "not-installed"; nodes all ready, nodeCount is 0 so
    // the nodeCount > 0 check doesn't trigger
    expect(deriveHealth(stats, nodes)).toBe('healthy')
  })

  it('returns not-installed only when BOTH plugin=unknown AND nodes empty', () => {
    // If plugin is unknown but there are nodes, it's not "not-installed"
    const stats = makeStats({ activePlugin: 'unknown' })
    const nodes = [makeNode()]
    // node state is ready so no degradation from that, but nodes exist so not "not-installed"
    expect(deriveHealth(stats, nodes)).not.toBe('not-installed')
  })
})

// ---------------------------------------------------------------------------
// buildCniStatus
// ---------------------------------------------------------------------------

describe('buildCniStatus', () => {
  it('builds not-installed status with unknown plugin and no nodes', () => {
    const stats = makeStats({ activePlugin: 'unknown' })
    const result = buildCniStatus(stats, [])
    expect(result.health).toBe('not-installed')
    expect(result.nodes).toEqual([])
    expect(result.stats).toBe(stats)
    expect(result.summary.activePlugin).toBe('unknown')
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('builds healthy status with ready nodes', () => {
    const stats = makeStats()
    const nodes = [makeNode(), makeNode({ node: 'worker-2' })]
    const result = buildCniStatus(stats, nodes)
    expect(result.health).toBe('healthy')
    expect(result.nodes).toHaveLength(2)
    expect(result.summary.activePlugin).toBe('cilium')
  })

  it('builds degraded status with not-ready node', () => {
    const stats = makeStats()
    const nodes = [makeNode({ state: 'not-ready' })]
    const result = buildCniStatus(stats, nodes)
    expect(result.health).toBe('degraded')
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildCniStatus(makeStats(), [])
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })

  it('preserves stats reference', () => {
    const stats = makeStats()
    const result = buildCniStatus(stats, [])
    expect(result.stats).toBe(stats)
  })
})

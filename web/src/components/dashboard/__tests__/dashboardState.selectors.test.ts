import { describe, expect, it, vi } from 'vitest'

import {
  computeClusterStats,
  computeCurrentCardTypes,
  computeFilteredClusters,
  resolveStatValue,
  type StatValueDeps,
} from '../dashboardState.selectors'

import type { ClusterInfo } from '../../../hooks/mcp/types'
import type { Card } from '../dashboardUtils'

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: 'c1',
    healthy: true,
    nodeCount: 3,
    podCount: 10,
    namespaces: ['default', 'kube-system'],
    ...overrides,
  } as ClusterInfo
}

function makeDeps(overrides: Partial<StatValueDeps> = {}): StatValueDeps {
  return {
    clusterCount: 0,
    healthyClusters: 0,
    unhealthyClusters: 0,
    healthyNodes: 0,
    totalPods: 0,
    totalNamespaces: 0,
    totalNodes: 0,
    drillToAllClusters: vi.fn(),
    drillToAllNodes: vi.fn(),
    drillToAllPods: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  } as StatValueDeps
}

// ─── computeFilteredClusters ────────────────────────────────────────────────

describe('computeFilteredClusters', () => {
  const c1 = makeCluster({ name: 'alpha' })
  const c2 = makeCluster({ name: 'beta' })
  const c3 = makeCluster({ name: 'gamma' })

  it('returns full list when isAllClustersSelected=true', () => {
    expect(computeFilteredClusters([c1, c2, c3], [], true)).toEqual([c1, c2, c3])
  })

  it('returns full list when isAllClustersSelected=true even if selection is non-empty', () => {
    expect(computeFilteredClusters([c1, c2, c3], ['alpha'], true)).toEqual([c1, c2, c3])
  })

  it('filters by name membership when isAllClustersSelected=false', () => {
    expect(computeFilteredClusters([c1, c2, c3], ['alpha', 'gamma'], false)).toEqual([c1, c3])
  })

  it('returns empty when selection is empty and not all-selected', () => {
    expect(computeFilteredClusters([c1, c2, c3], [], false)).toEqual([])
  })

  it('tolerates a null/undefined cluster list', () => {
    expect(computeFilteredClusters(null as unknown as ClusterInfo[], [], false)).toEqual([])
    expect(computeFilteredClusters(undefined as unknown as ClusterInfo[], ['alpha'], false)).toEqual([])
  })

  it('ignores names in the selection that do not match any cluster', () => {
    expect(computeFilteredClusters([c1, c2], ['alpha', 'missing'], false)).toEqual([c1])
  })
})

// ─── computeClusterStats ────────────────────────────────────────────────────

describe('computeClusterStats', () => {
  it('returns all-zero stats for an empty list', () => {
    expect(computeClusterStats([])).toEqual({
      clusterCount: 0,
      healthyClusters: 0,
      unhealthyClusters: 0,
      healthyNodes: 0,
      totalPods: 0,
      totalNamespaces: 0,
      totalNodes: 0,
    })
  })

  it('aggregates one healthy cluster', () => {
    const stats = computeClusterStats([
      makeCluster({ name: 'a', healthy: true, nodeCount: 3, podCount: 12, namespaces: ['x', 'y'] }),
    ])
    expect(stats).toEqual({
      clusterCount: 1,
      healthyClusters: 1,
      unhealthyClusters: 0,
      healthyNodes: 3,
      totalPods: 12,
      totalNamespaces: 2,
      totalNodes: 3,
    })
  })

  it('splits healthy vs unhealthy and does not credit unhealthy nodes to healthyNodes', () => {
    const stats = computeClusterStats([
      makeCluster({ name: 'a', healthy: true, nodeCount: 3, podCount: 10, namespaces: ['x'] }),
      makeCluster({ name: 'b', healthy: false, nodeCount: 5, podCount: 20, namespaces: ['y', 'z'] }),
    ])
    expect(stats.clusterCount).toBe(2)
    expect(stats.healthyClusters).toBe(1)
    expect(stats.unhealthyClusters).toBe(1)
    expect(stats.healthyNodes).toBe(3) // only the healthy cluster's nodes
    expect(stats.totalNodes).toBe(8)
    expect(stats.totalPods).toBe(30)
    expect(stats.totalNamespaces).toBe(3)
  })

  it('treats neverConnected clusters as unhealthy for count purposes', () => {
    const stats = computeClusterStats([
      makeCluster({ name: 'a', healthy: false, neverConnected: true, nodeCount: 4, podCount: 0, namespaces: [] }),
    ])
    expect(stats.healthyClusters).toBe(0)
    expect(stats.unhealthyClusters).toBe(1)
    expect(stats.healthyNodes).toBe(0)
    expect(stats.totalNodes).toBe(4)
  })

  it('handles missing nodeCount/podCount/namespaces gracefully', () => {
    const stats = computeClusterStats([
      makeCluster({ name: 'a', healthy: true, nodeCount: undefined, podCount: undefined, namespaces: undefined }),
    ])
    expect(stats).toEqual({
      clusterCount: 1,
      healthyClusters: 1,
      unhealthyClusters: 0,
      healthyNodes: 0,
      totalPods: 0,
      totalNamespaces: 0,
      totalNodes: 0,
    })
  })
})

// ─── resolveStatValue ───────────────────────────────────────────────────────

describe('resolveStatValue', () => {
  it('renders clusters block and wires the click handler', () => {
    const drillToAllClusters = vi.fn()
    const deps = makeDeps({ clusterCount: 4, drillToAllClusters })
    const block = resolveStatValue('clusters', deps)
    expect(block.value).toBe(4)
    expect(block.sublabel).toBe('total clusters')
    expect(block.groundtruthField).toBe('dashboard-clusters-total')
    expect(block.isClickable).toBe(true)
    block.onClick?.()
    expect(drillToAllClusters).toHaveBeenCalledWith()
  })

  it('renders healthy block with the healthy filter', () => {
    const drillToAllClusters = vi.fn()
    const block = resolveStatValue('healthy', makeDeps({ healthyClusters: 3, drillToAllClusters }))
    expect(block.value).toBe(3)
    expect(block.isClickable).toBe(true)
    block.onClick?.()
    expect(drillToAllClusters).toHaveBeenCalledWith('healthy')
  })

  it('renders warnings as an unclickable placeholder of 0', () => {
    const block = resolveStatValue('warnings', makeDeps())
    expect(block.value).toBe(0)
    expect(block.sublabel).toBe('warnings')
    expect(block.isClickable).toBe(false)
    expect(block.onClick).toBeUndefined()
  })

  it('renders errors block with unhealthy filter', () => {
    const drillToAllClusters = vi.fn()
    const block = resolveStatValue('errors', makeDeps({ unhealthyClusters: 2, drillToAllClusters }))
    expect(block.value).toBe(2)
    block.onClick?.()
    expect(drillToAllClusters).toHaveBeenCalledWith('unhealthy')
  })

  it('renders namespaces block that navigates to the namespaces route', () => {
    const navigate = vi.fn()
    const block = resolveStatValue('namespaces', makeDeps({ totalNamespaces: 7, navigate }))
    expect(block.value).toBe(7)
    expect(block.isClickable).toBe(true)
    block.onClick?.()
    expect(navigate).toHaveBeenCalledTimes(1)
    // The route constant is defined in ROUTES.NAMESPACES; we don't hard-code
    // the string here, but we assert navigate received a truthy string arg.
    expect(typeof navigate.mock.calls[0][0]).toBe('string')
  })

  it('renders nodes block with progressValue and max', () => {
    const drillToAllNodes = vi.fn()
    const block = resolveStatValue('nodes', makeDeps({ totalNodes: 8, healthyNodes: 6, drillToAllNodes }))
    expect(block.value).toBe(8)
    expect(block.progressValue).toBe(6)
    expect(block.max).toBe(8)
    block.onClick?.()
    expect(drillToAllNodes).toHaveBeenCalled()
  })

  it('renders pods block and wires the pods drill handler', () => {
    const drillToAllPods = vi.fn()
    const block = resolveStatValue('pods', makeDeps({ totalPods: 100, drillToAllPods }))
    expect(block.value).toBe(100)
    block.onClick?.()
    expect(drillToAllPods).toHaveBeenCalled()
  })

  it('marks blocks as non-clickable when the underlying count is zero', () => {
    const deps = makeDeps({
      clusterCount: 0, healthyClusters: 0, unhealthyClusters: 0,
      totalNamespaces: 0, totalNodes: 0, totalPods: 0,
    })
    for (const id of ['clusters', 'healthy', 'errors', 'namespaces', 'nodes', 'pods']) {
      expect(resolveStatValue(id, deps).isClickable).toBe(false)
    }
  })

  it('returns a placeholder for unknown block ids', () => {
    expect(resolveStatValue('this-is-not-a-real-block', makeDeps())).toEqual({ value: '-' })
  })
})

// ─── computeCurrentCardTypes ────────────────────────────────────────────────

describe('computeCurrentCardTypes', () => {
  it('returns an empty list for no cards', () => {
    expect(computeCurrentCardTypes([])).toEqual([])
  })

  it('returns the card_type for a static card', () => {
    const cards = [{ card_type: 'clusters' } as Card, { card_type: 'nodes' } as Card]
    expect(computeCurrentCardTypes(cards)).toEqual(['clusters', 'nodes'])
  })

  it('encodes dynamic cards with their dynamicCardId', () => {
    const cards = [
      { card_type: 'dynamic_card', config: { dynamicCardId: 'ai-123' } } as unknown as Card,
      { card_type: 'dynamic_card', config: { dynamicCardId: 'ai-456' } } as unknown as Card,
      { card_type: 'static' } as Card,
    ]
    expect(computeCurrentCardTypes(cards)).toEqual([
      'dynamic_card::ai-123',
      'dynamic_card::ai-456',
      'static',
    ])
  })

  it('falls back to plain card_type when a dynamic card is missing dynamicCardId', () => {
    const cards = [
      { card_type: 'dynamic_card', config: {} } as unknown as Card,
      { card_type: 'dynamic_card' } as Card,
    ]
    expect(computeCurrentCardTypes(cards)).toEqual(['dynamic_card', 'dynamic_card'])
  })
})

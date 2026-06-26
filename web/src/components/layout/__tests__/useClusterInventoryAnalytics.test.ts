import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockEmitClusterInventory = vi.fn()

vi.mock('../../../lib/analytics', () => ({
  emitClusterInventory: (...args: unknown[]) => mockEmitClusterInventory(...args),
}))

import { useClusterInventoryAnalytics } from '../useClusterInventoryAnalytics'

type ClusterInventoryItem = {
  distribution?: string
  healthy?: boolean
  reachable?: boolean
}

function createCluster(overrides: ClusterInventoryItem = {}): ClusterInventoryItem {
  return {
    distribution: 'kind',
    healthy: true,
    reachable: true,
    ...overrides,
  }
}

describe('useClusterInventoryAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not emit analytics for an empty cluster list', () => {
    renderHook(() => useClusterInventoryAnalytics([]))

    expect(mockEmitClusterInventory).not.toHaveBeenCalled()
  })

  it('does not emit again when rerendered with the same fingerprint', () => {
    const initialClusters = [
      createCluster({ distribution: 'eks' }),
      createCluster({ distribution: 'gke', healthy: false }),
    ]
    const sameFingerprintClusters = [
      createCluster({ distribution: 'gke', healthy: false }),
      createCluster({ distribution: 'eks' }),
    ]

    const { rerender } = renderHook(
      ({ clusters }) => useClusterInventoryAnalytics(clusters),
      { initialProps: { clusters: initialClusters } },
    )

    rerender({ clusters: sameFingerprintClusters })

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(1)
  })

  it('emits again when the cluster composition changes without a count change', () => {
    const { rerender } = renderHook(
      ({ clusters }) => useClusterInventoryAnalytics(clusters),
      {
        initialProps: {
          clusters: [
            createCluster({ distribution: 'eks' }),
            createCluster({ distribution: 'gke' }),
          ],
        },
      },
    )

    rerender({
      clusters: [
        createCluster({ distribution: 'eks' }),
        createCluster({ distribution: 'aks' }),
      ],
    })

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(2)
    expect(mockEmitClusterInventory).toHaveBeenLastCalledWith({
      total: 2,
      healthy: 2,
      unhealthy: 0,
      unreachable: 0,
      distributions: {
        eks: 1,
        aks: 1,
      },
    })
  })

  it('emits updated totals when the cluster count increases', () => {
    const { rerender } = renderHook(
      ({ clusters }) => useClusterInventoryAnalytics(clusters),
      { initialProps: { clusters: [createCluster({ distribution: 'eks' })] } },
    )

    rerender({
      clusters: [
        createCluster({ distribution: 'eks' }),
        createCluster({ distribution: 'gke' }),
      ],
    })

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(2)
    expect(mockEmitClusterInventory).toHaveBeenLastCalledWith({
      total: 2,
      healthy: 2,
      unhealthy: 0,
      unreachable: 0,
      distributions: {
        eks: 1,
        gke: 1,
      },
    })
  })

  it('counts all clusters under one distribution when they match', () => {
    renderHook(() =>
      useClusterInventoryAnalytics([
        createCluster({ distribution: 'eks' }),
        createCluster({ distribution: 'eks' }),
        createCluster({ distribution: 'eks' }),
      ]),
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledWith({
      total: 3,
      healthy: 3,
      unhealthy: 0,
      unreachable: 0,
      distributions: {
        eks: 3,
      },
    })
  })

  it('counts mixed distributions correctly', () => {
    renderHook(() =>
      useClusterInventoryAnalytics([
        createCluster({ distribution: 'eks' }),
        createCluster({ distribution: 'gke' }),
        createCluster({ distribution: 'eks' }),
        createCluster({ distribution: 'kind' }),
      ]),
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledWith({
      total: 4,
      healthy: 4,
      unhealthy: 0,
      unreachable: 0,
      distributions: {
        eks: 2,
        gke: 1,
        kind: 1,
      },
    })
  })

  it("uses 'unknown' when a cluster distribution is missing", () => {
    renderHook(() =>
      useClusterInventoryAnalytics([
        createCluster({ distribution: undefined }),
        createCluster({ distribution: 'eks' }),
      ]),
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledWith({
      total: 2,
      healthy: 2,
      unhealthy: 0,
      unreachable: 0,
      distributions: {
        unknown: 1,
        eks: 1,
      },
    })
  })

  it('counts unreachable clusters when reachable is false', () => {
    renderHook(() =>
      useClusterInventoryAnalytics([
        createCluster({ reachable: false, healthy: true }),
      ]),
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledWith({
      total: 1,
      healthy: 0,
      unhealthy: 0,
      unreachable: 1,
      distributions: {
        kind: 1,
      },
    })
  })

  it('counts unhealthy reachable clusters when healthy is false', () => {
    renderHook(() =>
      useClusterInventoryAnalytics([
        createCluster({ healthy: false, reachable: true }),
      ]),
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledWith({
      total: 1,
      healthy: 0,
      unhealthy: 1,
      unreachable: 0,
      distributions: {
        kind: 1,
      },
    })
  })

  it('counts healthy clusters by default', () => {
    renderHook(() =>
      useClusterInventoryAnalytics([
        createCluster(),
      ]),
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledWith({
      total: 1,
      healthy: 1,
      unhealthy: 0,
      unreachable: 0,
      distributions: {
        kind: 1,
      },
    })
  })

  it('calculates healthy, unhealthy, and unreachable totals together', () => {
    renderHook(() =>
      useClusterInventoryAnalytics([
        createCluster({ distribution: 'eks' }),
        createCluster({ distribution: 'gke', healthy: false }),
        createCluster({ distribution: 'aks', reachable: false }),
        createCluster({ distribution: 'kind' }),
      ]),
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledWith({
      total: 4,
      healthy: 2,
      unhealthy: 1,
      unreachable: 1,
      distributions: {
        eks: 1,
        gke: 1,
        aks: 1,
        kind: 1,
      },
    })
  })
})

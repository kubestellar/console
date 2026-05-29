import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockEmitClusterInventory = vi.fn()

vi.mock('../../../lib/analytics', () => ({
  emitClusterInventory: (...args: unknown[]) => mockEmitClusterInventory(...args),
}))

import { useClusterInventoryAnalytics } from '../useClusterInventoryAnalytics'

describe('useClusterInventoryAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not emit when clusters array is empty', () => {
    renderHook(() => useClusterInventoryAnalytics([]))

    expect(mockEmitClusterInventory).not.toHaveBeenCalled()
  })

  it('emits analytics when clusters are provided', () => {
    renderHook(() => useClusterInventoryAnalytics([
      { distribution: 'eks', healthy: true, reachable: true },
      { distribution: 'gke', healthy: true, reachable: true },
    ]))

    expect(mockEmitClusterInventory).toHaveBeenCalledWith({
      total: 2,
      healthy: 2,
      unhealthy: 0,
      unreachable: 0,
      distributions: { eks: 1, gke: 1 },
    })
  })

  it('does not re-emit when same clusters are passed again', () => {
    const clusters = [
      { distribution: 'eks', healthy: true, reachable: true },
    ]

    const { rerender } = renderHook(
      (props) => useClusterInventoryAnalytics(props),
      { initialProps: clusters }
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(1)

    // Same data re-rendered
    rerender([...clusters])

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(1)
  })

  it('re-emits when cluster identity changes but count stays the same', () => {
    const { rerender } = renderHook(
      (props) => useClusterInventoryAnalytics(props),
      {
        initialProps: [
          { distribution: 'eks', healthy: true, reachable: true },
          { distribution: 'gke', healthy: true, reachable: true },
        ] as readonly { distribution?: string; healthy?: boolean; reachable?: boolean }[]
      }
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(1)
    expect(mockEmitClusterInventory).toHaveBeenCalledWith(
      expect.objectContaining({ distributions: { eks: 1, gke: 1 } })
    )

    // Replace EKS with AKS — same count (2), different identity
    rerender([
      { distribution: 'aks', healthy: true, reachable: true },
      { distribution: 'gke', healthy: true, reachable: true },
    ])

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(2)
    expect(mockEmitClusterInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ distributions: { aks: 1, gke: 1 } })
    )
  })

  it('re-emits when health status changes but count stays the same', () => {
    const { rerender } = renderHook(
      (props) => useClusterInventoryAnalytics(props),
      {
        initialProps: [
          { distribution: 'eks', healthy: true, reachable: true },
        ] as readonly { distribution?: string; healthy?: boolean; reachable?: boolean }[]
      }
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(1)
    expect(mockEmitClusterInventory).toHaveBeenCalledWith(
      expect.objectContaining({ healthy: 1, unhealthy: 0 })
    )

    // Same cluster becomes unhealthy
    rerender([
      { distribution: 'eks', healthy: false, reachable: true },
    ])

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(2)
    expect(mockEmitClusterInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ healthy: 0, unhealthy: 1 })
    )
  })

  it('correctly counts unreachable clusters', () => {
    renderHook(() => useClusterInventoryAnalytics([
      { distribution: 'eks', healthy: true, reachable: true },
      { distribution: 'gke', healthy: true, reachable: false },
      { distribution: 'aks', healthy: false, reachable: true },
    ]))

    expect(mockEmitClusterInventory).toHaveBeenCalledWith({
      total: 3,
      healthy: 1,
      unhealthy: 1,
      unreachable: 1,
      distributions: { eks: 1, gke: 1, aks: 1 },
    })
  })

  it('uses "unknown" for clusters without a distribution field', () => {
    renderHook(() => useClusterInventoryAnalytics([
      { healthy: true, reachable: true },
      { distribution: 'eks', healthy: true, reachable: true },
    ]))

    expect(mockEmitClusterInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        distributions: { unknown: 1, eks: 1 },
      })
    )
  })

  it('emits when cluster count changes (add)', () => {
    const { rerender } = renderHook(
      (props) => useClusterInventoryAnalytics(props),
      {
        initialProps: [
          { distribution: 'eks', healthy: true, reachable: true },
        ] as readonly { distribution?: string; healthy?: boolean; reachable?: boolean }[]
      }
    )

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(1)

    rerender([
      { distribution: 'eks', healthy: true, reachable: true },
      { distribution: 'gke', healthy: true, reachable: true },
    ])

    expect(mockEmitClusterInventory).toHaveBeenCalledTimes(2)
    expect(mockEmitClusterInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ total: 2 })
    )
  })
})

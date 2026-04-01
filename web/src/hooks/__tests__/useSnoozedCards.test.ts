import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/analytics', () => ({
  emitSnoozed: vi.fn(),
  emitUnsnoozed: vi.fn(),
}))

import { useSnoozedCards } from '../useSnoozedCards'

describe('useSnoozedCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns snoozedSwaps array', () => {
    const { result } = renderHook(() => useSnoozedCards())
    expect(Array.isArray(result.current.snoozedSwaps)).toBe(true)
  })

  it('snoozeSwap adds a swap and returns it', () => {
    const { result } = renderHook(() => useSnoozedCards())
    let swap: unknown
    act(() => {
      swap = result.current.snoozeSwap({
        originalCardId: 'card-1',
        originalCardType: 'cluster',
        originalCardTitle: 'Cluster Card',
        newCardType: 'pod',
        newCardTitle: 'Pod Card',
        reason: 'test swap',
      })
    })
    expect(swap).toHaveProperty('id')
    expect(result.current.snoozedSwaps.length).toBeGreaterThanOrEqual(1)
  })

  it('unsnoozeSwap removes and returns the swap', () => {
    const { result } = renderHook(() => useSnoozedCards())
    let swapId = ''
    act(() => {
      const swap = result.current.snoozeSwap({
        originalCardId: 'card-2',
        originalCardType: 'cluster',
        originalCardTitle: 'Cluster',
        newCardType: 'pod',
        newCardTitle: 'Pod',
        reason: 'test',
      })
      swapId = swap.id
    })

    let removed: unknown
    act(() => {
      removed = result.current.unsnoozeSwap(swapId)
    })
    expect(removed).toHaveProperty('id', swapId)
  })

  it('dismissSwap removes without returning', () => {
    const { result } = renderHook(() => useSnoozedCards())
    let swapId = ''
    act(() => {
      const swap = result.current.snoozeSwap({
        originalCardId: 'card-3',
        originalCardType: 'node',
        originalCardTitle: 'Node',
        newCardType: 'pod',
        newCardTitle: 'Pod',
        reason: 'dismiss test',
      })
      swapId = swap.id
    })
    act(() => { result.current.dismissSwap(swapId) })
    // The swap should be removed
    const found = result.current.snoozedSwaps.find(s => s.id === swapId)
    expect(found).toBeUndefined()
  })

  it('provides getActiveSwaps and getExpiredSwaps', () => {
    const { result } = renderHook(() => useSnoozedCards())
    expect(typeof result.current.getActiveSwaps).toBe('function')
    expect(typeof result.current.getExpiredSwaps).toBe('function')
  })
})

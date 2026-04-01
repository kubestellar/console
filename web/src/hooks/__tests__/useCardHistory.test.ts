import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCardHistory } from '../useCardHistory'

describe('useCardHistory', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('returns empty history initially', () => {
    const { result } = renderHook(() => useCardHistory())
    expect(result.current.history).toEqual([])
  })

  it('loads existing history from localStorage', () => {
    const existing = [
      { id: 'h1', cardId: 'c1', cardType: 'cluster', action: 'added', config: {}, timestamp: 100 },
    ]
    localStorage.setItem('kubestellar-card-history', JSON.stringify(existing))
    const { result } = renderHook(() => useCardHistory())
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].cardId).toBe('c1')
  })

  it('handles corrupt localStorage data gracefully', () => {
    localStorage.setItem('kubestellar-card-history', 'not-json')
    const { result } = renderHook(() => useCardHistory())
    expect(result.current.history).toEqual([])
  })

  it('recordCardAdded adds entry with action "added"', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardAdded('c1', 'cluster', 'Cluster Card', {}, 'dash1', 'My Dashboard')
    })
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].action).toBe('added')
    expect(result.current.history[0].cardType).toBe('cluster')
  })

  it('recordCardRemoved adds entry with action "removed"', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardRemoved('c1', 'cluster', 'Cluster Card')
    })
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].action).toBe('removed')
  })

  it('recordCardReplaced adds entry with previousCardType', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardReplaced('c1', 'new-type', 'old-type', 'Title')
    })
    expect(result.current.history[0].action).toBe('replaced')
    expect(result.current.history[0].previousCardType).toBe('old-type')
    expect(result.current.history[0].cardType).toBe('new-type')
  })

  it('recordCardConfigured adds entry with action "configured"', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardConfigured('c1', 'cluster', 'Title', { key: 'val' })
    })
    expect(result.current.history[0].action).toBe('configured')
    expect(result.current.history[0].config).toEqual({ key: 'val' })
  })

  it('getRemovedCards filters for removed entries only', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardAdded('c1', 'cluster')
      result.current.recordCardRemoved('c2', 'pod')
      result.current.recordCardRemoved('c3', 'node')
    })
    const removed = result.current.getRemovedCards()
    expect(removed).toHaveLength(2)
    expect(removed.every(e => e.action === 'removed')).toBe(true)
  })

  it('clearHistory removes all entries', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardAdded('c1', 'cluster')
      result.current.recordCardAdded('c2', 'pod')
    })
    expect(result.current.history).toHaveLength(2)
    act(() => { result.current.clearHistory() })
    expect(result.current.history).toHaveLength(0)
  })

  it('removeEntry removes a specific entry by id', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardAdded('c1', 'cluster')
      result.current.recordCardAdded('c2', 'pod')
    })
    const idToRemove = result.current.history[0].id
    act(() => { result.current.removeEntry(idToRemove) })
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].id).not.toBe(idToRemove)
  })

  it('caps history at 100 entries', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      for (let i = 0; i < 110; i++) {
        result.current.recordCardAdded(`c${i}`, 'cluster')
      }
    })
    expect(result.current.history.length).toBeLessThanOrEqual(100)
  })

  it('persists history to localStorage on change', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardAdded('c1', 'cluster')
    })
    const stored = JSON.parse(localStorage.getItem('kubestellar-card-history') || '[]')
    expect(stored).toHaveLength(1)
  })
})

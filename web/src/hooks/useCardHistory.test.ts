import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCardHistory, type CardHistoryEntry } from './useCardHistory'

const STORAGE_KEY = 'kubestellar-card-history'

describe('useCardHistory', () => {
  let uuidCounter = 0

  beforeEach(() => {
    localStorage.clear()
    uuidCounter = 0
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => `uuid-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`
    )
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  })

  it('starts with an empty history when nothing is stored', () => {
    const { result } = renderHook(() => useCardHistory())
    expect(result.current.history).toEqual([])
  })

  it('hydrates history from localStorage', () => {
    const persisted: CardHistoryEntry[] = [
      {
        id: 'old',
        cardId: 'card-1',
        cardType: 'metrics',
        config: {},
        action: 'added',
        timestamp: 1,
      },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
    const { result } = renderHook(() => useCardHistory())
    expect(result.current.history).toEqual(persisted)
  })

  it('returns an empty array when storage contains malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useCardHistory())
    expect(result.current.history).toEqual([])
    errorSpy.mockRestore()
  })

  it('returns an empty array when storage contains a non-array JSON value', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }))
    const { result } = renderHook(() => useCardHistory())
    expect(result.current.history).toEqual([])
  })

  it('records added cards and prepends new entries', () => {
    const { result } = renderHook(() => useCardHistory())

    act(() => {
      result.current.recordCardAdded('card-1', 'metrics', 'Metrics', { period: '1h' }, 'dash-1', 'Main')
    })
    act(() => {
      result.current.recordCardAdded('card-2', 'logs')
    })

    expect(result.current.history).toHaveLength(2)
    expect(result.current.history[0]).toMatchObject({
      cardId: 'card-2',
      cardType: 'logs',
      action: 'added',
      config: {},
      timestamp: 1_700_000_000_000,
    })
    expect(result.current.history[1]).toMatchObject({
      cardId: 'card-1',
      cardType: 'metrics',
      cardTitle: 'Metrics',
      config: { period: '1h' },
      dashboardId: 'dash-1',
      dashboardName: 'Main',
      action: 'added',
    })
  })

  it('records removed, replaced, and configured actions with proper fields', () => {
    const { result } = renderHook(() => useCardHistory())

    act(() => {
      result.current.recordCardRemoved('c1', 'metrics', 'Metrics', { x: 1 }, 'd1', 'Dash')
    })
    act(() => {
      result.current.recordCardReplaced('c1', 'logs', 'metrics', 'Logs', { y: 2 })
    })
    act(() => {
      result.current.recordCardConfigured('c1', 'logs')
    })

    const [configured, replaced, removed] = result.current.history
    expect(configured.action).toBe('configured')
    expect(replaced.action).toBe('replaced')
    expect(replaced.previousCardType).toBe('metrics')
    expect(replaced.cardType).toBe('logs')
    expect(removed.action).toBe('removed')
    expect(removed.config).toEqual({ x: 1 })
  })

  it('caps history at 100 entries (MAX_HISTORY)', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      for (let i = 0; i < 105; i++) {
        result.current.recordCardAdded(`card-${i}`, 'metrics')
      }
    })
    expect(result.current.history).toHaveLength(100)
    // Newest entry is first, and it corresponds to the last recorded card.
    expect(result.current.history[0].cardId).toBe('card-104')
    expect(result.current.history[99].cardId).toBe('card-5')
  })

  it('filters removed entries via getRemovedCards', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardAdded('c1', 'metrics')
      result.current.recordCardRemoved('c2', 'logs')
      result.current.recordCardConfigured('c3', 'events')
    })
    const removed = result.current.getRemovedCards()
    expect(removed).toHaveLength(1)
    expect(removed[0].cardId).toBe('c2')
  })

  it('clears the entire history', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardAdded('c1', 'metrics')
      result.current.recordCardAdded('c2', 'logs')
    })
    expect(result.current.history).toHaveLength(2)

    act(() => {
      result.current.clearHistory()
    })
    expect(result.current.history).toEqual([])
  })

  it('removes a single entry by id', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.recordCardAdded('c1', 'metrics')
      result.current.recordCardAdded('c2', 'logs')
    })
    const targetId = result.current.history[0].id
    act(() => {
      result.current.removeEntry(targetId)
    })
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history.find((e) => e.id === targetId)).toBeUndefined()
  })

  it('addEntry auto-populates id and timestamp', () => {
    const { result } = renderHook(() => useCardHistory())
    act(() => {
      result.current.addEntry({
        cardId: 'c1',
        cardType: 'metrics',
        config: {},
        action: 'added',
      })
    })
    const entry = result.current.history[0]
    expect(entry.id).toBe('uuid-1')
    expect(entry.timestamp).toBe(1_700_000_000_000)
  })
})

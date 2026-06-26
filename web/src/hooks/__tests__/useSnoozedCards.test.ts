import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/analytics', () => ({
  emitSnoozed: vi.fn(),
  emitUnsnoozed: vi.fn(),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, POLL_INTERVAL_SLOW_MS: 60_000 }
})

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get _store() { return store },
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('useSnoozedCards', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorageMock.clear()
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function importHook() {
    const mod = await import('../useSnoozedCards')
    return mod
  }

  it('returns snoozedSwaps array', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())
    expect(Array.isArray(result.current.snoozedSwaps)).toBe(true)
  })

  it('snoozeSwap adds a swap and returns it', async () => {
    const { useSnoozedCards } = await importHook()
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
    expect(swap).toHaveProperty('snoozedAt')
    expect(swap).toHaveProperty('snoozedUntil')
    expect(result.current.snoozedSwaps.length).toBeGreaterThanOrEqual(1)
  })

  it('persists snoozed swaps to localStorage', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())
    act(() => {
      result.current.snoozeSwap({
        originalCardId: 'card-persist',
        originalCardType: 'cluster',
        originalCardTitle: 'Cluster',
        newCardType: 'pod',
        newCardTitle: 'Pod',
        reason: 'persist test',
      })
    })
    expect(localStorageMock.setItem).toHaveBeenCalled()
    const stored = JSON.parse(localStorageMock._store['kubestellar-snoozed-cards'] || '{}')
    expect(stored.swaps.length).toBeGreaterThanOrEqual(1)
    expect(stored.swaps[0].originalCardId).toBe('card-persist')
  })

  it('unsnoozeSwap removes and returns the swap', async () => {
    const { useSnoozedCards } = await importHook()
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

  it('dismissSwap removes without returning', async () => {
    const { useSnoozedCards } = await importHook()
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
    const found = result.current.snoozedSwaps.find(s => s.id === swapId)
    expect(found).toBeUndefined()
  })

  it('provides getActiveSwaps and getExpiredSwaps', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())
    expect(typeof result.current.getActiveSwaps).toBe('function')
    expect(typeof result.current.getExpiredSwaps).toBe('function')
  })

  it('isCardSnoozed returns true for snoozed cards', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())
    act(() => {
      result.current.snoozeSwap({
        originalCardId: 'card-snoozed',
        originalCardType: 'cluster',
        originalCardTitle: 'Cluster',
        newCardType: 'pod',
        newCardTitle: 'Pod',
        reason: 'test',
      })
    })
    expect(result.current.isCardSnoozed('card-snoozed')).toBe(true)
    expect(result.current.isCardSnoozed('card-not-snoozed')).toBe(false)
  })

  it('hydrates persisted snoozed cards before the first render', async () => {
    const now = Date.now()
    localStorageMock.setItem(
      'kubestellar-snoozed-cards',
      JSON.stringify({
        swaps: [
          {
            id: 'snooze-persisted',
            originalCardId: 'persisted-card',
            originalCardType: 'cluster',
            originalCardTitle: 'Cluster',
            newCardType: 'pod',
            newCardTitle: 'Pod',
            reason: 'persisted',
            snoozedAt: now,
            snoozedUntil: now + 60 * 60 * 1000,
          },
        ],
      })
    )

    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())

    expect(result.current.isCardSnoozed('persisted-card')).toBe(true)
    expect(result.current.snoozedSwaps).toHaveLength(1)
  })

  it('snoozedUntil uses duration parameter', async () => {
    const { useSnoozedCards } = await importHook()
    const { result } = renderHook(() => useSnoozedCards())
    const FIVE_MINUTES_MS = 5 * 60 * 1000
    const now = Date.now()
    let swap: ReturnType<typeof result.current.snoozeSwap> | undefined
    act(() => {
      swap = result.current.snoozeSwap({
        originalCardId: 'card-duration',
        originalCardType: 'cluster',
        originalCardTitle: 'Cluster',
        newCardType: 'pod',
        newCardTitle: 'Pod',
        reason: 'duration test',
      }, FIVE_MINUTES_MS)
    })
    expect(swap!.snoozedUntil).toBe(now + FIVE_MINUTES_MS)
  })
})

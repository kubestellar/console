import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import * as localStorageUtils from '../../lib/utils/localStorage'
import { useDashboardReset } from '../useDashboardReset'

interface TestCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
  position?: { w: number; h: number }
}

const DEFAULT_CARDS: TestCard[] = [
  { id: 'default-1', card_type: 'cluster', config: {} },
  { id: 'default-2', card_type: 'pods', config: {} },
  { id: 'default-3', card_type: 'nodes', config: {} },
]

const STORAGE_KEY = 'test-dashboard-cards'

describe('useDashboardReset', () => {
  let cards: TestCard[]
  let setCardsFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    cards = [
      { id: 'custom-1', card_type: 'cluster', config: {} },
      { id: 'custom-2', card_type: 'custom-widget', config: {} },
    ]
    setCardsFn = vi.fn((newCards: TestCard[]) => { cards = newCards })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports not customized when no localStorage key exists', () => {
    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))
    expect(result.current.isCustomized).toBe(false)
  })

  it('reports customized when localStorage key exists', () => {
    localStorage.setItem(STORAGE_KEY, 'anything')
    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))
    expect(result.current.isCustomized).toBe(true)
  })

  it('falls back to not customized when safeGetItem returns null during init', () => {
    const safeGetItemSpy = vi.spyOn(localStorageUtils, 'safeGetItem').mockReturnValue(null)

    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))

    expect(result.current.isCustomized).toBe(false)
    expect(safeGetItemSpy).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('resetToDefaults replaces cards with defaults and clears storage', () => {
    localStorage.setItem(STORAGE_KEY, 'something')
    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))
    act(() => { result.current.resetToDefaults() })
    expect(setCardsFn).toHaveBeenCalledWith(DEFAULT_CARDS)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.isCustomized).toBe(false)
  })

  it('resetToDefaults still clears customized state when safeRemoveItem reports failure', () => {
    localStorage.setItem(STORAGE_KEY, 'something')
    const safeRemoveItemSpy = vi.spyOn(localStorageUtils, 'safeRemoveItem').mockReturnValue(false)

    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))

    expect(() => {
      act(() => { result.current.resetToDefaults() })
    }).not.toThrow()
    expect(setCardsFn).toHaveBeenCalledWith(DEFAULT_CARDS)
    expect(result.current.isCustomized).toBe(false)
    expect(safeRemoveItemSpy).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('addMissingDefaults adds only missing default cards', () => {
    // cards already has 'cluster', missing 'pods' and 'nodes'
    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))
    let addedCount = 0
    act(() => { addedCount = result.current.addMissingDefaults() })
    expect(addedCount).toBe(2)
    expect(setCardsFn).toHaveBeenCalled()
    const newCards = setCardsFn.mock.calls[0][0] as TestCard[]
    expect(newCards.length).toBe(4) // 2 existing + 2 missing
  })

  it('addMissingDefaults returns 0 when all defaults present', () => {
    cards = DEFAULT_CARDS.map(c => ({ ...c }))
    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))
    let addedCount = 0
    act(() => { addedCount = result.current.addMissingDefaults() })
    expect(addedCount).toBe(0)
    expect(setCardsFn).not.toHaveBeenCalled()
  })

  it('addMissingDefaults restores duplicate card types when configs differ', () => {
    const duplicateDefaults: TestCard[] = [
      { id: 'default-workloads-all', card_type: 'workloads', config: { namespace: 'all' } },
      { id: 'default-workloads-team-a', card_type: 'workloads', config: { namespace: 'team-a' } },
    ]
    cards = [duplicateDefaults[0]]

    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: duplicateDefaults,
      setCards: setCardsFn,
      cards,
    }))

    let addedCount = 0
    act(() => { addedCount = result.current.addMissingDefaults() })

    expect(addedCount).toBe(1)
    const newCards = setCardsFn.mock.calls[0][0] as TestCard[]
    expect(newCards).toHaveLength(2)
    expect(newCards[1].card_type).toBe('workloads')
    expect(newCards[1].config).toEqual({ namespace: 'team-a' })
  })

  it('addMissingDefaults matches existing default cards by id before config', () => {
    cards = DEFAULT_CARDS.map(card =>
      card.id === 'default-1'
        ? {
            ...card,
            config: { scope: 'customized' },
            title: 'Custom title',
            position: { w: 6, h: 3 },
          }
        : { ...card }
    )

    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))

    let addedCount = 0
    act(() => { addedCount = result.current.addMissingDefaults() })

    expect(addedCount).toBe(0)
    expect(setCardsFn).not.toHaveBeenCalled()
  })

  it('addMissingDefaults restores duplicate card types when positions differ', () => {
    const duplicateDefaults: TestCard[] = [
      { id: 'default-workloads-compact', card_type: 'workloads', config: {}, position: { w: 4, h: 2 } },
      { id: 'default-workloads-expanded', card_type: 'workloads', config: {}, position: { w: 8, h: 4 } },
    ]
    cards = [duplicateDefaults[0]]

    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: duplicateDefaults,
      setCards: setCardsFn,
      cards,
    }))

    let addedCount = 0
    act(() => { addedCount = result.current.addMissingDefaults() })

    expect(addedCount).toBe(1)
    const newCards = setCardsFn.mock.calls[0][0] as TestCard[]
    expect(newCards).toHaveLength(2)
    expect(newCards[1].position).toEqual({ w: 8, h: 4 })
  })

  it('reset with "replace" mode returns default card count', () => {
    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))
    let count = 0
    act(() => { count = result.current.reset('replace') })
    expect(count).toBe(DEFAULT_CARDS.length)
  })

  it('reset with "add_missing" mode returns missing count', () => {
    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))
    let count = 0
    act(() => { count = result.current.reset('add_missing') })
    expect(count).toBe(2) // pods and nodes missing
  })

  it('setCustomized manually updates customized state', () => {
    const { result } = renderHook(() => useDashboardReset({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_CARDS,
      setCards: setCardsFn,
      cards,
    }))
    act(() => { result.current.setCustomized(true) })
    expect(result.current.isCustomized).toBe(true)
    act(() => { result.current.setCustomized(false) })
    expect(result.current.isCustomized).toBe(false)
  })
})

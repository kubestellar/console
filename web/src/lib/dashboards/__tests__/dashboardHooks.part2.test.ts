import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  mockSetAutoRefreshPaused,
  STORAGE_KEY,
  DEFAULT_PLACEMENTS,
  expectedDefaultCards,
} from './dashboardHooks.setup'
import type { DashboardCard } from './dashboardHooks.setup'
import {
  useDashboardDnD,
  useDashboardAutoRefresh,
  useDashboardModals,
  useDashboardShowCards,
  useDashboard,
} from '../dashboardHooks'

describe('useDashboardDnD', () => {
  it('tracks active drag id on drag start', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const setItems = vi.fn()

    const { result } = renderHook(() => useDashboardDnD(items, setItems))

    expect(result.current.activeId).toBeNull()
    expect(result.current.activeDragData).toBeNull()

    act(() => {
      result.current.handleDragStart({
        active: { id: 'b', data: { current: { label: 'Card B' } } },
      } as unknown as import('@dnd-kit/core').DragStartEvent)
    })

    expect(result.current.activeId).toBe('b')
    expect(result.current.activeDragData).toEqual({ label: 'Card B' })
  })

  it('reorders items when drag ends over a different item', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    let capturedSetter: ((prev: typeof items) => typeof items) | null = null
    const setItems = vi.fn((fn: React.SetStateAction<typeof items>) => {
      if (typeof fn === 'function') capturedSetter = fn
    })

    const { result } = renderHook(() => useDashboardDnD(items, setItems))

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'a' },
        over: { id: 'c' },
      } as unknown as import('@dnd-kit/core').DragEndEvent)
    })

    expect(result.current.activeId).toBeNull()
    expect(setItems).toHaveBeenCalled()

    // Execute the setter to verify reorder logic
    const reordered = capturedSetter!(items)
    expect(reordered.map(i => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not reorder when drag ends on same item', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    const setItems = vi.fn()

    const { result } = renderHook(() => useDashboardDnD(items, setItems))

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'a' },
        over: { id: 'a' },
      } as unknown as import('@dnd-kit/core').DragEndEvent)
    })

    expect(setItems).not.toHaveBeenCalled()
  })

  it('does not reorder when drag ends with no target', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    const setItems = vi.fn()

    const { result } = renderHook(() => useDashboardDnD(items, setItems))

    act(() => {
      result.current.handleDragEnd({
        active: { id: 'a' },
        over: null,
      } as unknown as import('@dnd-kit/core').DragEndEvent)
    })

    expect(setItems).not.toHaveBeenCalled()
  })
})

// ============================================================================
// useDashboardAutoRefresh
// ============================================================================

describe('useDashboardAutoRefresh', () => {
  it('calls refresh function at the specified interval', () => {
    const refreshFn = vi.fn()
    const INTERVAL_MS = 5000

    renderHook(() => useDashboardAutoRefresh(refreshFn, INTERVAL_MS))

    act(() => { vi.advanceTimersByTime(INTERVAL_MS) })
    expect(refreshFn).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(INTERVAL_MS) })
    expect(refreshFn).toHaveBeenCalledTimes(2)
  })

  it('stops refresh when auto-refresh is disabled', () => {
    const refreshFn = vi.fn()
    const INTERVAL_MS = 5000

    const { result } = renderHook(() => useDashboardAutoRefresh(refreshFn, INTERVAL_MS))

    act(() => { result.current.setAutoRefresh(false) })
    act(() => { vi.advanceTimersByTime(INTERVAL_MS * 3) })

    expect(refreshFn).not.toHaveBeenCalled()
  })

  it('propagates auto-refresh state to global cache layer', () => {
    const refreshFn = vi.fn()

    const { result } = renderHook(() => useDashboardAutoRefresh(refreshFn))

    // Initially enabled, so paused = false
    expect(mockSetAutoRefreshPaused).toHaveBeenCalledWith(false)

    act(() => { result.current.setAutoRefresh(false) })
    expect(mockSetAutoRefreshPaused).toHaveBeenCalledWith(true)
  })

  it('respects initialEnabled = false', () => {
    const refreshFn = vi.fn()
    const INTERVAL_MS = 1000
    const INITIAL_ENABLED = false

    const { result } = renderHook(() =>
      useDashboardAutoRefresh(refreshFn, INTERVAL_MS, INITIAL_ENABLED)
    )

    expect(result.current.autoRefresh).toBe(false)
    act(() => { vi.advanceTimersByTime(INTERVAL_MS * 3) })
    expect(refreshFn).not.toHaveBeenCalled()
  })
})

// ============================================================================
// useDashboardModals
// ============================================================================

describe('useDashboardModals', () => {
  it('starts with all modals closed and no configuring card', () => {
    const { result } = renderHook(() => useDashboardModals())

    expect(result.current.showAddCard).toBe(false)
    expect(result.current.showTemplates).toBe(false)
    expect(result.current.configuringCard).toBeNull()
  })

  it('toggles add card modal', () => {
    const { result } = renderHook(() => useDashboardModals())

    act(() => { result.current.setShowAddCard(true) })
    expect(result.current.showAddCard).toBe(true)

    act(() => { result.current.setShowAddCard(false) })
    expect(result.current.showAddCard).toBe(false)
  })

  it('toggles templates modal', () => {
    const { result } = renderHook(() => useDashboardModals())

    act(() => { result.current.setShowTemplates(true) })
    expect(result.current.showTemplates).toBe(true)
  })

  it('openConfigureCard finds card by id from internal ref', () => {
    const { result } = renderHook(() => useDashboardModals())
    const cards: DashboardCard[] = [
      { id: 'abc', card_type: 'metric', config: { x: 1 } },
      { id: 'def', card_type: 'chart', config: {} },
    ]

    act(() => { result.current._setCardsRef(cards) })
    act(() => { result.current.openConfigureCard('def') })

    expect(result.current.configuringCard).toEqual(cards[1])
  })

  it('openConfigureCard does nothing for non-existent id', () => {
    const { result } = renderHook(() => useDashboardModals())

    act(() => { result.current._setCardsRef([]) })
    act(() => { result.current.openConfigureCard('missing') })

    expect(result.current.configuringCard).toBeNull()
  })

  it('closeConfigureCard clears configuring card', () => {
    const { result } = renderHook(() => useDashboardModals())
    const card: DashboardCard = { id: 'x', card_type: 't', config: {} }

    act(() => { result.current.setConfiguringCard(card) })
    expect(result.current.configuringCard).not.toBeNull()

    act(() => { result.current.closeConfigureCard() })
    expect(result.current.configuringCard).toBeNull()
  })
})

// ============================================================================
// useDashboardShowCards
// ============================================================================

describe('useDashboardShowCards', () => {
  it('defaults to visible when no localStorage value', () => {
    const { result } = renderHook(() => useDashboardShowCards(STORAGE_KEY))
    expect(result.current.showCards).toBe(true)
  })

  it('restores collapsed state from localStorage', () => {
    localStorage.setItem(`${STORAGE_KEY}-cards-visible`, 'false')

    const { result } = renderHook(() => useDashboardShowCards(STORAGE_KEY))
    expect(result.current.showCards).toBe(false)
  })

  it('expandCards sets showCards to true', () => {
    localStorage.setItem(`${STORAGE_KEY}-cards-visible`, 'false')
    const { result } = renderHook(() => useDashboardShowCards(STORAGE_KEY))

    act(() => { result.current.expandCards() })
    expect(result.current.showCards).toBe(true)
  })

  it('collapseCards sets showCards to false', () => {
    const { result } = renderHook(() => useDashboardShowCards(STORAGE_KEY))

    act(() => { result.current.collapseCards() })
    expect(result.current.showCards).toBe(false)
  })

  it('persists visibility state to localStorage', () => {
    const { result } = renderHook(() => useDashboardShowCards(STORAGE_KEY))

    act(() => { result.current.collapseCards() })
    expect(localStorage.getItem(`${STORAGE_KEY}-cards-visible`)).toBe('false')

    act(() => { result.current.expandCards() })
    expect(localStorage.getItem(`${STORAGE_KEY}-cards-visible`)).toBe('true')
  })
})

// ============================================================================
// useDashboard — combined hook
// ============================================================================

describe('useDashboard', () => {
  it('composes all sub-hooks into a single result', () => {
    const onRefresh = vi.fn()
    const { result } = renderHook(() => useDashboard({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_PLACEMENTS,
      onRefresh,
      autoRefreshInterval: 10000,
    }))

    // Card management
    expect(result.current.cards).toEqual(expectedDefaultCards())
    expect(typeof result.current.addCards).toBe('function')
    expect(typeof result.current.removeCard).toBe('function')
    expect(typeof result.current.configureCard).toBe('function')
    expect(typeof result.current.updateCardWidth).toBe('function')
    expect(typeof result.current.reset).toBe('function')

    // DnD
    expect(result.current.dnd).toBeDefined()
    expect(result.current.dnd.activeId).toBeNull()

    // Modals
    expect(result.current.showAddCard).toBe(false)
    expect(result.current.showTemplates).toBe(false)
    expect(result.current.configuringCard).toBeNull()

    // ShowCards
    expect(result.current.showCards).toBe(true)

    // AutoRefresh
    expect(result.current.autoRefresh).toBe(true)

    // Undo/Redo
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)

    // Sync
    expect(typeof result.current.syncWithBackend).toBe('function')
  })

  it('defaults autoRefreshInterval to 30000 when not provided', () => {
    const onRefresh = vi.fn()
    const DEFAULT_INTERVAL_MS = 30000

    renderHook(() => useDashboard({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_PLACEMENTS,
      onRefresh,
    }))

    act(() => { vi.advanceTimersByTime(DEFAULT_INTERVAL_MS) })
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('wires modal cards ref so openConfigureCard works', () => {
    const { result } = renderHook(() => useDashboard({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_PLACEMENTS,
    }))

    const targetId = result.current.cards[1].id
    act(() => { result.current.openConfigureCard(targetId) })

    expect(result.current.configuringCard).not.toBeNull()
    expect(result.current.configuringCard!.id).toBe(targetId)
  })

  it('card mutations flow through the combined hook', () => {
    const { result } = renderHook(() => useDashboard({
      storageKey: STORAGE_KEY,
      defaultCards: DEFAULT_PLACEMENTS,
    }))

    // Add, then undo
    act(() => { result.current.addCards([{ type: 'combo_test' }]) })
    expect(result.current.cards).toHaveLength(4)

    act(() => { result.current.undo() })
    expect(result.current.cards).toHaveLength(3)
  })
})

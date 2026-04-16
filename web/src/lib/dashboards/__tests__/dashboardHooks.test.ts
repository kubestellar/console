import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFullSync = vi.fn<(key: string) => Promise<import('../types').DashboardCard[] | null>>()
const mockSaveCards = vi.fn()
const mockIsAuthenticated = vi.fn(() => false)
const mockClearCache = vi.fn()

vi.mock('../dashboardSync', () => ({
  dashboardSync: {
    fullSync: (...args: unknown[]) => mockFullSync(args[0] as string),
    saveCards: (...args: unknown[]) => mockSaveCards(...args),
    isAuthenticated: () => mockIsAuthenticated(),
    clearCache: () => mockClearCache(),
  },
}))

const mockSetAutoRefreshPaused = vi.fn()
vi.mock('../../cache', () => ({
  setAutoRefreshPaused: (...args: unknown[]) => mockSetAutoRefreshPaused(...args),
}))

// Allow all card types through the prune filter so synthetic test types
// (card_a, saved_card, x, etc.) are not filtered out during localStorage restore.
vi.mock('../../../config/cards', () => ({
  hasUnifiedConfig: () => true,
}))
vi.mock('../../../components/cards/cardRegistry', () => ({
  isCardTypeRegistered: () => true,
}))

// Mock requestAnimationFrame for undo/redo
vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 0 })

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import type { DashboardCard, DashboardCardPlacement, NewCardInput } from '../types'
import {
  useDashboardDnD,
  useDashboardCards,
  useDashboardAutoRefresh,
  useDashboardModals,
  useDashboardShowCards,
  useDashboard,
} from '../dashboardHooks'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'test-dashboard-cards'

const DEFAULT_PLACEMENTS: DashboardCardPlacement[] = [
  { type: 'card_a', position: { w: 4, h: 2 } },
  { type: 'card_b', config: { filter: 'active' }, position: { w: 6, h: 3 } },
  { type: 'card_c', title: 'Custom Title', position: { w: 4, h: 2 } },
]

/** Build a minimal DashboardCard from type and index */
function makeCard(type: string, index: number): DashboardCard {
  return {
    id: `default-${type}-${index}`,
    card_type: type,
    config: {},
    position: { w: 4, h: 2 },
  }
}

function expectedDefaultCards(): DashboardCard[] {
  return [
    { id: 'default-card_a-0', card_type: 'card_a', config: {}, title: undefined, position: { w: 4, h: 2 } },
    { id: 'default-card_b-1', card_type: 'card_b', config: { filter: 'active' }, title: undefined, position: { w: 6, h: 3 } },
    { id: 'default-card_c-2', card_type: 'card_c', config: {}, title: 'Custom Title', position: { w: 4, h: 2 } },
  ]
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// useDashboardCards — CRUD, persistence, undo/redo
// ============================================================================

describe('useDashboardCards', () => {
  // ---------- Initialisation ----------

  it('returns default cards when localStorage is empty', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const defaults = expectedDefaultCards()
    expect(result.current.cards).toEqual(defaults)
    expect(result.current.isCustomized).toBe(false)
  })

  it('restores cards from localStorage on mount', () => {
    const stored: DashboardCard[] = [
      makeCard('saved_card', 0),
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    expect(result.current.cards).toHaveLength(1)
    expect(result.current.cards[0].card_type).toBe('saved_card')
  })

  it('falls back to defaults when localStorage contains invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '!!!not-json!!!')

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    expect(result.current.cards).toEqual(expectedDefaultCards())
  })

  it('patches cards that have no position object (corrupt/old data)', () => {
    const corruptCards = [
      { id: 'c-1', card_type: 'x', config: {} },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(corruptCards))

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    expect(result.current.cards[0].position).toEqual({ w: 4, h: 2 })
  })

  // ---------- addCards ----------

  it('adds a single card to the front of the list', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const input: NewCardInput[] = [{ type: 'new_widget', title: 'Freshly Added' }]

    act(() => { result.current.addCards(input) })

    expect(result.current.cards[0].card_type).toBe('new_widget')
    expect(result.current.cards[0].title).toBe('Freshly Added')
    // ID should be generated, not "default-"
    expect(result.current.cards[0].id).toMatch(/^card-/)
    expect(result.current.isCustomized).toBe(true)
  })

  it('adds multiple cards at once when count is within batch threshold', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const inputs: NewCardInput[] = Array.from({ length: 4 }, (_, i) => ({
      type: `widget_${i}`,
    }))

    act(() => { result.current.addCards(inputs) })

    // 4 new + 3 defaults = 7
    expect(result.current.cards).toHaveLength(7)
  })

  it('batches card additions when many cards are added at once', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const TOTAL_CARDS = 12
    const inputs: NewCardInput[] = Array.from({ length: TOTAL_CARDS }, (_, i) => ({
      type: `bulk_${i}`,
    }))

    act(() => {
      result.current.addCards(inputs)
      // Advance timers to process remaining batches (50ms per batch)
      vi.advanceTimersByTime(500)
    })

    // All 12 new cards should be prepended to the 3 defaults
    const newCards = result.current.cards.filter(c => c.card_type.startsWith('bulk_'))
    expect(newCards).toHaveLength(TOTAL_CARDS)
  })

  it('adds cards with config passed through', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const input: NewCardInput[] = [{ type: 'metric', config: { cluster: 'prod' } }]

    act(() => { result.current.addCards(input) })
    expect(result.current.cards[0].config).toEqual({ cluster: 'prod' })
  })

  // ---------- removeCard ----------

  it('removes a card by id', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const idToRemove = result.current.cards[1].id

    act(() => { result.current.removeCard(idToRemove) })

    expect(result.current.cards).toHaveLength(2)
    expect(result.current.cards.find(c => c.id === idToRemove)).toBeUndefined()
  })

  it('is a no-op when removing a non-existent id', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const before = result.current.cards.length

    act(() => { result.current.removeCard('does-not-exist') })

    expect(result.current.cards).toHaveLength(before)
  })

  // ---------- configureCard ----------

  it('updates card config immutably', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const targetId = result.current.cards[0].id
    const newConfig = { namespace: 'kube-system', limit: 50 }

    act(() => { result.current.configureCard(targetId, newConfig) })

    expect(result.current.cards[0].config).toEqual(newConfig)
    // Other cards unchanged
    expect(result.current.cards[1].config).toEqual({ filter: 'active' })
  })

  // ---------- updateCardWidth ----------

  it('updates card width while preserving height', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const targetId = result.current.cards[1].id
    // card_b has position { w: 6, h: 3 }

    act(() => { result.current.updateCardWidth(targetId, 12) })

    expect(result.current.cards[1].position).toEqual({ w: 12, h: 3 })
  })

  it('creates default position when updating width on a card with no position', () => {
    // Seed a card with no position
    const noPos: DashboardCard[] = [{ id: 'np', card_type: 'x', config: {} }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(noPos))

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))

    act(() => { result.current.updateCardWidth('np', 8) })

    expect(result.current.cards[0].position).toEqual({ w: 8, h: 2 })
  })

  // ---------- reset ----------

  it('resets cards to defaults after customization', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))

    act(() => { result.current.addCards([{ type: 'extra' }]) })
    expect(result.current.isCustomized).toBe(true)

    act(() => { result.current.reset() })
    expect(result.current.cards).toEqual(expectedDefaultCards())
    expect(result.current.isCustomized).toBe(false)
  })

  // ---------- localStorage persistence ----------

  it('persists card changes to localStorage', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))

    act(() => { result.current.removeCard(result.current.cards[0].id) })
    // After the effect runs, localStorage should be updated
    act(() => { vi.runAllTimers() })

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toHaveLength(2)
  })

  // ---------- undo / redo ----------

  it('undo reverts last mutation', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const originalCards = [...result.current.cards]

    act(() => { result.current.removeCard(result.current.cards[0].id) })
    expect(result.current.cards).toHaveLength(2)
    expect(result.current.canUndo).toBe(true)

    act(() => { result.current.undo() })
    expect(result.current.cards).toHaveLength(3)
    expect(result.current.cards.map(c => c.id)).toEqual(originalCards.map(c => c.id))
  })

  it('redo re-applies undone mutation', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))

    act(() => { result.current.removeCard(result.current.cards[0].id) })
    act(() => { result.current.undo() })
    expect(result.current.canRedo).toBe(true)

    act(() => { result.current.redo() })
    expect(result.current.cards).toHaveLength(2)
    expect(result.current.canRedo).toBe(false)
  })

  it('canUndo is false when no mutations have been made', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  // ---------- isCustomized ----------

  it('detects customization when card types differ from defaults', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    expect(result.current.isCustomized).toBe(false)

    act(() => { result.current.addCards([{ type: 'new_type' }]) })
    expect(result.current.isCustomized).toBe(true)
  })

  it('detects customization when card count differs from defaults', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))

    act(() => { result.current.removeCard(result.current.cards[0].id) })
    expect(result.current.isCustomized).toBe(true)
  })

  // ---------- Backend sync ----------

  it('syncs with backend on mount when authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(true)
    const backendCards: DashboardCard[] = [
      { id: 'backend-1', card_type: 'synced_card', config: {}, position: { w: 6, h: 2 } },
    ]
    mockFullSync.mockResolvedValue(backendCards)

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))

    // Wait for the async sync
    await act(async () => { await vi.runAllTimersAsync() })

    expect(mockFullSync).toHaveBeenCalledWith(STORAGE_KEY)
    expect(result.current.cards).toEqual(backendCards)
    expect(result.current.isSyncing).toBe(false)
  })

  it('does not sync with backend when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)

    renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    await act(async () => { await vi.runAllTimersAsync() })

    expect(mockFullSync).not.toHaveBeenCalled()
  })

  it('handles backend sync failure gracefully', async () => {
    mockIsAuthenticated.mockReturnValue(true)
    mockFullSync.mockRejectedValue(new Error('Network error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    await act(async () => { await vi.runAllTimersAsync() })

    // Falls back to defaults
    expect(result.current.cards).toEqual(expectedDefaultCards())
    expect(result.current.isSyncing).toBe(false)
    consoleSpy.mockRestore()
  })

  it('accepts empty array from backend (#7254)', async () => {
    mockIsAuthenticated.mockReturnValue(true)
    mockFullSync.mockResolvedValue([])

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    await act(async () => { await vi.runAllTimersAsync() })

    // #7254 — An empty array from the backend means zero cards; the UI
    // should accept it rather than falling back to defaults.
    expect(result.current.cards).toEqual([])
  })

  it('keeps defaults when backend returns null', async () => {
    mockIsAuthenticated.mockReturnValue(true)
    mockFullSync.mockResolvedValue(null)

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    await act(async () => { await vi.runAllTimersAsync() })

    expect(result.current.cards).toEqual(expectedDefaultCards())
  })

  it('manually triggers backend sync via syncWithBackend()', async () => {
    mockIsAuthenticated.mockReturnValue(true)
    const backendCards: DashboardCard[] = [
      { id: 'manual-1', card_type: 'manual_sync', config: {}, position: { w: 4, h: 2 } },
    ]
    mockFullSync.mockResolvedValue(backendCards)

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    // Wait for initial mount sync
    await act(async () => { await vi.runAllTimersAsync() })

    // Reset mock to track manual sync
    mockFullSync.mockClear()
    mockFullSync.mockResolvedValue(backendCards)

    await act(async () => { await result.current.syncWithBackend() })

    expect(mockFullSync).toHaveBeenCalledWith(STORAGE_KEY)
    expect(result.current.cards).toEqual(backendCards)
  })

  it('manual syncWithBackend is no-op when unauthenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))

    await act(async () => { await result.current.syncWithBackend() })

    expect(mockFullSync).not.toHaveBeenCalled()
  })

  it('setCards (with snapshot) records undo history', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))

    act(() => {
      result.current.setCards([makeCard('replaced', 0)])
    })

    expect(result.current.cards).toHaveLength(1)
    expect(result.current.canUndo).toBe(true)

    act(() => { result.current.undo() })
    expect(result.current.cards).toHaveLength(3)
  })
})

// ============================================================================
// useDashboardDnD
// ============================================================================

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

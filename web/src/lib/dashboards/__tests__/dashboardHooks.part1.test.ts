import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  mockFullSync,
  mockIsAuthenticated,
  STORAGE_KEY,
  DEFAULT_PLACEMENTS,
  makeCard,
  expectedDefaultCards,
} from './dashboardHooks.setup'
import type { DashboardCard, DashboardCardPlacement, NewCardInput } from './dashboardHooks.setup'
import {
  useDashboardCards,
} from '../dashboardHooks'

describe('useDashboardCards', () => {
  // ---------- Initialisation ----------

  it('returns default cards when localStorage is empty', () => {
    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS))
    const defaults = expectedDefaultCards()
    expect(result.current.cards).toEqual(defaults)
    expect(result.current.isCustomized).toBe(false)
  })

  // Regression: #17093 — placements with explicit id must preserve it
  it('uses configured id from DashboardCardPlacement instead of generating synthetic id', () => {
    const placementsWithIds: DashboardCardPlacement[] = [
      { id: 'workload-deployment-1', type: 'workload_deployment', position: { w: 4, h: 2 } },
      { id: 'cluster-groups-1', type: 'cluster_groups', position: { w: 6, h: 3 } },
      { type: 'card_no_id', position: { w: 4, h: 2 } },
    ]

    const { result } = renderHook(() => useDashboardCards(STORAGE_KEY, placementsWithIds))

    expect(result.current.cards[0].id).toBe('workload-deployment-1')
    expect(result.current.cards[1].id).toBe('cluster-groups-1')
    // Card without explicit id falls back to synthetic format
    expect(result.current.cards[2].id).toBe('default-card_no_id-2')
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

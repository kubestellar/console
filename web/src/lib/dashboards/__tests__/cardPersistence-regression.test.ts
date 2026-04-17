/**
 * Regression test: Card add/remove persistence (#8504)
 *
 * Verifies that adding and removing cards persists to localStorage so the
 * layout survives a page reload (simulated by unmounting + re-mounting the hook).
 */
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
// are not filtered out during localStorage restore.
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

import type { DashboardCardPlacement } from '../types'
import { useDashboardCards } from '../dashboardHooks'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'test-card-persistence'

const DEFAULT_PLACEMENTS: DashboardCardPlacement[] = [
  { type: 'cluster_health', position: { w: 4, h: 2 } },
  { type: 'pod_status', position: { w: 4, h: 2 } },
  { type: 'node_overview', position: { w: 6, h: 3 } },
]

const INITIAL_CARD_COUNT = 3

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Card add/remove persistence (#8504)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('added card survives simulated page reload', () => {
    // --- First mount: add a card ---
    const { result, unmount } = renderHook(() =>
      useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS)
    )

    expect(result.current.cards).toHaveLength(INITIAL_CARD_COUNT)

    act(() => {
      result.current.addCards([{ type: 'new_card', config: { foo: 'bar' } }])
    })

    const AFTER_ADD_COUNT = 4
    expect(result.current.cards).toHaveLength(AFTER_ADD_COUNT)

    // Let the persistence effect run
    act(() => { vi.runAllTimers() })

    // Verify localStorage was written
    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed).toHaveLength(AFTER_ADD_COUNT)

    // Remember the added card's ID so we can verify identity after reload
    const addedCard = result.current.cards.find(c => c.card_type === 'new_card')
    expect(addedCard).toBeDefined()
    const addedCardId = addedCard!.id

    // --- Simulate page reload by unmounting and re-mounting ---
    unmount()

    const { result: reloaded } = renderHook(() =>
      useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS)
    )

    expect(reloaded.current.cards).toHaveLength(AFTER_ADD_COUNT)
    const restoredCard = reloaded.current.cards.find(c => c.card_type === 'new_card')
    expect(restoredCard).toBeDefined()
    expect(restoredCard!.id).toBe(addedCardId)
    expect(restoredCard!.config).toEqual({ foo: 'bar' })
  })

  it('removed card stays removed after simulated page reload', () => {
    // --- First mount: remove a card ---
    const { result, unmount } = renderHook(() =>
      useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS)
    )

    expect(result.current.cards).toHaveLength(INITIAL_CARD_COUNT)

    const removedId = result.current.cards[0].id
    const removedType = result.current.cards[0].card_type

    act(() => {
      result.current.removeCard(removedId)
    })

    const AFTER_REMOVE_COUNT = 2
    expect(result.current.cards).toHaveLength(AFTER_REMOVE_COUNT)

    // Let the persistence effect run
    act(() => { vi.runAllTimers() })

    // --- Simulate reload ---
    unmount()

    const { result: reloaded } = renderHook(() =>
      useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS)
    )

    expect(reloaded.current.cards).toHaveLength(AFTER_REMOVE_COUNT)
    expect(reloaded.current.cards.find(c => c.id === removedId)).toBeUndefined()
    // Verify the correct type was removed, not some other card
    const remainingTypes = reloaded.current.cards.map(c => c.card_type)
    expect(remainingTypes).not.toContain(removedType)
  })

  it('add then remove then reload preserves final state', () => {
    // --- First mount: add then remove ---
    const { result, unmount } = renderHook(() =>
      useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS)
    )

    // Add a card
    act(() => {
      result.current.addCards([{ type: 'temp_card' }])
    })
    const AFTER_ADD = 4
    expect(result.current.cards).toHaveLength(AFTER_ADD)

    // Remove the original first card
    const firstCardId = result.current.cards.find(c => c.card_type === 'cluster_health')!.id
    act(() => {
      result.current.removeCard(firstCardId)
    })

    // Now we should have: temp_card, pod_status, node_overview
    expect(result.current.cards).toHaveLength(INITIAL_CARD_COUNT)

    // Let persistence run
    act(() => { vi.runAllTimers() })

    // --- Simulate reload ---
    unmount()

    const { result: reloaded } = renderHook(() =>
      useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS)
    )

    expect(reloaded.current.cards).toHaveLength(INITIAL_CARD_COUNT)
    const types = reloaded.current.cards.map(c => c.card_type)
    expect(types).toContain('temp_card')
    expect(types).toContain('pod_status')
    expect(types).toContain('node_overview')
    expect(types).not.toContain('cluster_health')
  })

  it('isCustomized reflects changes after reload', () => {
    const { result, unmount } = renderHook(() =>
      useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS)
    )

    // Initially not customized
    expect(result.current.isCustomized).toBe(false)

    // Remove a card to customize
    act(() => {
      result.current.removeCard(result.current.cards[0].id)
    })
    expect(result.current.isCustomized).toBe(true)

    act(() => { vi.runAllTimers() })
    unmount()

    // After reload, should still be customized
    const { result: reloaded } = renderHook(() =>
      useDashboardCards(STORAGE_KEY, DEFAULT_PLACEMENTS)
    )
    expect(reloaded.current.isCustomized).toBe(true)
  })
})

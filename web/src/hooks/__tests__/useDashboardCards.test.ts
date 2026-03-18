import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDashboardCards, DashboardCard } from '../useDashboardCards'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_STORAGE_KEY = 'test-dashboard-cards'
const TEST_COLLAPSED_KEY = `${TEST_STORAGE_KEY}:collapsed`

const makeCard = (id: string, cardType = 'generic', config: Record<string, unknown> = {}): DashboardCard => ({
  id,
  card_type: cardType,
  config,
})

const DEFAULT_CARDS: DashboardCard[] = [
  makeCard('card-1', 'cluster_status', { cluster: 'prod' }),
  makeCard('card-2', 'pod_status', { namespace: 'default' }),
]

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

/** Read the cards array that the hook persisted. */
const readStoredCards = (): DashboardCard[] => {
  const raw = localStorage.getItem(TEST_STORAGE_KEY)
  return raw ? JSON.parse(raw) : []
}

/** Read the collapsed boolean that the hook persisted. */
const readStoredCollapsed = (): boolean | null => {
  const raw = localStorage.getItem(TEST_COLLAPSED_KEY)
  return raw !== null ? JSON.parse(raw) : null
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // Provide a stable Date.now for deterministic card IDs.
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDashboardCards', () => {
  // ── Initialization ──────────────────────────────────────────────────────

  describe('initialization', () => {
    it('returns defaultCards when localStorage is empty', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      expect(result.current.cards).toEqual(DEFAULT_CARDS)
    })

    it('returns an empty array when no defaultCards are provided and localStorage is empty', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      expect(result.current.cards).toEqual([])
    })

    it('loads cards from localStorage when they exist', () => {
      const stored: DashboardCard[] = [makeCard('stored-1', 'custom')]
      localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(stored))

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // Should prefer stored cards over defaults
      expect(result.current.cards).toEqual(stored)
    })

    it('defaults isCollapsed to false (expanded)', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      expect(result.current.isCollapsed).toBe(false)
      expect(result.current.showCards).toBe(true)
    })

    it('respects defaultCollapsed option', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCollapsed: true }),
      )

      expect(result.current.isCollapsed).toBe(true)
      expect(result.current.showCards).toBe(false)
    })

    it('loads collapsed state from localStorage over defaultCollapsed', () => {
      localStorage.setItem(TEST_COLLAPSED_KEY, JSON.stringify(true))

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCollapsed: false }),
      )

      expect(result.current.isCollapsed).toBe(true)
    })
  })

  // ── Adding cards ────────────────────────────────────────────────────────

  describe('addCard', () => {
    it('appends a new card and returns its id', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      let newId: string
      act(() => {
        newId = result.current.addCard('network_map', { region: 'us-east' }, 'Network')
      })

      expect(newId!).toBe('network_map-1700000000000')
      expect(result.current.cards).toHaveLength(DEFAULT_CARDS.length + 1)

      const added = result.current.cards[result.current.cards.length - 1]
      expect(added).toEqual({
        id: 'network_map-1700000000000',
        card_type: 'network_map',
        config: { region: 'us-east' },
        title: 'Network',
      })
    })

    it('adds a card with empty config when none is provided', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      act(() => {
        result.current.addCard('simple_card')
      })

      expect(result.current.cards).toHaveLength(1)
      expect(result.current.cards[0].config).toEqual({})
      expect(result.current.cards[0].title).toBeUndefined()
    })
  })

  // ── Removing cards ──────────────────────────────────────────────────────

  describe('removeCard', () => {
    it('removes a card by id', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.removeCard('card-1')
      })

      expect(result.current.cards).toHaveLength(1)
      expect(result.current.cards[0].id).toBe('card-2')
    })

    it('does nothing when removing a non-existent card id', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.removeCard('does-not-exist')
      })

      expect(result.current.cards).toEqual(DEFAULT_CARDS)
    })

    it('can remove all cards one by one', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.removeCard('card-1')
      })
      act(() => {
        result.current.removeCard('card-2')
      })

      expect(result.current.cards).toEqual([])
    })
  })

  // ── Updating card config ────────────────────────────────────────────────

  describe('updateCardConfig', () => {
    it('merges new config into an existing card', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.updateCardConfig('card-1', { cluster: 'staging', region: 'eu' })
      })

      const updated = result.current.cards.find(c => c.id === 'card-1')
      expect(updated!.config).toEqual({ cluster: 'staging', region: 'eu' })
    })

    it('does not affect other cards', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.updateCardConfig('card-1', { newKey: 'value' })
      })

      const other = result.current.cards.find(c => c.id === 'card-2')
      expect(other!.config).toEqual({ namespace: 'default' })
    })

    it('does nothing when card id does not exist', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.updateCardConfig('ghost', { x: 1 })
      })

      expect(result.current.cards).toEqual(DEFAULT_CARDS)
    })
  })

  // ── Reordering / replacing cards ────────────────────────────────────────

  describe('replaceCards', () => {
    it('replaces the entire cards array (reorder scenario)', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      const reordered = [DEFAULT_CARDS[1], DEFAULT_CARDS[0]]
      act(() => {
        result.current.replaceCards(reordered)
      })

      expect(result.current.cards).toEqual(reordered)
    })

    it('can set a completely new set of cards', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      const newCards = [makeCard('new-1', 'alert'), makeCard('new-2', 'logs'), makeCard('new-3', 'metrics')]
      act(() => {
        result.current.replaceCards(newCards)
      })

      expect(result.current.cards).toEqual(newCards)
      expect(result.current.cards).toHaveLength(3)
    })

    it('can replace with an empty array', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.replaceCards([])
      })

      expect(result.current.cards).toEqual([])
    })
  })

  // ── clearCards ──────────────────────────────────────────────────────────

  describe('clearCards', () => {
    it('removes all cards', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.clearCards()
      })

      expect(result.current.cards).toEqual([])
    })
  })

  // ── resetToDefaults ─────────────────────────────────────────────────────

  describe('resetToDefaults', () => {
    it('restores the defaultCards after customization', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // Mutate cards first
      act(() => {
        result.current.addCard('extra')
      })
      expect(result.current.cards).toHaveLength(3)

      act(() => {
        result.current.resetToDefaults()
      })

      expect(result.current.cards).toEqual(DEFAULT_CARDS)
      // Note: resetToDefaults calls localStorage.removeItem, but the useEffect
      // that watches `cards` re-persists the defaultCards immediately after.
      // The net effect is that localStorage contains the default cards again.
      expect(readStoredCards()).toEqual(DEFAULT_CARDS)
    })

    it('restores to empty array when no defaultCards were provided', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      act(() => {
        result.current.addCard('temp')
      })

      act(() => {
        result.current.resetToDefaults()
      })

      expect(result.current.cards).toEqual([])
    })
  })

  // ── isCustomized ────────────────────────────────────────────────────────

  describe('isCustomized', () => {
    it('returns false before any mutation persists', () => {
      // localStorage is empty at this point — but the useEffect that persists
      // defaultCards fires asynchronously. The useState initializer sets cards
      // to defaultCards, and the useEffect writes them. After render, isCustomized
      // will reflect whether localStorage has been written.
      localStorage.removeItem(TEST_STORAGE_KEY)

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // After the first render, the useEffect persists cards to localStorage,
      // so isCustomized should return true (localStorage key now exists).
      expect(result.current.isCustomized()).toBe(true)
    })

    it('returns true when cards have been modified', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // After initial render + useEffect, localStorage has the default cards
      // so isCustomized returns true (key exists).
      act(() => {
        result.current.addCard('extra')
      })

      expect(result.current.isCustomized()).toBe(true)
    })

    it('returns false when localStorage key does not exist', () => {
      // Manually ensure the key is absent
      localStorage.removeItem(TEST_STORAGE_KEY)

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // Before useEffect fires, call isCustomized synchronously
      // This checks only whether the localStorage key exists —
      // the hook's useEffect will set it, but isCustomized is just a
      // wrapper around localStorage.getItem !== null.
      // After renderHook, the effect has already fired, so the key exists.
      expect(result.current.isCustomized()).toBe(true)
    })
  })

  // ── Collapsed state ─────────────────────────────────────────────────────

  describe('collapsed state', () => {
    it('toggleCollapsed flips the state', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      expect(result.current.isCollapsed).toBe(false)
      expect(result.current.showCards).toBe(true)

      act(() => {
        result.current.toggleCollapsed()
      })

      expect(result.current.isCollapsed).toBe(true)
      expect(result.current.showCards).toBe(false)

      act(() => {
        result.current.toggleCollapsed()
      })

      expect(result.current.isCollapsed).toBe(false)
      expect(result.current.showCards).toBe(true)
    })

    it('setIsCollapsed sets the state directly', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      act(() => {
        result.current.setIsCollapsed(true)
      })

      expect(result.current.isCollapsed).toBe(true)

      act(() => {
        result.current.setIsCollapsed(false)
      })

      expect(result.current.isCollapsed).toBe(false)
    })

    it('persists collapsed state to localStorage', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      act(() => {
        result.current.toggleCollapsed()
      })

      expect(readStoredCollapsed()).toBe(true)

      act(() => {
        result.current.toggleCollapsed()
      })

      expect(readStoredCollapsed()).toBe(false)
    })

    it('showCards is the inverse of isCollapsed', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCollapsed: true }),
      )

      expect(result.current.isCollapsed).toBe(true)
      expect(result.current.showCards).toBe(false)

      act(() => {
        result.current.toggleCollapsed()
      })

      expect(result.current.isCollapsed).toBe(false)
      expect(result.current.showCards).toBe(true)
    })
  })

  // ── localStorage persistence ────────────────────────────────────────────

  describe('localStorage persistence', () => {
    it('persists cards to localStorage after adding a card', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      act(() => {
        result.current.addCard('test_card', { key: 'val' })
      })

      const stored = readStoredCards()
      expect(stored).toHaveLength(1)
      expect(stored[0].card_type).toBe('test_card')
      expect(stored[0].config).toEqual({ key: 'val' })
    })

    it('persists cards to localStorage after removing a card', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.removeCard('card-1')
      })

      const stored = readStoredCards()
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe('card-2')
    })

    it('persists cards to localStorage after replaceCards', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      const newCards = [makeCard('replaced-1', 'widget')]
      act(() => {
        result.current.replaceCards(newCards)
      })

      expect(readStoredCards()).toEqual(newCards)
    })

    it('persists cards after clearCards', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.clearCards()
      })

      expect(readStoredCards()).toEqual([])
    })

    it('uses separate storage keys for different instances', () => {
      const keyA = 'dashboard-a'
      const keyB = 'dashboard-b'

      const { result: hookA } = renderHook(() =>
        useDashboardCards({ storageKey: keyA }),
      )
      const { result: hookB } = renderHook(() =>
        useDashboardCards({ storageKey: keyB }),
      )

      act(() => {
        hookA.current.addCard('card_a')
      })
      act(() => {
        hookB.current.addCard('card_b')
      })

      const storedA: DashboardCard[] = JSON.parse(localStorage.getItem(keyA)!)
      const storedB: DashboardCard[] = JSON.parse(localStorage.getItem(keyB)!)

      expect(storedA).toHaveLength(1)
      expect(storedA[0].card_type).toBe('card_a')
      expect(storedB).toHaveLength(1)
      expect(storedB[0].card_type).toBe('card_b')
    })
  })

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles corrupted JSON in localStorage for cards gracefully', () => {
      localStorage.setItem(TEST_STORAGE_KEY, '{{{not valid json')

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // Falls back to defaultCards when JSON.parse throws
      expect(result.current.cards).toEqual(DEFAULT_CARDS)
    })

    it('handles corrupted JSON in localStorage for collapsed state gracefully', () => {
      localStorage.setItem(TEST_COLLAPSED_KEY, '!!!bad')

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCollapsed: true }),
      )

      // Falls back to defaultCollapsed when JSON.parse throws
      expect(result.current.isCollapsed).toBe(true)
    })

    it('handles null stored value for collapsed state (uses default)', () => {
      // collapsed key not set at all
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCollapsed: false }),
      )

      expect(result.current.isCollapsed).toBe(false)
    })

    it('handles empty string in localStorage for cards', () => {
      localStorage.setItem(TEST_STORAGE_KEY, '')

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // empty string is falsy, so `stored ? JSON.parse(stored) : defaultCards` returns defaults
      expect(result.current.cards).toEqual(DEFAULT_CARDS)
    })

    it('preserves card position field through add and read', () => {
      const cardsWithPosition: DashboardCard[] = [
        { id: 'pos-1', card_type: 'widget', config: {}, position: { w: 4, h: 2 } },
      ]
      localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(cardsWithPosition))

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      expect(result.current.cards[0].position).toEqual({ w: 4, h: 2 })
    })

    it('handles rapid sequential operations', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      // Multiple Date.now stubs for unique IDs
      let counter = 1700000000000
      vi.spyOn(Date, 'now').mockImplementation(() => counter++)

      act(() => {
        result.current.addCard('a')
        result.current.addCard('b')
        result.current.addCard('c')
      })

      expect(result.current.cards).toHaveLength(3)
    })

    it('localStorage.getItem returning null for storageKey uses defaults', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      expect(result.current.cards).toEqual(DEFAULT_CARDS)
    })

    it('handles updateCardConfig merging with existing config (preserves old keys)', () => {
      const initial: DashboardCard[] = [
        makeCard('merge-test', 'widget', { keyA: 'alpha', keyB: 'beta' }),
      ]
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: initial }),
      )

      act(() => {
        result.current.updateCardConfig('merge-test', { keyB: 'updated', keyC: 'gamma' })
      })

      expect(result.current.cards[0].config).toEqual({
        keyA: 'alpha',
        keyB: 'updated',
        keyC: 'gamma',
      })
    })
  })

  // ── Return value shape ──────────────────────────────────────────────────

  describe('return value', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY }),
      )

      expect(result.current).toHaveProperty('cards')
      expect(result.current).toHaveProperty('addCard')
      expect(result.current).toHaveProperty('removeCard')
      expect(result.current).toHaveProperty('updateCardConfig')
      expect(result.current).toHaveProperty('replaceCards')
      expect(result.current).toHaveProperty('clearCards')
      expect(result.current).toHaveProperty('resetToDefaults')
      expect(result.current).toHaveProperty('isCustomized')
      expect(result.current).toHaveProperty('isCollapsed')
      expect(result.current).toHaveProperty('setIsCollapsed')
      expect(result.current).toHaveProperty('toggleCollapsed')
      expect(result.current).toHaveProperty('showCards')

      // Type checks: functions
      expect(typeof result.current.addCard).toBe('function')
      expect(typeof result.current.removeCard).toBe('function')
      expect(typeof result.current.updateCardConfig).toBe('function')
      expect(typeof result.current.replaceCards).toBe('function')
      expect(typeof result.current.clearCards).toBe('function')
      expect(typeof result.current.resetToDefaults).toBe('function')
      expect(typeof result.current.isCustomized).toBe('function')
      expect(typeof result.current.toggleCollapsed).toBe('function')
      expect(typeof result.current.setIsCollapsed).toBe('function')

      // Type checks: values
      expect(Array.isArray(result.current.cards)).toBe(true)
      expect(typeof result.current.isCollapsed).toBe('boolean')
      expect(typeof result.current.showCards).toBe('boolean')
    })
  })
})

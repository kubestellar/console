import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  DEFAULT_CARDS,
  TEST_STORAGE_KEY,
  TEST_STORAGE_SCHEMA_KEY,
  makeCard,
  readStoredCards,
  useDashboardCards,
} from './useDashboardCards.setup'

describe('useDashboardCards', () => {
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

    it('falls back to defaults when stored cards do not match the schema', () => {
      localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify([{ id: 'stored-1', card_type: 'custom' }]))

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      expect(result.current.cards).toEqual(DEFAULT_CARDS)
      expect(readStoredCards()).toEqual(DEFAULT_CARDS)
      expect(localStorage.getItem(TEST_STORAGE_SCHEMA_KEY)).toBe('1')
    })

    it('clears malformed JSON before restoring defaults', () => {
      localStorage.setItem(TEST_STORAGE_KEY, '{not-valid-json}')

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      expect(result.current.cards).toEqual(DEFAULT_CARDS)
      expect(readStoredCards()).toEqual(DEFAULT_CARDS)
      expect(localStorage.getItem(TEST_STORAGE_SCHEMA_KEY)).toBe('1')
    })

    it('falls back to defaults when the stored schema version is stale', () => {
      const stored: DashboardCard[] = [makeCard('stored-1', 'custom')]
      localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(stored))
      localStorage.setItem(TEST_STORAGE_SCHEMA_KEY, '0')

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      expect(result.current.cards).toEqual(DEFAULT_CARDS)
      expect(readStoredCards()).toEqual(DEFAULT_CARDS)
      expect(localStorage.getItem(TEST_STORAGE_SCHEMA_KEY)).toBe('1')
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
      // resetToDefaults removes the localStorage key and skips the persistence
      // effect so the key stays removed (fixes #4686 — reset no longer undone)
      expect(localStorage.getItem(TEST_STORAGE_KEY)).toBeNull()
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

    it('does not re-persist defaults after reset (fixes #4686)', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // Customize, then reset
      act(() => {
        result.current.addCard('extra')
      })
      act(() => {
        result.current.resetToDefaults()
      })

      // The persistence effect should have been skipped — key stays removed
      expect(localStorage.getItem(TEST_STORAGE_KEY)).toBeNull()

      // isCustomized should return false since the key is gone
      expect(result.current.isCustomized()).toBe(false)
    })
  })

  // ── isCustomized ────────────────────────────────────────────────────────
})

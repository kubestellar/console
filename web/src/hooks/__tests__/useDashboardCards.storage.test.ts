import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  DEFAULT_CARDS,
  TEST_STORAGE_KEY,
  TEST_STORAGE_SCHEMA_KEY,
  makeCard,
  readStoredCards,
  readStoredCollapsed,
  useDashboardCards,
  type DashboardCard,
} from './useDashboardCards.setup'

describe('useDashboardCards', () => {
  describe('isCustomized', () => {
    it('returns false when stored cards match defaults (fixes #4687)', () => {
      // The useEffect persists defaultCards to localStorage on first render.
      // isCustomized now compares content, not just key existence.
      localStorage.removeItem(TEST_STORAGE_KEY)

      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // After the first render, the useEffect persists cards to localStorage,
      // but since the stored content matches defaultCards, isCustomized returns false.
      expect(result.current.isCustomized()).toBe(false)
    })

    it('returns true when cards have been modified', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.addCard('extra')
      })

      // After adding a card, stored content differs from defaults
      expect(result.current.isCustomized()).toBe(true)
    })

    it('returns false when localStorage key does not exist', () => {
      // Manually ensure the key is absent
      localStorage.removeItem(TEST_STORAGE_KEY)

      // Use a fresh render to avoid persistence effect writing the key
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // After renderHook, the effect persists defaults. Since content matches
      // defaults, isCustomized returns false.
      expect(result.current.isCustomized()).toBe(false)
    })

    it('returns false after resetToDefaults even if key gets re-written', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      // Customize, then reset
      act(() => {
        result.current.addCard('extra')
      })
      expect(result.current.isCustomized()).toBe(true)

      act(() => {
        result.current.resetToDefaults()
      })
      expect(result.current.isCustomized()).toBe(false)
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
      expect(localStorage.getItem(TEST_STORAGE_SCHEMA_KEY)).toBe('1')
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
      expect(localStorage.getItem(TEST_STORAGE_SCHEMA_KEY)).toBe('1')
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
      expect(localStorage.getItem(TEST_STORAGE_SCHEMA_KEY)).toBe('1')
    })

    it('persists cards after clearCards', () => {
      const { result } = renderHook(() =>
        useDashboardCards({ storageKey: TEST_STORAGE_KEY, defaultCards: DEFAULT_CARDS }),
      )

      act(() => {
        result.current.clearCards()
      })

      expect(readStoredCards()).toEqual([])
      expect(localStorage.getItem(TEST_STORAGE_SCHEMA_KEY)).toBe('1')
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
})

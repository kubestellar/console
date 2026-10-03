import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  DEFAULT_CARDS,
  TEST_COLLAPSED_KEY,
  TEST_STORAGE_KEY,
  makeCard,
  useDashboardCards,
  type DashboardCard,
} from './useDashboardCards.setup'

describe('useDashboardCards', () => {
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

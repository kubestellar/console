/**
 * Tests for useNavigationHistory hook and getNavigationBehavior utility.
 *
 * The hook itself requires react-router-dom context, so we test
 * getNavigationBehavior (pure utility) and the hook with a mocked router.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { getNavigationBehavior } from '../useNavigationHistory'

const STORAGE_KEY = 'kubestellar-nav-history'

// Mock react-router-dom
const mockPathname = { current: '/' }
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname.current, search: '', hash: '' }),
}))

// Dynamically import after mocking
let useNavigationHistory: typeof import('../useNavigationHistory').useNavigationHistory

describe('useNavigationHistory', () => {
  beforeEach(async () => {
    localStorage.clear()
    mockPathname.current = '/'
    vi.resetModules()
    // Re-mock after resetModules
    vi.doMock('react-router-dom', () => ({
      useLocation: () => ({ pathname: mockPathname.current, search: '', hash: '' }),
    }))
    const mod = await import('../useNavigationHistory')
    useNavigationHistory = mod.useNavigationHistory
  })

  describe('useNavigationHistory hook', () => {
    it('should record a visit to localStorage on mount', () => {
      mockPathname.current = '/clusters'
      renderHook(() => useNavigationHistory())

      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(history).toContain('/clusters')
    })

    it('should prepend new visits to the front of history', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['/events', '/clusters']))
      mockPathname.current = '/workloads'
      renderHook(() => useNavigationHistory())

      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(history[0]).toBe('/workloads')
      expect(history[1]).toBe('/events')
      expect(history[2]).toBe('/clusters')
    })

    it('should not track auth-related pages', () => {
      mockPathname.current = '/auth/callback'
      renderHook(() => useNavigationHistory())

      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(history).not.toContain('/auth/callback')
    })

    it('should not track /login page', () => {
      mockPathname.current = '/login'
      renderHook(() => useNavigationHistory())

      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(history).not.toContain('/login')
    })

    it('should cap history at 100 entries', () => {
      // Fill with 100 entries
      const existing = Array.from({ length: 100 }, (_, i) => `/page-${i}`)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

      mockPathname.current = '/new-page'
      renderHook(() => useNavigationHistory())

      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(history.length).toBe(100)
      expect(history[0]).toBe('/new-page')
      // Last entry from original should be dropped
      expect(history).not.toContain('/page-99')
    })
  })

  describe('getNavigationBehavior', () => {
    it('should return empty stats when no history exists', () => {
      const behavior = getNavigationBehavior()
      expect(behavior.totalVisits).toBe(0)
      expect(behavior.uniquePages).toBe(0)
      expect(behavior.topPages).toEqual([])
    })

    it('should count total visits', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['/a', '/b', '/a', '/c']))
      const behavior = getNavigationBehavior()
      expect(behavior.totalVisits).toBe(4)
    })

    it('should count unique pages', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['/a', '/b', '/a', '/c']))
      const behavior = getNavigationBehavior()
      expect(behavior.uniquePages).toBe(3)
    })

    it('should sort top pages by visit count descending', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        '/a', '/b', '/a', '/a', '/b', '/c',
      ]))
      const behavior = getNavigationBehavior()
      expect(behavior.topPages[0]).toEqual({ path: '/a', count: 3 })
      expect(behavior.topPages[1]).toEqual({ path: '/b', count: 2 })
      expect(behavior.topPages[2]).toEqual({ path: '/c', count: 1 })
    })

    it('should limit top pages to 10', () => {
      // Create 15 unique paths
      const history = Array.from({ length: 15 }, (_, i) => `/page-${i}`)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history))

      const behavior = getNavigationBehavior()
      expect(behavior.topPages.length).toBe(10)
    })

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json')
      const behavior = getNavigationBehavior()
      expect(behavior.totalVisits).toBe(0)
      expect(behavior.uniquePages).toBe(0)
      expect(behavior.topPages).toEqual([])
    })
  })
})

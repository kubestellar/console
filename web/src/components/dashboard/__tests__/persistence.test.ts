/**
 * Unit tests for dashboard/persistence.ts
 *
 * Covers the module-level cache mutators (setDashboardCache /
 * patchDashboardCache) and the three-tier initLocalCardsState
 * priority order (memory cache → localStorage → defaults).
 *
 * Run: npx vitest run src/components/dashboard/__tests__/persistence.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Card } from '../dashboardUtils'

const { mockLoad, defaultsFixture } = vi.hoisted(() => {
  const defaults = [{ id: 'default-1' }, { id: 'default-2' }] as unknown as Card[]
  return {
    mockLoad: vi.fn(),
    defaultsFixture: defaults,
  }
})

vi.mock('../../../config/dashboards', () => ({
  getDefaultCardsForDashboard: (name: string) => {
    // Persistence hard-codes 'main' — assert we receive it so a rename
    // of the dashboard key is caught immediately.
    if (name !== 'main') throw new Error(`unexpected dashboard: ${name}`)
    return defaultsFixture
  },
}))

vi.mock('../../../lib/dashboards/dashboardCardStorage', () => ({
  loadDashboardCardsFromStorage: (
    key: string,
    fallback: Card[],
    opts: Record<string, unknown>,
  ) => mockLoad(key, fallback, opts),
}))

import {
  AUTO_REFRESH_INTERVAL_MS,
  DASHBOARD_STORAGE_KEY,
  DEFAULT_DASHBOARD_CARDS,
  dashboardCache,
  setDashboardCache,
  patchDashboardCache,
  initLocalCardsState,
} from '../persistence'
import { STORAGE_KEY_MAIN_DASHBOARD_CARDS } from '../../../lib/constants/storage'

beforeEach(() => {
  setDashboardCache(null)
  mockLoad.mockReset()
})

describe('constants', () => {
  it('AUTO_REFRESH_INTERVAL_MS is 30 seconds', () => {
    expect(AUTO_REFRESH_INTERVAL_MS).toBe(30_000)
  })

  it('DASHBOARD_STORAGE_KEY equals the shared main-dashboard storage key', () => {
    expect(DASHBOARD_STORAGE_KEY).toBe(STORAGE_KEY_MAIN_DASHBOARD_CARDS)
  })

  it('DEFAULT_DASHBOARD_CARDS uses the "main" dashboard default set', () => {
    expect(DEFAULT_DASHBOARD_CARDS).toBe(defaultsFixture)
  })

  it('dashboardCache starts null on a fresh module load', () => {
    expect(dashboardCache).toBeNull()
  })
})

describe('setDashboardCache', () => {
  it('replaces the entire cache entry', () => {
    const entry = { dashboard: null, cards: [{ id: 'a' }] as unknown as Card[], timestamp: 1 }
    setDashboardCache(entry)
    // Re-import via initLocalCardsState which reads dashboardCache directly
    expect(initLocalCardsState()).toBe(entry.cards)
  })

  it('accepts null to clear the cache', () => {
    setDashboardCache({ dashboard: null, cards: [{ id: 'a' }] as unknown as Card[], timestamp: 1 })
    setDashboardCache(null)
    mockLoad.mockReturnValueOnce([])
    expect(initLocalCardsState()).toBe(defaultsFixture)
  })
})

describe('patchDashboardCache', () => {
  it('merges partial updates onto the existing cache entry', () => {
    const initial = {
      dashboard: { name: 'd1' } as any,
      cards: [{ id: 'a' }] as unknown as Card[],
      timestamp: 1,
    }
    setDashboardCache(initial)
    const nextCards = [{ id: 'b' }, { id: 'c' }] as unknown as Card[]
    patchDashboardCache({ cards: nextCards, timestamp: 42 })
    // initLocalCardsState returns the current cached cards
    expect(initLocalCardsState()).toBe(nextCards)
  })

  it('is a no-op when the cache is null', () => {
    // Should not throw and should not create a cache entry.
    patchDashboardCache({ timestamp: 99 })
    mockLoad.mockReturnValueOnce([])
    expect(initLocalCardsState()).toBe(defaultsFixture)
    expect(mockLoad).toHaveBeenCalledTimes(1)
  })
})

describe('initLocalCardsState — priority order', () => {
  it('1. returns in-memory cached cards when present and non-empty', () => {
    const cached = [{ id: 'cached' }] as unknown as Card[]
    setDashboardCache({ dashboard: null, cards: cached, timestamp: 1 })
    expect(initLocalCardsState()).toBe(cached)
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('skips empty cached cards array and falls through to storage', () => {
    setDashboardCache({ dashboard: null, cards: [], timestamp: 1 })
    const stored = [{ id: 'stored' }] as unknown as Card[]
    mockLoad.mockReturnValueOnce(stored)
    expect(initLocalCardsState()).toBe(stored)
  })

  it('2. returns cards restored from localStorage when cache is empty', () => {
    const stored = [{ id: 's1' }, { id: 's2' }] as unknown as Card[]
    mockLoad.mockReturnValueOnce(stored)
    expect(initLocalCardsState()).toBe(stored)
    expect(mockLoad).toHaveBeenCalledWith(
      DASHBOARD_STORAGE_KEY,
      defaultsFixture,
      { requirePosition: true, requireGridCoordinates: true },
    )
  })

  it('3. falls back to DEFAULT_DASHBOARD_CARDS when storage returns empty', () => {
    mockLoad.mockReturnValueOnce([])
    expect(initLocalCardsState()).toBe(defaultsFixture)
  })

  it('passes strict validation options (requirePosition, requireGridCoordinates)', () => {
    mockLoad.mockReturnValueOnce([])
    initLocalCardsState()
    expect(mockLoad).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      { requirePosition: true, requireGridCoordinates: true },
    )
  })
})

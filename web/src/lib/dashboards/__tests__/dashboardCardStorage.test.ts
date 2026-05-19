/**
 * Unit tests for lib/dashboards/dashboardCardStorage.ts
 *
 * jsdom provides a functional localStorage implementation so no
 * mocking of safeGetItem/safeSetItem/etc. is needed — tests exercise the
 * real storage layer.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getDashboardCardStorageVersionKey,
  clearDashboardCardStorage,
  loadDashboardCardsFromStorage,
  saveDashboardCardsToStorage,
} from '../dashboardCardStorage'
import type { DashboardCardStorageEntry } from '../dashboardCardStorage'

const KEY = 'test-dash'

function makeCard(overrides: Partial<DashboardCardStorageEntry> = {}): DashboardCardStorageEntry {
  return {
    id: 'card-1',
    card_type: 'clusters',
    config: {},
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

// ── getDashboardCardStorageVersionKey ─────────────────────────────────────────

describe('getDashboardCardStorageVersionKey', () => {
  it('appends the schema-version suffix', () => {
    expect(getDashboardCardStorageVersionKey('my-dash')).toBe('my-dash:schema-version')
  })

  it('handles empty string key', () => {
    expect(getDashboardCardStorageVersionKey('')).toBe(':schema-version')
  })
})

// ── clearDashboardCardStorage ─────────────────────────────────────────────────

describe('clearDashboardCardStorage', () => {
  it('removes the data key from localStorage', () => {
    localStorage.setItem(KEY, '[]')
    clearDashboardCardStorage(KEY)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('removes the version key from localStorage', () => {
    const versionKey = getDashboardCardStorageVersionKey(KEY)
    localStorage.setItem(versionKey, '1')
    clearDashboardCardStorage(KEY)
    expect(localStorage.getItem(versionKey)).toBeNull()
  })

  it('is safe to call when keys are absent', () => {
    expect(() => clearDashboardCardStorage(KEY)).not.toThrow()
  })
})

// ── loadDashboardCardsFromStorage ─────────────────────────────────────────────

describe('loadDashboardCardsFromStorage', () => {
  const fallback = [makeCard({ id: 'fallback' })]

  it('returns fallback when nothing stored', () => {
    expect(loadDashboardCardsFromStorage(KEY, fallback)).toBe(fallback)
  })

  it('returns stored valid cards', () => {
    const cards = [makeCard()]
    saveDashboardCardsToStorage(KEY, cards)
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('card-1')
  })

  it('returns fallback and clears storage on invalid JSON', () => {
    localStorage.setItem(KEY, '{bad json')
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toBe(fallback)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('returns fallback and clears storage when stored value is not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ not: 'array' }))
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toBe(fallback)
  })

  it('returns fallback and clears when schema version mismatch', () => {
    saveDashboardCardsToStorage(KEY, [makeCard()])
    // overwrite version key with a different version
    localStorage.setItem(getDashboardCardStorageVersionKey(KEY), '999')
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toBe(fallback)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('returns stored cards when version key is absent (version key not written)', () => {
    // Only write data key, no version key — treated as schema-compatible
    localStorage.setItem(KEY, JSON.stringify([makeCard()]))
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toHaveLength(1)
  })

  it('returns fallback when stored card has invalid id', () => {
    const bad = [{ id: '', card_type: 'clusters', config: {} }]
    localStorage.setItem(KEY, JSON.stringify(bad))
    expect(loadDashboardCardsFromStorage(KEY, fallback)).toBe(fallback)
  })

  it('returns fallback when stored card has invalid card_type', () => {
    const bad = [{ id: 'c1', card_type: '', config: {} }]
    localStorage.setItem(KEY, JSON.stringify(bad))
    expect(loadDashboardCardsFromStorage(KEY, fallback)).toBe(fallback)
  })

  it('returns fallback when stored card config is not a plain object', () => {
    const bad = [{ id: 'c1', card_type: 'clusters', config: 'not-an-object' }]
    localStorage.setItem(KEY, JSON.stringify(bad))
    expect(loadDashboardCardsFromStorage(KEY, fallback)).toBe(fallback)
  })

  it('includes optional title field when present', () => {
    const cards = [makeCard({ title: 'My Dashboard' })]
    saveDashboardCardsToStorage(KEY, cards)
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result[0].title).toBe('My Dashboard')
  })

  it('requirePosition option rejects card without position', () => {
    saveDashboardCardsToStorage(KEY, [makeCard()])
    const result = loadDashboardCardsFromStorage(KEY, fallback, { requirePosition: true })
    expect(result).toBe(fallback)
  })

  it('requirePosition accepts card with valid position', () => {
    const cards = [makeCard({ position: { x: 0, y: 0, w: 2, h: 2 } })]
    saveDashboardCardsToStorage(KEY, cards)
    const result = loadDashboardCardsFromStorage(KEY, fallback, { requirePosition: true })
    expect(result).toHaveLength(1)
  })

  it('requireGridCoordinates rejects card with missing x/y', () => {
    const cards = [makeCard({ position: { w: 2, h: 2 } })]
    saveDashboardCardsToStorage(KEY, cards)
    const result = loadDashboardCardsFromStorage(KEY, fallback, { requireGridCoordinates: true })
    expect(result).toBe(fallback)
  })

  it('requireGridCoordinates accepts card with x, y, w, h', () => {
    const cards = [makeCard({ position: { x: 1, y: 2, w: 3, h: 4 } })]
    saveDashboardCardsToStorage(KEY, cards)
    const result = loadDashboardCardsFromStorage(KEY, fallback, { requireGridCoordinates: true })
    expect(result).toHaveLength(1)
  })
})

// ── saveDashboardCardsToStorage ───────────────────────────────────────────────

describe('saveDashboardCardsToStorage', () => {
  it('writes cards as JSON to localStorage', () => {
    const cards = [makeCard()]
    saveDashboardCardsToStorage(KEY, cards)
    const stored = localStorage.getItem(KEY)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('card-1')
  })

  it('writes schema version key', () => {
    saveDashboardCardsToStorage(KEY, [makeCard()])
    const version = localStorage.getItem(getDashboardCardStorageVersionKey(KEY))
    expect(version).toBe('1')
  })

  it('persists empty array', () => {
    saveDashboardCardsToStorage(KEY, [])
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([])
  })

  it('round-trips through load', () => {
    const cards = [makeCard(), makeCard({ id: 'card-2', card_type: 'gpu' })]
    saveDashboardCardsToStorage(KEY, cards)
    const loaded = loadDashboardCardsFromStorage(KEY, [])
    expect(loaded).toHaveLength(2)
    expect(loaded[1].card_type).toBe('gpu')
  })
})

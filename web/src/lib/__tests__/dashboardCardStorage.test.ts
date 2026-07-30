/**
 * Tests for lib/dashboards/dashboardCardStorage.ts — localStorage-backed
 * dashboard card persistence with schema validation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getDashboardCardStorageVersionKey,
  clearDashboardCardStorage,
  loadDashboardCardsFromStorage,
  saveDashboardCardsToStorage,
  type DashboardCardStorageEntry,
} from '../dashboards/dashboardCardStorage'

const KEY = 'test-dashboard'
const VERSION_KEY = getDashboardCardStorageVersionKey(KEY)
const SCHEMA_VERSION = '1'

function makeCard(overrides: Partial<DashboardCardStorageEntry> = {}): DashboardCardStorageEntry {
  return {
    id: 'card-1',
    card_type: 'clusters',
    config: {},
    ...overrides,
  }
}

function makeCardWithPosition(overrides: Partial<DashboardCardStorageEntry> = {}): DashboardCardStorageEntry {
  return makeCard({
    position: { x: 0, y: 0, w: 2, h: 2 },
    ...overrides,
  })
}

beforeEach(() => {
  localStorage.clear()
})

describe('getDashboardCardStorageVersionKey', () => {
  it('appends :schema-version suffix', () => {
    expect(getDashboardCardStorageVersionKey('my-key')).toBe('my-key:schema-version')
  })
})

describe('clearDashboardCardStorage', () => {
  it('removes both the data key and version key', () => {
    localStorage.setItem(KEY, '[]')
    localStorage.setItem(VERSION_KEY, SCHEMA_VERSION)
    clearDashboardCardStorage(KEY)
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(localStorage.getItem(VERSION_KEY)).toBeNull()
  })
})

describe('loadDashboardCardsFromStorage', () => {
  const fallback = [makeCard({ id: 'fallback-1' })]

  it('returns fallback when storage key is absent', () => {
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(fallback)
  })

  it('returns valid cards stored without a version key (first-load)', () => {
    const cards = [makeCard()]
    localStorage.setItem(KEY, JSON.stringify(cards))
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(cards)
  })

  it('returns valid cards with matching schema version', () => {
    const cards = [makeCard(), makeCard({ id: 'card-2', card_type: 'gpu' })]
    localStorage.setItem(KEY, JSON.stringify(cards))
    localStorage.setItem(VERSION_KEY, SCHEMA_VERSION)
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(cards)
  })

  it('returns fallback and clears storage on schema version mismatch', () => {
    const cards = [makeCard()]
    localStorage.setItem(KEY, JSON.stringify(cards))
    localStorage.setItem(VERSION_KEY, '99')
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(fallback)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('returns fallback and clears storage on invalid JSON', () => {
    localStorage.setItem(KEY, '{ not valid json')
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(fallback)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('returns fallback and clears storage when stored value is not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'card-1' }))
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(fallback)
  })

  it('returns fallback when a card has missing id', () => {
    const bad = [{ card_type: 'clusters', config: {} }]
    localStorage.setItem(KEY, JSON.stringify(bad))
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(fallback)
  })

  it('returns fallback when a card has empty id', () => {
    const bad = [{ id: '', card_type: 'clusters', config: {} }]
    localStorage.setItem(KEY, JSON.stringify(bad))
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(fallback)
  })

  it('returns fallback when a card has missing card_type', () => {
    const bad = [{ id: 'c1', config: {} }]
    localStorage.setItem(KEY, JSON.stringify(bad))
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(fallback)
  })

  it('returns fallback when a card config is not a plain object', () => {
    const bad = [{ id: 'c1', card_type: 'gpu', config: 'oops' }]
    localStorage.setItem(KEY, JSON.stringify(bad))
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(fallback)
  })

  it('returns fallback when title is not a string', () => {
    const bad = [{ id: 'c1', card_type: 'gpu', config: {}, title: 42 }]
    localStorage.setItem(KEY, JSON.stringify(bad))
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result).toEqual(fallback)
  })

  it('accepts card with optional title as string', () => {
    const cards = [makeCard({ title: 'My GPU Card' })]
    localStorage.setItem(KEY, JSON.stringify(cards))
    const result = loadDashboardCardsFromStorage(KEY, fallback)
    expect(result[0].title).toBe('My GPU Card')
  })

  describe('requirePosition option', () => {
    it('returns fallback when requirePosition=true and card has no position', () => {
      const cards = [makeCard()]
      localStorage.setItem(KEY, JSON.stringify(cards))
      const result = loadDashboardCardsFromStorage(KEY, fallback, { requirePosition: true })
      expect(result).toEqual(fallback)
    })

    it('accepts card with valid position when requirePosition=true', () => {
      const cards = [makeCardWithPosition()]
      localStorage.setItem(KEY, JSON.stringify(cards))
      const result = loadDashboardCardsFromStorage(KEY, fallback, { requirePosition: true })
      expect(result).toEqual(cards)
    })
  })

  describe('requireGridCoordinates option', () => {
    it('returns fallback when position missing x/y and requireGridCoordinates=true', () => {
      const cards = [makeCard({ position: { w: 2, h: 2 } })]
      localStorage.setItem(KEY, JSON.stringify(cards))
      const result = loadDashboardCardsFromStorage(KEY, fallback, { requireGridCoordinates: true })
      expect(result).toEqual(fallback)
    })

    it('accepts card with x/y/w/h when requireGridCoordinates=true', () => {
      const cards = [makeCardWithPosition()]
      localStorage.setItem(KEY, JSON.stringify(cards))
      const result = loadDashboardCardsFromStorage(KEY, fallback, { requireGridCoordinates: true })
      expect(result).toEqual(cards)
    })

    it('returns fallback when w is less than 1', () => {
      const cards = [makeCard({ position: { x: 0, y: 0, w: 0, h: 2 } })]
      localStorage.setItem(KEY, JSON.stringify(cards))
      const result = loadDashboardCardsFromStorage(KEY, fallback, { requireGridCoordinates: true })
      expect(result).toEqual(fallback)
    })
  })
})

describe('saveDashboardCardsToStorage', () => {
  it('writes cards as JSON and sets schema version', () => {
    const cards = [makeCard(), makeCardWithPosition()]
    saveDashboardCardsToStorage(KEY, cards)
    const raw = localStorage.getItem(KEY)
    expect(JSON.parse(raw!)).toEqual(cards)
    expect(localStorage.getItem(VERSION_KEY)).toBe(SCHEMA_VERSION)
  })

  it('overwrites previous data', () => {
    saveDashboardCardsToStorage(KEY, [makeCard()])
    saveDashboardCardsToStorage(KEY, [makeCard({ id: 'updated' })])
    const raw = JSON.parse(localStorage.getItem(KEY)!)
    expect(raw[0].id).toBe('updated')
  })

  it('can save empty array', () => {
    saveDashboardCardsToStorage(KEY, [])
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([])
  })
})

describe('round-trip: save then load', () => {
  it('persists and restores cards faithfully', () => {
    const cards: DashboardCardStorageEntry[] = [
      makeCard({ id: 'c1', config: { size: 'large' } }),
      makeCardWithPosition({ id: 'c2', card_type: 'gpu', title: 'GPU' }),
    ]
    saveDashboardCardsToStorage(KEY, cards)
    const loaded = loadDashboardCardsFromStorage(KEY, [])
    expect(loaded).toEqual(cards)
  })
})

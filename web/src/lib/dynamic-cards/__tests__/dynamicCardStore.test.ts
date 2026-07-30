import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for dynamicCardStore - localStorage persistence for dynamic cards.
 *
 * We mock the underlying registry functions (dynamicCardRegistry) so
 * these tests focus on the store layer (load/save/import/export/delete).
 */

// Mock the registry before importing the store
const mockCards = new Map<string, Record<string, unknown>>()

vi.mock('../dynamicCardRegistry', () => ({
  registerDynamicCard: vi.fn((def: Record<string, unknown>) => {
    mockCards.set(def.id as string, def)
  }),
  getAllDynamicCards: vi.fn(() => Array.from(mockCards.values())),
  unregisterDynamicCard: vi.fn((id: string) => {
    const had = mockCards.has(id)
    mockCards.delete(id)
    return had
  }),
  clearDynamicCards: vi.fn(() => {
    mockCards.clear()
  }),
}))

import {
  loadDynamicCards,
  saveDynamicCards,
  saveDynamicCard,
  deleteDynamicCard,
  exportDynamicCards,
  importDynamicCards,
} from '../dynamicCardStore'
import {
  registerDynamicCard,
  unregisterDynamicCard,
} from '../dynamicCardRegistry'

const STORAGE_KEY = 'kc-dynamic-cards'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockCards.clear()
})

describe('loadDynamicCards', () => {
  it('does nothing when localStorage has no stored cards', () => {
    loadDynamicCards()
    expect(registerDynamicCard).not.toHaveBeenCalled()
  })

  it('registers cards from localStorage', () => {
    const stored = [
      { id: 'card-1', title: 'Card 1', tier: 'tier1' },
      {
        id: 'card-2',
        title: 'Card 2',
        tier: 'tier2',
        sourceCode: 'module.exports.default = () => null',
      },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    loadDynamicCards()

    expect(registerDynamicCard).toHaveBeenCalledTimes(2)
  })

  it('drops invalid stored entries (schema validation)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stored = [
      { id: 'good', title: 'Good', tier: 'tier1' },
      { id: 'bad id', title: 'Bad', tier: 'tier1' }, // invalid slug
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    loadDynamicCards()

    expect(registerDynamicCard).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('handles corrupted localStorage gracefully', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, 'not valid json{{{')

    expect(() => loadDynamicCards()).not.toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  // #6681: reconcile removals on reload. Previously loadDynamicCards was
  // additive and left entries that had been removed from storage still
  // registered in memory.
  it('reconciles removals when storage shrinks between loads', () => {
    const three = [
      { id: 'a', title: 'A', tier: 'tier1' },
      { id: 'b', title: 'B', tier: 'tier1' },
      { id: 'c', title: 'C', tier: 'tier1' },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(three))
    loadDynamicCards()
    expect(mockCards.size).toBe(3)

    const two = [
      { id: 'a', title: 'A', tier: 'tier1' },
      { id: 'b', title: 'B', tier: 'tier1' },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(two))
    loadDynamicCards()

    expect(mockCards.size).toBe(2)
    expect(mockCards.has('a')).toBe(true)
    expect(mockCards.has('b')).toBe(true)
    expect(mockCards.has('c')).toBe(false)
  })

  it('clears the registry when storage has been emptied', () => {
    const one = [{ id: 'only', title: 'Only', tier: 'tier1' }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(one))
    loadDynamicCards()
    expect(mockCards.size).toBe(1)

    localStorage.removeItem(STORAGE_KEY)
    loadDynamicCards()
    expect(mockCards.size).toBe(0)
  })
})

describe('saveDynamicCards', () => {
  it('persists all registered cards to localStorage', () => {
    mockCards.set('c1', { id: 'c1', title: 'C1', tier: 'tier1' })

    saveDynamicCards()

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('c1')
  })

  it('handles localStorage write errors gracefully', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = () => {
      throw new Error('QuotaExceeded')
    }

    expect(() => saveDynamicCards()).not.toThrow()
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
    localStorage.setItem = originalSetItem
  })
})

describe('saveDynamicCard', () => {
  it('registers the card and persists to localStorage', () => {
    const def = { id: 'new-card', title: 'New Card', tier: 'tier1' }
    saveDynamicCard(def as never)

    expect(registerDynamicCard).toHaveBeenCalledWith(def)
  })

  it('throws when id fails the slug regex', () => {
    const def = { id: 'bad id with spaces', title: 'X', tier: 'tier1' }
    expect(() => saveDynamicCard(def as never)).toThrow(/Invalid dynamic card/)
  })

  it('throws when a tier2 card omits sourceCode', () => {
    const def = { id: 'tier2-card', title: 'T2', tier: 'tier2' }
    expect(() => saveDynamicCard(def as never)).toThrow(/sourceCode/)
  })

  it('throws when sourceCode exceeds the size limit', () => {
    // MAX_CARD_SOURCE_BYTES = 50_000; use a hair over that.
    const OVERSIZE_BYTES = 50_001
    const def = {
      id: 'tier2-big',
      title: 'Big',
      tier: 'tier2',
      sourceCode: 'a'.repeat(OVERSIZE_BYTES),
    }
    expect(() => saveDynamicCard(def as never)).toThrow(/exceeds/)
  })

  it('throws when an unknown top-level field is present', () => {
    const def = { id: 'x', title: 'X', tier: 'tier1', rogueField: 1 }
    expect(() => saveDynamicCard(def as never)).toThrow(/Unknown field/)
  })
})

describe('deleteDynamicCard', () => {
  it('returns true when card was unregistered', () => {
    mockCards.set('card-1', { id: 'card-1' })
    const result = deleteDynamicCard('card-1')
    expect(result).toBe(true)
    expect(unregisterDynamicCard).toHaveBeenCalledWith('card-1')
  })

  it('returns false when card did not exist', () => {
    const result = deleteDynamicCard('nonexistent')
    expect(result).toBe(false)
  })
})

describe('exportDynamicCards', () => {
  it('returns JSON string of all cards', () => {
    mockCards.set('c1', { id: 'c1', title: 'C1', tier: 't1' })

    const json = exportDynamicCards()
    const parsed = JSON.parse(json)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('c1')
  })

  it('returns formatted JSON with 2-space indent', () => {
    const json = exportDynamicCards()
    expect(json).toBe('[]')
  })
})

describe('importDynamicCards', () => {
  it('imports valid cards and returns count', () => {
    const json = JSON.stringify([
      { id: 'i1', title: 'Import 1', tier: 'tier1' },
      { id: 'i2', title: 'Import 2', tier: 'tier2', sourceCode: 'module.exports = () => null' },
    ])

    const result = importDynamicCards(json)
    expect(result.count).toBe(2)
    expect(result.invalid).toHaveLength(0)
    expect(registerDynamicCard).toHaveBeenCalledTimes(2)
  })

  it('reports invalid entries in the result', () => {
    const json = JSON.stringify([
      { id: 'valid', title: 'Valid', tier: 'tier1' },
      { id: 'no-title', tier: 'tier1' },
      { title: 'no-id', tier: 'tier1' },
      { id: 'tier2-missing-source', title: 'T', tier: 'tier2' },
    ])

    const result = importDynamicCards(json)
    expect(result.count).toBe(1)
    expect(result.invalid).toHaveLength(3)
    expect(result.invalid[0].index).toBe(1)
  })

  it('returns error result for invalid JSON', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = importDynamicCards('invalid json')
    expect(result.count).toBe(0)
    expect(result.invalid[0].error).toMatch(/Parse error/)
    spy.mockRestore()
  })

  it('returns empty result for empty array', () => {
    const result = importDynamicCards('[]')
    expect(result.count).toBe(0)
    expect(result.invalid).toHaveLength(0)
  })

  it('rejects non-array top-level values', () => {
    const result = importDynamicCards('{"not":"array"}')
    expect(result.count).toBe(0)
    expect(result.invalid[0].error).toMatch(/not an array/)
  })
})

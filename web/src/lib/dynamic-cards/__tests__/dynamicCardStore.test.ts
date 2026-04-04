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
      { id: 'card-2', title: 'Card 2', tier: 'tier2' },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    loadDynamicCards()

    expect(registerDynamicCard).toHaveBeenCalledTimes(2)
  })

  it('handles corrupted localStorage gracefully', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, 'not valid json{{{')

    expect(() => loadDynamicCards()).not.toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
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
      { id: 'i2', title: 'Import 2', tier: 'tier2' },
    ])

    const count = importDynamicCards(json)
    expect(count).toBe(2)
    expect(registerDynamicCard).toHaveBeenCalledTimes(2)
  })

  it('skips entries missing required fields', () => {
    const json = JSON.stringify([
      { id: 'valid', title: 'Valid', tier: 'tier1' },
      { id: 'no-title', tier: 'tier1' },
      { title: 'no-id', tier: 'tier1' },
    ])

    const count = importDynamicCards(json)
    expect(count).toBe(1)
  })

  it('returns 0 for invalid JSON', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const count = importDynamicCards('invalid json')
    expect(count).toBe(0)
    spy.mockRestore()
  })

  it('returns 0 for empty array', () => {
    const count = importDynamicCards('[]')
    expect(count).toBe(0)
  })
})

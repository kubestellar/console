import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for dynamicStatsStore - localStorage persistence for dynamic stats.
 *
 * We mock the underlying registry functions (dynamicStatsRegistry) so
 * these tests focus on the store layer.
 */

const mockStats = new Map<string, Record<string, unknown>>()

vi.mock('../dynamicStatsRegistry', () => ({
  registerDynamicStats: vi.fn((def: Record<string, unknown>) => {
    mockStats.set(def.type as string, def)
  }),
  getAllDynamicStats: vi.fn(() => Array.from(mockStats.values())),
  unregisterDynamicStats: vi.fn((type: string) => {
    const had = mockStats.has(type)
    mockStats.delete(type)
    return had
  }),
  clearDynamicStats: vi.fn(() => {
    mockStats.clear()
  }),
  toRecord: vi.fn((def: Record<string, unknown>) => def),
}))

import {
  loadDynamicStats,
  saveDynamicStats,
  saveDynamicStatsDefinition,
  deleteDynamicStatsDefinition,
  exportDynamicStats,
  importDynamicStats,
} from '../dynamicStatsStore'
import {
  registerDynamicStats,
  unregisterDynamicStats,
} from '../dynamicStatsRegistry'

const STORAGE_KEY = 'kc-dynamic-stats'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockStats.clear()
})

describe('loadDynamicStats', () => {
  it('does nothing when localStorage is empty', () => {
    loadDynamicStats()
    expect(registerDynamicStats).not.toHaveBeenCalled()
  })

  it('registers stats from localStorage', () => {
    const stored = [
      { type: 'stat-1', blocks: [{ id: 'a', label: 'A' }] },
      { type: 'stat-2', blocks: [{ id: 'b', label: 'B' }] },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    loadDynamicStats()

    expect(registerDynamicStats).toHaveBeenCalledTimes(2)
  })

  it('drops entries that fail schema validation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stored = [
      { type: 'good', blocks: [{ id: 'a', label: 'A' }] },
      { type: 'bad', blocks: 'not-an-array' },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    loadDynamicStats()

    expect(registerDynamicStats).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('handles corrupted localStorage gracefully', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, '{{invalid}')

    expect(() => loadDynamicStats()).not.toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  // #6681: reconcile removals on reload. Previously loadDynamicStats was
  // additive and left entries that had been removed from storage still
  // registered in memory.
  it('reconciles removals when storage shrinks between loads', () => {
    const three = [
      { type: 'a', blocks: [{ id: 'a-block', label: 'A' }] },
      { type: 'b', blocks: [{ id: 'b-block', label: 'B' }] },
      { type: 'c', blocks: [{ id: 'c-block', label: 'C' }] },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(three))
    loadDynamicStats()
    expect(mockStats.size).toBe(3)

    const two = [
      { type: 'a', blocks: [{ id: 'a-block', label: 'A' }] },
      { type: 'b', blocks: [{ id: 'b-block', label: 'B' }] },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(two))
    loadDynamicStats()

    expect(mockStats.size).toBe(2)
    expect(mockStats.has('a')).toBe(true)
    expect(mockStats.has('b')).toBe(true)
    expect(mockStats.has('c')).toBe(false)
  })

  it('clears the registry when storage has been emptied', () => {
    const one = [{ type: 'only', blocks: [{ id: 'only-block', label: 'Only' }] }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(one))
    loadDynamicStats()
    expect(mockStats.size).toBe(1)

    localStorage.removeItem(STORAGE_KEY)
    loadDynamicStats()
    expect(mockStats.size).toBe(0)
  })
})

describe('saveDynamicStats', () => {
  it('persists all registered stats to localStorage', () => {
    mockStats.set('s1', { type: 's1', blocks: [] })

    saveDynamicStats()

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].type).toBe('s1')
  })

  it('handles localStorage errors gracefully', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = () => {
      throw new Error('QuotaExceeded')
    }

    expect(() => saveDynamicStats()).not.toThrow()
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
    localStorage.setItem = originalSetItem
  })
})

describe('saveDynamicStatsDefinition', () => {
  it('registers the definition and persists', () => {
    const def = { type: 'new-stat', blocks: [{ id: 'x', label: 'X' }] }
    saveDynamicStatsDefinition(def as never)
    expect(registerDynamicStats).toHaveBeenCalledWith(def)
  })

  it('throws on invalid definition (unknown field)', () => {
    const def = { type: 'bad', blocks: [], rogueField: 1 }
    expect(() => saveDynamicStatsDefinition(def as never)).toThrow(/Invalid dynamic stats/)
  })

  it('throws on non-array blocks', () => {
    const def = { type: 'bad', blocks: 'nope' }
    expect(() => saveDynamicStatsDefinition(def as never)).toThrow(/blocks must be an array/)
  })
})

describe('deleteDynamicStatsDefinition', () => {
  it('returns true when stat was removed', () => {
    mockStats.set('existing', { type: 'existing', blocks: [] })
    const result = deleteDynamicStatsDefinition('existing')
    expect(result).toBe(true)
    expect(unregisterDynamicStats).toHaveBeenCalledWith('existing')
  })

  it('returns false when stat did not exist', () => {
    const result = deleteDynamicStatsDefinition('nonexistent')
    expect(result).toBe(false)
  })
})

describe('exportDynamicStats', () => {
  it('returns JSON string of all stats', () => {
    mockStats.set('s1', { type: 's1', blocks: [] })
    const json = exportDynamicStats()
    const parsed = JSON.parse(json)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe('s1')
  })

  it('returns empty array JSON when no stats', () => {
    const json = exportDynamicStats()
    expect(json).toBe('[]')
  })
})

describe('importDynamicStats', () => {
  it('imports valid stats and returns count', () => {
    const json = JSON.stringify([
      { type: 'a', blocks: [{ id: 'a1', label: 'A' }] },
      { type: 'b', blocks: [{ id: 'b1', label: 'B' }] },
    ])
    const result = importDynamicStats(json)
    expect(result.count).toBe(2)
    expect(result.invalid).toHaveLength(0)
    expect(registerDynamicStats).toHaveBeenCalledTimes(2)
  })

  it('reports invalid entries in the result', () => {
    const json = JSON.stringify([
      { type: 'valid', blocks: [{ id: 'v', label: 'V' }] },
      { type: 'no-blocks' },
      { blocks: [{ id: 'nt', label: 'no-type' }] },
      { type: 'non-array-blocks', blocks: 'invalid' },
    ])
    const result = importDynamicStats(json)
    expect(result.count).toBe(1)
    expect(result.invalid).toHaveLength(3)
  })

  it('returns error result for invalid JSON', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = importDynamicStats('not json')
    expect(result.count).toBe(0)
    expect(result.invalid[0].error).toMatch(/Parse error/)
    spy.mockRestore()
  })

  it('returns empty result for empty array', () => {
    const result = importDynamicStats('[]')
    expect(result.count).toBe(0)
    expect(result.invalid).toHaveLength(0)
  })
})

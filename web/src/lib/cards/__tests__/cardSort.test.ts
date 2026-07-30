/**
 * Tests for cardSort.ts — covers commonComparators and useCardSort hook.
 * commonComparators are pure functions; useCardSort is tested with renderHook.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { commonComparators, useCardSort } from '../cardSort'

// ── commonComparators ─────────────────────────────────────────────────────────

describe('commonComparators', () => {
  describe('string', () => {
    it('sorts strings alphabetically (ascending)', () => {
      const items = [{ name: 'Banana' }, { name: 'Apple' }, { name: 'Cherry' }]
      const cmp = commonComparators.string<(typeof items)[0]>('name')
      const sorted = [...items].sort(cmp)
      expect(sorted.map(i => i.name)).toEqual(['Apple', 'Banana', 'Cherry'])
    })

    it('returns negative when a < b', () => {
      const cmp = commonComparators.string<{ name: string }>('name')
      expect(cmp({ name: 'Apple' }, { name: 'Banana' })).toBeLessThan(0)
    })

    it('returns positive when a > b', () => {
      const cmp = commonComparators.string<{ name: string }>('name')
      expect(cmp({ name: 'Zebra' }, { name: 'Apple' })).toBeGreaterThan(0)
    })

    it('returns 0 for equal strings', () => {
      const cmp = commonComparators.string<{ name: string }>('name')
      expect(cmp({ name: 'Same' }, { name: 'Same' })).toBe(0)
    })

    it('coerces null/undefined to empty string', () => {
      const cmp = commonComparators.string<{ name: string | null | undefined }>('name')
      expect(cmp({ name: null }, { name: 'a' })).toBeLessThan(0)
      expect(cmp({ name: undefined }, { name: undefined })).toBe(0)
      expect(cmp({ name: '' }, { name: '' })).toBe(0)
    })

    it('handles falsy values in field', () => {
      const cmp = commonComparators.string<{ name: string | number }>('name')
      expect(cmp({ name: 0 }, { name: 1 })).toBeLessThan(0) // 0 coerces to '' and sorts before '1'
    })
  })

  describe('number', () => {
    it('sorts numbers ascending', () => {
      const items = [{ count: 30 }, { count: 10 }, { count: 20 }]
      const cmp = commonComparators.number<(typeof items)[0]>('count')
      const sorted = [...items].sort(cmp)
      expect(sorted.map(i => i.count)).toEqual([10, 20, 30])
    })

    it('returns negative for a < b', () => {
      const cmp = commonComparators.number<{ count: number }>('count')
      expect(cmp({ count: 1 }, { count: 5 })).toBeLessThan(0)
    })

    it('returns positive for a > b', () => {
      const cmp = commonComparators.number<{ count: number }>('count')
      expect(cmp({ count: 10 }, { count: 3 })).toBeGreaterThan(0)
    })

    it('returns 0 for equal numbers', () => {
      const cmp = commonComparators.number<{ count: number }>('count')
      expect(cmp({ count: 7 }, { count: 7 })).toBe(0)
    })

    it('coerces non-numeric fields to 0', () => {
      const cmp = commonComparators.number<{ count: number | string | null | undefined }>('count')
      expect(cmp({ count: 'abc' }, { count: 5 })).toBeLessThan(0) // 0 < 5
      expect(cmp({ count: null }, { count: null })).toBe(0)
      expect(cmp({ count: undefined }, { count: undefined })).toBe(0)
    })
  })

  describe('statusOrder', () => {
    const ORDER = { critical: 0, warning: 1, info: 2 }

    it('sorts by priority map ascending', () => {
      const items = [{ status: 'info' }, { status: 'critical' }, { status: 'warning' }]
      const cmp = commonComparators.statusOrder<(typeof items)[0]>('status', ORDER)
      const sorted = [...items].sort(cmp)
      expect(sorted.map(i => i.status)).toEqual(['critical', 'warning', 'info'])
    })

    it('returns negative when a has higher priority than b', () => {
      const cmp = commonComparators.statusOrder<{ status: string }>('status', ORDER)
      expect(cmp({ status: 'critical' }, { status: 'info' })).toBeLessThan(0)
    })

    it('returns positive when a has lower priority than b', () => {
      const cmp = commonComparators.statusOrder<{ status: string }>('status', ORDER)
      expect(cmp({ status: 'info' }, { status: 'critical' })).toBeGreaterThan(0)
    })

    it('returns 0 for equal status', () => {
      const cmp = commonComparators.statusOrder<{ status: string }>('status', ORDER)
      expect(cmp({ status: 'warning' }, { status: 'warning' })).toBe(0)
    })

    it('maps unknown statuses to 999 (sorts last)', () => {
      const cmp = commonComparators.statusOrder<{ status: string }>('status', ORDER)
      expect(cmp({ status: 'unknown' }, { status: 'critical' })).toBeGreaterThan(0)
      expect(cmp({ status: 'unknown' }, { status: 'unknown' })).toBe(0)
    })

    it('handles empty string status as unknown (999)', () => {
      const cmp = commonComparators.statusOrder<{ status: string }>('status', ORDER)
      expect(cmp({ status: '' }, { status: 'info' })).toBeGreaterThan(0)
    })
  })

  describe('date', () => {
    it('sorts valid ISO dates chronologically', () => {
      const items = [
        { ts: '2024-06-01T00:00:00Z' },
        { ts: '2024-01-01T00:00:00Z' },
        { ts: '2024-03-01T00:00:00Z' },
      ]
      const cmp = commonComparators.date<(typeof items)[0]>('ts')
      const sorted = [...items].sort(cmp)
      expect(sorted[0].ts).toBe('2024-01-01T00:00:00Z')
      expect(sorted[2].ts).toBe('2024-06-01T00:00:00Z')
    })

    it('returns negative for earlier date vs later', () => {
      const cmp = commonComparators.date<{ ts: string }>('ts')
      expect(cmp({ ts: '2024-01-01T00:00:00Z' }, { ts: '2024-12-31T00:00:00Z' })).toBeLessThan(0)
    })

    it('returns positive for later date vs earlier', () => {
      const cmp = commonComparators.date<{ ts: string }>('ts')
      expect(cmp({ ts: '2024-12-31T00:00:00Z' }, { ts: '2024-01-01T00:00:00Z' })).toBeGreaterThan(0)
    })

    it('returns 0 for equal dates', () => {
      const cmp = commonComparators.date<{ ts: string }>('ts')
      expect(cmp({ ts: '2024-01-01T00:00:00Z' }, { ts: '2024-01-01T00:00:00Z' })).toBe(0)
    })

    it('sends invalid date strings to end (MAX_SAFE_INTEGER sentinel)', () => {
      const items = [
        { ts: 'not-a-date' },
        { ts: '2024-01-01T00:00:00Z' },
        { ts: '' },
      ]
      const cmp = commonComparators.date<(typeof items)[0]>('ts')
      const sorted = [...items].sort(cmp)
      expect(sorted[0].ts).toBe('2024-01-01T00:00:00Z')
      expect(['not-a-date', '']).toContain(sorted[1].ts)
      expect(['not-a-date', '']).toContain(sorted[2].ts)
    })

    it('treats two invalid dates as equal relative to each other', () => {
      const cmp = commonComparators.date<{ ts: string }>('ts')
      expect(cmp({ ts: 'bad-date' }, { ts: 'also-bad' })).toBe(0)
    })

    it('accepts Date objects (not just strings)', () => {
      const cmp = commonComparators.date<{ ts: Date | string }>('ts')
      const d1 = new Date('2024-01-01')
      const d2 = new Date('2024-06-01')
      expect(cmp({ ts: d1 }, { ts: d2 })).toBeLessThan(0)
      expect(cmp({ ts: d2 }, { ts: d1 })).toBeGreaterThan(0)
    })

    it('epoch-zero timestamp sorts before invalid dates (not treated as NaN)', () => {
      const cmp = commonComparators.date<{ ts: string | number }>('ts')
      // new Date(0).getTime() = 0, not NaN — should sort before invalid
      const epochZero = new Date(0).toISOString()
      expect(cmp({ ts: epochZero }, { ts: 'not-a-date' })).toBeLessThan(0)
    })
  })
})

// ── useCardSort ───────────────────────────────────────────────────────────────

interface Item {
  name: string
  count: number
}

const ITEMS: Item[] = [
  { name: 'Banana', count: 30 },
  { name: 'Apple', count: 10 },
  { name: 'Cherry', count: 20 },
]

const SORT_CONFIG = {
  defaultField: 'name' as const,
  defaultDirection: 'asc' as const,
  comparators: {
    name: commonComparators.string<Item>('name'),
    count: commonComparators.number<Item>('count'),
  },
}

describe('useCardSort', () => {
  it('sorts by default field ascending on mount', () => {
    const { result } = renderHook(() => useCardSort(ITEMS, SORT_CONFIG))
    expect(result.current.sorted[0].name).toBe('Apple')
    expect(result.current.sorted[2].name).toBe('Cherry')
  })

  it('sorts descending when defaultDirection is desc', () => {
    const { result } = renderHook(() =>
      useCardSort(ITEMS, { ...SORT_CONFIG, defaultDirection: 'desc' }),
    )
    expect(result.current.sorted[0].name).toBe('Cherry')
    expect(result.current.sorted[2].name).toBe('Apple')
  })

  it('exposes sortBy and sortDirection from config defaults', () => {
    const { result } = renderHook(() => useCardSort(ITEMS, SORT_CONFIG))
    expect(result.current.sortBy).toBe('name')
    expect(result.current.sortDirection).toBe('asc')
  })

  it('toggleSortDirection flips asc → desc', () => {
    const { result } = renderHook(() => useCardSort(ITEMS, SORT_CONFIG))
    act(() => { result.current.toggleSortDirection() })
    expect(result.current.sortDirection).toBe('desc')
    expect(result.current.sorted[0].name).toBe('Cherry')
  })

  it('toggleSortDirection flips desc → asc', () => {
    const { result } = renderHook(() =>
      useCardSort(ITEMS, { ...SORT_CONFIG, defaultDirection: 'desc' }),
    )
    act(() => { result.current.toggleSortDirection() })
    expect(result.current.sortDirection).toBe('asc')
    expect(result.current.sorted[0].name).toBe('Apple')
  })

  it('setSortBy switches to new field', () => {
    const { result } = renderHook(() => useCardSort(ITEMS, SORT_CONFIG))
    act(() => { result.current.setSortBy('count') })
    expect(result.current.sortBy).toBe('count')
    expect(result.current.sorted[0].count).toBe(10)
    expect(result.current.sorted[2].count).toBe(30)
  })

  it('setSortDirection changes direction without toggling', () => {
    const { result } = renderHook(() => useCardSort(ITEMS, SORT_CONFIG))
    act(() => { result.current.setSortDirection('desc') })
    expect(result.current.sortDirection).toBe('desc')
  })

  it('returns items in original order when no comparator for sort field', () => {
    const { result } = renderHook(() =>
      useCardSort(ITEMS, {
        defaultField: 'name' as const,
        defaultDirection: 'asc' as const,
        comparators: {} as Record<string, (a: Item, b: Item) => number>,
      }),
    )
    expect(result.current.sorted).toHaveLength(3)
  })

  it('handles undefined config gracefully (returns items copy)', () => {
    const { result } = renderHook(() => useCardSort(ITEMS, undefined as unknown as Parameters<typeof useCardSort<Item>>[1]))
    expect(result.current.sorted).toHaveLength(3)
  })

  it('handles empty items array', () => {
    const { result } = renderHook(() => useCardSort([], SORT_CONFIG))
    expect(result.current.sorted).toHaveLength(0)
  })
})

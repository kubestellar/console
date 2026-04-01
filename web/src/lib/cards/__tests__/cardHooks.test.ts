/**
 * Deep regression-preventing tests for cardHooks.ts
 *
 * Covers:
 * - commonComparators (pure functions: string, number, statusOrder, date)
 * - getCollapsedCards / saveCollapsedCards (localStorage helpers)
 * - useCardSort (via renderHook)
 * - useCardCollapse / useCardCollapseAll (via renderHook)
 * - useStatusFilter (via renderHook)
 * - useCardFlash (via renderHook + timers)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    filterByCluster: <T,>(items: T[]) => items,
    filterByStatus: <T,>(items: T[]) => items,
    customFilter: '',
    selectedClusters: [] as string[],
    isAllClustersSelected: true,
  }),
}))

vi.mock('../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({
    deduplicatedClusters: [],
    clusters: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FLASH_ANIMATION_MS: 100, // speed up for tests
  }
})

vi.mock('../useStablePageHeight', () => ({
  useStablePageHeight: () => ({
    containerRef: { current: null },
    containerStyle: undefined,
  }),
}))

import {
  commonComparators,
  useCardSort,
  useCardCollapse,
  useCardCollapseAll,
  useStatusFilter,
  useCardFlash,
  type SortConfig,
  type StatusFilterConfig,
} from '../cardHooks'

// ---------------------------------------------------------------------------
// localStorage key used internally by cardHooks
// ---------------------------------------------------------------------------
const COLLAPSED_STORAGE_KEY = 'kubestellar-collapsed-cards'
const LOCAL_FILTER_STORAGE_PREFIX = 'kubestellar-card-filter:'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// commonComparators — pure function tests
// ============================================================================

describe('commonComparators', () => {
  describe('string', () => {
    interface Item { name: string }
    const compare = commonComparators.string<Item>('name')

    it('sorts alphabetically ascending', () => {
      expect(compare({ name: 'banana' }, { name: 'apple' })).toBeGreaterThan(0)
    })

    it('returns 0 for equal strings', () => {
      expect(compare({ name: 'apple' }, { name: 'apple' })).toBe(0)
    })

    it('handles empty strings', () => {
      expect(compare({ name: '' }, { name: 'a' })).toBeLessThan(0)
    })

    it('treats falsy field values as empty string', () => {
      const compareNull = commonComparators.string<{ name: string | null }>('name')
      expect(compareNull({ name: null } as unknown as { name: string | null }, { name: 'a' })).toBeLessThan(0)
    })

    it('case-insensitive locale comparison', () => {
      // localeCompare is case-insensitive by default in most locales
      const result = compare({ name: 'Apple' }, { name: 'apple' })
      // Should be 0 or very small — depends on locale, but not wildly different
      expect(Math.abs(result)).toBeLessThanOrEqual(1)
    })
  })

  describe('number', () => {
    interface Item { value: number }
    const compare = commonComparators.number<Item>('value')

    it('sorts numerically ascending', () => {
      expect(compare({ value: 10 }, { value: 5 })).toBeGreaterThan(0)
    })

    it('returns 0 for equal numbers', () => {
      expect(compare({ value: 7 }, { value: 7 })).toBe(0)
    })

    it('handles negative numbers', () => {
      expect(compare({ value: -3 }, { value: 2 })).toBeLessThan(0)
    })

    it('treats NaN as 0', () => {
      const result = compare({ value: NaN }, { value: 5 })
      expect(result).toBe(-5)
    })

    it('treats undefined as 0', () => {
      const compareUndef = commonComparators.number<{ value?: number }>('value')
      expect(compareUndef({ value: undefined }, { value: 3 })).toBeLessThan(0)
    })
  })

  describe('statusOrder', () => {
    interface Item { status: string }
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2, ok: 3 }
    const compare = commonComparators.statusOrder<Item>('status', order)

    it('sorts by priority order', () => {
      expect(compare({ status: 'critical' }, { status: 'ok' })).toBeLessThan(0)
    })

    it('returns 0 for same status', () => {
      expect(compare({ status: 'warning' }, { status: 'warning' })).toBe(0)
    })

    it('puts unknown statuses last (999)', () => {
      expect(compare({ status: 'unknown' }, { status: 'critical' })).toBeGreaterThan(0)
    })

    it('two unknown statuses compare equal', () => {
      expect(compare({ status: 'foo' }, { status: 'bar' })).toBe(0)
    })

    it('empty status treated as unknown', () => {
      expect(compare({ status: '' }, { status: 'critical' })).toBeGreaterThan(0)
    })
  })

  describe('date', () => {
    interface Item { createdAt: string }
    const compare = commonComparators.date<Item>('createdAt')

    it('sorts chronologically ascending', () => {
      expect(
        compare({ createdAt: '2024-01-01' }, { createdAt: '2024-06-01' })
      ).toBeLessThan(0)
    })

    it('returns 0 for equal dates', () => {
      expect(
        compare({ createdAt: '2024-03-15' }, { createdAt: '2024-03-15' })
      ).toBe(0)
    })

    it('handles ISO timestamps', () => {
      expect(
        compare(
          { createdAt: '2024-01-01T00:00:00Z' },
          { createdAt: '2024-01-01T12:00:00Z' }
        )
      ).toBeLessThan(0)
    })

    it('handles invalid dates (NaN comparison)', () => {
      const result = compare(
        { createdAt: 'not-a-date' },
        { createdAt: '2024-01-01' }
      )
      expect(Number.isNaN(result)).toBe(true)
    })
  })
})

// ============================================================================
// useCardSort — hook tests
// ============================================================================

describe('useCardSort', () => {
  interface TestItem { name: string; priority: number }

  const items: TestItem[] = [
    { name: 'Charlie', priority: 3 },
    { name: 'Alice', priority: 1 },
    { name: 'Bob', priority: 2 },
  ]

  const sortConfig: SortConfig<TestItem, 'name' | 'priority'> = {
    defaultField: 'name',
    defaultDirection: 'asc',
    comparators: {
      name: commonComparators.string<TestItem>('name'),
      priority: commonComparators.number<TestItem>('priority'),
    },
  }

  it('sorts items by default field and direction', () => {
    const { result } = renderHook(() => useCardSort(items, sortConfig))
    expect(result.current.sorted.map(i => i.name)).toEqual(['Alice', 'Bob', 'Charlie'])
    expect(result.current.sortBy).toBe('name')
    expect(result.current.sortDirection).toBe('asc')
  })

  it('reverses order when direction is desc', () => {
    const { result } = renderHook(() => useCardSort(items, sortConfig))
    act(() => { result.current.setSortDirection('desc') })
    expect(result.current.sorted.map(i => i.name)).toEqual(['Charlie', 'Bob', 'Alice'])
  })

  it('toggleSortDirection flips between asc and desc', () => {
    const { result } = renderHook(() => useCardSort(items, sortConfig))
    expect(result.current.sortDirection).toBe('asc')
    act(() => { result.current.toggleSortDirection() })
    expect(result.current.sortDirection).toBe('desc')
    act(() => { result.current.toggleSortDirection() })
    expect(result.current.sortDirection).toBe('asc')
  })

  it('allows changing sort field', () => {
    const { result } = renderHook(() => useCardSort(items, sortConfig))
    act(() => { result.current.setSortBy('priority') })
    expect(result.current.sorted.map(i => i.priority)).toEqual([1, 2, 3])
  })

  it('returns items unsorted if comparator is missing', () => {
    const config: SortConfig<TestItem, 'missing'> = {
      defaultField: 'missing',
      defaultDirection: 'asc',
      comparators: {} as Record<'missing', (a: TestItem, b: TestItem) => number>,
    }
    const { result } = renderHook(() => useCardSort(items, config))
    // Items returned in original order
    expect(result.current.sorted).toEqual(items)
  })

  it('does not mutate the original array', () => {
    const original = [...items]
    renderHook(() => useCardSort(items, sortConfig))
    expect(items).toEqual(original)
  })
})

// ============================================================================
// useCardCollapse — hook tests
// ============================================================================

describe('useCardCollapse', () => {
  it('starts expanded by default', () => {
    const { result } = renderHook(() => useCardCollapse('test-card'))
    expect(result.current.isCollapsed).toBe(false)
  })

  it('starts collapsed when defaultCollapsed is true', () => {
    const { result } = renderHook(() => useCardCollapse('test-card', true))
    expect(result.current.isCollapsed).toBe(true)
  })

  it('reads initial state from localStorage', () => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(['saved-card']))
    const { result } = renderHook(() => useCardCollapse('saved-card'))
    expect(result.current.isCollapsed).toBe(true)
  })

  it('toggleCollapsed flips the state', () => {
    const { result } = renderHook(() => useCardCollapse('toggle-card'))
    expect(result.current.isCollapsed).toBe(false)
    act(() => { result.current.toggleCollapsed() })
    expect(result.current.isCollapsed).toBe(true)
    act(() => { result.current.toggleCollapsed() })
    expect(result.current.isCollapsed).toBe(false)
  })

  it('persists collapsed state to localStorage', () => {
    const { result } = renderHook(() => useCardCollapse('persist-card'))
    act(() => { result.current.setCollapsed(true) })
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) || '[]')
    expect(stored).toContain('persist-card')
  })

  it('removes from localStorage when expanded', () => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(['rm-card']))
    const { result } = renderHook(() => useCardCollapse('rm-card'))
    expect(result.current.isCollapsed).toBe(true)
    act(() => { result.current.setCollapsed(false) })
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) || '[]')
    expect(stored).not.toContain('rm-card')
  })

  it('expand() shorthand sets collapsed to false', () => {
    const { result } = renderHook(() => useCardCollapse('expand-card', true))
    expect(result.current.isCollapsed).toBe(true)
    act(() => { result.current.expand() })
    expect(result.current.isCollapsed).toBe(false)
  })

  it('collapse() shorthand sets collapsed to true', () => {
    const { result } = renderHook(() => useCardCollapse('collapse-card'))
    expect(result.current.isCollapsed).toBe(false)
    act(() => { result.current.collapse() })
    expect(result.current.isCollapsed).toBe(true)
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, 'not-json')
    const { result } = renderHook(() => useCardCollapse('corrupted-card'))
    // Falls back to default (expanded)
    expect(result.current.isCollapsed).toBe(false)
  })
})

// ============================================================================
// useCardCollapseAll — hook tests
// ============================================================================

describe('useCardCollapseAll', () => {
  const cardIds = ['card-a', 'card-b', 'card-c']

  it('starts with all expanded', () => {
    const { result } = renderHook(() => useCardCollapseAll(cardIds))
    expect(result.current.allExpanded).toBe(true)
    expect(result.current.allCollapsed).toBe(false)
    expect(result.current.collapsedCount).toBe(0)
  })

  it('collapseAll collapses all cards', () => {
    const { result } = renderHook(() => useCardCollapseAll(cardIds))
    act(() => { result.current.collapseAll() })
    expect(result.current.allCollapsed).toBe(true)
    expect(result.current.allExpanded).toBe(false)
    expect(result.current.collapsedCount).toBe(3)
  })

  it('expandAll expands all cards', () => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(['card-a', 'card-b', 'card-c']))
    const { result } = renderHook(() => useCardCollapseAll(cardIds))
    act(() => { result.current.expandAll() })
    expect(result.current.allExpanded).toBe(true)
    expect(result.current.collapsedCount).toBe(0)
  })

  it('toggleCard toggles individual card', () => {
    const { result } = renderHook(() => useCardCollapseAll(cardIds))
    act(() => { result.current.toggleCard('card-b') })
    expect(result.current.isCardCollapsed('card-b')).toBe(true)
    expect(result.current.isCardCollapsed('card-a')).toBe(false)
    expect(result.current.collapsedCount).toBe(1)
  })

  it('toggleCard un-collapses a collapsed card', () => {
    const { result } = renderHook(() => useCardCollapseAll(cardIds))
    act(() => { result.current.toggleCard('card-a') })
    expect(result.current.isCardCollapsed('card-a')).toBe(true)
    act(() => { result.current.toggleCard('card-a') })
    expect(result.current.isCardCollapsed('card-a')).toBe(false)
  })

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useCardCollapseAll(cardIds))
    act(() => { result.current.collapseAll() })
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) || '[]') as string[]
    expect(stored).toEqual(expect.arrayContaining(['card-a', 'card-b', 'card-c']))
  })

  it('does not affect cards outside the provided IDs', () => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(['other-card']))
    const { result } = renderHook(() => useCardCollapseAll(cardIds))
    act(() => { result.current.expandAll() })
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) || '[]') as string[]
    expect(stored).toContain('other-card')
  })
})

// ============================================================================
// useStatusFilter — hook tests
// ============================================================================

describe('useStatusFilter', () => {
  const statuses = ['all', 'running', 'stopped', 'error'] as const
  type Status = typeof statuses[number]

  const config: StatusFilterConfig<Status> = {
    statuses,
    defaultStatus: 'all',
    storageKey: 'test-status',
  }

  it('starts with default status', () => {
    const { result } = renderHook(() => useStatusFilter(config))
    expect(result.current.statusFilter).toBe('all')
  })

  it('allows changing status', () => {
    const { result } = renderHook(() => useStatusFilter(config))
    act(() => { result.current.setStatusFilter('running') })
    expect(result.current.statusFilter).toBe('running')
  })

  it('persists non-default status to localStorage', () => {
    const { result } = renderHook(() => useStatusFilter(config))
    act(() => { result.current.setStatusFilter('error') })
    const stored = localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}test-status-status`)
    expect(stored).toBe('error')
  })

  it('removes localStorage when reset to default', () => {
    const { result } = renderHook(() => useStatusFilter(config))
    act(() => { result.current.setStatusFilter('running') })
    act(() => { result.current.setStatusFilter('all') })
    const stored = localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}test-status-status`)
    expect(stored).toBeNull()
  })

  it('reads persisted status from localStorage', () => {
    localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}test-status-status`, 'stopped')
    const { result } = renderHook(() => useStatusFilter(config))
    expect(result.current.statusFilter).toBe('stopped')
  })

  it('falls back to default if stored status is not in list', () => {
    localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}test-status-status`, 'unknown')
    const { result } = renderHook(() => useStatusFilter(config))
    expect(result.current.statusFilter).toBe('all')
  })

  it('works without storageKey (no persistence)', () => {
    const noStorageConfig: StatusFilterConfig<Status> = {
      statuses,
      defaultStatus: 'all',
    }
    const { result } = renderHook(() => useStatusFilter(noStorageConfig))
    act(() => { result.current.setStatusFilter('running') })
    expect(result.current.statusFilter).toBe('running')
    // Nothing persisted
    expect(localStorage.length).toBe(0)
  })
})

// ============================================================================
// useCardFlash — hook tests with fake timers
// ============================================================================

describe('useCardFlash', () => {
  it('starts with flashType none', () => {
    const { result } = renderHook(() => useCardFlash(10))
    expect(result.current.flashType).toBe('none')
  })

  it('does not flash on initial render (no previous value)', () => {
    const { result } = renderHook(() => useCardFlash(100))
    expect(result.current.flashType).toBe('none')
  })

  it('flashes on significant increase', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1 }),
      { initialProps: { value: 100 } }
    )
    // 20% increase
    rerender({ value: 120 })
    expect(result.current.flashType).toBe('info')
  })

  it('flashes with custom increaseType', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1, increaseType: 'error' }),
      { initialProps: { value: 100 } }
    )
    rerender({ value: 120 })
    expect(result.current.flashType).toBe('error')
  })

  it('flashes with custom decreaseType on decrease', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1, decreaseType: 'warning' }),
      { initialProps: { value: 100 } }
    )
    rerender({ value: 80 })
    expect(result.current.flashType).toBe('warning')
  })

  it('does not flash when change is below threshold', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.5 }),
      { initialProps: { value: 100 } }
    )
    // Only 5% change
    rerender({ value: 105 })
    expect(result.current.flashType).toBe('none')
  })

  it('does not flash when value is unchanged', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value),
      { initialProps: { value: 50 } }
    )
    rerender({ value: 50 })
    expect(result.current.flashType).toBe('none')
  })

  it('does not flash when new value is 0', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.01 }),
      { initialProps: { value: 50 } }
    )
    rerender({ value: 0 })
    expect(result.current.flashType).toBe('none')
  })

  it('auto-resets flash after FLASH_ANIMATION_MS', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1 }),
      { initialProps: { value: 100 } }
    )
    rerender({ value: 200 })
    expect(result.current.flashType).toBe('info')

    // Advance timer past FLASH_ANIMATION_MS (mocked to 100ms)
    act(() => { vi.advanceTimersByTime(150) })
    expect(result.current.flashType).toBe('none')
  })

  it('resetFlash manually clears flash', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1 }),
      { initialProps: { value: 100 } }
    )
    rerender({ value: 200 })
    expect(result.current.flashType).toBe('info')
    act(() => { result.current.resetFlash() })
    expect(result.current.flashType).toBe('none')
  })

  it('respects cooldown period', () => {
    const COOLDOWN_MS = 3000
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1, cooldown: COOLDOWN_MS }),
      { initialProps: { value: 100 } }
    )

    // First flash
    rerender({ value: 200 })
    expect(result.current.flashType).toBe('info')

    // Auto-reset flash
    act(() => { vi.advanceTimersByTime(150) })
    expect(result.current.flashType).toBe('none')

    // Second change within cooldown — should not flash
    act(() => { vi.advanceTimersByTime(1000) }) // only 1150ms total, less than 3000ms cooldown
    rerender({ value: 400 })
    expect(result.current.flashType).toBe('none')

    // Advance past cooldown
    act(() => { vi.advanceTimersByTime(3000) })
    rerender({ value: 800 })
    expect(result.current.flashType).toBe('info')
  })
})

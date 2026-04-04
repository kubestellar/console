import { describe, it, expect} from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCardFiltering } from '../useCardFiltering'
import type { CardFilterConfig } from '../../../types'

describe('useCardFiltering', () => {
  // ---------------------------------------------------------------------------
  // Basic behavior
  // ---------------------------------------------------------------------------

  it('returns all data when no filters are configured', () => {
    const data = [{ name: 'a' }, { name: 'b' }]
    const { result } = renderHook(() => useCardFiltering(data))
    expect(result.current.filteredData).toEqual(data)
  })

  it('returns undefined when data is undefined', () => {
    const { result } = renderHook(() => useCardFiltering(undefined))
    expect(result.current.filteredData).toBeUndefined()
  })

  it('returns all data when filters array is empty', () => {
    const data = [{ id: 1 }]
    const { result } = renderHook(() => useCardFiltering(data, []))
    expect(result.current.filteredData).toEqual(data)
  })

  it('provides setFilter and clearFilters functions', () => {
    const { result } = renderHook(() => useCardFiltering([]))
    expect(typeof result.current.setFilter).toBe('function')
    expect(typeof result.current.clearFilters).toBe('function')
  })

  it('initializes with empty filterState', () => {
    const { result } = renderHook(() => useCardFiltering([]))
    expect(result.current.filterState).toEqual({})
  })

  // ---------------------------------------------------------------------------
  // Text filter
  // ---------------------------------------------------------------------------

  it('filters by text search on default field', () => {
    const data = [
      { name: 'Alice', role: 'admin' },
      { name: 'Bob', role: 'user' },
      { name: 'Charlie', role: 'admin' },
    ]
    const filters: CardFilterConfig[] = [
      { field: 'name', type: 'text' },
    ]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('name', 'ali')
    })

    expect(result.current.filteredData).toHaveLength(1)
    expect((result.current.filteredData![0] as Record<string, unknown>).name).toBe('Alice')
  })

  it('text filter is case-insensitive', () => {
    const data = [{ name: 'UPPERCASE' }, { name: 'lowercase' }]
    const filters: CardFilterConfig[] = [{ field: 'name', type: 'text' }]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('name', 'LOWERCASE')
    })

    expect(result.current.filteredData).toHaveLength(1)
  })

  it('text filter searches across multiple searchFields', () => {
    const data = [
      { name: 'pod-1', namespace: 'production' },
      { name: 'pod-2', namespace: 'staging' },
    ]
    const filters: CardFilterConfig[] = [
      { field: 'search', type: 'text', searchFields: ['name', 'namespace'] },
    ]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('search', 'production')
    })

    expect(result.current.filteredData).toHaveLength(1)
    expect((result.current.filteredData![0] as Record<string, unknown>).name).toBe('pod-1')
  })

  // ---------------------------------------------------------------------------
  // Select filter
  // ---------------------------------------------------------------------------

  it('filters by select value', () => {
    const data = [
      { name: 'a', status: 'running' },
      { name: 'b', status: 'failed' },
      { name: 'c', status: 'running' },
    ]
    const filters: CardFilterConfig[] = [
      { field: 'status', type: 'select', options: [{ label: 'Running', value: 'running' }] },
    ]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('status', 'running')
    })

    expect(result.current.filteredData).toHaveLength(2)
  })

  // ---------------------------------------------------------------------------
  // Toggle filter
  // ---------------------------------------------------------------------------

  it('toggle filter shows only truthy values when enabled', () => {
    const data = [
      { name: 'a', critical: true },
      { name: 'b', critical: false },
      { name: 'c', critical: true },
    ]
    const filters: CardFilterConfig[] = [
      { field: 'critical', type: 'toggle' },
    ]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('critical', true)
    })

    expect(result.current.filteredData).toHaveLength(2)
  })

  it('toggle filter shows all values when disabled', () => {
    const data = [
      { name: 'a', critical: true },
      { name: 'b', critical: false },
    ]
    const filters: CardFilterConfig[] = [
      { field: 'critical', type: 'toggle' },
    ]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('critical', false)
    })

    expect(result.current.filteredData).toHaveLength(2)
  })

  // ---------------------------------------------------------------------------
  // Multi-select / chips filter
  // ---------------------------------------------------------------------------

  it('multi-select filters by multiple selected values', () => {
    const data = [
      { name: 'a', env: 'prod' },
      { name: 'b', env: 'staging' },
      { name: 'c', env: 'dev' },
    ]
    const filters: CardFilterConfig[] = [
      { field: 'env', type: 'multi-select' },
    ]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('env', ['prod', 'dev'])
    })

    expect(result.current.filteredData).toHaveLength(2)
  })

  it('multi-select with empty array shows all data', () => {
    const data = [{ env: 'prod' }, { env: 'staging' }]
    const filters: CardFilterConfig[] = [{ field: 'env', type: 'multi-select' }]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('env', [])
    })

    expect(result.current.filteredData).toHaveLength(2)
  })

  // ---------------------------------------------------------------------------
  // clearFilters
  // ---------------------------------------------------------------------------

  it('clearFilters resets all filter state', () => {
    const data = [{ name: 'a' }, { name: 'b' }]
    const filters: CardFilterConfig[] = [{ field: 'name', type: 'text' }]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('name', 'a')
    })
    expect(result.current.filteredData).toHaveLength(1)

    act(() => {
      result.current.clearFilters()
    })
    expect(result.current.filteredData).toHaveLength(2)
    expect(result.current.filterState).toEqual({})
  })

  // ---------------------------------------------------------------------------
  // filterControls
  // ---------------------------------------------------------------------------

  it('returns null filterControls when no filters configured', () => {
    const { result } = renderHook(() => useCardFiltering([]))
    expect(result.current.filterControls).toBeNull()
  })

  it('returns non-null filterControls when filters are configured', () => {
    const filters: CardFilterConfig[] = [{ field: 'name', type: 'text' }]
    const { result } = renderHook(() => useCardFiltering([], filters))
    expect(result.current.filterControls).not.toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Skipping filters with empty/null/undefined values
  // ---------------------------------------------------------------------------

  it('skips filter when value is empty string', () => {
    const data = [{ name: 'a' }, { name: 'b' }]
    const filters: CardFilterConfig[] = [{ field: 'name', type: 'text' }]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('name', '')
    })

    expect(result.current.filteredData).toHaveLength(2)
  })

  it('skips filter when value is null', () => {
    const data = [{ name: 'a' }, { name: 'b' }]
    const filters: CardFilterConfig[] = [{ field: 'name', type: 'select' }]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('name', null)
    })

    expect(result.current.filteredData).toHaveLength(2)
  })

  // ---------------------------------------------------------------------------
  // cluster-select (alias for select)
  // ---------------------------------------------------------------------------

  it('cluster-select works like select filter', () => {
    const data = [
      { name: 'a', cluster: 'prod' },
      { name: 'b', cluster: 'dev' },
    ]
    const filters: CardFilterConfig[] = [
      { field: 'cluster', type: 'cluster-select' },
    ]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('cluster', 'prod')
    })

    expect(result.current.filteredData).toHaveLength(1)
  })
})

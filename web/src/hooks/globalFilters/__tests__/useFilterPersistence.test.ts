import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFilterPersistence } from '../useFilterPersistence'
import {
  CLUSTER_STORAGE_KEY,
  CUSTOM_FILTER_STORAGE_KEY,
  DISTRIBUTION_STORAGE_KEY,
  GROUPS_STORAGE_KEY,
  SAVED_FILTER_SETS_KEY,
  SEVERITY_STORAGE_KEY,
  STATUS_STORAGE_KEY,
} from '../constants'
import type { FilterSelections } from '../filterSelections'
import type { ClusterGroup, SavedFilterSet } from '../types'

function makeStorage(initial: Record<string, string> = {}): Storage {
  const store = { ...initial }
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  } as Storage
}

const EMPTY_FILTERS: FilterSelections = {
  clusters: [],
  severities: [],
  statuses: [],
  distributions: [],
  customText: '',
}

describe('useFilterPersistence', () => {
  let storage: Storage

  beforeEach(() => {
    storage = makeStorage()
    vi.stubGlobal('localStorage', storage)
  })

  it('writes null for empty selections and empty text on mount', () => {
    renderHook(() => useFilterPersistence(EMPTY_FILTERS, [], []))
    expect(storage.getItem(CLUSTER_STORAGE_KEY)).toBe('null')
    expect(storage.getItem(SEVERITY_STORAGE_KEY)).toBe('null')
    expect(storage.getItem(STATUS_STORAGE_KEY)).toBe('null')
    expect(storage.getItem(DISTRIBUTION_STORAGE_KEY)).toBe('null')
    expect(storage.getItem(CUSTOM_FILTER_STORAGE_KEY)).toBe('')
    expect(storage.getItem(GROUPS_STORAGE_KEY)).toBe('[]')
    expect(storage.getItem(SAVED_FILTER_SETS_KEY)).toBe('[]')
  })

  it('persists non-empty selections, groups and saved sets', () => {
    const filters: FilterSelections = {
      clusters: ['a', 'b'],
      severities: ['critical'],
      statuses: ['failed'],
      distributions: ['eks'],
      customText: 'hello',
    }
    const groups: ClusterGroup[] = [{ id: 'g1', name: 'G', clusters: ['a'] }]
    const sets = [{ id: 's1', name: 'S' }] as unknown as SavedFilterSet[]
    renderHook(() => useFilterPersistence(filters, groups, sets))
    expect(JSON.parse(storage.getItem(CLUSTER_STORAGE_KEY)!)).toEqual(['a', 'b'])
    expect(JSON.parse(storage.getItem(SEVERITY_STORAGE_KEY)!)).toEqual(['critical'])
    expect(JSON.parse(storage.getItem(STATUS_STORAGE_KEY)!)).toEqual(['failed'])
    expect(JSON.parse(storage.getItem(DISTRIBUTION_STORAGE_KEY)!)).toEqual(['eks'])
    expect(storage.getItem(CUSTOM_FILTER_STORAGE_KEY)).toBe('hello')
    expect(JSON.parse(storage.getItem(GROUPS_STORAGE_KEY)!)).toEqual(groups)
    expect(JSON.parse(storage.getItem(SAVED_FILTER_SETS_KEY)!)).toEqual(sets)
  })

  it('rewrites storage when inputs change', () => {
    const { rerender } = renderHook(
      ({ filters }) => useFilterPersistence(filters, [], []),
      { initialProps: { filters: EMPTY_FILTERS } },
    )
    rerender({ filters: { ...EMPTY_FILTERS, clusters: ['c1'], customText: 'abc' } })
    expect(JSON.parse(storage.getItem(CLUSTER_STORAGE_KEY)!)).toEqual(['c1'])
    expect(storage.getItem(CUSTOM_FILTER_STORAGE_KEY)).toBe('abc')
  })

  it('does not write a key again when its input is unchanged', () => {
    const setItem = vi.spyOn(storage, 'setItem')
    const groups: ClusterGroup[] = []
    const sets: SavedFilterSet[] = []
    const { rerender } = renderHook(
      ({ filters }) => useFilterPersistence(filters, groups, sets),
      { initialProps: { filters: EMPTY_FILTERS } },
    )
    setItem.mockClear()
    rerender({ filters: { ...EMPTY_FILTERS, severities: ['low'] } })
    const keys = setItem.mock.calls.map(c => c[0])
    expect(keys).toEqual([SEVERITY_STORAGE_KEY])
  })
})

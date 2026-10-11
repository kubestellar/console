import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLUSTER_STORAGE_KEY,
  CUSTOM_FILTER_STORAGE_KEY,
  DISTRIBUTION_STORAGE_KEY,
  SEVERITY_STORAGE_KEY,
  STATUS_STORAGE_KEY,
} from '../constants'
import {
  findActiveFilterSetId,
  loadInitialFilterSelections,
  patchFilters,
  type FilterSelections,
} from '../filterSelections'
import type { SavedFilterSet } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function makeSelections(overrides: Partial<FilterSelections> = {}): FilterSelections {
  return {
    clusters: [],
    severities: [],
    statuses: [],
    distributions: [],
    customText: '',
    ...overrides,
  }
}

function makeSavedFilterSet(overrides: Partial<SavedFilterSet> & { id: string }): SavedFilterSet {
  return {
    name: overrides.id,
    color: '#000000',
    clusters: [],
    severities: [],
    statuses: [],
    distributions: [],
    customText: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// patchFilters
// ---------------------------------------------------------------------------
describe('patchFilters', () => {
  it('merges a partial object patch into the existing state', () => {
    const state = makeSelections({ clusters: ['a'], customText: 'old' })
    const result = patchFilters(state, { customText: 'new' })
    expect(result).toEqual(makeSelections({ clusters: ['a'], customText: 'new' }))
  })

  it('applies a function patch computed from the current state', () => {
    const state = makeSelections({ clusters: ['a'] })
    const result = patchFilters(state, prev => ({ clusters: [...prev.clusters, 'b'] }))
    expect(result.clusters).toEqual(['a', 'b'])
  })

  it('does not mutate the original state object', () => {
    const state = makeSelections({ clusters: ['a'] })
    const result = patchFilters(state, { clusters: ['b'] })
    expect(state.clusters).toEqual(['a'])
    expect(result.clusters).toEqual(['b'])
  })

  it('leaves fields untouched when the patch omits them', () => {
    const state = makeSelections({ clusters: ['a'], severities: ['critical'] })
    const result = patchFilters(state, { statuses: ['failed'] })
    expect(result.clusters).toEqual(['a'])
    expect(result.severities).toEqual(['critical'])
    expect(result.statuses).toEqual(['failed'])
  })
})

// ---------------------------------------------------------------------------
// loadInitialFilterSelections
// ---------------------------------------------------------------------------
describe('loadInitialFilterSelections', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage())
  })

  it('returns empty defaults when nothing is stored', () => {
    expect(loadInitialFilterSelections()).toEqual(makeSelections())
  })

  it('reads previously stored selections from localStorage', () => {
    vi.stubGlobal('localStorage', makeStorage({
      [CLUSTER_STORAGE_KEY]: JSON.stringify(['cluster-1']),
      [SEVERITY_STORAGE_KEY]: JSON.stringify(['critical']),
      [STATUS_STORAGE_KEY]: JSON.stringify(['failed']),
      [DISTRIBUTION_STORAGE_KEY]: JSON.stringify(['eks']),
      [CUSTOM_FILTER_STORAGE_KEY]: 'search term',
    }))

    expect(loadInitialFilterSelections()).toEqual(makeSelections({
      clusters: ['cluster-1'],
      severities: ['critical'],
      statuses: ['failed'],
      distributions: ['eks'],
      customText: 'search term',
    }))
  })
})

// ---------------------------------------------------------------------------
// findActiveFilterSetId
// ---------------------------------------------------------------------------
describe('findActiveFilterSetId', () => {
  it('returns null when there are no saved filter sets', () => {
    expect(findActiveFilterSetId([], ['a'], ['critical'], ['failed'], ['eks'], '')).toBeNull()
  })

  it('returns the id of the filter set matching the current selections', () => {
    const saved = [
      makeSavedFilterSet({ id: 'set-1', clusters: ['a'], severities: ['critical'], statuses: ['failed'], distributions: ['eks'], customText: 'x' }),
      makeSavedFilterSet({ id: 'set-2', clusters: ['b'], severities: ['warning'], statuses: ['pending'], distributions: ['gke'], customText: 'y' }),
    ]
    expect(findActiveFilterSetId(saved, ['a'], ['critical'], ['failed'], ['eks'], 'x')).toBe('set-1')
  })

  it('matches regardless of selection order', () => {
    const saved = [
      makeSavedFilterSet({ id: 'set-1', clusters: ['a', 'b'], severities: [], statuses: [], distributions: [], customText: '' }),
    ]
    expect(findActiveFilterSetId(saved, ['b', 'a'], [], [], [], '')).toBe('set-1')
  })

  it('returns null when no saved filter set matches', () => {
    const saved = [
      makeSavedFilterSet({ id: 'set-1', clusters: ['a'], severities: [], statuses: [], distributions: [], customText: '' }),
    ]
    expect(findActiveFilterSetId(saved, ['b'], [], [], [], '')).toBeNull()
  })

  it('treats an undefined distributions field on the saved set as empty', () => {
    const saved: SavedFilterSet[] = [
      { id: 'set-1', name: 'set-1', color: '#000', clusters: [], severities: [], statuses: [], customText: '' } as SavedFilterSet,
    ]
    expect(findActiveFilterSetId(saved, [], [], [], [], '')).toBe('set-1')
  })
})

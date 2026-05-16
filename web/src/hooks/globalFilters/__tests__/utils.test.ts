import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildClusterInfoMap,
  getAvailableDistributions,
  haveSameSelections,
  loadStoredClusterGroups,
  loadStoredSavedFilterSets,
  loadStoredSelection,
  loadStoredText,
  matchesCustomText,
} from '../utils'
import type { ClusterInfo } from '../../mcp/types'

// Mock detectCloudProvider so tests don't depend on icon logic
vi.mock('../../../components/ui/CloudProviderIcon', () => ({
  detectCloudProvider: () => 'unknown',
}))

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

function makeCluster(overrides: Partial<ClusterInfo> & { name: string }): ClusterInfo {
  return { context: overrides.name, ...overrides }
}

// ---------------------------------------------------------------------------
// loadStoredSelection
// ---------------------------------------------------------------------------
describe('loadStoredSelection', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage())
  })

  it('returns empty array when key is absent', () => {
    expect(loadStoredSelection('missing')).toEqual([])
  })

  it('returns stored array', () => {
    localStorage.setItem('key', JSON.stringify(['a', 'b']))
    expect(loadStoredSelection('key')).toEqual(['a', 'b'])
  })

  it('returns empty array when stored value is not an array', () => {
    localStorage.setItem('key', JSON.stringify({ foo: 'bar' }))
    expect(loadStoredSelection('key')).toEqual([])
  })

  it('returns empty array on malformed JSON', () => {
    localStorage.setItem('key', 'not-json{{{')
    expect(loadStoredSelection('key')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// loadStoredText
// ---------------------------------------------------------------------------
describe('loadStoredText', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage())
  })

  it('returns empty string when key is absent', () => {
    expect(loadStoredText('missing')).toBe('')
  })

  it('returns stored string', () => {
    localStorage.setItem('key', 'hello')
    expect(loadStoredText('key')).toBe('hello')
  })

  it('returns empty string when getItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('quota') },
    })
    expect(loadStoredText('key')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// loadStoredSavedFilterSets
// ---------------------------------------------------------------------------
describe('loadStoredSavedFilterSets', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage())
  })

  it('returns empty array when key is absent', () => {
    expect(loadStoredSavedFilterSets('missing')).toEqual([])
  })

  it('returns stored filter sets', () => {
    const sets = [{ id: '1', name: 'Prod', color: '#f00', clusters: [], severities: [], statuses: [], distributions: [], customText: '' }]
    localStorage.setItem('key', JSON.stringify(sets))
    expect(loadStoredSavedFilterSets('key')).toEqual(sets)
  })

  it('returns empty array when stored value is not an array', () => {
    localStorage.setItem('key', '"just-a-string"')
    expect(loadStoredSavedFilterSets('key')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// loadStoredClusterGroups
// ---------------------------------------------------------------------------
describe('loadStoredClusterGroups', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage())
  })

  it('returns empty array (DEFAULT_GROUPS) when nothing stored', () => {
    const result = loadStoredClusterGroups()
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns persisted groups when present', () => {
    const groups = [{ id: 'g1', name: 'Team A', clusters: ['c1'] }]
    localStorage.setItem('globalFilter:clusterGroups', JSON.stringify(groups))
    const result = loadStoredClusterGroups()
    expect(result).toEqual(groups)
  })

  it('migrates legacy project definitions and removes legacy keys', () => {
    const projects = [{ id: 'p1', name: 'MyProject', clusters: ['c1'], color: '#00f' }]
    localStorage.setItem('projects:definitions', JSON.stringify(projects))
    const result = loadStoredClusterGroups()
    expect(result.some(g => g.name === 'MyProject')).toBe(true)
    expect(localStorage.getItem('projects:definitions')).toBeNull()
    expect(localStorage.getItem('projects:selected')).toBeNull()
  })

  it('does not duplicate migrated groups already in stored groups', () => {
    const groups = [{ id: 'g1', name: 'MyProject', clusters: [] }]
    localStorage.setItem('globalFilter:clusterGroups', JSON.stringify(groups))
    const projects = [{ id: 'p1', name: 'MyProject', clusters: ['c1'] }]
    localStorage.setItem('projects:definitions', JSON.stringify(projects))
    const result = loadStoredClusterGroups()
    expect(result.filter(g => g.name === 'MyProject')).toHaveLength(1)
  })

  it('handles malformed stored groups gracefully', () => {
    localStorage.setItem('globalFilter:clusterGroups', 'bad-json')
    const result = loadStoredClusterGroups()
    expect(Array.isArray(result)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildClusterInfoMap
// ---------------------------------------------------------------------------
describe('buildClusterInfoMap', () => {
  it('returns an empty map for empty array', () => {
    expect(buildClusterInfoMap([])).toEqual({})
  })

  it('maps cluster name to ClusterInfo', () => {
    const clusters = [makeCluster({ name: 'a' }), makeCluster({ name: 'b' })]
    const map = buildClusterInfoMap(clusters)
    expect(map['a'].name).toBe('a')
    expect(map['b'].name).toBe('b')
  })

  it('last cluster wins when names collide', () => {
    const clusters = [
      makeCluster({ name: 'a', nodeCount: 1 }),
      makeCluster({ name: 'a', nodeCount: 5 }),
    ]
    const map = buildClusterInfoMap(clusters)
    expect(map['a'].nodeCount).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// getAvailableDistributions
// ---------------------------------------------------------------------------
describe('getAvailableDistributions', () => {
  it('returns empty array for empty input', () => {
    expect(getAvailableDistributions([])).toEqual([])
  })

  it('uses cluster.distribution when present', () => {
    const clusters = [makeCluster({ name: 'a', distribution: 'eks' }), makeCluster({ name: 'b', distribution: 'gke' })]
    const result = getAvailableDistributions(clusters)
    expect(result).toContain('eks')
    expect(result).toContain('gke')
  })

  it('falls back to detectCloudProvider (mocked to "unknown") when distribution absent', () => {
    const clusters = [makeCluster({ name: 'a' })]
    const result = getAvailableDistributions(clusters)
    expect(result).toContain('unknown')
  })

  it('deduplicates identical distributions', () => {
    const clusters = [
      makeCluster({ name: 'a', distribution: 'eks' }),
      makeCluster({ name: 'b', distribution: 'eks' }),
    ]
    const result = getAvailableDistributions(clusters)
    expect(result.filter(d => d === 'eks')).toHaveLength(1)
  })

  it('returns sorted result', () => {
    const clusters = [
      makeCluster({ name: 'c', distribution: 'gke' }),
      makeCluster({ name: 'a', distribution: 'eks' }),
      makeCluster({ name: 'b', distribution: 'aks' }),
    ]
    const result = getAvailableDistributions(clusters)
    expect(result).toEqual([...result].sort())
  })
})

// ---------------------------------------------------------------------------
// haveSameSelections
// ---------------------------------------------------------------------------
describe('haveSameSelections', () => {
  it('returns true for identical arrays', () => {
    expect(haveSameSelections(['a', 'b'], ['a', 'b'])).toBe(true)
  })

  it('returns true when order differs', () => {
    expect(haveSameSelections(['b', 'a'], ['a', 'b'])).toBe(true)
  })

  it('returns false when lengths differ', () => {
    expect(haveSameSelections(['a'], ['a', 'b'])).toBe(false)
  })

  it('returns false when content differs', () => {
    expect(haveSameSelections(['a', 'c'], ['a', 'b'])).toBe(false)
  })

  it('returns true for two empty arrays', () => {
    expect(haveSameSelections([], [])).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// matchesCustomText
// ---------------------------------------------------------------------------
describe('matchesCustomText', () => {
  const item = { name: 'my-cluster', region: 'us-east-1', status: 'active' }

  it('matches case-insensitively', () => {
    expect(matchesCustomText(item, 'MY-CLUSTER', ['name'])).toBe(true)
  })

  it('returns false when query not in any field', () => {
    expect(matchesCustomText(item, 'xyz', ['name', 'region'])).toBe(false)
  })

  it('returns true when query matches any field', () => {
    expect(matchesCustomText(item, 'east', ['name', 'region'])).toBe(true)
  })

  it('skips non-string fields', () => {
    const mixed = { count: 5, label: 'hello' } as unknown as Record<string, unknown>
    expect(matchesCustomText(mixed, 'hello', ['count', 'label'])).toBe(true)
    expect(matchesCustomText(mixed, '5', ['count', 'label'])).toBe(false)
  })

  it('returns false for empty searchFields', () => {
    expect(matchesCustomText(item, 'cluster', [])).toBe(false)
  })
})

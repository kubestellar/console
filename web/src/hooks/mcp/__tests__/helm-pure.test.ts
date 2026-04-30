import { describe, it, expect, beforeEach } from 'vitest'

const mod = await import('../helm')
const {
  getDemoHelmReleases,
  getDemoHelmHistory,
  getDemoHelmValues,
  loadHelmReleasesFromStorage,
  saveHelmReleasesToStorage,
  loadHelmHistoryFromStorage,
  saveHelmHistoryToStorage,
  HELM_RELEASES_CACHE_KEY,
  HELM_HISTORY_CACHE_KEY,
  HELM_CACHE_TTL_MS,
  HELM_REFRESH_INTERVAL_MS,
} = mod.__helmTestables

beforeEach(() => {
  localStorage.clear()
})

describe('getDemoHelmReleases', () => {
  it('returns a non-empty array', () => {
    const releases = getDemoHelmReleases()
    expect(releases.length).toBeGreaterThan(0)
  })

  it('each release has required fields', () => {
    for (const r of getDemoHelmReleases()) {
      expect(typeof r.name).toBe('string')
      expect(typeof r.namespace).toBe('string')
      expect(typeof r.revision).toBe('string')
      expect(typeof r.updated).toBe('string')
      expect(typeof r.status).toBe('string')
      expect(typeof r.chart).toBe('string')
      expect(typeof r.app_version).toBe('string')
      expect(typeof r.cluster).toBe('string')
    }
  })

  it('includes at least one failed release', () => {
    const failed = getDemoHelmReleases().filter(r => r.status === 'failed')
    expect(failed.length).toBeGreaterThan(0)
  })

  it('covers multiple clusters', () => {
    const clusters = new Set(getDemoHelmReleases().map(r => r.cluster))
    expect(clusters.size).toBeGreaterThanOrEqual(2)
  })

  it('returns cached result on second call', () => {
    const a = getDemoHelmReleases()
    const b = getDemoHelmReleases()
    expect(a).toBe(b)
  })
})

describe('getDemoHelmHistory', () => {
  it('returns a non-empty array', () => {
    expect(getDemoHelmHistory().length).toBeGreaterThan(0)
  })

  it('each entry has required fields', () => {
    for (const h of getDemoHelmHistory()) {
      expect(typeof h.revision).toBe('number')
      expect(typeof h.updated).toBe('string')
      expect(typeof h.status).toBe('string')
      expect(typeof h.chart).toBe('string')
      expect(typeof h.app_version).toBe('string')
      expect(typeof h.description).toBe('string')
    }
  })

  it('includes multiple statuses', () => {
    const statuses = new Set(getDemoHelmHistory().map(h => h.status))
    expect(statuses.size).toBeGreaterThanOrEqual(2)
  })

  it('revisions are in descending order', () => {
    const history = getDemoHelmHistory()
    for (let i = 1; i < history.length; i++) {
      expect(history[i - 1].revision).toBeGreaterThan(history[i].revision)
    }
  })
})

describe('getDemoHelmValues', () => {
  it('returns an object with replicaCount', () => {
    const vals = getDemoHelmValues()
    expect(typeof vals.replicaCount).toBe('number')
  })

  it('has nested image config', () => {
    const vals = getDemoHelmValues()
    const img = vals.image as Record<string, unknown>
    expect(typeof img.repository).toBe('string')
    expect(typeof img.tag).toBe('string')
  })

  it('has resources with limits and requests', () => {
    const vals = getDemoHelmValues()
    const res = vals.resources as Record<string, Record<string, string>>
    expect(res.limits).toBeDefined()
    expect(res.requests).toBeDefined()
  })
})

describe('loadHelmReleasesFromStorage', () => {
  it('returns empty data when localStorage is empty', () => {
    const result = loadHelmReleasesFromStorage()
    expect(result.data).toEqual([])
    expect(result.timestamp).toBe(0)
  })

  it('returns stored data when valid', () => {
    const data = [{ name: 'test', namespace: 'ns', revision: '1', updated: '', status: 'deployed', chart: 'c-1.0', app_version: '1.0' }]
    const ts = Date.now()
    localStorage.setItem(HELM_RELEASES_CACHE_KEY, JSON.stringify({ data, timestamp: ts }))
    const result = loadHelmReleasesFromStorage()
    expect(result.data).toEqual(data)
    expect(result.timestamp).toBe(ts)
  })

  it('returns empty on corrupted JSON', () => {
    localStorage.setItem(HELM_RELEASES_CACHE_KEY, 'not-json')
    const result = loadHelmReleasesFromStorage()
    expect(result.data).toEqual([])
  })

  it('returns empty when data is not an array', () => {
    localStorage.setItem(HELM_RELEASES_CACHE_KEY, JSON.stringify({ data: 'notarray' }))
    const result = loadHelmReleasesFromStorage()
    expect(result.data).toEqual([])
  })

  it('defaults timestamp to 0 when missing', () => {
    localStorage.setItem(HELM_RELEASES_CACHE_KEY, JSON.stringify({ data: [{ name: 'x' }] }))
    const result = loadHelmReleasesFromStorage()
    expect(result.timestamp).toBe(0)
  })
})

describe('saveHelmReleasesToStorage', () => {
  it('persists data to localStorage', () => {
    const data = [{ name: 'saved', namespace: 'ns', revision: '2', updated: '', status: 'deployed', chart: 'c', app_version: '1' }]
    const ts = 12345
    saveHelmReleasesToStorage(data, ts)
    const stored = JSON.parse(localStorage.getItem(HELM_RELEASES_CACHE_KEY) || '{}')
    expect(stored.data).toEqual(data)
    expect(stored.timestamp).toBe(ts)
  })
})

describe('loadHelmHistoryFromStorage', () => {
  it('returns empty Map when localStorage is empty', () => {
    const result = loadHelmHistoryFromStorage()
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('returns stored entries', () => {
    const entry = { data: [{ revision: 1, updated: '', status: 'deployed', chart: 'c', app_version: '1', description: 'ok' }], timestamp: 100, consecutiveFailures: 0 }
    localStorage.setItem(HELM_HISTORY_CACHE_KEY, JSON.stringify({ 'prod:release1': entry }))
    const result = loadHelmHistoryFromStorage()
    expect(result.size).toBe(1)
    expect(result.get('prod:release1')).toEqual(entry)
  })

  it('returns empty Map on corrupted JSON', () => {
    localStorage.setItem(HELM_HISTORY_CACHE_KEY, '{invalid')
    const result = loadHelmHistoryFromStorage()
    expect(result.size).toBe(0)
  })
})

describe('saveHelmHistoryToStorage', () => {
  it('persists Map entries to localStorage', () => {
    const cache = new Map()
    cache.set('c1:r1', { data: [], timestamp: 999, consecutiveFailures: 0 })
    saveHelmHistoryToStorage(cache)
    const stored = JSON.parse(localStorage.getItem(HELM_HISTORY_CACHE_KEY) || '{}')
    expect(stored['c1:r1'].timestamp).toBe(999)
  })

  it('handles empty Map', () => {
    saveHelmHistoryToStorage(new Map())
    const stored = JSON.parse(localStorage.getItem(HELM_HISTORY_CACHE_KEY) || '{}')
    expect(Object.keys(stored)).toHaveLength(0)
  })
})

describe('constants', () => {
  it('HELM_RELEASES_CACHE_KEY is a string', () => {
    expect(typeof HELM_RELEASES_CACHE_KEY).toBe('string')
    expect(HELM_RELEASES_CACHE_KEY.length).toBeGreaterThan(0)
  })

  it('HELM_HISTORY_CACHE_KEY is a string', () => {
    expect(typeof HELM_HISTORY_CACHE_KEY).toBe('string')
  })

  it('HELM_CACHE_TTL_MS is positive', () => {
    expect(HELM_CACHE_TTL_MS).toBeGreaterThan(0)
  })

  it('HELM_REFRESH_INTERVAL_MS is positive and larger than TTL', () => {
    expect(HELM_REFRESH_INTERVAL_MS).toBeGreaterThan(HELM_CACHE_TTL_MS)
  })
})

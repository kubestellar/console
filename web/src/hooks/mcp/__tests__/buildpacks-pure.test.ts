import { describe, it, expect, beforeEach } from 'vitest'

const mod = await import('../buildpacks')
const {
  getDemoBuildpackImages,
  loadFromStorage,
  saveToStorage,
  BUILDPACK_CACHE_KEY,
  BUILDPACK_CACHE_TTL_MS,
  BUILDPACK_REFRESH_INTERVAL_MS,
} = mod.__buildpacksTestables

beforeEach(() => {
  localStorage.clear()
})

describe('getDemoBuildpackImages', () => {
  it('returns a non-empty array', () => {
    expect(getDemoBuildpackImages().length).toBeGreaterThan(0)
  })

  it('each image has required fields', () => {
    for (const img of getDemoBuildpackImages()) {
      expect(typeof img.name).toBe('string')
      expect(typeof img.namespace).toBe('string')
      expect(typeof img.builder).toBe('string')
      expect(typeof img.image).toBe('string')
      expect(typeof img.status).toBe('string')
      expect(typeof img.updated).toBe('string')
      expect(typeof img.cluster).toBe('string')
    }
  })

  it('includes both succeeded and failed statuses', () => {
    const statuses = new Set(getDemoBuildpackImages().map(img => img.status))
    expect(statuses.has('succeeded')).toBe(true)
    expect(statuses.has('failed')).toBe(true)
  })

  it('updated fields are valid ISO dates', () => {
    for (const img of getDemoBuildpackImages()) {
      expect(new Date(img.updated).getTime()).not.toBeNaN()
    }
  })
})

describe('loadFromStorage', () => {
  it('returns empty data when localStorage is empty', () => {
    const result = loadFromStorage()
    expect(result.data).toEqual([])
    expect(result.timestamp).toBe(0)
  })

  it('returns stored data when valid', () => {
    const data = [{ name: 'app', namespace: 'ns', builder: 'b', image: 'i', status: 'succeeded', updated: '', cluster: 'c' }]
    const ts = 55555
    localStorage.setItem(BUILDPACK_CACHE_KEY, JSON.stringify({ data, timestamp: ts }))
    const result = loadFromStorage()
    expect(result.data).toEqual(data)
    expect(result.timestamp).toBe(ts)
  })

  it('returns empty on corrupted JSON', () => {
    localStorage.setItem(BUILDPACK_CACHE_KEY, 'not-json!')
    const result = loadFromStorage()
    expect(result.data).toEqual([])
    expect(result.timestamp).toBe(0)
  })

  it('returns empty when data is not an array', () => {
    localStorage.setItem(BUILDPACK_CACHE_KEY, JSON.stringify({ data: 'string' }))
    const result = loadFromStorage()
    expect(result.data).toEqual([])
  })

  it('defaults timestamp to 0 when missing', () => {
    localStorage.setItem(BUILDPACK_CACHE_KEY, JSON.stringify({ data: [{ name: 'x' }] }))
    const result = loadFromStorage()
    expect(result.timestamp).toBe(0)
  })
})

describe('saveToStorage', () => {
  it('persists data and timestamp', () => {
    const data = [{ name: 'saved', namespace: 'ns', builder: 'b', image: 'i', status: 'succeeded', updated: '', cluster: 'c' }]
    saveToStorage(data, 77777)
    const stored = JSON.parse(localStorage.getItem(BUILDPACK_CACHE_KEY) || '{}')
    expect(stored.data).toEqual(data)
    expect(stored.timestamp).toBe(77777)
  })

  it('overwrites previous data', () => {
    saveToStorage([{ name: 'first' }] as never[], 1)
    saveToStorage([{ name: 'second' }] as never[], 2)
    const stored = JSON.parse(localStorage.getItem(BUILDPACK_CACHE_KEY) || '{}')
    expect(stored.data[0].name).toBe('second')
    expect(stored.timestamp).toBe(2)
  })
})

describe('constants', () => {
  it('BUILDPACK_CACHE_KEY is a non-empty string', () => {
    expect(typeof BUILDPACK_CACHE_KEY).toBe('string')
    expect(BUILDPACK_CACHE_KEY.length).toBeGreaterThan(0)
  })

  it('BUILDPACK_CACHE_TTL_MS is positive', () => {
    expect(BUILDPACK_CACHE_TTL_MS).toBeGreaterThan(0)
  })

  it('BUILDPACK_REFRESH_INTERVAL_MS is larger than TTL', () => {
    expect(BUILDPACK_REFRESH_INTERVAL_MS).toBeGreaterThan(BUILDPACK_CACHE_TTL_MS)
  })
})

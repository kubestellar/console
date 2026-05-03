import { describe, it, expect, beforeEach } from 'vitest'

const mod = await import('../storage')
const {
  getDemoPVCs,
  getDemoResourceQuotas,
  getDemoLimitRanges,
  loadPVCsCacheFromStorage,
  savePVCsCacheToStorage,
  PVCS_CACHE_KEY,
} = mod.__storageTestables

beforeEach(() => {
  localStorage.clear()
})

describe('getDemoPVCs', () => {
  it('returns a non-empty array', () => {
    expect(getDemoPVCs().length).toBeGreaterThan(0)
  })

  it('each PVC has required fields', () => {
    for (const pvc of getDemoPVCs()) {
      expect(typeof pvc.name).toBe('string')
      expect(typeof pvc.namespace).toBe('string')
      expect(typeof pvc.cluster).toBe('string')
      expect(typeof pvc.status).toBe('string')
      expect(typeof pvc.capacity).toBe('string')
      expect(Array.isArray(pvc.accessModes)).toBe(true)
    }
  })

  it('includes Bound and Pending statuses', () => {
    const statuses = new Set(getDemoPVCs().map(p => p.status))
    expect(statuses.has('Bound')).toBe(true)
    expect(statuses.has('Pending')).toBe(true)
  })

  it('covers multiple clusters', () => {
    const clusters = new Set(getDemoPVCs().map(p => p.cluster))
    expect(clusters.size).toBeGreaterThanOrEqual(2)
  })
})

describe('getDemoResourceQuotas', () => {
  it('returns a non-empty array', () => {
    expect(getDemoResourceQuotas().length).toBeGreaterThan(0)
  })

  it('each quota has hard and used limits', () => {
    for (const q of getDemoResourceQuotas()) {
      expect(typeof q.name).toBe('string')
      expect(typeof q.namespace).toBe('string')
      expect(typeof q.cluster).toBe('string')
      expect(typeof q.hard).toBe('object')
      expect(typeof q.used).toBe('object')
    }
  })

  it('includes GPU quota', () => {
    const gpuQuota = getDemoResourceQuotas().find(q =>
      q.hard['requests.nvidia.com/gpu'] !== undefined
    )
    expect(gpuQuota).toBeDefined()
  })
})

describe('getDemoLimitRanges', () => {
  it('returns a non-empty array', () => {
    expect(getDemoLimitRanges().length).toBeGreaterThan(0)
  })

  it('each limit range has limits array', () => {
    for (const lr of getDemoLimitRanges()) {
      expect(typeof lr.name).toBe('string')
      expect(typeof lr.namespace).toBe('string')
      expect(typeof lr.cluster).toBe('string')
      expect(Array.isArray(lr.limits)).toBe(true)
      expect(lr.limits.length).toBeGreaterThan(0)
    }
  })

  it('includes Container type limits', () => {
    const hasContainer = getDemoLimitRanges().some(lr =>
      lr.limits.some(l => l.type === 'Container')
    )
    expect(hasContainer).toBe(true)
  })
})

describe('loadPVCsCacheFromStorage', () => {
  it('returns null when localStorage is empty', () => {
    expect(loadPVCsCacheFromStorage('key1')).toBeNull()
  })

  it('returns null when cache key does not match', () => {
    localStorage.setItem(PVCS_CACHE_KEY, JSON.stringify({
      key: 'other',
      data: [{ name: 'pvc1' }],
      timestamp: new Date().toISOString(),
    }))
    expect(loadPVCsCacheFromStorage('my-key')).toBeNull()
  })

  it('returns data when cache key matches', () => {
    const data = [{ name: 'pvc1', namespace: 'ns', cluster: 'c1', status: 'Bound', capacity: '10Gi' }]
    localStorage.setItem(PVCS_CACHE_KEY, JSON.stringify({
      key: 'match',
      data,
      timestamp: new Date().toISOString(),
    }))
    const result = loadPVCsCacheFromStorage('match')
    expect(result).not.toBeNull()
    expect(result!.data).toEqual(data)
  })

  it('returns null on corrupted JSON', () => {
    localStorage.setItem(PVCS_CACHE_KEY, '{{{bad')
    expect(loadPVCsCacheFromStorage('key')).toBeNull()
  })

  it('returns null when data array is empty', () => {
    localStorage.setItem(PVCS_CACHE_KEY, JSON.stringify({ key: 'k', data: [] }))
    expect(loadPVCsCacheFromStorage('k')).toBeNull()
  })
})

describe('savePVCsCacheToStorage', () => {
  it('does not throw when no cache exists', () => {
    expect(() => savePVCsCacheToStorage()).not.toThrow()
  })
})

describe('constants', () => {
  it('PVCS_CACHE_KEY is a non-empty string', () => {
    expect(typeof PVCS_CACHE_KEY).toBe('string')
    expect(PVCS_CACHE_KEY.length).toBeGreaterThan(0)
  })
})

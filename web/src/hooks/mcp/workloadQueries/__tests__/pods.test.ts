/**
 * Unit tests for workloadQueries/pods.ts
 *
 * Covers pure/exported functions:
 *   getDemoPods, getDemoPodIssues, getDemoAllPods,
 *   loadPodsCacheFromStorage, savePodsCacheToStorage,
 *   resetPodsCache, PODS_CACHE_KEY
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getDemoPods,
  getDemoPodIssues,
  getDemoAllPods,
  loadPodsCacheFromStorage,
  savePodsCacheToStorage,
  resetPodsCache,
  PODS_CACHE_KEY,
} from '../pods'

// ---------------------------------------------------------------------------
// Mocks required by pods.ts imports (hooks not under test)
// ---------------------------------------------------------------------------
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: vi.fn((init: unknown) => [init, vi.fn()]),
    useRef: vi.fn((init: unknown) => ({ current: init })),
    useEffect: vi.fn(),
    useCallback: vi.fn((fn: unknown) => fn),
  }
})
vi.mock('../../../../lib/api', () => ({ isBackendUnavailable: vi.fn(() => false) }))
vi.mock('../../../../lib/demoMode', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, isDemoMode: vi.fn(() => false) }
})
vi.mock('../../../../lib/errorClassifier', () => ({ classifyError: vi.fn(() => 'unknown') }))
vi.mock('../../../../lib/kubectlProxy', () => ({ kubectlProxy: vi.fn() }))
vi.mock('../../../../lib/sseClient', () => ({ fetchSSE: vi.fn() }))
vi.mock('../../../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(),
  registerCacheReset: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))
vi.mock('../../../../lib/cache/fetcherUtils', () => ({
  getClusterModeBaseUrl: vi.fn(() => 'http://localhost:8080'),
  isClusterModeBackend: vi.fn(() => false),
}))
vi.mock('../../../useLocalAgent', () => ({ isAgentUnavailable: vi.fn(() => false) }))
vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 30_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: vi.fn(() => 30_000),
  clusterCacheRef: { current: null },
}))
vi.mock('../pollingManager', () => ({ subscribePolling: vi.fn(() => () => {}) }))
vi.mock('../workloadSubscriptions', () => ({
  subscribeWorkloadsCache: vi.fn(() => () => {}),
}))

// ---------------------------------------------------------------------------
// getDemoPods
// ---------------------------------------------------------------------------
describe('getDemoPods', () => {
  it('returns an array of PodInfo objects', () => {
    const pods = getDemoPods()
    expect(Array.isArray(pods)).toBe(true)
    expect(pods.length).toBeGreaterThan(0)
  })

  it('each pod has required fields', () => {
    const pods = getDemoPods()
    for (const pod of pods) {
      expect(pod).toHaveProperty('name')
      expect(pod).toHaveProperty('namespace')
      expect(pod).toHaveProperty('cluster')
      expect(pod).toHaveProperty('status')
      expect(pod).toHaveProperty('ready')
      expect(typeof pod.restarts).toBe('number')
      expect(pod).toHaveProperty('age')
      expect(pod).toHaveProperty('node')
    }
  })

  it('returns fresh array on each call (no shared reference)', () => {
    const a = getDemoPods()
    const b = getDemoPods()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('all pods have valid status strings', () => {
    const pods = getDemoPods()
    for (const pod of pods) {
      expect(typeof pod.status).toBe('string')
      expect(pod.status.length).toBeGreaterThan(0)
    }
  })

  it('restarts are non-negative integers', () => {
    const pods = getDemoPods()
    for (const pod of pods) {
      expect(pod.restarts).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(pod.restarts)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// getDemoPodIssues
// ---------------------------------------------------------------------------
describe('getDemoPodIssues', () => {
  it('returns an array of PodIssue objects', () => {
    const issues = getDemoPodIssues()
    expect(Array.isArray(issues)).toBe(true)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('each issue has required fields', () => {
    const issues = getDemoPodIssues()
    for (const issue of issues) {
      expect(issue).toHaveProperty('name')
      expect(issue).toHaveProperty('namespace')
      expect(issue).toHaveProperty('cluster')
      expect(issue).toHaveProperty('status')
      expect(typeof issue.restarts).toBe('number')
      expect(issue).toHaveProperty('reason')
      expect(Array.isArray(issue.issues)).toBe(true)
    }
  })

  it('each issue has at least one issue message', () => {
    const issues = getDemoPodIssues()
    for (const issue of issues) {
      expect(issue.issues.length).toBeGreaterThan(0)
    }
  })

  it('returns fresh array on each call', () => {
    const a = getDemoPodIssues()
    const b = getDemoPodIssues()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// getDemoAllPods
// ---------------------------------------------------------------------------
describe('getDemoAllPods', () => {
  it('returns superset of getDemoPods', () => {
    const all = getDemoAllPods()
    const base = getDemoPods()
    expect(all.length).toBeGreaterThanOrEqual(base.length)
  })

  it('contains all pods from getDemoPods', () => {
    const all = getDemoAllPods()
    const base = getDemoPods()
    const allNames = new Set(all.map((p) => p.name))
    for (const pod of base) {
      expect(allNames.has(pod.name)).toBe(true)
    }
  })

  it('includes extra ML pods not in getDemoPods', () => {
    const all = getDemoAllPods()
    const base = getDemoPods()
    expect(all.length).toBeGreaterThan(base.length)
    const extraPods = all.filter((p) => !base.some((b) => b.name === p.name))
    expect(extraPods.length).toBeGreaterThan(0)
    const mlPods = extraPods.filter((p) => p.namespace === 'ml')
    expect(mlPods.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// PODS_CACHE_KEY constant
// ---------------------------------------------------------------------------
describe('PODS_CACHE_KEY', () => {
  it('is a non-empty string', () => {
    expect(typeof PODS_CACHE_KEY).toBe('string')
    expect(PODS_CACHE_KEY.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// loadPodsCacheFromStorage / savePodsCacheToStorage / resetPodsCache
// ---------------------------------------------------------------------------
describe('loadPodsCacheFromStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPodsCache()
  })

  afterEach(() => {
    localStorage.clear()
    resetPodsCache()
  })

  it('returns null when localStorage is empty', () => {
    expect(loadPodsCacheFromStorage('test-key')).toBeNull()
  })

  it('returns null when stored key does not match', () => {
    localStorage.setItem(
      PODS_CACHE_KEY,
      JSON.stringify({ key: 'other-key', data: getDemoPods(), timestamp: new Date().toISOString() })
    )
    expect(loadPodsCacheFromStorage('test-key')).toBeNull()
  })

  it('returns null when stored data is empty array', () => {
    localStorage.setItem(
      PODS_CACHE_KEY,
      JSON.stringify({ key: 'test-key', data: [], timestamp: new Date().toISOString() })
    )
    expect(loadPodsCacheFromStorage('test-key')).toBeNull()
  })

  it('returns data and timestamp when key matches', () => {
    const pods = getDemoPods()
    const ts = new Date('2024-01-01T00:00:00Z').toISOString()
    localStorage.setItem(
      PODS_CACHE_KEY,
      JSON.stringify({ key: 'test-key', data: pods, timestamp: ts })
    )
    const result = loadPodsCacheFromStorage('test-key')
    expect(result).not.toBeNull()
    expect(result!.data).toEqual(pods)
    expect(result!.timestamp).toBeInstanceOf(Date)
  })

  it('uses current Date when timestamp field is missing', () => {
    const pods = getDemoPods()
    const before = new Date()
    localStorage.setItem(
      PODS_CACHE_KEY,
      JSON.stringify({ key: 'test-key', data: pods })
    )
    const result = loadPodsCacheFromStorage('test-key')
    expect(result).not.toBeNull()
    expect(result!.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('returns null and does not throw on invalid JSON', () => {
    localStorage.setItem(PODS_CACHE_KEY, 'not-valid-json{{{')
    expect(() => loadPodsCacheFromStorage('test-key')).not.toThrow()
    expect(loadPodsCacheFromStorage('test-key')).toBeNull()
  })
})

describe('savePodsCacheToStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPodsCache()
  })

  afterEach(() => {
    localStorage.clear()
    resetPodsCache()
  })

  it('does not throw when podsCache is null (no-op)', () => {
    resetPodsCache()
    expect(() => savePodsCacheToStorage()).not.toThrow()
  })

  it('round-trips data through load/save', () => {
    const pods = getDemoPods()
    const ts = new Date('2024-06-01T12:00:00Z').toISOString()
    const cacheKey = 'pods:all:all:restarts:10'
    localStorage.setItem(
      PODS_CACHE_KEY,
      JSON.stringify({ key: cacheKey, data: pods, timestamp: ts })
    )
    const loaded = loadPodsCacheFromStorage(cacheKey)
    expect(loaded).not.toBeNull()
    expect(loaded!.data.length).toBe(pods.length)
    savePodsCacheToStorage()
    const stored = localStorage.getItem(PODS_CACHE_KEY)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.data).toEqual(pods)
    expect(parsed.key).toBe(cacheKey)
  })
})

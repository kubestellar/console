import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before imports)
// ---------------------------------------------------------------------------

vi.mock('../useLocalAgent', () => ({
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
  isAgentUnavailable: vi.fn(() => false),
}))

vi.mock('../../lib/modeTransition', () => ({
  registerCacheReset: vi.fn(),
  registerRefetch: vi.fn(() => () => {}),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: {
    getServices: vi.fn(() => Promise.resolve(null)),
    getIngresses: vi.fn(() => Promise.resolve(null)),
    getNetworkPolicies: vi.fn(() => Promise.resolve(null)),
  },
}))

vi.mock('../../lib/authToken', () => ({
  getStoredAuthToken: vi.fn(() => Promise.resolve('')),
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
  isClusterModeBackend: vi.fn(() => false),
}))

vi.mock('../mcp/pollingManager', () => ({
  subscribePolling: vi.fn(() => () => {}),
}))

vi.mock('../useCachedData/demoData', () => ({
  getDemoIngresses: vi.fn(() => []),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  subscribeNetworkingCache,
  useServices,
  useIngresses,
  useNetworkPolicies,
  __networkingTestables,
} from '../mcp/networking'

// ---------------------------------------------------------------------------
// subscribeNetworkingCache
// ---------------------------------------------------------------------------

describe('subscribeNetworkingCache', () => {
  it('returns an unsubscribe function', () => {
    const cb = vi.fn()
    const unsub = subscribeNetworkingCache(cb)
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('calling the unsubscribe function does not throw', () => {
    const cb = vi.fn()
    const unsub = subscribeNetworkingCache(cb)
    expect(() => unsub()).not.toThrow()
  })

  it('multiple subscribers can be added and removed independently', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = subscribeNetworkingCache(cb1)
    const unsub2 = subscribeNetworkingCache(cb2)
    unsub1()
    expect(() => unsub2()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// useServices
// ---------------------------------------------------------------------------

describe('useServices', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))
    localStorage.clear()
    __networkingTestables.resetServicesCache()
  })

  it('returns the expected API shape after load', async () => {
    const { result } = renderHook(() => useServices('test-cluster-shape'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toHaveProperty('services')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(Array.isArray(result.current.services)).toBe(true)
  })

  it('starts in loading state when no cache exists', () => {
    const { result } = renderHook(() => useServices('test-cluster-loading'))
    expect(result.current.isLoading).toBe(true)
  })

  it('increments consecutiveFailures when all fetches fail', async () => {
    const { result } = renderHook(() => useServices('test-cluster-fail'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.consecutiveFailures).toBeGreaterThanOrEqual(1)
  })

  it('isFailed is a boolean', async () => {
    const { result } = renderHook(() => useServices('test-cluster-isfailed'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.isFailed).toBe('boolean')
  })

  it('refetch is a callable function', async () => {
    const { result } = renderHook(() => useServices('test-cluster-refetch'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })

  it('initialises from a valid localStorage cache', () => {
    const cacheKey = 'services:ls-cluster:ls-ns'
    const cachedEntry = {
      data: [{ name: 'cached-svc', namespace: 'ls-ns', cluster: 'ls-cluster', type: 'ClusterIP', ports: [], clusterIP: '10.0.0.1' }],
      timestamp: new Date().toISOString(),
      key: cacheKey,
    }
    localStorage.setItem('kubestellar-services-cache', JSON.stringify(cachedEntry))
    const { result } = renderHook(() => useServices('ls-cluster', 'ls-ns'))
    expect(result.current.services).toHaveLength(1)
    expect(result.current.services[0].name).toBe('cached-svc')
    expect(result.current.isLoading).toBe(false)
  })

  it('renders without crashing when no arguments are passed', async () => {
    const { result } = renderHook(() => useServices())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Array.isArray(result.current.services)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useIngresses
// ---------------------------------------------------------------------------

describe('useIngresses', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))
  })

  it('returns the expected API shape', async () => {
    const { result } = renderHook(() => useIngresses('test-cluster-ingress'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toHaveProperty('ingresses')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(Array.isArray(result.current.ingresses)).toBe(true)
  })

  it('refetch is callable', async () => {
    const { result } = renderHook(() => useIngresses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// useNetworkPolicies
// ---------------------------------------------------------------------------

describe('useNetworkPolicies', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))
  })

  it('returns the expected API shape', async () => {
    const { result } = renderHook(() => useNetworkPolicies('test-cluster-netpol'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toHaveProperty('networkpolicies')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('refetch')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('isFailed')
    expect(Array.isArray(result.current.networkpolicies)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// __networkingTestables — internal utility coverage
// ---------------------------------------------------------------------------

describe('__networkingTestables.getDemoServices', () => {
  it('returns a non-empty array of demo services', () => {
    const services = __networkingTestables.getDemoServices()
    expect(Array.isArray(services)).toBe(true)
    expect(services.length).toBeGreaterThan(0)
  })

  it('every demo service has required fields', () => {
    const services = __networkingTestables.getDemoServices()
    for (const svc of services) {
      expect(typeof svc.name).toBe('string')
      expect(typeof svc.namespace).toBe('string')
      expect(typeof svc.cluster).toBe('string')
    }
  })
})

describe('__networkingTestables.loadServicesCacheFromStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    __networkingTestables.resetServicesCache()
  })

  it('returns null when localStorage is empty', () => {
    const result = __networkingTestables.loadServicesCacheFromStorage('services:all:all')
    expect(result).toBeNull()
  })

  it('returns cached data for a matching key', () => {
    const key = 'services:cls:ns'
    const entry = {
      data: [{ name: 'svc-a', namespace: 'ns', cluster: 'cls', type: 'ClusterIP', ports: [], clusterIP: '10.0.0.1' }],
      timestamp: new Date().toISOString(),
      key,
    }
    localStorage.setItem('kubestellar-services-cache', JSON.stringify(entry))
    const result = __networkingTestables.loadServicesCacheFromStorage(key)
    expect(result).not.toBeNull()
    expect(result!.data).toHaveLength(1)
    expect(result!.data[0].name).toBe('svc-a')
  })

  it('returns null when the stored key does not match the requested key', () => {
    const entry = { data: [{}], timestamp: new Date().toISOString(), key: 'services:all:all' }
    localStorage.setItem('kubestellar-services-cache', JSON.stringify(entry))
    const result = __networkingTestables.loadServicesCacheFromStorage('services:different:key')
    expect(result).toBeNull()
  })

  it('returns null for an expired cache entry', () => {
    const key = 'services:expired:test'
    const entry = {
      data: [{ name: 'old-svc', namespace: 'test', cluster: 'expired', type: 'ClusterIP', ports: [], clusterIP: '10.0.0.2' }],
      // Epoch timestamp — guaranteed to be beyond any reasonable TTL
      timestamp: new Date(0).toISOString(),
      key,
    }
    localStorage.setItem('kubestellar-services-cache', JSON.stringify(entry))
    const result = __networkingTestables.loadServicesCacheFromStorage(key)
    expect(result).toBeNull()
  })

  it('returns null for malformed JSON in localStorage', () => {
    localStorage.setItem('kubestellar-services-cache', 'not-valid-json')
    const result = __networkingTestables.loadServicesCacheFromStorage('services:all:all')
    expect(result).toBeNull()
  })
})

describe('__networkingTestables.resetServicesCache', () => {
  it('clears module-level services cache so next call re-reads from localStorage', () => {
    __networkingTestables.resetServicesCache()
    localStorage.clear()
    // After reset with empty localStorage, loading returns null
    const result = __networkingTestables.loadServicesCacheFromStorage('services:all:all')
    expect(result).toBeNull()
  })
})

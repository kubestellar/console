/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedKserve.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockAuthFetch, mockUseCache } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockUseCache: vi.fn(),
}))
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: mockAuthFetch }))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../useDemoMode', () => ({
    createCachedHook: vi.fn(),
  useDemoMode: () => ({ isDemoMode: false }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))

mockUseCache.mockReturnValue({
  data: null,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
})
vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
    createCachedHook: vi.fn(),
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
  useCardDemoState: vi.fn(),
}))

import { __testables, useCachedKserve } from '../useCachedKserve'
import type {
  KServeControllerPods,
  KServeService,
} from '../../lib/demo/kserve'

const { countByStatus, summarize, deriveHealth, buildKserveStatus } = __testables

// ---------------------------------------------------------------------------
// countByStatus
// ---------------------------------------------------------------------------

describe('countByStatus', () => {
  it('returns 0 for an empty array', () => {
    expect(countByStatus([], 'ready')).toBe(0)
  })

  it('counts services matching the given status', () => {
    const services: KServeService[] = [
      makeService({ status: 'ready' }),
      makeService({ status: 'not-ready' }),
      makeService({ status: 'ready' }),
      makeService({ status: 'unknown' }),
    ]
    expect(countByStatus(services, 'ready')).toBe(2)
    expect(countByStatus(services, 'not-ready')).toBe(1)
    expect(countByStatus(services, 'unknown')).toBe(1)
  })

  it('returns 0 when no services match', () => {
    const services: KServeService[] = [
      makeService({ status: 'ready' }),
    ]
    expect(countByStatus(services, 'not-ready')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeroes for an empty array', () => {
    const result = summarize([])
    expect(result).toEqual({
      totalServices: 0,
      readyServices: 0,
      notReadyServices: 0,
      totalRequestsPerSecond: 0,
      avgP95LatencyMs: 0,
    })
  })

  it('counts ready and not-ready services', () => {
    const services: KServeService[] = [
      makeService({ status: 'ready' }),
      makeService({ status: 'not-ready' }),
      makeService({ status: 'ready' }),
    ]
    const result = summarize(services)
    expect(result.totalServices).toBe(3)
    expect(result.readyServices).toBe(2)
    expect(result.notReadyServices).toBe(1)
  })

  it('sums requestsPerSecond with rounding', () => {
    const services: KServeService[] = [
      makeService({ requestsPerSecond: 10.15 }),
      makeService({ requestsPerSecond: 5.27 }),
    ]
    const result = summarize(services)
    // Rounded to 1 decimal: (10.15 + 5.27) = 15.42 -> round(15.42 * 10) / 10 = 15.4
    expect(result.totalRequestsPerSecond).toBe(15.4)
  })

  it('computes average p95 latency', () => {
    const services: KServeService[] = [
      makeService({ p95LatencyMs: 100 }),
      makeService({ p95LatencyMs: 200 }),
      makeService({ p95LatencyMs: 300 }),
    ]
    const result = summarize(services)
    expect(result.avgP95LatencyMs).toBe(200)
  })

  it('handles a single service', () => {
    const services: KServeService[] = [
      makeService({ requestsPerSecond: 42.5, p95LatencyMs: 150, status: 'ready' }),
    ]
    const result = summarize(services)
    expect(result.totalServices).toBe(1)
    expect(result.readyServices).toBe(1)
    expect(result.totalRequestsPerSecond).toBe(42.5)
    expect(result.avgP95LatencyMs).toBe(150)
  })

  it('handles non-finite requestsPerSecond gracefully', () => {
    const services: KServeService[] = [
      makeService({ requestsPerSecond: NaN }),
      makeService({ requestsPerSecond: 10 }),
    ]
    const result = summarize(services)
    expect(result.totalRequestsPerSecond).toBe(10)
  })

  it('handles non-finite p95LatencyMs gracefully', () => {
    const services: KServeService[] = [
      makeService({ p95LatencyMs: Infinity }),
      makeService({ p95LatencyMs: 100 }),
    ]
    const result = summarize(services)
    // (0 + 100) / 2 = 50
    expect(result.avgP95LatencyMs).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when no controller pods and no services', () => {
    expect(deriveHealth({ ready: 0, total: 0 }, [])).toBe('not-installed')
  })

  it('returns healthy when controller pods are fully ready and services are ready', () => {
    const pods: KServeControllerPods = { ready: 3, total: 3 }
    const services: KServeService[] = [makeService({ status: 'ready' })]
    expect(deriveHealth(pods, services)).toBe('healthy')
  })

  it('returns degraded when controller pods are not fully ready', () => {
    const pods: KServeControllerPods = { ready: 1, total: 3 }
    expect(deriveHealth(pods, [makeService({ status: 'ready' })])).toBe('degraded')
  })

  it('returns degraded when a service is not ready', () => {
    const pods: KServeControllerPods = { ready: 3, total: 3 }
    const services: KServeService[] = [
      makeService({ status: 'ready' }),
      makeService({ status: 'not-ready' }),
    ]
    expect(deriveHealth(pods, services)).toBe('degraded')
  })

  it('returns degraded when a service has unknown status', () => {
    const pods: KServeControllerPods = { ready: 2, total: 2 }
    const services: KServeService[] = [makeService({ status: 'unknown' })]
    expect(deriveHealth(pods, services)).toBe('degraded')
  })

  it('returns healthy with controller pods but no services', () => {
    const pods: KServeControllerPods = { ready: 2, total: 2 }
    expect(deriveHealth(pods, [])).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildKserveStatus
// ---------------------------------------------------------------------------

describe('buildKserveStatus', () => {
  it('builds a complete status object', () => {
    const pods: KServeControllerPods = { ready: 2, total: 2 }
    const services: KServeService[] = [makeService({ status: 'ready' })]
    const result = buildKserveStatus(pods, services)

    expect(result.health).toBe('healthy')
    expect(result.controllerPods).toBe(pods)
    expect(result.services).toEqual(services)
    expect(result.summary.totalServices).toBe(1)
    expect(result.summary.readyServices).toBe(1)
    expect(result.lastCheckTime).toBeDefined()
  })

  it('returns not-installed for empty controller pods and services', () => {
    const result = buildKserveStatus({ ready: 0, total: 0 }, [])
    expect(result.health).toBe('not-installed')
  })

  it('returns degraded when controller pods are degraded', () => {
    const pods: KServeControllerPods = { ready: 1, total: 3 }
    const result = buildKserveStatus(pods, [])
    expect(result.health).toBe('degraded')
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildKserveStatus({ ready: 0, total: 0 }, [])
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// Helpers — factory functions for test data
// ---------------------------------------------------------------------------

let serviceIdCounter = 0

function makeService(overrides?: Partial<KServeService>): KServeService {
  serviceIdCounter++
  return {
    id: `svc-${serviceIdCounter}`,
    name: `test-service-${serviceIdCounter}`,
    namespace: 'default',
    cluster: 'cluster-1',
    status: 'ready',
    modelName: 'sklearn-iris',
    runtime: 'kserve-sklearnserver',
    url: 'https://test-service.example.com',
    trafficPercent: 100,
    readyReplicas: 1,
    desiredReplicas: 1,
    requestsPerSecond: 10,
    p95LatencyMs: 50,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetcher (via useCache capture)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: {
        health: 'not-installed',
        controllerPods: { ready: 0, total: 0 },
        services: [],
        summary: { totalServices: 0, readyServices: 0, notReadyServices: 0, totalRequestsPerSecond: 0, avgP95LatencyMs: 0 },
        lastCheckTime: new Date().toISOString(),
      },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
      refetch: vi.fn(),
    })
  })

  it('returns parsed KServe status on successful response', async () => {
    const validResponse = {
      controllerPods: { ready: 2, total: 2 },
      services: [
        { id: 'svc-1', name: 'iris', namespace: 'default', cluster: 'c1', status: 'ready', modelName: 'sklearn-iris', runtime: 'kserve-sklearnserver', url: 'https://iris.example.com', trafficPercent: 100, readyReplicas: 1, desiredReplicas: 1, requestsPerSecond: 10, p95LatencyMs: 50, updatedAt: new Date().toISOString() },
      ],
    }

    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    renderHook(() => useCachedKserve())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('healthy')
    expect(result.controllerPods.ready).toBe(2)
    expect(result.services).toHaveLength(1)
  })

  it('returns not-installed status on 404 (treat404AsEmpty path)', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderHook(() => useCachedKserve())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('not-installed')
  })

  it('throws when authFetch returns a non-404 error', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderHook(() => useCachedKserve())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Unable to fetch KServe status')
  })

  it('throws when authFetch rejects (network error)', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network failure'))

    renderHook(() => useCachedKserve())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Unable to fetch KServe status')
  })
})

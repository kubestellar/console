/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedGrpc.ts, PLUS fetcher function tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockAuthFetch = vi.fn()
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: (...args: unknown[]) => mockAuthFetch(...args) }))

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

const mockUseCache = vi.fn(() => ({
  data: null,
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  error: null,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
  refetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../components/cards/CardDataContext', () => ({
    createCachedHook: vi.fn(),
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false, showEmptyState: false })),
  useCardDemoState: vi.fn(),
}))

import { __testables } from '../useCachedGrpc'
import { useCachedGrpc } from '../useCachedGrpc'
import type { GrpcService } from '../../components/cards/grpc_status/demoData'

const { summarize, deriveHealth, buildGrpcStatus } = __testables

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeService(overrides: Partial<GrpcService> = {}): GrpcService {
  return {
    name: 'grpc.health.v1.Health',
    namespace: 'default',
    cluster: 'cluster-1',
    status: 'serving',
    endpoints: 3,
    rps: 100,
    latencyP99Ms: 12,
    errorRatePct: 0.1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeros for empty services', () => {
    const result = summarize([])
    expect(result).toEqual({
      totalServices: 0,
      servingServices: 0,
      totalEndpoints: 0,
    })
  })

  it('counts serving services and sums endpoints', () => {
    const services = [
      makeService({ status: 'serving', endpoints: 3 }),
      makeService({ name: 'svc2', status: 'not-serving', endpoints: 2 }),
      makeService({ name: 'svc3', status: 'serving', endpoints: 5 }),
    ]
    const result = summarize(services)
    expect(result.totalServices).toBe(3)
    expect(result.servingServices).toBe(2)
    expect(result.totalEndpoints).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed when no services', () => {
    expect(deriveHealth([])).toBe('not-installed')
  })

  it('returns healthy when all services are serving', () => {
    expect(deriveHealth([makeService(), makeService({ name: 'svc2' })])).toBe('healthy')
  })

  it('returns degraded when a service is not serving', () => {
    const services = [
      makeService(),
      makeService({ name: 'svc2', status: 'not-serving' }),
    ]
    expect(deriveHealth(services)).toBe('degraded')
  })
})

// ---------------------------------------------------------------------------
// buildGrpcStatus
// ---------------------------------------------------------------------------

describe('buildGrpcStatus', () => {
  it('builds not-installed status with no services', () => {
    const stats = { totalRps: 0, avgLatencyP99Ms: 0, avgErrorRatePct: 0, reflectionEnabled: 0 }
    const result = buildGrpcStatus([], stats)
    expect(result.health).toBe('not-installed')
    expect(result.services).toEqual([])
    expect(result.stats).toBe(stats)
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('builds healthy status with serving services', () => {
    const services = [makeService()]
    const stats = { totalRps: 100, avgLatencyP99Ms: 12, avgErrorRatePct: 0.1, reflectionEnabled: 1 }
    const result = buildGrpcStatus(services, stats)
    expect(result.health).toBe('healthy')
    expect(result.services).toHaveLength(1)
    expect(result.summary.servingServices).toBe(1)
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const stats = { totalRps: 0, avgLatencyP99Ms: 0, avgErrorRatePct: 0, reflectionEnabled: 0 }
    const result = buildGrpcStatus([], stats)
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// Fetcher function tests (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchGrpcStatus (via useCache fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: { health: 'not-installed', services: [], stats: { totalRps: 0, avgLatencyP99Ms: 0, avgErrorRatePct: 0, reflectionEnabled: 0 }, summary: { totalServices: 0, servingServices: 0, totalEndpoints: 0 }, lastCheckTime: '' },
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

  it('parses a successful API response into GrpcStatusData', async () => {
    renderHook(() => useCachedGrpc())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          services: [
            {
              name: 'grpc.health.v1.Health',
              namespace: 'default',
              cluster: 'cluster-1',
              status: 'serving',
              endpoints: 3,
              rps: 100,
              latencyP99Ms: 12,
              errorRatePct: 0.1,
            },
          ],
          stats: {
            totalRps: 100,
            avgLatencyP99Ms: 12,
            avgErrorRatePct: 0.1,
            reflectionEnabled: 1,
          },
        }),
    })

    const result = await fetcher()
    expect(result.health).toBe('healthy')
    expect(result.services).toHaveLength(1)
    expect(result.stats.totalRps).toBe(100)
    expect(result.summary.servingServices).toBe(1)
  })

  it('throws on non-ok response (non-404) so cache falls back to demo', async () => {
    renderHook(() => useCachedGrpc())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(fetcher()).rejects.toThrow('Unable to fetch gRPC status')
  })

  it('returns not-installed data on 404 (treated as empty)', async () => {
    renderHook(() => useCachedGrpc())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await fetcher()
    expect(result.health).toBe('not-installed')
    expect(result.services).toEqual([])
  })

  it('throws on network error so cache falls back to demo', async () => {
    renderHook(() => useCachedGrpc())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockRejectedValueOnce(new Error('Network failure'))

    await expect(fetcher()).rejects.toThrow('Unable to fetch gRPC status')
  })

  it('handles empty body fields gracefully', async () => {
    renderHook(() => useCachedGrpc())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const result = await fetcher()
    expect(result.services).toEqual([])
    expect(result.stats.totalRps).toBe(0)
  })
})

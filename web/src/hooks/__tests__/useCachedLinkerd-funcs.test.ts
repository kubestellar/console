/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedLinkerd.ts.
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

import { __testables, useCachedLinkerd } from '../useCachedLinkerd'
import type { LinkerdMeshedDeployment, LinkerdStats } from '../../components/cards/linkerd_status/demoData'

const { summarize, deriveHealth, buildLinkerdStatus } = __testables

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeros for empty deployments array', () => {
    const result = summarize([])
    expect(result).toEqual({
      totalDeployments: 0,
      fullyMeshedDeployments: 0,
      totalMeshedPods: 0,
      totalPods: 0,
    })
  })

  it('counts fully meshed deployments', () => {
    const deployments: LinkerdMeshedDeployment[] = [
      { namespace: 'ns1', deployment: 'd1', meshedPods: 3, totalPods: 3, successRatePct: 100, requestsPerSecond: 10, p99LatencyMs: 5, status: 'meshed', cluster: 'c1' },
      { namespace: 'ns1', deployment: 'd2', meshedPods: 1, totalPods: 3, successRatePct: 95, requestsPerSecond: 5, p99LatencyMs: 10, status: 'partial', cluster: 'c1' },
      { namespace: 'ns2', deployment: 'd3', meshedPods: 0, totalPods: 2, successRatePct: 0, requestsPerSecond: 0, p99LatencyMs: 0, status: 'unmeshed', cluster: 'c1' },
    ]
    const result = summarize(deployments)
    expect(result.totalDeployments).toBe(3)
    expect(result.fullyMeshedDeployments).toBe(1)
    expect(result.totalMeshedPods).toBe(4)
    expect(result.totalPods).toBe(8)
  })

  it('handles single deployment', () => {
    const deployments: LinkerdMeshedDeployment[] = [
      { namespace: 'ns', deployment: 'd', meshedPods: 5, totalPods: 5, successRatePct: 100, requestsPerSecond: 50, p99LatencyMs: 2, status: 'meshed', cluster: 'c' },
    ]
    const result = summarize(deployments)
    expect(result.totalDeployments).toBe(1)
    expect(result.fullyMeshedDeployments).toBe(1)
    expect(result.totalMeshedPods).toBe(5)
    expect(result.totalPods).toBe(5)
  })

  it('handles all unmeshed', () => {
    const deployments: LinkerdMeshedDeployment[] = [
      { namespace: 'ns', deployment: 'd1', meshedPods: 0, totalPods: 2, successRatePct: 0, requestsPerSecond: 0, p99LatencyMs: 0, status: 'unmeshed', cluster: 'c' },
      { namespace: 'ns', deployment: 'd2', meshedPods: 0, totalPods: 3, successRatePct: 0, requestsPerSecond: 0, p99LatencyMs: 0, status: 'unmeshed', cluster: 'c' },
    ]
    const result = summarize(deployments)
    expect(result.fullyMeshedDeployments).toBe(0)
    expect(result.totalMeshedPods).toBe(0)
    expect(result.totalPods).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed for empty deployments', () => {
    expect(deriveHealth([])).toBe('not-installed')
  })

  it('returns healthy when all meshed with high success rate', () => {
    const deployments: LinkerdMeshedDeployment[] = [
      { namespace: 'ns', deployment: 'd1', meshedPods: 3, totalPods: 3, successRatePct: 99.9, requestsPerSecond: 10, p99LatencyMs: 5, status: 'meshed', cluster: 'c' },
      { namespace: 'ns', deployment: 'd2', meshedPods: 2, totalPods: 2, successRatePct: 100, requestsPerSecond: 20, p99LatencyMs: 3, status: 'meshed', cluster: 'c' },
    ]
    expect(deriveHealth(deployments)).toBe('healthy')
  })

  it('returns degraded when a deployment is partial', () => {
    const deployments: LinkerdMeshedDeployment[] = [
      { namespace: 'ns', deployment: 'd1', meshedPods: 3, totalPods: 3, successRatePct: 100, requestsPerSecond: 10, p99LatencyMs: 5, status: 'meshed', cluster: 'c' },
      { namespace: 'ns', deployment: 'd2', meshedPods: 1, totalPods: 3, successRatePct: 100, requestsPerSecond: 5, p99LatencyMs: 8, status: 'partial', cluster: 'c' },
    ]
    expect(deriveHealth(deployments)).toBe('degraded')
  })

  it('returns degraded when success rate is below threshold', () => {
    const deployments: LinkerdMeshedDeployment[] = [
      { namespace: 'ns', deployment: 'd1', meshedPods: 3, totalPods: 3, successRatePct: 98.5, requestsPerSecond: 10, p99LatencyMs: 5, status: 'meshed', cluster: 'c' },
    ]
    expect(deriveHealth(deployments)).toBe('degraded')
  })

  it('returns degraded when unmeshed deployments exist', () => {
    const deployments: LinkerdMeshedDeployment[] = [
      { namespace: 'ns', deployment: 'd1', meshedPods: 0, totalPods: 2, successRatePct: 0, requestsPerSecond: 0, p99LatencyMs: 0, status: 'unmeshed', cluster: 'c' },
    ]
    expect(deriveHealth(deployments)).toBe('degraded')
  })

  it('returns healthy at exactly the threshold (99.0)', () => {
    const deployments: LinkerdMeshedDeployment[] = [
      { namespace: 'ns', deployment: 'd1', meshedPods: 2, totalPods: 2, successRatePct: 99.0, requestsPerSecond: 10, p99LatencyMs: 5, status: 'meshed', cluster: 'c' },
    ]
    // 99.0 is NOT < 99.0, so not unhealthy
    expect(deriveHealth(deployments)).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildLinkerdStatus
// ---------------------------------------------------------------------------

describe('buildLinkerdStatus', () => {
  const baseStats: LinkerdStats = {
    totalRps: 100,
    avgSuccessRatePct: 99.5,
    avgP99LatencyMs: 12,
    controlPlaneVersion: 'stable-2.14.10',
  }

  it('builds a complete status with empty deployments', () => {
    const result = buildLinkerdStatus([], baseStats)
    expect(result.health).toBe('not-installed')
    expect(result.deployments).toEqual([])
    expect(result.stats).toBe(baseStats)
    expect(result.summary.totalDeployments).toBe(0)
    expect(result.lastCheckTime).toBeTruthy()
  })

  it('builds a healthy status with meshed deployments', () => {
    const deployments: LinkerdMeshedDeployment[] = [
      { namespace: 'ns', deployment: 'd1', meshedPods: 3, totalPods: 3, successRatePct: 100, requestsPerSecond: 50, p99LatencyMs: 5, status: 'meshed', cluster: 'c' },
    ]
    const result = buildLinkerdStatus(deployments, baseStats)
    expect(result.health).toBe('healthy')
    expect(result.deployments).toHaveLength(1)
    expect(result.summary.totalDeployments).toBe(1)
    expect(result.summary.fullyMeshedDeployments).toBe(1)
    expect(result.summary.totalMeshedPods).toBe(3)
    expect(result.summary.totalPods).toBe(3)
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildLinkerdStatus([], baseStats)
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })

  it('builds degraded status with mixed deployments', () => {
    const deployments: LinkerdMeshedDeployment[] = [
      { namespace: 'ns', deployment: 'd1', meshedPods: 3, totalPods: 3, successRatePct: 100, requestsPerSecond: 50, p99LatencyMs: 5, status: 'meshed', cluster: 'c' },
      { namespace: 'ns', deployment: 'd2', meshedPods: 0, totalPods: 2, successRatePct: 0, requestsPerSecond: 0, p99LatencyMs: 0, status: 'unmeshed', cluster: 'c' },
    ]
    const result = buildLinkerdStatus(deployments, baseStats)
    expect(result.health).toBe('degraded')
    expect(result.summary.fullyMeshedDeployments).toBe(1)
    expect(result.summary.totalDeployments).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetcher (via useCache capture)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: {
        health: 'not-installed',
        deployments: [],
        stats: { totalRps: 0, avgSuccessRatePct: 0, avgP99LatencyMs: 0, controlPlaneVersion: 'unknown' },
        summary: { totalDeployments: 0, fullyMeshedDeployments: 0, totalMeshedPods: 0, totalPods: 0 },
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

  it('returns parsed Linkerd status on successful response', async () => {
    const validResponse = {
      deployments: [
        { namespace: 'ns', deployment: 'd1', meshedPods: 3, totalPods: 3, successRatePct: 100, requestsPerSecond: 50, p99LatencyMs: 5, status: 'meshed', cluster: 'c' },
      ],
      stats: { totalRps: 50, avgSuccessRatePct: 100, avgP99LatencyMs: 5, controlPlaneVersion: 'stable-2.14.10' },
    }

    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    renderHook(() => useCachedLinkerd())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('healthy')
    expect(result.deployments).toHaveLength(1)
    expect(result.stats.controlPlaneVersion).toBe('stable-2.14.10')
  })

  it('returns not-installed status on 404 (treat404AsEmpty path)', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderHook(() => useCachedLinkerd())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('not-installed')
  })

  it('throws when authFetch returns a non-404 error', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderHook(() => useCachedLinkerd())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Unable to fetch Linkerd status')
  })

  it('throws when authFetch rejects (network error)', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network failure'))

    renderHook(() => useCachedLinkerd())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Unable to fetch Linkerd status')
  })
})

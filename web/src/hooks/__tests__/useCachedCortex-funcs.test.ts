/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedCortex.ts.
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

import { __testables, useCachedCortex } from '../useCachedCortex'
import type {
  CortexComponentPod,
  CortexIngestionMetrics,
} from '../../lib/demo/cortex'

const { summarize, deriveHealth, buildCortexStatus } = __testables

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  it('returns zeroes for an empty array', () => {
    const result = summarize([])
    expect(result).toEqual({
      totalPods: 0,
      runningPods: 0,
      totalComponents: 0,
      runningComponents: 0,
    })
  })

  it('sums replica counts across components', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ replicasDesired: 3, replicasReady: 3, status: 'running' }),
      makeComponent({ replicasDesired: 6, replicasReady: 5, status: 'running' }),
    ]
    const result = summarize(components)
    expect(result.totalPods).toBe(9)
    expect(result.runningPods).toBe(8)
  })

  it('counts components where status is running AND all replicas ready', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 3 }),
      makeComponent({ status: 'running', replicasDesired: 6, replicasReady: 5 }),
      makeComponent({ status: 'pending', replicasDesired: 2, replicasReady: 2 }),
    ]
    const result = summarize(components)
    expect(result.totalComponents).toBe(3)
    // Only the first one is fully running (status=running AND ready===desired)
    expect(result.runningComponents).toBe(1)
  })

  it('counts single fully-running component', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 2, replicasReady: 2 }),
    ]
    const result = summarize(components)
    expect(result.totalComponents).toBe(1)
    expect(result.runningComponents).toBe(1)
  })

  it('returns 0 runningComponents when all are degraded', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'pending', replicasDesired: 3, replicasReady: 0 }),
      makeComponent({ status: 'failed', replicasDesired: 2, replicasReady: 0 }),
    ]
    const result = summarize(components)
    expect(result.runningComponents).toBe(0)
    expect(result.totalComponents).toBe(2)
    expect(result.totalPods).toBe(5)
    expect(result.runningPods).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// deriveHealth
// ---------------------------------------------------------------------------

describe('deriveHealth', () => {
  it('returns not-installed for an empty array', () => {
    expect(deriveHealth([])).toBe('not-installed')
  })

  it('returns healthy when all components are running with full replicas', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 3 }),
      makeComponent({ status: 'running', replicasDesired: 2, replicasReady: 2 }),
    ]
    expect(deriveHealth(components)).toBe('healthy')
  })

  it('returns degraded when a component is not running', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 3 }),
      makeComponent({ status: 'pending', replicasDesired: 2, replicasReady: 2 }),
    ]
    expect(deriveHealth(components)).toBe('degraded')
  })

  it('returns degraded when replicas are not fully ready', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 2 }),
    ]
    expect(deriveHealth(components)).toBe('degraded')
  })

  it('returns degraded for failed status', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'failed', replicasDesired: 1, replicasReady: 0 }),
    ]
    expect(deriveHealth(components)).toBe('degraded')
  })

  it('returns degraded for unknown status', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'unknown', replicasDesired: 1, replicasReady: 1 }),
    ]
    expect(deriveHealth(components)).toBe('degraded')
  })

  it('returns healthy for a single fully healthy component', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 1, replicasReady: 1 }),
    ]
    expect(deriveHealth(components)).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// buildCortexStatus
// ---------------------------------------------------------------------------

describe('buildCortexStatus', () => {
  const DEFAULT_METRICS: CortexIngestionMetrics = {
    activeSeries: 0,
    ingestionRatePerSec: 0,
    queryRatePerSec: 0,
    tenantCount: 0,
  }

  it('builds a complete status object', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 3 }),
    ]
    const metrics: CortexIngestionMetrics = {
      activeSeries: 500_000,
      ingestionRatePerSec: 12_000,
      queryRatePerSec: 50,
      tenantCount: 4,
    }
    const result = buildCortexStatus(components, metrics, '1.16.0')

    expect(result.health).toBe('healthy')
    expect(result.version).toBe('1.16.0')
    expect(result.components).toBe(components)
    expect(result.metrics).toBe(metrics)
    expect(result.summary.totalComponents).toBe(1)
    expect(result.summary.runningComponents).toBe(1)
    expect(result.lastCheckTime).toBeDefined()
  })

  it('returns not-installed for empty components', () => {
    const result = buildCortexStatus([], DEFAULT_METRICS, 'unknown')
    expect(result.health).toBe('not-installed')
  })

  it('returns degraded when a component is degraded', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 2 }),
    ]
    const result = buildCortexStatus(components, DEFAULT_METRICS, '1.16.0')
    expect(result.health).toBe('degraded')
  })

  it('computes summary from components', () => {
    const components: CortexComponentPod[] = [
      makeComponent({ status: 'running', replicasDesired: 3, replicasReady: 3 }),
      makeComponent({ status: 'running', replicasDesired: 6, replicasReady: 5 }),
    ]
    const result = buildCortexStatus(components, DEFAULT_METRICS, '1.16.0')
    expect(result.summary.totalPods).toBe(9)
    expect(result.summary.runningPods).toBe(8)
    expect(result.summary.totalComponents).toBe(2)
    expect(result.summary.runningComponents).toBe(1)
  })

  it('sets lastCheckTime to a valid ISO string', () => {
    const result = buildCortexStatus([], DEFAULT_METRICS, 'unknown')
    expect(() => new Date(result.lastCheckTime)).not.toThrow()
    expect(new Date(result.lastCheckTime).toISOString()).toBe(result.lastCheckTime)
  })
})

// ---------------------------------------------------------------------------
// Helpers — factory functions for test data
// ---------------------------------------------------------------------------

function makeComponent(overrides?: Partial<CortexComponentPod>): CortexComponentPod {
  return {
    name: 'distributor',
    namespace: 'cortex',
    status: 'running',
    replicasDesired: 3,
    replicasReady: 3,
    cluster: 'default',
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
        version: 'unknown',
        components: [],
        metrics: { activeSeries: 0, ingestionRatePerSec: 0, queryRatePerSec: 0, tenantCount: 0 },
        summary: { totalPods: 0, runningPods: 0, totalComponents: 0, runningComponents: 0 },
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

  it('returns parsed Cortex status on successful response', async () => {
    const validResponse = {
      version: '1.16.0',
      components: [
        { name: 'distributor', namespace: 'cortex', status: 'running', replicasDesired: 3, replicasReady: 3, cluster: 'default' },
      ],
      metrics: { activeSeries: 500000, ingestionRatePerSec: 12000, queryRatePerSec: 50, tenantCount: 4 },
    }

    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    renderHook(() => useCachedCortex())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('healthy')
    expect(result.version).toBe('1.16.0')
    expect(result.components).toHaveLength(1)
    expect(result.metrics.activeSeries).toBe(500000)
  })

  it('returns not-installed status on 404 (treat404AsEmpty path)', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderHook(() => useCachedCortex())
    const config = mockUseCache.mock.calls[0][0]
    const result = await config.fetcher()

    expect(result.health).toBe('not-installed')
  })

  it('throws when authFetch returns a non-404 error', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderHook(() => useCachedCortex())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Unable to fetch Cortex status')
  })

  it('throws when authFetch rejects (network error)', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network failure'))

    renderHook(() => useCachedCortex())
    const config = mockUseCache.mock.calls[0][0]

    await expect(config.fetcher()).rejects.toThrow('Unable to fetch Cortex status')
  })
})

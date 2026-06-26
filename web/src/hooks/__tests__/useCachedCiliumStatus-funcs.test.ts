/**
 * Fetcher function tests for useCachedCiliumStatus.ts.
 * This hook delegates to fetchCiliumStatus from agentFetchers,
 * so we mock that and test the fetcher passed to useCache.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockFetchCiliumStatus = vi.fn()

vi.mock('../useCachedData/agentFetchers', () => ({
    createCachedHook: vi.fn(),
  fetchCiliumStatus: (...args: unknown[]) => mockFetchCiliumStatus(...args),
}))

vi.mock('../useCachedData/demoData', () => ({
    createCachedHook: vi.fn(),
  getDemoCiliumStatus: () => ({
    status: 'Healthy',
    nodes: [{ name: 'demo-node', status: 'Ready' }],
    networkPolicies: 5,
    endpoints: 10,
    hubble: { enabled: true, flowsPerSecond: 100, metrics: { forwarded: 50, dropped: 2 } },
  }),
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
    createCachedHook: (config: Record<string, unknown>) => {
        return () => {
            const result = mockUseCache(config)
            return {
                data: result.data,
                isLoading: result.isLoading,
                isRefreshing: result.isRefreshing,
                isDemoFallback: result.isDemoFallback && !result.isLoading,
                error: result.error,
                isFailed: result.isFailed,
                consecutiveFailures: result.consecutiveFailures,
                lastRefresh: result.lastRefresh,
                refetch: result.refetch,
            }
        }
    },
    useCache: (...args: unknown[]) => mockUseCache(...args),
}))

import { useCachedCiliumStatus } from '../useCachedCiliumStatus'

// ---------------------------------------------------------------------------
// Fetcher function tests (via useCache capture)
// ---------------------------------------------------------------------------

describe('useCachedCiliumStatus fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: { status: 'Healthy', nodes: [], networkPolicies: 0, endpoints: 0, hubble: { enabled: false, flowsPerSecond: 0, metrics: { forwarded: 0, dropped: 0 } } },
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

  it('returns data from fetchCiliumStatus on success', async () => {
    renderHook(() => useCachedCiliumStatus())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    const mockData = {
      status: 'Healthy',
      nodes: [{ name: 'node-1', status: 'Ready' }],
      networkPolicies: 3,
      endpoints: 8,
      hubble: { enabled: true, flowsPerSecond: 50, metrics: { forwarded: 20, dropped: 1 } },
    }
    mockFetchCiliumStatus.mockResolvedValueOnce(mockData)

    const result = await fetcher()
    expect(result).toBe(mockData)
  })

  it('throws when fetchCiliumStatus returns null', async () => {
    renderHook(() => useCachedCiliumStatus())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockFetchCiliumStatus.mockResolvedValueOnce(null)

    await expect(fetcher()).rejects.toThrow('Cilium status unavailable')
  })

  it('propagates network error from fetchCiliumStatus', async () => {
    renderHook(() => useCachedCiliumStatus())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockFetchCiliumStatus.mockRejectedValueOnce(new Error('Network failure'))

    await expect(fetcher()).rejects.toThrow('Network failure')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockAgentFetch, mockUseCache, mockIsAgentUnavailable } = vi.hoisted(() => ({
  mockAgentFetch: vi.fn(),
  mockUseCache: vi.fn(),
  mockIsAgentUnavailable: vi.fn(() => false),
}))

vi.mock('../../lib/cache', () => ({
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

import { useCachedQuality } from '../useCachedQuality'

describe('useCachedQuality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAgentUnavailable.mockReturnValue(false)
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
  })

  function captureFetcher() {
    renderHook(() => useCachedQuality())
    const config = mockUseCache.mock.calls[0]?.[0] as { fetcher: () => Promise<unknown>; key: string }
    return config
  }

  it('configures stable cache key', () => {
    const config = captureFetcher()
    expect(config.key).toBe('quality-stats')
  })

  it('returns INITIAL data when local agent unavailable', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const { fetcher } = captureFetcher()
    const result = await fetcher() as { bugsFoundCount: number; healthScore: number; progressPct: string }

    expect(mockAgentFetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      bugsFoundCount: 0,
      remediationsFixed: 0,
      driftEventsCount: 0,
      healthScore: 100,
      progressPct: '0%',
    })
  })

  it('maps backend fields to QualityStats', async () => {
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalPredictions: 25,
        accurateFeedback: 10,
        inaccurateFeedback: 3,
        accuracyRate: 0.941,
        progressPct: '40%',
      }),
    })
    const { fetcher } = captureFetcher()
    const result = await fetcher() as {
      bugsFoundCount: number
      remediationsFixed: number
      driftEventsCount: number
      healthScore: number
      progressPct: string
    }

    expect(result).toEqual({
      bugsFoundCount: 25,
      remediationsFixed: 10,
      driftEventsCount: 3,
      healthScore: 94,
      progressPct: '40%',
    })
  })

  it('applies defaults when backend omits fields', async () => {
    mockAgentFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })
    const { fetcher } = captureFetcher()
    const result = await fetcher() as { healthScore: number; progressPct: string }

    expect(result.healthScore).toBe(100)
    expect(result.progressPct).toBe('0%')
  })

  it('throws on non-2xx status', async () => {
    mockAgentFetch.mockResolvedValueOnce({ ok: false, status: 503 })
    const { fetcher } = captureFetcher()
    await expect(fetcher()).rejects.toThrow('HTTP 503')
  })

  it('rethrows fetch errors', async () => {
    mockAgentFetch.mockRejectedValueOnce(new Error('network down'))
    const { fetcher } = captureFetcher()
    await expect(fetcher()).rejects.toThrow('network down')
  })
})

/**
 * Fetcher function tests for useCachedFlatcar.ts.
 * Tests the fetchFlatcarStatus function via useCache capture,
 * plus __testables pure functions.
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

import { useCachedFlatcar } from '../useCachedFlatcar'

// ---------------------------------------------------------------------------
// Fetcher function tests (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchFlatcarStatus (via useCache fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: { health: 'not-installed', nodes: [], stats: { totalNodes: 0, upToDateNodes: 0, updateAvailableNodes: 0, rebootRequiredNodes: 0, channelsInUse: [] }, summary: { latestStableVersion: '', latestBetaVersion: '', totalClusters: 0 }, lastCheckTime: '' },
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

  it('parses a successful API response into FlatcarStatusData', async () => {
    renderHook(() => useCachedFlatcar())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          nodes: [
            {
              name: 'node-1',
              cluster: 'c1',
              osImage: 'Flatcar Container Linux',
              currentVersion: '3815.2.0',
              availableVersion: null,
              channel: 'stable',
              state: 'up-to-date',
              rebootRequired: false,
              lastCheckTime: new Date().toISOString(),
            },
          ],
          summary: {
            latestStableVersion: '3815.2.0',
            latestBetaVersion: '3816.0.0',
            totalClusters: 1,
          },
        }),
    })

    const result = await fetcher()
    expect(result.health).toBe('healthy')
    expect(result.nodes).toHaveLength(1)
    expect(result.summary.latestStableVersion).toBe('3815.2.0')
    expect(result.stats.totalNodes).toBe(1)
    expect(result.stats.upToDateNodes).toBe(1)
  })

  it('throws on non-ok response (non-404) so cache falls back to demo', async () => {
    renderHook(() => useCachedFlatcar())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(fetcher()).rejects.toThrow('Unable to fetch Flatcar status')
  })

  it('returns not-installed data on 404 (treated as empty)', async () => {
    renderHook(() => useCachedFlatcar())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await fetcher()
    expect(result.health).toBe('not-installed')
    expect(result.nodes).toEqual([])
  })

  it('throws on network error so cache falls back to demo', async () => {
    renderHook(() => useCachedFlatcar())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockRejectedValueOnce(new Error('Network failure'))

    await expect(fetcher()).rejects.toThrow('Unable to fetch Flatcar status')
  })

  it('handles empty body fields gracefully', async () => {
    renderHook(() => useCachedFlatcar())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const result = await fetcher()
    expect(result.nodes).toEqual([])
    expect(result.health).toBe('not-installed')
  })
})

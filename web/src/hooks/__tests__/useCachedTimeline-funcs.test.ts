/**
 * Fetcher function tests for useCachedTimeline.ts.
 * Tests the fetchTimelineEvents function via useCache capture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockAuthFetch = vi.fn()
vi.mock('../../lib/api', () => ({
    createCachedHook: vi.fn(), authFetch: (...args: unknown[]) => mockAuthFetch(...args) }))

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

vi.mock('../../lib/constants/time', () => ({
    createCachedHook: vi.fn(),
  MS_PER_DAY: 86400000,
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

vi.mock('../../components/cards/change_timeline/demoData', () => ({
    createCachedHook: vi.fn(),
  getDemoTimelineEvents: () => [
    { timestamp: '2024-01-01T00:00:00Z', kind: 'Deployment', name: 'demo', action: 'created', namespace: 'default' },
  ],
}))

const mockUseCache = vi.fn(() => ({
  data: [],
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

import { useCachedTimeline } from '../useCachedTimeline'

// ---------------------------------------------------------------------------
// Fetcher function tests (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchTimelineEvents (via useCache fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: [],
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

  it('parses a successful API response into TimelineEvent array', async () => {
    renderHook(() => useCachedTimeline())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    const events = [
      { timestamp: '2024-01-01T00:00:00Z', kind: 'Deployment', name: 'web', action: 'updated', namespace: 'default' },
      { timestamp: '2024-01-01T01:00:00Z', kind: 'Service', name: 'api', action: 'created', namespace: 'default' },
    ]

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(events),
    })

    const result = await fetcher()
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe('Deployment')
  })

  it('throws on non-ok response', async () => {
    renderHook(() => useCachedTimeline())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(fetcher()).rejects.toThrow('Timeline API returned HTTP 500')
  })

  it('throws on non-array response body', async () => {
    renderHook(() => useCachedTimeline())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ notAnArray: true }),
    })

    await expect(fetcher()).rejects.toThrow('Timeline API returned non-array payload')
  })

  it('throws on network error', async () => {
    renderHook(() => useCachedTimeline())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockRejectedValueOnce(new Error('Network failure'))

    await expect(fetcher()).rejects.toThrow('Network failure')
  })

  it('returns empty array for empty response', async () => {
    renderHook(() => useCachedTimeline())
    const config = mockUseCache.mock.calls[0][0]
    const fetcher = config.fetcher

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    const result = await fetcher()
    expect(result).toEqual([])
  })
})

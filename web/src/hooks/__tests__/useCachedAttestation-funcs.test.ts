/**
 * Tests for the fetcher function from useCachedAttestation.ts.
 *
 * useCachedAttestation uses plain `fetch` (not authFetch) and has no
 * __testables export, so we test only the fetcher via useCache capture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockFetch, mockUseCache } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockUseCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })),
}))
vi.stubGlobal('fetch', mockFetch)
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

vi.mock('../../lib/constants/network', () => ({
    createCachedHook: vi.fn(),
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
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

import { useCachedAttestation } from '../useCachedAttestation'

// ---------------------------------------------------------------------------
// Fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchAttestationScore (fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function captureFetcher(): () => Promise<unknown> {
    renderHook(() => useCachedAttestation())
    const config = mockUseCache.mock.calls[0]?.[0] as { fetcher: () => Promise<unknown> }
    return config.fetcher
  }

  it('returns parsed data on success', async () => {
    const validResponse = {
      clusters: [
        {
          cluster: 'eks-prod',
          overallScore: 92,
          signals: [
            { name: 'Image Provenance', score: 92, weight: 30, detail: 'good' },
          ],
          nonCompliantWorkloads: [],
        },
      ],
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(validResponse),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { clusters: unknown[] }
    expect(result.clusters).toHaveLength(1)
  })

  it('returns empty clusters array when body has no clusters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { clusters: unknown[] }
    expect(result.clusters).toEqual([])
  })

  it('throws on 404 status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('attestation HTTP 404')
  })

  it('throws on 500 status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('attestation HTTP 500')
  })

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('Network error')
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}))

const mockAddCustomTheme = vi.fn()
const mockRemoveCustomTheme = vi.fn()
vi.mock('../../lib/themes', () => ({
  addCustomTheme: (...args: unknown[]) => mockAddCustomTheme(...args),
  removeCustomTheme: (...args: unknown[]) => mockRemoveCustomTheme(...args),
}))

const mockEmitInstall = vi.fn()
const mockEmitRemove = vi.fn()
const mockEmitInstallFailed = vi.fn()
vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitMarketplaceInstall: (...args: unknown[]) => mockEmitInstall(...args),
  emitMarketplaceRemove: (...args: unknown[]) => mockEmitRemove(...args),
  emitMarketplaceInstallFailed: (...args: unknown[]) => mockEmitInstallFailed(...args),
}
))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_EXTERNAL_TIMEOUT_MS: 15000,
  }
})

const mockIsCardTypeRegistered = vi.fn(() => false)
vi.mock('../../components/cards/cardRegistry', () => ({
  isCardTypeRegistered: (t: string) => mockIsCardTypeRegistered(t),
}))

vi.mock('@/lib/cache', async () => {
  const React = await import('react')
  return {
    useCache: <T>(opts: { fetcher: () => Promise<T>; initialData: T }) => {
      const { fetcher, initialData } = opts
      const [state, setState] = React.useState<{
        data: T; isLoading: boolean; error: string | null
      }>({ data: initialData, isLoading: true, error: null })
      const refetch = React.useCallback(async () => {
        setState(s => ({ ...s, isLoading: true, error: null }))
        try {
          const data = await fetcher()
          setState({ data, isLoading: false, error: null })
        } catch (e) {
          setState(s => ({
            ...s,
            isLoading: false,
            error: e instanceof Error ? e.message : 'Failed to load marketplace',
          }))
        }
      }, []) // eslint-disable-line react-hooks/exhaustive-deps
      React.useEffect(() => { void refetch() }, []) // eslint-disable-line react-hooks/exhaustive-deps
      return {
        data: state.data,
        isLoading: state.isLoading,
        error: state.error,
        refetch,
        isDemoData: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: null,
      }
    },
    createCachedHook: <T>(config: { fetcher: () => Promise<T>; initialData: T }) => {
      const { fetcher, initialData } = config
      return () => {
        const [state, setState] = React.useState({ data: initialData, isLoading: true, error: null })
        const refetch = React.useCallback(async () => {
          setState((s: { data: T; isLoading: boolean; error: string | null }) => ({ ...s, isLoading: true }))
          try { const data = await fetcher(); setState({ data, isLoading: false, error: null }) }
          catch (e) { setState((s: { data: T; isLoading: boolean; error: string | null }) => ({ ...s, isLoading: false, error: e instanceof Error ? e.message : 'error' })) }
        }, [])
        React.useEffect(() => { void refetch() }, [refetch])
        return { data: state.data, isLoading: state.isLoading, error: state.error, refetch, isDemoData: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null }
      }
    },
  }
})

import { useAuthorProfile } from '../useMarketplace'

// ---------------------------------------------------------------------------
// Tests — useAuthorProfile
// ---------------------------------------------------------------------------

describe('useAuthorProfile', () => {
  const AUTHOR_CACHE_PREFIX = 'kc-author-'

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns initial state when disabled', () => {
    const { result } = renderHook(() => useAuthorProfile('testuser', false))
    expect(result.current.loading).toBe(false)
    expect(result.current.consolePRs).toBe(0)
    expect(result.current.marketplacePRs).toBe(0)
    expect(result.current.coins).toBe(0)
  })

  it('returns initial state when no handle', () => {
    const { result } = renderHook(() => useAuthorProfile(undefined, true))
    expect(result.current.loading).toBe(false)
    expect(result.current.coins).toBe(0)
  })

  it('fetches PR counts from GitHub when enabled', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 5 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 3 }),
      } as Response)

    const { result } = renderHook(() => useAuthorProfile('octocat', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.consolePRs).toBe(5)
    })
    expect(result.current.marketplacePRs).toBe(3)
    const COINS_PER_PR = 100
    expect(result.current.coins).toBe((5 + 3) * COINS_PER_PR)
  })

  it('loads from valid cache without fetching', async () => {
    const cached = {
      consolePRs: 10,
      marketplacePRs: 2,
      fetchedAt: Date.now(),
    }
    localStorage.setItem(`${AUTHOR_CACHE_PREFIX}testuser`, JSON.stringify(cached))

    const { result } = renderHook(() => useAuthorProfile('testuser', true))

    await waitFor(() => {
      expect(result.current.consolePRs).toBe(10)
    })
    expect(result.current.marketplacePRs).toBe(2)
    const COINS_PER_PR = 100
    expect(result.current.coins).toBe(12 * COINS_PER_PR)
    // No fetch should have been called
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('ignores expired author cache', async () => {
    const TWENTY_FIVE_HOURS_AGO = Date.now() - 25 * 60 * 60 * 1000
    const cached = {
      consolePRs: 10,
      marketplacePRs: 2,
      fetchedAt: TWENTY_FIVE_HOURS_AGO,
    }
    localStorage.setItem(`${AUTHOR_CACHE_PREFIX}staleuser`, JSON.stringify(cached))

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 20 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 5 }),
      } as Response)

    const { result } = renderHook(() => useAuthorProfile('staleuser', true))

    await waitFor(() => {
      expect(result.current.consolePRs).toBe(20)
    })
    expect(result.current.marketplacePRs).toBe(5)
  })

  it('returns 0 for PR counts when GitHub API fails', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)

    const { result } = renderHook(() => useAuthorProfile('ratelimited', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.consolePRs).toBe(0)
    expect(result.current.marketplacePRs).toBe(0)
    expect(result.current.coins).toBe(0)
  })

  it('caches fetched results in localStorage', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 7 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 1 }),
      } as Response)

    const { result } = renderHook(() => useAuthorProfile('cachetest', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.consolePRs).toBe(7)
    })

    const stored = JSON.parse(localStorage.getItem(`${AUTHOR_CACHE_PREFIX}cachetest`)!)
    expect(stored.consolePRs).toBe(7)
    expect(stored.marketplacePRs).toBe(1)
    expect(stored.fetchedAt).toBeDefined()
  })

  it('handles malformed author cache gracefully', async () => {
    localStorage.setItem(`${AUTHOR_CACHE_PREFIX}badcache`, '<<not json>>')

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 2 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 1 }),
      } as Response)

    const { result } = renderHook(() => useAuthorProfile('badcache', true))

    await waitFor(() => {
      expect(result.current.consolePRs).toBe(2)
    })
  })
})

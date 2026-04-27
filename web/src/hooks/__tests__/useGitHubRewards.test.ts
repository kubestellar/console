/**
 * Tests for the useGitHubRewards hook.
 *
 * Validates demo-user skip, unauthenticated skip, per-user localStorage
 * caching with TTL, successful fetch, error handling with expired cache
 * clearing, and periodic refresh via interval.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { GitHubRewardsResponse } from '../../types/rewards'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn<[], { user: { github_login: string } | null; isAuthenticated: boolean }>()
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/auth', () => ({ useAuth: () => mockUseAuth() }))

// Constants are simple values -- we mirror them here for localStorage setup.
const STORAGE_KEY_TOKEN = 'token'
const STORAGE_KEY_HAS_SESSION = 'kc-has-session'
/** Per-user cache key format matching the hook's userCacheKey() */
function userCacheKey(login: string): string {
  return `github-rewards-cache:${login}`
}
/** Legacy global cache key — the hook should clean this up */
const LEGACY_CACHE_KEY = 'github-rewards-cache'
/** Client-side cache TTL in milliseconds (must match hook) */
const CLIENT_CACHE_TTL_MS = 15 * 60 * 1000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSampleResponse(overrides: Partial<GitHubRewardsResponse> = {}): GitHubRewardsResponse {
  return {
    total_points: 1200,
    contributions: [],
    breakdown: { bug_issues: 2, feature_issues: 1, other_issues: 0, prs_opened: 3, prs_merged: 1 },
    cached_at: '2025-01-01T00:00:00Z',
    from_cache: false,
    ...overrides,
  }
}

/** Store a cache entry in the new per-user format */
function seedCache(login: string, data: GitHubRewardsResponse, storedAt = Date.now()): void {
  localStorage.setItem(userCacheKey(login), JSON.stringify({ data, storedAt }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useGitHubRewards', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
    // Default: authenticated, real user, token present
    mockUseAuth.mockReturnValue({ user: { github_login: 'octocat' }, isAuthenticated: true })
    localStorage.setItem(STORAGE_KEY_TOKEN, 'test-jwt')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Demo user skip
  it('returns null and does not fetch for demo users', async () => {
    mockUseAuth.mockReturnValue({ user: { github_login: 'demo-user' }, isAuthenticated: true })

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    expect(result.current.githubRewards).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // 2. Unauthenticated skip
  it('returns null and does not fetch when not authenticated', async () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false })

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    expect(result.current.githubRewards).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // 3. Cached data loaded from localStorage on mount (per-user, within TTL)
  it('returns cached data from localStorage on mount when within TTL', async () => {
    const cached = makeSampleResponse({ total_points: 999 })
    seedCache('octocat', cached, Date.now()) // fresh cache

    // Prevent actual fetch from resolving during this test
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    // Cached value loaded via useEffect (not useState initialiser)
    await waitFor(() => {
      expect(result.current.githubRewards).not.toBeNull()
      expect(result.current.githubRewards!.total_points).toBe(999)
    })
  })

  // 3b. Expired cache is discarded
  it('discards expired cache and returns null', async () => {
    const expired = makeSampleResponse({ total_points: 999 })
    const twentyMinutesAgo = Date.now() - (CLIENT_CACHE_TTL_MS + 60_000)
    seedCache('octocat', expired, twentyMinutesAgo)

    // Prevent actual fetch from resolving
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    // Expired cache should be ignored — data stays null until fetch resolves
    await act(async () => { /* flush effects */ })
    expect(result.current.githubRewards).toBeNull()
  })

  // 3c. Legacy global cache key is cleaned up
  it('removes legacy global cache key on load', async () => {
    localStorage.setItem(LEGACY_CACHE_KEY, JSON.stringify(makeSampleResponse()))

    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    renderHook(() => useGitHubRewards())

    await act(async () => { /* flush effects */ })

    expect(localStorage.getItem(LEGACY_CACHE_KEY)).toBeNull()
  })

  // 4. Successful fetch updates state and writes per-user cache
  it('updates state and caches result on successful fetch', async () => {
    const apiResponse = makeSampleResponse({ total_points: 1500 })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    } as Response)

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    await waitFor(() => {
      expect(result.current.githubRewards).not.toBeNull()
      expect(result.current.githubRewards!.total_points).toBe(1500)
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()

    // Per-user cache should have been written with storedAt timestamp
    const raw = localStorage.getItem(userCacheKey('octocat'))
    expect(raw).not.toBeNull()
    const entry = JSON.parse(raw!)
    expect(entry.data.total_points).toBe(1500)
    expect(entry.storedAt).toBeDefined()
  })

  // 5. Failed fetch clears data when cache has expired
  it('clears data on fetch failure when cache has also expired', async () => {
    // Seed an expired cache
    const stale = makeSampleResponse({ total_points: 800 })
    const twentyMinutesAgo = Date.now() - (CLIENT_CACHE_TTL_MS + 60_000)
    seedCache('octocat', stale, twentyMinutesAgo)

    vi.mocked(global.fetch).mockRejectedValue(new Error('Network down'))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    await waitFor(() => {
      expect(result.current.error).toBe('Network down')
    })

    expect(result.current.isLoading).toBe(false)
    // Stale data should be cleared because cache has expired
    expect(result.current.githubRewards).toBeNull()
  })

  // 5b. Failed fetch retains data when cache is still within TTL
  it('retains data on fetch failure when cache is still valid', async () => {
    const cached = makeSampleResponse({ total_points: 800 })
    seedCache('octocat', cached, Date.now()) // fresh cache

    vi.mocked(global.fetch).mockRejectedValue(new Error('Network down'))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    await waitFor(() => {
      expect(result.current.error).toBe('Network down')
    })

    // Data retained because cache is still valid
    expect(result.current.githubRewards).not.toBeNull()
    expect(result.current.githubRewards!.total_points).toBe(800)
  })

  // 6. Refreshes on interval (uses fake timers)
  it('calls fetch again after the refresh interval', async () => {
    vi.useFakeTimers()

    const apiResponse = makeSampleResponse()
    // Use a manually controlled promise so we can resolve it on demand
    let resolveFirstFetch!: (v: Response) => void
    const firstFetchPromise = new Promise<Response>((r) => { resolveFirstFetch = r })
    vi.mocked(global.fetch).mockReturnValueOnce(firstFetchPromise)

    const { useGitHubRewards } = await import('../useGitHubRewards')
    renderHook(() => useGitHubRewards())

    // Resolve the first fetch
    await act(async () => {
      resolveFirstFetch({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      } as Response)
    })

    const callsAfterMount = vi.mocked(global.fetch).mock.calls.length
    // 2 calls: one for rewards (Netlify), one for contributions (local proxy)
    expect(callsAfterMount).toBe(2)

    // Set up the next fetch response
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    } as Response)

    // Advance by 10 minutes (REFRESH_INTERVAL_MS)
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })

    expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(callsAfterMount)

    vi.useRealTimers()
  })

  // 7. Missing token -- no fetch
  it('does not fetch when user is not authenticated', async () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false })

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    // Give effect a chance to run
    await act(async () => {
      // no-op, just flush effects
    })

    expect(global.fetch).not.toHaveBeenCalled()
    // Data stays null since no cache and no fetch
    expect(result.current.githubRewards).toBeNull()
  })

  // 8. Fetch URL includes login query param
  it('includes login query param in fetch URL', async () => {
    const apiResponse = makeSampleResponse()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    } as Response)

    const { useGitHubRewards } = await import('../useGitHubRewards')
    renderHook(() => useGitHubRewards())

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    const rewardsCall = vi.mocked(global.fetch).mock.calls.find(
      c => (c[0] as string).includes('rewards/github'),
    )
    expect(rewardsCall).toBeDefined()
    expect(rewardsCall![0] as string).toContain('login=octocat')
  })

  // 9. Authenticated fetch does not send Authorization header (server-side token resolution)
  it('fetches without Authorization header when authenticated', async () => {
    const apiResponse = makeSampleResponse({ total_points: 2000 })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    } as Response)

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
      expect(result.current.githubRewards).not.toBeNull()
      expect(result.current.githubRewards!.total_points).toBe(2000)
    })

    // Verify the rewards fetch (Netlify) sends no Authorization header
    const rewardsCall = vi.mocked(global.fetch).mock.calls.find(
      c => (c[0] as string).includes('rewards/github'),
    )
    expect(rewardsCall).toBeDefined()
    const fetchInit = rewardsCall![1] as RequestInit | undefined
    const headers = fetchInit?.headers as Record<string, string> | undefined
    expect(headers?.['Authorization']).toBeUndefined()
  })

  // 10. localStorage.getItem throwing does not crash the hook
  it('handles localStorage throwing without crashing', async () => {
    // Simulate restricted browser mode where localStorage throws on read.
    // Use vi.spyOn so jsdom's internal binding is properly intercepted.
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied')
    })

    // Hook is authenticated, but localStorage cache will fail to load
    const apiResponse = makeSampleResponse()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    } as Response)

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    await waitFor(() => {
      // Should not crash — fetches from API even though localStorage is broken
      expect(global.fetch).toHaveBeenCalled()
      expect(result.current.githubRewards).not.toBeNull()
    })

    getItemSpy.mockRestore()
  })
})

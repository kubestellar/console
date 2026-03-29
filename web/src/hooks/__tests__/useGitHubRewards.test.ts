/**
 * Tests for the useGitHubRewards hook.
 *
 * Validates demo-user skip, unauthenticated skip, localStorage caching,
 * successful fetch, error handling with stale cache retention, and
 * periodic refresh via interval.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { GitHubRewardsResponse } from '../../types/rewards'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn<[], { user: { github_login: string } | null; isAuthenticated: boolean }>()
vi.mock('../../lib/auth', () => ({ useAuth: () => mockUseAuth() }))

// Constants are simple values -- we mirror them here for localStorage setup.
const STORAGE_KEY_TOKEN = 'token'
const CACHE_KEY = 'github-rewards-cache'

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

  // 3. Cached data loaded from localStorage on mount
  it('returns cached data from localStorage on mount', async () => {
    const cached = makeSampleResponse({ total_points: 999 })
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))

    // Prevent actual fetch from resolving during this test
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    // Cached value available synchronously (useState initialiser)
    expect(result.current.githubRewards).not.toBeNull()
    expect(result.current.githubRewards!.total_points).toBe(999)
  })

  // 4. Successful fetch updates state and writes cache
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

    // Cache should have been written
    const raw = localStorage.getItem(CACHE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).total_points).toBe(1500)
  })

  // 5. Failed fetch sets error and retains stale cache
  it('sets error but keeps stale cached data on fetch failure', async () => {
    const stale = makeSampleResponse({ total_points: 800 })
    localStorage.setItem(CACHE_KEY, JSON.stringify(stale))

    vi.mocked(global.fetch).mockRejectedValue(new Error('Network down'))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    await waitFor(() => {
      expect(result.current.error).toBe('Network down')
    })

    expect(result.current.isLoading).toBe(false)

    // Stale data retained
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
    expect(callsAfterMount).toBe(1)

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
  it('does not fetch when STORAGE_KEY_TOKEN is absent', async () => {
    localStorage.removeItem(STORAGE_KEY_TOKEN)

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
})

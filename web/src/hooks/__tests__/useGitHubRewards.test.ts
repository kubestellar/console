/**
 * Tests for useGitHubRewards pure helper functions and hook behavior.
 *
 * Covers: classifySearchItem, repoFromUrl, userCacheKey (pure functions)
 * plus hook-level tests for demo-user skip, caching, fetch, and refresh.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { GitHubRewardsResponse } from '../../types/rewards'
import { classifySearchItem, repoFromUrl, userCacheKey } from '../useGitHubRewards'
import type { GitHubSearchItem } from '../useGitHubRewards'

// ---------------------------------------------------------------------------
// Tests: classifySearchItem (pure function)
// ---------------------------------------------------------------------------

/** Helper to build a minimal GitHubSearchItem for testing */
function makeSearchItem(overrides: Partial<GitHubSearchItem> = {}): GitHubSearchItem {
  return {
    html_url: 'https://github.com/kubestellar/console/issues/1',
    title: 'Test item',
    number: 1,
    created_at: '2025-01-01T00:00:00Z',
    labels: [],
    repository_url: 'https://api.github.com/repos/kubestellar/console',
    ...overrides,
  }
}

describe('classifySearchItem', () => {
  it('returns "pr_merged" for a PR with merged_at set', () => {
    const item = makeSearchItem({
      pull_request: { merged_at: '2025-01-15T10:00:00Z' },
    })
    expect(classifySearchItem(item)).toBe('pr_merged')
  })

  it('returns "pr_opened" for a PR that is not merged', () => {
    const item = makeSearchItem({
      pull_request: { merged_at: null },
    })
    expect(classifySearchItem(item)).toBe('pr_opened')
  })

  it('returns "issue_bug" for an issue with a bug label', () => {
    const item = makeSearchItem({
      labels: [{ name: 'kind/bug' }],
    })
    expect(classifySearchItem(item)).toBe('issue_bug')
  })

  it('returns "issue_bug" for an issue with a label containing "bug" (case-insensitive)', () => {
    const item = makeSearchItem({
      labels: [{ name: 'Bug Report' }],
    })
    // The function lowercases label names, so "Bug Report" -> "bug report" which includes "bug"
    expect(classifySearchItem(item)).toBe('issue_bug')
  })

  it('returns "issue_feature" for an issue with a "feature" label', () => {
    const item = makeSearchItem({
      labels: [{ name: 'feature-request' }],
    })
    expect(classifySearchItem(item)).toBe('issue_feature')
  })

  it('returns "issue_feature" for an issue with an "enhancement" label', () => {
    const item = makeSearchItem({
      labels: [{ name: 'enhancement' }],
    })
    expect(classifySearchItem(item)).toBe('issue_feature')
  })

  it('returns "issue_other" for an issue with no matching labels', () => {
    const item = makeSearchItem({
      labels: [{ name: 'documentation' }, { name: 'good first issue' }],
    })
    expect(classifySearchItem(item)).toBe('issue_other')
  })

  it('returns "issue_other" for an issue with no labels at all', () => {
    const item = makeSearchItem({ labels: [] })
    expect(classifySearchItem(item)).toBe('issue_other')
  })

  it('prioritizes PR classification over label classification', () => {
    // Even if a PR has bug labels, it should be classified as a PR
    const item = makeSearchItem({
      pull_request: { merged_at: '2025-01-15T10:00:00Z' },
      labels: [{ name: 'kind/bug' }],
    })
    expect(classifySearchItem(item)).toBe('pr_merged')
  })

  it('prioritizes bug over feature when both labels present', () => {
    const item = makeSearchItem({
      labels: [{ name: 'bug' }, { name: 'feature' }],
    })
    // bug is checked first
    expect(classifySearchItem(item)).toBe('issue_bug')
  })

  it('handles undefined labels gracefully', () => {
    const item = makeSearchItem()
    // @ts-expect-error -- testing runtime safety with undefined labels
    item.labels = undefined
    expect(classifySearchItem(item)).toBe('issue_other')
  })
})

// ---------------------------------------------------------------------------
// Tests: repoFromUrl (pure function)
// ---------------------------------------------------------------------------

describe('repoFromUrl', () => {
  it('extracts org/repo from a standard GitHub API URL', () => {
    expect(repoFromUrl('https://api.github.com/repos/kubestellar/console')).toBe('kubestellar/console')
  })

  it('extracts org/repo from a nested URL', () => {
    expect(repoFromUrl('https://api.github.com/repos/llm-d/llm-d-infra')).toBe('llm-d/llm-d-infra')
  })

  it('handles URLs with trailing segments by taking last two', () => {
    // repoFromUrl always takes the last two path segments
    expect(repoFromUrl('https://api.github.com/repos/org/repo/extra')).toBe('repo/extra')
  })

  it('returns the original string when URL has fewer than 2 segments', () => {
    expect(repoFromUrl('single')).toBe('single')
  })

  it('handles a URL with exactly 2 segments', () => {
    expect(repoFromUrl('org/repo')).toBe('org/repo')
  })

  it('handles empty string', () => {
    // '' split by '/' -> [''], length=1, so < 2 -> returns original
    expect(repoFromUrl('')).toBe('')
  })

  it('handles URLs with hyphens in org and repo names', () => {
    expect(repoFromUrl('https://api.github.com/repos/llm-d-incubation/sched-prom')).toBe('llm-d-incubation/sched-prom')
  })
})

// ---------------------------------------------------------------------------
// Tests: userCacheKey (pure function)
// ---------------------------------------------------------------------------

describe('userCacheKey', () => {
  it('builds a cache key with the prefix and login', () => {
    expect(userCacheKey('octocat')).toBe('github-rewards-cache:octocat')
  })

  it('handles logins with special characters', () => {
    expect(userCacheKey('user-name_123')).toBe('github-rewards-cache:user-name_123')
  })

  it('handles empty login', () => {
    expect(userCacheKey('')).toBe('github-rewards-cache:')
  })

  it('returns distinct keys for different logins', () => {
    const key1 = userCacheKey('alice')
    const key2 = userCacheKey('bob')
    expect(key1).not.toBe(key2)
  })
})

// ---------------------------------------------------------------------------
// Hook-level tests (mocked)
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn<[], { user: { github_login: string } | null; isAuthenticated: boolean }>()
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/auth', () => ({ useAuth: () => mockUseAuth() }))

const STORAGE_KEY_TOKEN = 'token'
/** Client-side cache TTL in milliseconds (must match hook) */
const CLIENT_CACHE_TTL_MS = 15 * 60 * 1000

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

function seedCache(login: string, data: GitHubRewardsResponse, storedAt = Date.now()): void {
  localStorage.setItem(userCacheKey(login), JSON.stringify({ data, storedAt }))
}

describe('useGitHubRewards', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
    mockUseAuth.mockReturnValue({ user: { github_login: 'octocat' }, isAuthenticated: true })
    localStorage.setItem(STORAGE_KEY_TOKEN, 'test-jwt')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null and does not fetch for demo users', async () => {
    mockUseAuth.mockReturnValue({ user: { github_login: 'demo-user' }, isAuthenticated: true })

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    expect(result.current.githubRewards).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns null and does not fetch when not authenticated', async () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false })

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    expect(result.current.githubRewards).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns cached data from localStorage on mount when within TTL', async () => {
    const cached = makeSampleResponse({ total_points: 999 })
    seedCache('octocat', cached, Date.now())

    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    await waitFor(() => {
      expect(result.current.githubRewards).not.toBeNull()
      expect(result.current.githubRewards!.total_points).toBe(999)
    })
  })

  it('discards expired cache and returns null', async () => {
    const expired = makeSampleResponse({ total_points: 999 })
    const twentyMinutesAgo = Date.now() - (CLIENT_CACHE_TTL_MS + 60_000)
    seedCache('octocat', expired, twentyMinutesAgo)

    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    await act(async () => { /* flush effects */ })
    expect(result.current.githubRewards).toBeNull()
  })

  it('removes legacy global cache key on load', async () => {
    localStorage.setItem('github-rewards-cache', JSON.stringify(makeSampleResponse()))

    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    renderHook(() => useGitHubRewards())

    await act(async () => { /* flush effects */ })

    expect(localStorage.getItem('github-rewards-cache')).toBeNull()
  })

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

    const raw = localStorage.getItem(userCacheKey('octocat'))
    expect(raw).not.toBeNull()
    const entry = JSON.parse(raw!)
    expect(entry.data.total_points).toBe(1500)
    expect(entry.storedAt).toBeDefined()
  })

  it('clears data on fetch failure when cache has also expired', async () => {
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
    expect(result.current.githubRewards).toBeNull()
  })

  it('retains data on fetch failure when cache is still valid', async () => {
    const cached = makeSampleResponse({ total_points: 800 })
    seedCache('octocat', cached, Date.now())

    vi.mocked(global.fetch).mockRejectedValue(new Error('Network down'))

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    await waitFor(() => {
      expect(result.current.error).toBe('Network down')
    })

    expect(result.current.githubRewards).not.toBeNull()
    expect(result.current.githubRewards!.total_points).toBe(800)
  })

  it('calls fetch again after the refresh interval', async () => {
    vi.useFakeTimers()

    const apiResponse = makeSampleResponse()
    let resolveFirstFetch!: (v: Response) => void
    const firstFetchPromise = new Promise<Response>((r) => { resolveFirstFetch = r })
    vi.mocked(global.fetch).mockReturnValueOnce(firstFetchPromise)

    const { useGitHubRewards } = await import('../useGitHubRewards')
    renderHook(() => useGitHubRewards())

    await act(async () => {
      resolveFirstFetch({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      } as Response)
    })

    const callsAfterMount = vi.mocked(global.fetch).mock.calls.length
    expect(callsAfterMount).toBe(2)

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    } as Response)

    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })

    expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(callsAfterMount)

    vi.useRealTimers()
  })

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

  it('handles localStorage throwing without crashing', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied')
    })

    const apiResponse = makeSampleResponse()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    } as Response)

    const { useGitHubRewards } = await import('../useGitHubRewards')
    const { result } = renderHook(() => useGitHubRewards())

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
      expect(result.current.githubRewards).not.toBeNull()
    })

    getItemSpy.mockRestore()
  })
})

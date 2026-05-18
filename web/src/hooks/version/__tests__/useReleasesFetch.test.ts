/**
 * Tests for hooks/version/useReleasesFetch.ts
 *
 * Covers:
 * - clearGithubRateLimitBackoff: removes localStorage backoff key
 * - fetchReleases: cache-hit, cache-miss, force, 403, 304, 200, error
 * - fetchLatestMainSHA: rate-limit guard, 200, 403/429 backoff, error
 * - fetchRecentCommits: early-return guards, happy path, 403, network error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../../lib/constants/time', () => ({
  MS_PER_MINUTE: 60_000,
}))

vi.mock('../../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  FETCH_EXTERNAL_TIMEOUT_MS: 15_000,
  MCP_HOOK_TIMEOUT_MS: 5_000,
}))

const mockAuthFetch = vi.fn()
vi.mock('../../../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

// Stub versionUtils pure helpers so tests are isolated from their implementations
const mockLoadCache = vi.fn()
const mockSaveCache = vi.fn()
const mockIsCacheValid = vi.fn()
const mockParseRelease = vi.fn()
const mockSafeJsonParse = vi.fn()

vi.mock('../../versionUtils', () => ({
  DEV_SHA_CACHE_KEY: 'kc-dev-latest-sha',
  GITHUB_API_URL: '/api/github/repos/kubestellar/console/releases',
  GITHUB_MAIN_SHA_URL: '/api/github/repos/kubestellar/console/git/ref/heads/main',
  loadCache: (...args: unknown[]) => mockLoadCache(...args),
  saveCache: (...args: unknown[]) => mockSaveCache(...args),
  isCacheValid: (...args: unknown[]) => mockIsCacheValid(...args),
  parseRelease: (...args: unknown[]) => mockParseRelease(...args),
  safeJsonParse: (...args: unknown[]) => mockSafeJsonParse(...args),
}))

import {
  clearGithubRateLimitBackoff,
  fetchReleases,
  fetchLatestMainSHA,
  fetchRecentCommits,
  GITHUB_RATE_LIMIT_UNTIL_KEY,
} from '../useReleasesFetch'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function makeResponse(status: number, body: unknown = {}, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // Default: no cache in localStorage
  mockLoadCache.mockReturnValue(null)
  mockIsCacheValid.mockReturnValue(false)
  mockParseRelease.mockImplementation((r: { tag_name: string }) => ({ tag: r.tag_name }))
  mockSaveCache.mockReturnValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// clearGithubRateLimitBackoff
// ---------------------------------------------------------------------------

describe('clearGithubRateLimitBackoff', () => {
  it('removes the rate-limit key from localStorage', () => {
    localStorage.setItem(GITHUB_RATE_LIMIT_UNTIL_KEY, '9999999999000')
    clearGithubRateLimitBackoff()
    expect(localStorage.getItem(GITHUB_RATE_LIMIT_UNTIL_KEY)).toBeNull()
  })

  it('is a no-op when key is not present', () => {
    expect(() => clearGithubRateLimitBackoff()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// fetchReleases
// ---------------------------------------------------------------------------

describe('fetchReleases — cache hit', () => {
  it('returns cached releases when cache is valid and force=false', async () => {
    const cachedReleases = [{ tag_name: 'v1.0.0' }]
    mockLoadCache.mockReturnValue({ data: cachedReleases, etag: '"abc"', timestamp: Date.now() })
    mockIsCacheValid.mockReturnValue(true)
    mockParseRelease.mockReturnValue({ tag: 'v1.0.0', type: 'stable' })

    const result = await fetchReleases()

    expect(result.success).toBe(true)
    expect(result.releases).toHaveLength(1)
    expect(result.releases![0].tag).toBe('v1.0.0')
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('bypasses cache when force=true even if cache is valid', async () => {
    mockLoadCache.mockReturnValue({ data: [], etag: '"old"', timestamp: Date.now() })
    mockIsCacheValid.mockReturnValue(true)
    mockSafeJsonParse.mockResolvedValue([{ tag_name: 'v2.0.0', draft: false }])
    mockAuthFetch.mockResolvedValue(makeOkResponse([]))

    await fetchReleases(true)
    expect(mockAuthFetch).toHaveBeenCalledOnce()
  })
})

describe('fetchReleases — network paths', () => {
  it('fetches and saves releases when cache is invalid', async () => {
    const releases = [{ tag_name: 'v1.2.3', draft: false }]
    mockSafeJsonParse.mockResolvedValue(releases)
    mockParseRelease.mockReturnValue({ tag: 'v1.2.3', type: 'stable' })
    mockAuthFetch.mockResolvedValue(makeOkResponse(releases, { ETag: '"newetag"' }))

    const result = await fetchReleases()

    expect(result.success).toBe(true)
    expect(result.releases).toHaveLength(1)
    expect(mockSaveCache).toHaveBeenCalledWith(releases, '"newetag"')
  })

  it('filters out draft releases before saving', async () => {
    const releases = [
      { tag_name: 'v1.2.3', draft: false },
      { tag_name: 'v1.2.4', draft: true },
    ]
    mockSafeJsonParse.mockResolvedValue(releases)
    mockParseRelease.mockImplementation((r: { tag_name: string }) => ({ tag: r.tag_name }))
    mockAuthFetch.mockResolvedValue(makeOkResponse(releases))

    const result = await fetchReleases()

    expect(result.success).toBe(true)
    // Only the non-draft release is saved/returned
    const savedReleases: unknown[] = mockSaveCache.mock.calls[0][0]
    expect(savedReleases.every((r: unknown) => (r as { draft: boolean }).draft === false)).toBe(true)
    expect(savedReleases).not.toContainEqual(expect.objectContaining({ draft: true }))
  })

  it('sends ETag in If-None-Match header when cache has etag', async () => {
    mockLoadCache.mockReturnValue({ data: [], etag: '"stale"', timestamp: 0 })
    mockIsCacheValid.mockReturnValue(false)
    mockSafeJsonParse.mockResolvedValue([])
    mockAuthFetch.mockResolvedValue(makeOkResponse([]))

    await fetchReleases()

    const callHeaders: Headers = mockAuthFetch.mock.calls[0][1].headers
    expect(callHeaders.get('If-None-Match')).toBe('"stale"')
  })

  it('returns cached releases on 304 Not Modified', async () => {
    const cachedData = [{ tag_name: 'v1.0.0', draft: false }]
    mockLoadCache.mockReturnValue({ data: cachedData, etag: '"abc"', timestamp: 0 })
    mockIsCacheValid.mockReturnValue(false)
    mockParseRelease.mockReturnValue({ tag: 'v1.0.0' })
    mockAuthFetch.mockResolvedValue(new Response(null, { status: 304 }))

    const result = await fetchReleases()

    expect(result.success).toBe(true)
    expect(mockSaveCache).toHaveBeenCalledWith(cachedData, '"abc"')
    expect(result.releases).toHaveLength(1)
  })

  it('returns failure on 403 without reset header', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(403))

    const result = await fetchReleases()

    expect(result.success).toBe(false)
    expect(result.errorMessage).toMatch(/rate limit/i)
  })

  it('includes reset time in error when 403 has X-RateLimit-Reset header', async () => {
    const futureReset = String(Math.floor(Date.now() / 1000) + 3600)
    mockAuthFetch.mockResolvedValue(
      makeResponse(403, {}, { 'X-RateLimit-Reset': futureReset }),
    )

    const result = await fetchReleases()

    expect(result.success).toBe(false)
    expect(result.errorMessage).toMatch(/rate limit/i)
  })

  it('returns failure on non-ok status other than 304/403', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500))

    const result = await fetchReleases()

    expect(result.success).toBe(false)
    expect(result.errorMessage).toMatch(/500/)
  })

  it('returns failure and cached releases on network error', async () => {
    const cachedData = [{ tag_name: 'v1.0.0', draft: false }]
    mockLoadCache.mockReturnValue({ data: cachedData, etag: null, timestamp: 0 })
    mockParseRelease.mockReturnValue({ tag: 'v1.0.0' })
    mockAuthFetch.mockRejectedValue(new Error('Network error'))

    const result = await fetchReleases()

    expect(result.success).toBe(false)
    expect(result.errorMessage).toBe('Network error')
    // Falls back to cached data even on failure
    expect(result.releases).toHaveLength(1)
  })

  it('returns generic error message for non-Error throws', async () => {
    mockAuthFetch.mockRejectedValue('string error')

    const result = await fetchReleases()

    expect(result.success).toBe(false)
    expect(result.errorMessage).toBe('Failed to check for updates')
  })
})

// ---------------------------------------------------------------------------
// fetchLatestMainSHA
// ---------------------------------------------------------------------------

describe('fetchLatestMainSHA — rate limit guard', () => {
  it('returns rate-limited when active backoff is stored', async () => {
    const future = Date.now() + 60_000
    localStorage.setItem(GITHUB_RATE_LIMIT_UNTIL_KEY, String(future))

    const result = await fetchLatestMainSHA()

    expect(result.success).toBe(false)
    expect(result.rateLimited).toBe(true)
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('returns cached dev SHA when rate-limited', async () => {
    localStorage.setItem('kc-dev-latest-sha', 'abc123')
    localStorage.setItem(GITHUB_RATE_LIMIT_UNTIL_KEY, String(Date.now() + 60_000))

    const result = await fetchLatestMainSHA()

    expect(result.sha).toBe('abc123')
  })

  it('ignores expired backoff (past timestamp)', async () => {
    localStorage.setItem(GITHUB_RATE_LIMIT_UNTIL_KEY, String(Date.now() - 1000))
    mockSafeJsonParse.mockResolvedValue({ object: { sha: 'freshsha' } })
    mockAuthFetch.mockResolvedValue(makeOkResponse({}))

    await fetchLatestMainSHA()

    expect(mockAuthFetch).toHaveBeenCalledOnce()
  })
})

describe('fetchLatestMainSHA — network paths', () => {
  it('returns SHA and saves to localStorage on 200', async () => {
    mockSafeJsonParse.mockResolvedValue({ object: { sha: 'deadbeef' } })
    mockAuthFetch.mockResolvedValue(makeOkResponse({}))

    const result = await fetchLatestMainSHA()

    expect(result.success).toBe(true)
    expect(result.sha).toBe('deadbeef')
    expect(localStorage.getItem('kc-dev-latest-sha')).toBe('deadbeef')
    expect(localStorage.getItem(GITHUB_RATE_LIMIT_UNTIL_KEY)).toBeNull()
  })

  it('clears rate-limit backoff after successful fetch', async () => {
    localStorage.setItem(GITHUB_RATE_LIMIT_UNTIL_KEY, String(Date.now() - 1))
    mockSafeJsonParse.mockResolvedValue({ object: { sha: 'abc' } })
    mockAuthFetch.mockResolvedValue(makeOkResponse({}))

    await fetchLatestMainSHA()

    expect(localStorage.getItem(GITHUB_RATE_LIMIT_UNTIL_KEY)).toBeNull()
  })

  it('handles 200 response with missing sha gracefully', async () => {
    mockSafeJsonParse.mockResolvedValue({ object: {} })
    mockAuthFetch.mockResolvedValue(makeOkResponse({}))

    const result = await fetchLatestMainSHA()

    expect(result.success).toBe(true)
    expect(result.sha).toBeUndefined()
  })

  it('sets rate-limit backoff on 403', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(403))

    const result = await fetchLatestMainSHA()

    expect(result.success).toBe(false)
    expect(result.rateLimited).toBe(true)
    const stored = localStorage.getItem(GITHUB_RATE_LIMIT_UNTIL_KEY)
    expect(stored).not.toBeNull()
    expect(Number(stored)).toBeGreaterThan(Date.now())
  })

  it('uses X-RateLimit-Reset header for backoff when present on 403', async () => {
    const resetEpoch = Math.floor(Date.now() / 1000) + 900
    mockAuthFetch.mockResolvedValue(makeResponse(403, {}, { 'X-RateLimit-Reset': String(resetEpoch) }))

    await fetchLatestMainSHA()

    const stored = Number(localStorage.getItem(GITHUB_RATE_LIMIT_UNTIL_KEY))
    // Should be approximately resetEpoch * 1000
    expect(stored).toBeCloseTo(resetEpoch * 1000, -5)
  })

  it('sets rate-limit backoff on 429', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(429))

    const result = await fetchLatestMainSHA()

    expect(result.success).toBe(false)
    expect(result.rateLimited).toBe(true)
  })

  it('returns error for other non-ok statuses', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500))

    const result = await fetchLatestMainSHA()

    expect(result.success).toBe(false)
    expect(result.errorMessage).toMatch(/500/)
  })

  it('returns failure on network error', async () => {
    mockAuthFetch.mockRejectedValue(new Error('timeout'))

    const result = await fetchLatestMainSHA()

    expect(result.success).toBe(false)
    expect(result.errorMessage).toBe('timeout')
  })

  it('returns cached SHA on network error', async () => {
    localStorage.setItem('kc-dev-latest-sha', 'fallbacksha')
    mockAuthFetch.mockRejectedValue(new Error('timeout'))

    const result = await fetchLatestMainSHA()

    expect(result.sha).toBe('fallbacksha')
  })
})

// ---------------------------------------------------------------------------
// fetchRecentCommits — early-return guards
// ---------------------------------------------------------------------------

describe('fetchRecentCommits — early returns', () => {
  it('returns [] when currentSHA is empty string', async () => {
    const result = await fetchRecentCommits('', 'abc123')
    expect(result).toEqual([])
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('returns [] when currentSHA is "unknown"', async () => {
    const result = await fetchRecentCommits('unknown', 'abc123')
    expect(result).toEqual([])
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('returns [] when latestSHA is null', async () => {
    const result = await fetchRecentCommits('abc123', null)
    expect(result).toEqual([])
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('returns [] when SHAs are equal', async () => {
    const result = await fetchRecentCommits('abc123', 'abc123')
    expect(result).toEqual([])
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('returns [] when latestSHA starts with currentSHA (prefix match)', async () => {
    const result = await fetchRecentCommits('abc', 'abcdef')
    expect(result).toEqual([])
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('returns [] when currentSHA starts with latestSHA (reverse prefix)', async () => {
    const result = await fetchRecentCommits('abcdef', 'abc')
    expect(result).toEqual([])
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('returns [] when rate-limit backoff is active', async () => {
    localStorage.setItem(GITHUB_RATE_LIMIT_UNTIL_KEY, String(Date.now() + 60_000))

    const result = await fetchRecentCommits('sha-a', 'sha-b')
    expect(result).toEqual([])
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })
})

describe('fetchRecentCommits — network paths', () => {
  const CURRENT_SHA = 'aaaa1111'
  const LATEST_SHA = 'bbbb2222'

  const rawCommits = [
    { sha: 'c1', commit: { message: 'feat: first\ndetail', author: { name: 'Alice', date: '2026-01-01' } } },
    { sha: 'c2', commit: { message: 'fix: second', author: { name: 'Bob', date: '2026-01-02' } } },
  ]

  it('maps commits correctly on 200 response', async () => {
    mockSafeJsonParse.mockResolvedValue({ commits: rawCommits })
    mockAuthFetch.mockResolvedValue(makeOkResponse({}))

    const result = await fetchRecentCommits(CURRENT_SHA, LATEST_SHA)

    // Returned in reversed order (most-recent first after .reverse())
    expect(result).toHaveLength(2)
    // sha preserved
    expect(result.some(c => c.sha === 'c1')).toBe(true)
    // message truncated to first line
    expect(result.find(c => c.sha === 'c1')?.message).toBe('feat: first')
    expect(result.find(c => c.sha === 'c1')?.author).toBe('Alice')
  })

  it('limits commits to last 20 entries', async () => {
    const manyCommits = Array.from({ length: 30 }, (_, i) => ({
      sha: `sha${i}`,
      commit: { message: `msg ${i}`, author: { name: 'Dev', date: '2026-01-01' } },
    }))
    mockSafeJsonParse.mockResolvedValue({ commits: manyCommits })
    mockAuthFetch.mockResolvedValue(makeOkResponse({}))

    const result = await fetchRecentCommits(CURRENT_SHA, LATEST_SHA)

    expect(result.length).toBeLessThanOrEqual(20)
  })

  it('returns [] when response commits array is missing', async () => {
    mockSafeJsonParse.mockResolvedValue({})
    mockAuthFetch.mockResolvedValue(makeOkResponse({}))

    const result = await fetchRecentCommits(CURRENT_SHA, LATEST_SHA)
    expect(result).toEqual([])
  })

  it('returns [] and sets backoff on 403', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(403))

    const result = await fetchRecentCommits(CURRENT_SHA, LATEST_SHA)

    expect(result).toEqual([])
    expect(localStorage.getItem(GITHUB_RATE_LIMIT_UNTIL_KEY)).not.toBeNull()
  })

  it('returns [] and sets backoff on 429', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(429))

    const result = await fetchRecentCommits(CURRENT_SHA, LATEST_SHA)

    expect(result).toEqual([])
    expect(localStorage.getItem(GITHUB_RATE_LIMIT_UNTIL_KEY)).not.toBeNull()
  })

  it('returns [] on network error (best-effort only)', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network failure'))

    const result = await fetchRecentCommits(CURRENT_SHA, LATEST_SHA)
    expect(result).toEqual([])
  })

  it('returns [] on non-ok response (not 403/429)', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse(500))

    const result = await fetchRecentCommits(CURRENT_SHA, LATEST_SHA)
    expect(result).toEqual([])
  })
})

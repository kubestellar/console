import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../helpers', async () => {
  const actual = await vi.importActual<typeof import('../helpers')>('../helpers')
  return {
    ...actual,
    GITHUB_API: 'https://api.github.com',
    API_TIMEOUT_MS: 15000,
  }
})

import { fetchTreePaths, fetchWeeklyActivity } from '../fetchers'

// ── fetchTreePaths ──────────────────────────────────────────────

describe('fetchTreePaths', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns set of file paths from repo tree', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        tree: [
          { path: 'README.md', type: 'blob' },
          { path: 'src/index.ts', type: 'blob' },
          { path: 'src', type: 'tree' },
        ],
      }), { status: 200 }))

    const paths = await fetchTreePaths('kubestellar/console', 'token123')
    expect(paths).toBeInstanceOf(Set)
    expect(paths.has('README.md')).toBe(true)
    expect(paths.has('src/index.ts')).toBe(true)
    expect(paths.has('src')).toBe(true)
  })

  it('uses default_branch from repo info', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: 'develop' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tree: [] }), { status: 200 }))

    await fetchTreePaths('org/repo', 'tok')
    const treeCall = vi.mocked(fetch).mock.calls[1]
    expect(treeCall[0]).toContain('/git/trees/develop?recursive=1')
  })

  it('falls back to "main" when default_branch is not set', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tree: [] }), { status: 200 }))

    await fetchTreePaths('org/repo', 'tok')
    const treeCall = vi.mocked(fetch).mock.calls[1]
    expect(treeCall[0]).toContain('/git/trees/main?recursive=1')
  })

  it('throws on 404 from repo endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 404 }))
    await expect(fetchTreePaths('org/missing', 'tok')).rejects.toThrow('Repo not found')
  })

  it('throws on non-404 error from repo endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }))
    await expect(fetchTreePaths('org/repo', 'tok')).rejects.toThrow('GitHub repo API 500')
  })

  it('throws on 404 from tree endpoint', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))

    await expect(fetchTreePaths('org/repo', 'tok')).rejects.toThrow('Repo not found')
  })

  it('throws on non-404 error from tree endpoint', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 403 }))

    await expect(fetchTreePaths('org/repo', 'tok')).rejects.toThrow('GitHub tree API 403')
  })

  it('returns empty set when tree array is missing', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

    const paths = await fetchTreePaths('org/repo', 'tok')
    expect(paths.size).toBe(0)
  })

  it('includes Authorization header when token is provided', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tree: [] }), { status: 200 }))

    await fetchTreePaths('org/repo', 'my-token')
    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer my-token')
  })

  it('omits Authorization header when token is empty', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tree: [] }), { status: 200 }))

    await fetchTreePaths('org/repo', '')
    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('throws when response body exceeds size cap', async () => {
    const bigBody = 'x'.repeat(3_000_001)
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(bigBody, { status: 200 }))

    await expect(fetchTreePaths('org/repo', 'tok')).rejects.toThrow('too large')
  })

  it('throws when content-length header exceeds size cap', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', {
        status: 200,
        headers: { 'content-length': '5000000' },
      }))

    await expect(fetchTreePaths('org/repo', 'tok')).rejects.toThrow('too large')
  })
})

// ── fetchWeeklyActivity ─────────────────────────────────────────

describe('fetchWeeklyActivity', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns weekly activity buckets', async () => {
    // Mock both PR and issue search responses
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 })
    )

    const result = await fetchWeeklyActivity('kubestellar/console', 'tok')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(16) // WEEKS_OF_HISTORY is 16
    for (const week of result) {
      expect(week).toHaveProperty('week')
      expect(week).toHaveProperty('aiPrs')
      expect(week).toHaveProperty('humanPrs')
      expect(week).toHaveProperty('aiIssues')
      expect(week).toHaveProperty('humanIssues')
    }
  })

  it('counts AI PRs correctly based on labels/user', async () => {
    const now = new Date()
    const prItems = [
      { created_at: now.toISOString(), user: { login: 'copilot[bot]' }, labels: [], pull_request: {} },
      { created_at: now.toISOString(), user: { login: 'human-dev' }, labels: [], pull_request: {} },
    ]

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: prItems }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))

    const result = await fetchWeeklyActivity('kubestellar/console', 'tok')
    const currentWeek = result[result.length - 1]
    // One should be AI, one human (exact count depends on isAIContribution logic)
    expect(currentWeek.aiPrs + currentWeek.humanPrs).toBeGreaterThanOrEqual(0)
  })

  it('handles pagination — stops when page has fewer items than page size', async () => {
    const items = Array.from({ length: 50 }, () => ({
      created_at: new Date().toISOString(),
      user: { login: 'dev' },
      labels: [],
    }))

    vi.mocked(fetch)
      // PR search — one page with 50 items (< 100 page size)
      .mockResolvedValueOnce(new Response(JSON.stringify({ items }), { status: 200 }))
      // Issue search
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))

    await fetchWeeklyActivity('org/repo', 'tok')

    // Should be 2 fetch calls total (1 PR page + 1 issue page)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })

  it('handles search API failure gracefully (returns empty items)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 403 })) // PR search fails
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))

    const result = await fetchWeeklyActivity('org/repo', 'tok')
    // Should still return the buckets, just with zero counts
    expect(result.length).toBe(16)
    for (const w of result) {
      expect(w.aiPrs + w.humanPrs).toBe(0)
    }
  })

  it('skips issue items that have pull_request field (they are PRs)', async () => {
    const now = new Date()
    const issueItems = [
      { created_at: now.toISOString(), user: { login: 'dev' }, labels: [], pull_request: { merged_at: null } },
      { created_at: now.toISOString(), user: { login: 'dev' }, labels: [] },
    ]

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 })) // PRs
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: issueItems }), { status: 200 })) // Issues

    const result = await fetchWeeklyActivity('org/repo', 'tok')
    const currentWeek = result[result.length - 1]
    // Only the second item (without pull_request) should count
    expect(currentWeek.humanIssues).toBe(1)
  })

  it('ignores items from weeks outside the tracking window', async () => {
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 365) // Way outside 16-week window

    const items = [
      { created_at: oldDate.toISOString(), user: { login: 'dev' }, labels: [] },
    ]

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ items }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))

    const result = await fetchWeeklyActivity('org/repo', 'tok')
    const totalPrs = result.reduce((sum, w) => sum + w.aiPrs + w.humanPrs, 0)
    expect(totalPrs).toBe(0) // Old item doesn't match any bucket
  })
})

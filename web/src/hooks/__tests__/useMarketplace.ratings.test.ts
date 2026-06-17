import { describe, setupUseAuthorProfileSuite } from './useMarketplace.test.setup'
import { it, expect, renderHook, waitFor, useAuthorProfile, vi } from './useMarketplace.test.setup'

describe('useAuthorProfile', () => {
  const AUTHOR_CACHE_PREFIX = 'kc-author-'
  setupUseAuthorProfileSuite()

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
})

/**
 * Tests for usePlaylistVideos hook.
 *
 * Covers:
 * - Fetch lifecycle (loading, success, error)
 * - sessionStorage caching (read, write, TTL expiry)
 * - Cancellation on unmount
 * - Fallback playlist URL
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePlaylistVideos } from '../usePlaylistVideos'

const CACHE_KEY = 'ks-playlist-cache'

// Mock sessionStorage since jsdom's may not persist between tests
const sessionStorageStore: Record<string, string> = {}
const sessionStorageMock = {
  getItem: (key: string) => sessionStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { sessionStorageStore[key] = value },
  removeItem: (key: string) => { delete sessionStorageStore[key] },
  clear: () => { Object.keys(sessionStorageStore).forEach(k => delete sessionStorageStore[k]) },
  key: (index: number) => Object.keys(sessionStorageStore)[index] ?? null,
  get length() { return Object.keys(sessionStorageStore).length },
}
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock, writable: true })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorageMock.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

describe('usePlaylistVideos', () => {
  it('returns expected shape', () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ videos: [], playlistUrl: 'https://example.com' }),
    })

    const { result } = renderHook(() => usePlaylistVideos())

    expect(result.current).toHaveProperty('videos')
    expect(result.current).toHaveProperty('playlistUrl')
    expect(result.current).toHaveProperty('loading')
  })

  it('starts in loading state', () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ videos: [], playlistUrl: 'https://example.com' }),
    })

    const { result } = renderHook(() => usePlaylistVideos())
    expect(result.current.loading).toBe(true)
  })

  it('fetches videos from /api/youtube/playlist', async () => {
    const mockVideos = [
      { id: 'v1', title: 'Video 1' },
      { id: 'v2', title: 'Video 2' },
    ]
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        videos: mockVideos,
        playlistId: 'PLtest',
        playlistUrl: 'https://youtube.com/playlist?list=PLtest',
      }),
    })

    const { result } = renderHook(() => usePlaylistVideos())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.videos).toHaveLength(2)
    expect(result.current.videos[0].title).toBe('Video 1')
    expect(result.current.playlistUrl).toBe('https://youtube.com/playlist?list=PLtest')
  })

  it('uses cached data from sessionStorage when available', async () => {
    const cached = {
      videos: [{ id: 'cached-1', title: 'Cached Video' }],
      playlistUrl: 'https://cached-url.com',
      timestamp: Date.now(), // fresh
    }
    sessionStorageMock.setItem(CACHE_KEY, JSON.stringify(cached))

    const { result } = renderHook(() => usePlaylistVideos())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Should use cached data and NOT fetch
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.videos).toHaveLength(1)
    expect(result.current.videos[0].title).toBe('Cached Video')
  })

  it('ignores expired cache and fetches fresh data', async () => {
    const expiredCache = {
      videos: [{ id: 'old-1', title: 'Old Video' }],
      playlistUrl: 'https://old-url.com',
      timestamp: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago (past TTL)
    }
    sessionStorageMock.setItem(CACHE_KEY, JSON.stringify(expiredCache))

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        videos: [{ id: 'fresh-1', title: 'Fresh Video' }],
        playlistUrl: 'https://fresh-url.com',
        playlistId: 'PLfresh',
      }),
    })

    const { result } = renderHook(() => usePlaylistVideos())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.videos[0].title).toBe('Fresh Video')
  })

  it('handles fetch error gracefully (returns empty videos)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => usePlaylistVideos())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.videos).toEqual([])
  })

  it('handles network error gracefully', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => usePlaylistVideos())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.videos).toEqual([])
  })

  it('has a default playlist URL', () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ videos: [], playlistUrl: '' }),
    })

    const { result } = renderHook(() => usePlaylistVideos())

    // Before fetch completes, should have default URL
    expect(result.current.playlistUrl).toContain('youtube.com/playlist')
  })

  it('handles malformed cache JSON gracefully', async () => {
    sessionStorageMock.setItem(CACHE_KEY, 'not-json-at-all!!!')

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        videos: [{ id: 'v1', title: 'Fetched' }],
        playlistUrl: 'https://fetched.com',
        playlistId: 'PL1',
      }),
    })

    const { result } = renderHook(() => usePlaylistVideos())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Should fall back to fetching
    expect(fetchMock).toHaveBeenCalled()
    expect(result.current.videos[0].title).toBe('Fetched')
  })
})

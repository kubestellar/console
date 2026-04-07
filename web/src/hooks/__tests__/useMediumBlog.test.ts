import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useMediumBlog } from '../useMediumBlog'

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('useMediumBlog', () => {
  it('returns loading state initially', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useMediumBlog())
    expect(result.current.loading).toBe(true)
    expect(result.current.posts).toEqual([])
  })

  it('fetches blog posts and returns them', async () => {
    const fakePosts = [
      { title: 'Hello World', link: 'https://example.com/1', published: '2024-01-01', preview: 'Test post' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: fakePosts, feedUrl: 'https://feed.com', channelUrl: 'https://channel.com' }),
    })

    const { result } = renderHook(() => useMediumBlog())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.posts).toEqual(fakePosts)
    expect(result.current.channelUrl).toBe('https://channel.com')
  })

  it('handles fetch failure gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useMediumBlog())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.posts).toEqual([])
  })

  it('handles non-ok response gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useMediumBlog())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.posts).toEqual([])
  })

  it('uses cached data when available', async () => {
    const fakePosts = [
      { title: 'Cached Post', link: 'https://example.com/1', published: '2024-01-01', preview: 'Cached' },
    ]
    const cacheEntry = {
      posts: fakePosts,
      channelUrl: 'https://cached-channel.com',
      timestamp: Date.now(),
    }
    sessionStorage.setItem('ks-medium-blog-cache', JSON.stringify(cacheEntry))

    const mockFetch = vi.fn()
    globalThis.fetch = mockFetch

    const { result } = renderHook(() => useMediumBlog())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.posts).toEqual(fakePosts)
    expect(result.current.channelUrl).toBe('https://cached-channel.com')
    // Should NOT call fetch when cache is valid
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('ignores expired cache', async () => {
    const cacheEntry = {
      posts: [{ title: 'Old', link: 'x', published: 'x', preview: 'x' }],
      channelUrl: 'https://old.com',
      timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago (expired)
    }
    sessionStorage.setItem('ks-medium-blog-cache', JSON.stringify(cacheEntry))

    const freshPosts = [{ title: 'Fresh', link: 'y', published: 'y', preview: 'y' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: freshPosts, feedUrl: 'f', channelUrl: 'https://fresh.com' }),
    })

    const { result } = renderHook(() => useMediumBlog())

    await waitFor(() => expect(result.current.posts).toEqual(freshPosts))
    expect(result.current.channelUrl).toBe('https://fresh.com')
  })

  it('ignores invalid cache format', async () => {
    sessionStorage.setItem('ks-medium-blog-cache', 'not json')

    const freshPosts = [{ title: 'Fresh', link: 'y', published: 'y', preview: 'y' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: freshPosts, feedUrl: 'f', channelUrl: 'https://fresh.com' }),
    })

    const { result } = renderHook(() => useMediumBlog())

    await waitFor(() => expect(result.current.posts).toEqual(freshPosts))
  })

  it('handles null posts in response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: null, feedUrl: 'f', channelUrl: 'https://ch.com' }),
    })

    const { result } = renderHook(() => useMediumBlog())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.posts).toEqual([])
  })

  it('caches successful response in sessionStorage', async () => {
    const fakePosts = [
      { title: 'Post', link: 'https://example.com', published: '2024-01-01', preview: 'Preview' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: fakePosts, feedUrl: 'f', channelUrl: 'https://ch.com' }),
    })

    const { result } = renderHook(() => useMediumBlog())

    await waitFor(() => expect(result.current.loading).toBe(false))

    const cached = sessionStorage.getItem('ks-medium-blog-cache')
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached!)
    expect(parsed.posts).toEqual(fakePosts)
    expect(parsed.channelUrl).toBe('https://ch.com')
  })

  it('ignores cache with missing required fields', async () => {
    // Cache missing channelUrl
    sessionStorage.setItem('ks-medium-blog-cache', JSON.stringify({
      posts: [],
      timestamp: Date.now(),
    }))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: [], feedUrl: 'f', channelUrl: 'https://ch.com' }),
    })

    const { result } = renderHook(() => useMediumBlog())

    await waitFor(() => expect(result.current.loading).toBe(false))
    // Should have fetched since cache was invalid
    expect(globalThis.fetch).toHaveBeenCalled()
  })
})

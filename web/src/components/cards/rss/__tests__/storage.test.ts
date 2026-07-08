import { describe, it, expect, beforeEach, vi } from 'vitest'
import { hashUrl, loadSavedFeeds, saveFeeds, getCachedFeed, cacheFeed } from '../storage'
import { FEEDS_STORAGE_KEY, CACHE_KEY_PREFIX, CACHE_TTL_MS, PRESET_FEEDS } from '../constants'

// Mock localStorage helpers
vi.mock('../../../../lib/utils/localStorage', () => {
  const store = new Map<string, unknown>()
  return {
    safeGetJSON: <T>(key: string): T | null => (store.get(key) as T) ?? null,
    safeSetJSON: (key: string, value: unknown) => { store.set(key, value) },
    __store: store,
  }
})

// Access mock store for test assertions
async function getStore(): Promise<Map<string, unknown>> {
  const mod = await import('../../../../lib/utils/localStorage') as { __store: Map<string, unknown> }
  return mod.__store
}

describe('hashUrl', () => {
  it('returns a string for any URL', () => {
    const result = hashUrl('https://example.com/feed.xml')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns consistent hash for same input', () => {
    const url = 'https://hnrss.org/frontpage'
    expect(hashUrl(url)).toBe(hashUrl(url))
  })

  it('returns different hashes for different URLs', () => {
    expect(hashUrl('https://a.com')).not.toBe(hashUrl('https://b.com'))
  })

  it('handles empty string', () => {
    const result = hashUrl('')
    expect(typeof result).toBe('string')
    expect(result).toBe('0')
  })

  it('returns base-36 encoded string', () => {
    const result = hashUrl('https://kubernetes.io/feed.xml')
    // base-36 only contains [0-9a-z]
    expect(result).toMatch(/^[0-9a-z]+$/)
  })
})

describe('loadSavedFeeds', () => {
  beforeEach(async () => {
    const store = await getStore()
    store.clear()
  })

  it('returns first preset feed when nothing saved', () => {
    const feeds = loadSavedFeeds()
    expect(feeds).toEqual([PRESET_FEEDS[0]])
  })

  it('returns saved feeds from storage', async () => {
    const store = await getStore()
    const saved = [{ url: 'https://example.com/rss', name: 'Test', icon: '📰' }]
    store.set(FEEDS_STORAGE_KEY, saved)

    const feeds = loadSavedFeeds()
    expect(feeds).toEqual(saved)
  })
})

describe('saveFeeds', () => {
  beforeEach(async () => {
    const store = await getStore()
    store.clear()
  })

  it('persists feeds to storage', async () => {
    const store = await getStore()
    const feeds = [{ url: 'https://example.com/rss', name: 'Saved', icon: '✅' }]
    saveFeeds(feeds)
    expect(store.get(FEEDS_STORAGE_KEY)).toEqual(feeds)
  })
})

describe('getCachedFeed', () => {
  beforeEach(async () => {
    const store = await getStore()
    store.clear()
  })

  it('returns null for uncached URL', () => {
    expect(getCachedFeed('https://uncached.com/feed')).toBeNull()
  })

  it('returns cached data when fresh', async () => {
    const store = await getStore()
    const url = 'https://example.com/feed'
    const items = [{ id: '1', title: 'Item 1', link: 'https://example.com/1' }]
    store.set(CACHE_KEY_PREFIX + hashUrl(url), { items, timestamp: Date.now() })

    const result = getCachedFeed(url)
    expect(result).not.toBeNull()
    expect(result!.items).toHaveLength(1)
    expect(result!.items[0].title).toBe('Item 1')
    expect(result!.isStale).toBe(false)
  })

  it('returns null for expired cache when ignoreExpiry is false', async () => {
    const store = await getStore()
    const url = 'https://example.com/expired'
    const items = [{ id: '1', title: 'Old', link: 'https://example.com/old' }]
    store.set(CACHE_KEY_PREFIX + hashUrl(url), {
      items,
      timestamp: Date.now() - CACHE_TTL_MS - 1000,
    })

    expect(getCachedFeed(url)).toBeNull()
  })

  it('returns stale data when ignoreExpiry is true', async () => {
    const store = await getStore()
    const url = 'https://example.com/stale'
    const items = [{ id: '1', title: 'Stale', link: 'https://example.com/s' }]
    store.set(CACHE_KEY_PREFIX + hashUrl(url), {
      items,
      timestamp: Date.now() - CACHE_TTL_MS - 1000,
    })

    const result = getCachedFeed(url, true)
    expect(result).not.toBeNull()
    expect(result!.isStale).toBe(true)
    expect(result!.items[0].title).toBe('Stale')
  })

  it('converts pubDate strings back to Date objects', async () => {
    const store = await getStore()
    const url = 'https://example.com/dates'
    const dateStr = '2024-01-01T00:00:00Z'
    store.set(CACHE_KEY_PREFIX + hashUrl(url), {
      items: [{ id: '1', title: 'D', link: '', pubDate: dateStr }],
      timestamp: Date.now(),
    })

    const result = getCachedFeed(url)
    expect(result!.items[0].pubDate).toBeInstanceOf(Date)
  })
})

describe('cacheFeed', () => {
  beforeEach(async () => {
    const store = await getStore()
    store.clear()
  })

  it('stores items with a timestamp', async () => {
    const store = await getStore()
    const url = 'https://example.com/cache-me'
    const items = [{ id: '1', title: 'Cached', link: 'https://example.com/c' }]

    cacheFeed(url, items)

    const cached = store.get(CACHE_KEY_PREFIX + hashUrl(url)) as { items: unknown[]; timestamp: number }
    expect(cached).toBeDefined()
    expect(cached.items).toEqual(items)
    expect(typeof cached.timestamp).toBe('number')
    expect(cached.timestamp).toBeGreaterThan(0)
  })
})

import type { FeedConfig, FeedItem } from './types'
import { FEEDS_STORAGE_KEY, CACHE_KEY_PREFIX, CACHE_TTL_MS, PRESET_FEEDS } from './constants'
import { safeGetJSON, safeSetJSON } from '../../../lib/utils/localStorage'

// Simple hash function for cache keys (avoids btoa collision issues)
export function hashUrl(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

// Load saved feeds from localStorage
export function loadSavedFeeds(): FeedConfig[] {
  return safeGetJSON<FeedConfig[]>(FEEDS_STORAGE_KEY) ?? [PRESET_FEEDS[0]]
}

// Save feeds to localStorage
export function saveFeeds(feeds: FeedConfig[]) {
  safeSetJSON(FEEDS_STORAGE_KEY, feeds)
}

// Get cached feed data
export function getCachedFeed(url: string, ignoreExpiry = false): { items: FeedItem[], timestamp: number, isStale: boolean } | null {
  const data = safeGetJSON<{ items: FeedItem[], timestamp: number }>(CACHE_KEY_PREFIX + hashUrl(url))
  if (data) {
    const isStale = Date.now() - data.timestamp >= CACHE_TTL_MS
    // Return cache if not expired, or if we want stale data
    if (!isStale || ignoreExpiry) {
      return {
        items: (data.items || []).map((item: FeedItem) => ({
          ...item,
          pubDate: item.pubDate ? new Date(item.pubDate) : undefined,
        })),
        timestamp: data.timestamp,
        isStale,
      }
    }
  }
  return null
}

// Cache feed data
export function cacheFeed(url: string, items: FeedItem[]) {
  safeSetJSON(CACHE_KEY_PREFIX + hashUrl(url), { items, timestamp: Date.now() })
}

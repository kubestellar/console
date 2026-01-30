import type { FeedConfig, FeedItem } from './types'
import { FEEDS_KEY, CACHE_KEY_PREFIX, CACHE_TTL_MS, PRESET_FEEDS } from './constants'

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
  try {
    const saved = localStorage.getItem(FEEDS_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return [PRESET_FEEDS[0]] // Default to Hacker News
}

// Save feeds to localStorage
export function saveFeeds(feeds: FeedConfig[]) {
  localStorage.setItem(FEEDS_KEY, JSON.stringify(feeds))
}

// Get cached feed data
export function getCachedFeed(url: string, ignoreExpiry = false): { items: FeedItem[], timestamp: number, isStale: boolean } | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY_PREFIX + hashUrl(url))
    if (cached) {
      const data = JSON.parse(cached)
      const isStale = Date.now() - data.timestamp >= CACHE_TTL_MS
      // Return cache if not expired, or if we want stale data
      if (!isStale || ignoreExpiry) {
        return {
          items: data.items.map((item: FeedItem) => ({
            ...item,
            pubDate: item.pubDate ? new Date(item.pubDate) : undefined,
          })),
          timestamp: data.timestamp,
          isStale,
        }
      }
    }
  } catch { /* ignore */ }
  return null
}

// Cache feed data
export function cacheFeed(url: string, items: FeedItem[]) {
  try {
    localStorage.setItem(
      CACHE_KEY_PREFIX + hashUrl(url),
      JSON.stringify({ items, timestamp: Date.now() })
    )
  } catch { /* ignore quota errors */ }
}

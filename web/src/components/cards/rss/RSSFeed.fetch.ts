import { useCallback } from 'react'
import { PRESET_FEEDS } from './constants'
import { fetchSingleFeed } from './feedFetcher'
import type { FeedConfig, FeedItem } from './types'
import { cacheFeed, getCachedFeed } from './storage'

interface UseRSSFeedFetchArgs {
  activeFeed?: FeedConfig
  feeds: FeedConfig[]
  isDemoMode: boolean
  getDemoRSSItems: () => FeedItem[]
  setItems: React.Dispatch<React.SetStateAction<FeedItem[]>>
  setItemsSourceUrl: (value: string) => void
  setIsLoading: (value: boolean) => void
  setIsRefreshing: (value: boolean) => void
  setLastRefresh: (value: Date | null) => void
  setError: (value: string | null) => void
  setFetchSuccess: (value: string | null) => void
  t: (key: string) => string
}

export function useRSSFeedFetch(args: UseRSSFeedFetchArgs) {
  const { activeFeed, feeds, isDemoMode, getDemoRSSItems, setItems, setItemsSourceUrl, setIsLoading, setIsRefreshing, setLastRefresh, setError, setFetchSuccess, t } = args

  return useCallback(async (isManualRefresh = false) => {
    if (isDemoMode) {
      const demoItems = getDemoRSSItems()
      setItems(demoItems)
      setItemsSourceUrl('demo')
      setIsLoading(false)
      setIsRefreshing(false)
      setLastRefresh(new Date())
      setError(null)
      const cacheKey = activeFeed?.isAggregate ? `aggregate:${(activeFeed.sourceUrls ?? []).join(',')}:${activeFeed.name}` : activeFeed?.url
      if (cacheKey) cacheFeed(cacheKey, demoItems)
      return
    }

    if (!activeFeed?.url && !activeFeed?.isAggregate) return

    const cacheKey = activeFeed.isAggregate ? `aggregate:${(activeFeed.sourceUrls ?? []).join(',')}:${activeFeed.name}` : activeFeed.url
    const cached = getCachedFeed(cacheKey, true)
    if (cached && cached.items.length > 0) {
      setItems(cached.items)
      setItemsSourceUrl(cacheKey)
      setLastRefresh(new Date(cached.timestamp))
      setError(null)
      setIsLoading(false)
      if (!cached.isStale && !isManualRefresh) {
        setIsRefreshing(false)
        return
      }
      setIsRefreshing(true)
    } else if (isManualRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)

    try {
      let feedItems: FeedItem[] = []
      if (activeFeed.isAggregate && activeFeed.sourceUrls) {
        const results = await Promise.all(activeFeed.sourceUrls.map(async (url) => {
          const items = await fetchSingleFeed(url)
          const sourceFeed = feeds.find(f => f.url === url) || PRESET_FEEDS.find(p => p.url === url)
          let sourceName: string
          try { sourceName = sourceFeed?.name || new URL(url).hostname } catch { sourceName = sourceFeed?.name || url }
          const sourceIcon = sourceFeed?.icon || '📰'
          return items.map(item => ({ ...item, sourceUrl: url, sourceName, sourceIcon }))
        }))
        const seen = new Set<string>()
        for (const items of results) {
          for (const item of items) {
            if (!seen.has(item.link)) {
              seen.add(item.link)
              feedItems.push(item)
            }
          }
        }
      } else {
        feedItems = await fetchSingleFeed(activeFeed.url)
      }

      if (feedItems.length === 0) {
        throw new Error(activeFeed.isAggregate ? 'No items found in any source feed' : 'No items found in feed')
      }

      setItems(feedItems)
      setItemsSourceUrl(cacheKey)
      setError(null)
      setLastRefresh(new Date())
      const sourceCount = activeFeed.isAggregate ? ` from ${activeFeed.sourceUrls?.length || 0} sources` : ''
      setFetchSuccess(`Fetched ${feedItems.length} items${sourceCount}`)
      cacheFeed(cacheKey, feedItems)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('rssFeed.failedToLoadFeed')
      const fallback = getCachedFeed(cacheKey)
      if (fallback && fallback.items.length > 0) {
        setItems(fallback.items)
        setItemsSourceUrl(cacheKey)
        setLastRefresh(new Date(fallback.timestamp))
        setError(null)
      } else {
        setItems([])
        setItemsSourceUrl(cacheKey)
        setError(message)
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [activeFeed, feeds, isDemoMode, getDemoRSSItems, setItems, setItemsSourceUrl, setIsLoading, setIsRefreshing, setLastRefresh, setError, setFetchSuccess, t])
}

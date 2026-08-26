import { useState, useEffect, useCallback, useRef } from 'react'
import type { FeedConfig, FeedItem } from '../types'
import { RSS_DEMO_FEEDS, getDemoRSSItems } from '../demoData'
import { loadSavedFeeds, saveFeeds, getCachedFeed, cacheFeed } from '../storage'
import { fetchSingleFeed } from '../feedFetcher'
import { TOAST_DISMISS_MS } from '../../../../lib/constants/network'

interface UseRSSFeedManagementProps {
  isDemoMode: boolean
  config?: { feedUrl?: string; feedName?: string }
}

export function useRSSFeedManagement({ isDemoMode, config }: UseRSSFeedManagementProps) {
  const getInitialFeeds = useCallback(() => {
    if (config?.feedUrl) {
      return [{ url: config.feedUrl, name: config.feedName || 'RSS Feed', icon: '📰' }]
    }
    const savedFeeds = loadSavedFeeds()
    return savedFeeds.length > 0 ? savedFeeds : (isDemoMode ? RSS_DEMO_FEEDS : [])
  }, [config, isDemoMode])

  const [feeds, setFeeds] = useState<FeedConfig[]>(() => getInitialFeeds())
  const [activeFeedIndex, setActiveFeedIndex] = useState(0)

  const [items, setItems] = useState<FeedItem[]>(() => {
    const initialFeeds = getInitialFeeds()
    const firstFeed = initialFeeds[0]
    if (firstFeed) {
      const cacheKey = firstFeed.isAggregate
        ? `aggregate:${(firstFeed.sourceUrls ?? []).join(',')}:${firstFeed.name}`
        : firstFeed.url
      const cached = getCachedFeed(cacheKey, true)
      if (cached && cached.items.length > 0) {
        return cached.items
      }
    }
    return []
  })

  const [itemsSourceUrl, setItemsSourceUrl] = useState<string | null>(() => {
    const initialFeeds = getInitialFeeds()
    const firstFeed = initialFeeds[0]
    if (firstFeed) {
      return firstFeed.isAggregate
        ? `aggregate:${(firstFeed.sourceUrls ?? []).join(',')}:${firstFeed.name}`
        : firstFeed.url
    }
    return null
  })

  const [isLoading, setIsLoading] = useState(() => {
    const initialFeeds = getInitialFeeds()
    const firstFeed = initialFeeds[0]
    if (firstFeed) {
      const cacheKey = firstFeed.isAggregate
        ? `aggregate:${(firstFeed.sourceUrls ?? []).join(',')}:${firstFeed.name}`
        : firstFeed.url
      const cached = getCachedFeed(cacheKey, true)
      return !cached || cached.items.length === 0
    }
    return true
  })

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [fetchSuccess, setFetchSuccess] = useState<string | null>(null)

  const activeFeed = feeds[activeFeedIndex] || feeds[0]

  const currentCacheKey = activeFeed?.isAggregate
    ? `aggregate:${(activeFeed.sourceUrls ?? []).join(',')}:${activeFeed.name}`
    : activeFeed?.url

  const itemsMatchActiveFeed = itemsSourceUrl === currentCacheKey

  const fetchFeed = useCallback(async (isManualRefresh = false, t: (key: string) => string) => {
    if (isDemoMode) {
      const demoItems = getDemoRSSItems()
      setItems(demoItems)
      setItemsSourceUrl('demo')
      setIsLoading(false)
      setIsRefreshing(false)
      setLastRefresh(new Date())
      setError(null)
      const cacheKey = activeFeed?.isAggregate
        ? `aggregate:${(activeFeed.sourceUrls ?? []).join(',')}:${activeFeed.name}`
        : activeFeed?.url
      if (cacheKey) cacheFeed(cacheKey, demoItems)
      return
    }

    if (!activeFeed?.url && !activeFeed?.isAggregate) return

    const cacheKey = activeFeed.isAggregate
      ? `aggregate:${(activeFeed.sourceUrls ?? []).join(',')}:${activeFeed.name}`
      : activeFeed.url

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
    } else {
      if (isManualRefresh) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }
    }
    setError(null)

    try {
      let feedItems: FeedItem[] = []

      if (activeFeed.isAggregate && activeFeed.sourceUrls) {
        const results = await Promise.all(
          activeFeed.sourceUrls.map(async (url) => {
            const items = await fetchSingleFeed(url)
            const sourceFeed = feeds.find(f => f.url === url)
            let sourceName: string
            try {
              sourceName = sourceFeed?.name || new URL(url).hostname
            } catch {
              sourceName = sourceFeed?.name || url
            }
            const sourceIcon = sourceFeed?.icon || '📰'
            return items.map(item => ({
              ...item,
              sourceUrl: url,
              sourceName,
              sourceIcon }))
          })
        )
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

      const cached = getCachedFeed(cacheKey)
      if (cached && cached.items.length > 0) {
        setItems(cached.items)
        setItemsSourceUrl(cacheKey)
        setLastRefresh(new Date(cached.timestamp))
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
  }, [activeFeed?.url, activeFeed?.name, activeFeed?.isAggregate, activeFeed?.sourceUrls, isDemoMode, feeds])

  const feedInitRef = useRef(false)
  useEffect(() => {
    if (feedInitRef.current) return
    feedInitRef.current = true
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchFeed(false, (key: string) => key)
    return () => {
      feedInitRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (config?.feedUrl) return

    const onlyDemoFeeds = feeds.length > 0 && feeds.every(feed => feed.url.startsWith('demo:'))
    if (isDemoMode && feeds.length === 0) {
      setFeeds(RSS_DEMO_FEEDS)
      setActiveFeedIndex(0)
      return
    }

    if (!isDemoMode && onlyDemoFeeds) {
      setFeeds(loadSavedFeeds())
      setActiveFeedIndex(0)
    }
  }, [config?.feedUrl, feeds, isDemoMode])

  useEffect(() => {
    if (fetchSuccess) {
      const timer = setTimeout(() => setFetchSuccess(null), TOAST_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [fetchSuccess])

  useEffect(() => {
    if (config?.feedUrl) return
    if (feeds.length > 0 && feeds.every(feed => feed.url.startsWith('demo:'))) return
    saveFeeds(feeds)
  }, [feeds, config?.feedUrl])

  const handleRefresh = useCallback((t: (key: string) => string) => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchFeed(true, t)
  }, [fetchFeed])

  return {
    feeds,
    setFeeds,
    activeFeedIndex,
    setActiveFeedIndex,
    items,
    itemsSourceUrl,
    isLoading,
    isRefreshing,
    setIsRefreshing,
    error,
    setError,
    lastRefresh,
    fetchSuccess,
    activeFeed,
    currentCacheKey,
    itemsMatchActiveFeed,
    fetchFeed,
    handleRefresh,
  }
}

import { useCallback, useEffect, useRef } from 'react'
import type { FeedConfig, FeedItem, RSSItemRaw } from './types'
import { CORS_PROXIES, PRESET_FEEDS } from './constants'
import { cacheFeed, getCachedFeed } from './storage'
import { decodeHTMLEntities, isValidThumbnail, parseRSSFeed, stripHTML } from './RSSParser'
import { getDemoRSSItems } from './demoData'

const MIN_VALID_FEED_LENGTH = 50
const FETCH_TIMEOUT_MS = 10000

interface UseRSSFeedRefreshParams {
  activeFeed?: FeedConfig
  feeds: FeedConfig[]
  isDemoMode: boolean
  failedToLoadText: string
  setItems: (items: FeedItem[]) => void
  setItemsSourceUrl: (source: string | null) => void
  setIsLoading: (v: boolean) => void
  setIsRefreshing: (v: boolean) => void
  setError: (v: string | null) => void
  setLastRefresh: (v: Date | null) => void
  setFetchSuccess: (v: string | null) => void
}

export function useRSSFeedRefresh({
  activeFeed,
  feeds,
  isDemoMode,
  failedToLoadText,
  setItems,
  setItemsSourceUrl,
  setIsLoading,
  setIsRefreshing,
  setError,
  setLastRefresh,
  setFetchSuccess,
}: UseRSSFeedRefreshParams) {
  const fetchWithTimeout = useCallback(async (url: string, timeoutMs: number): Promise<Response> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { signal: controller.signal })
      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }, [])

  const fetchSingleFeed = useCallback(async (feedUrl: string): Promise<FeedItem[]> => {
    for (const proxy of CORS_PROXIES) {
      try {
        const proxyUrl = proxy.url + encodeURIComponent(feedUrl)
        const response = await fetchWithTimeout(proxyUrl, FETCH_TIMEOUT_MS)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        let items: FeedItem[] = []

        if (proxy.type === 'json-rss2json') {
          const data = await response.json()
          if (data.status === 'ok' && data.items) {
            items = data.items.map((item: RSSItemRaw, idx: number) => {
              let thumb = item.thumbnail || item.enclosure?.thumbnail || item.enclosure?.link || ''
              if (!isValidThumbnail(thumb)) thumb = ''
              if (!thumb && (item.description || item.content)) {
                const descOrContent = item.description || item.content
                if (descOrContent) {
                  const imgMatch = descOrContent.match(/<img[^>]+src=["']([^"']+)["']/)
                  if (imgMatch && isValidThumbnail(imgMatch[1])) {
                    thumb = imgMatch[1]
                  }
                }
              }
              return {
                id: `${feedUrl}-${item.guid || item.link || idx}`,
                title: decodeHTMLEntities(item.title || 'Untitled'),
                link: item.link || '',
                description: stripHTML(item.description || item.content || '').slice(0, 300),
                pubDate: item.pubDate ? new Date(item.pubDate) : undefined,
                author: item.author || '',
                thumbnail: thumb,
                subreddit: item.link?.match(/reddit\.com\/r\/([^/]+)/)?.[1],
              }
            })
          } else {
            throw new Error(data.message || 'Invalid RSS feed')
          }
        } else if (proxy.type === 'json-contents') {
          const data = await response.json()
          if (data.contents) {
            let contents = data.contents
            if (contents.startsWith('data:') && contents.includes('base64,')) {
              const base64Part = contents.split('base64,')[1]
              contents = atob(base64Part)
            }
            if (contents.includes('<title>500') || contents.includes('Internal Server Error')) {
              throw new Error('Proxy returned error page')
            }
            items = parseRSSFeed(contents, feedUrl)
          } else {
            throw new Error('No content in response')
          }
        } else {
          const feedXml = await response.text()
          if (!feedXml || feedXml.length < MIN_VALID_FEED_LENGTH) {
            throw new Error('Empty response')
          }
          if (feedXml.includes('Internal Server Error') || feedXml.includes('<!DOCTYPE html>') && !feedXml.includes('<rss') && !feedXml.includes('<feed')) {
            throw new Error('Received error page instead of feed')
          }
          items = parseRSSFeed(feedXml, feedUrl)
        }

        if (items.length > 0) {
          return items
        }
        throw new Error('No items parsed from feed')
      } catch {
        continue
      }
    }
    return []
  }, [fetchWithTimeout])

  const fetchFeed = useCallback(async (isManualRefresh = false) => {
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
            const sourceFeed = feeds.find(f => f.url === url) || PRESET_FEEDS.find(p => p.url === url)
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
              sourceIcon,
            }))
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
      const message = err instanceof Error ? err.message : failedToLoadText

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
  }, [activeFeed?.url, activeFeed?.name, activeFeed?.isAggregate, activeFeed?.sourceUrls, failedToLoadText, feeds, fetchSingleFeed, isDemoMode, setError, setFetchSuccess, setIsLoading, setIsRefreshing, setItems, setItemsSourceUrl, setLastRefresh])

  const feedInitRef = useRef(false)
  useEffect(() => {
    if (feedInitRef.current) return
    feedInitRef.current = true
    fetchFeed()
    return () => {
      feedInitRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { fetchFeed }
}

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import type { FeedItem, FeedConfig, FeedFilter, RSSFeedProps } from './types'
import { PRESET_FEEDS } from './constants'
import { loadSavedFeeds, saveFeeds, getCachedFeed, cacheFeed } from './storage'
import { fetchSingleFeed } from './feedFetcher'
import { useTranslation } from 'react-i18next'
import { TOAST_DISMISS_MS } from '../../../lib/constants/network'
import { hostnameEndsWith } from '../../../lib/utils/urlHostname'
import { RSS_DEMO_FEEDS, getDemoRSSItems } from './demoData'

export type SortByOption = 'date' | 'title'

export const SORT_COMPARATORS: Record<SortByOption, (a: FeedItem, b: FeedItem) => number> = {
  date: (a, b) => {
    const aTime = a.pubDate?.getTime() || 0
    const bTime = b.pubDate?.getTime() || 0
    return aTime - bTime
  },
  title: commonComparators.string<FeedItem>('title'),
}

export interface RSSFeedState {
  feeds: FeedConfig[]
  setFeeds: React.Dispatch<React.SetStateAction<FeedConfig[]>>
  activeFeedIndex: number
  setActiveFeedIndex: React.Dispatch<React.SetStateAction<number>>
  items: FeedItem[]
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  showSettings: boolean
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>
  showFeedSelector: boolean
  setShowFeedSelector: React.Dispatch<React.SetStateAction<boolean>>
  newFeedUrl: string
  setNewFeedUrl: React.Dispatch<React.SetStateAction<string>>
  newFeedName: string
  setNewFeedName: React.Dispatch<React.SetStateAction<string>>
  lastRefresh: Date | null
  fetchSuccess: string | null
  showFilterEditor: boolean
  setShowFilterEditor: React.Dispatch<React.SetStateAction<boolean>>
  tempIncludeTerms: string
  setTempIncludeTerms: React.Dispatch<React.SetStateAction<string>>
  tempExcludeTerms: string
  setTempExcludeTerms: React.Dispatch<React.SetStateAction<string>>
  showAggregateCreator: boolean
  setShowAggregateCreator: React.Dispatch<React.SetStateAction<boolean>>
  editingAggregateIndex: number | null
  setEditingAggregateIndex: React.Dispatch<React.SetStateAction<number | null>>
  aggregateName: string
  setAggregateName: React.Dispatch<React.SetStateAction<string>>
  selectedSourceUrls: string[]
  setSelectedSourceUrls: React.Dispatch<React.SetStateAction<string[]>>
  aggregateIncludeTerms: string
  setAggregateIncludeTerms: React.Dispatch<React.SetStateAction<string>>
  aggregateExcludeTerms: string
  setAggregateExcludeTerms: React.Dispatch<React.SetStateAction<string>>
  sourceFilter: string[]
  setSourceFilter: React.Dispatch<React.SetStateAction<string[]>>
  showSourceFilter: boolean
  setShowSourceFilter: React.Dispatch<React.SetStateAction<boolean>>
  itemsSourceUrl: string | null
  fetchFeed: (isManualRefresh?: boolean) => Promise<void>
  normalizeUrl: (url: string) => string
  addFeed: (feed: FeedConfig) => void
  activeFeed: FeedConfig | undefined
  currentCacheKey: string | undefined
  itemsMatchActiveFeed: boolean
  isRedditFeed: boolean
  setError: React.Dispatch<React.SetStateAction<string | null>>
  availableSources: Array<{ url: string; name: string; icon: string }>
  preFilteredItems: FeedItem[]

export function useRSSFeedState(config: RSSFeedProps['config']): RSSFeedState {
  const { t } = useTranslation(['cards', 'common'])
  const { isDemoMode } = useDemoMode()

  const getInitialFeeds = () => {
    if (config?.feedUrl) {
      return [{ url: config.feedUrl, name: config.feedName || 'Feed' }]
    }
    const savedFeeds = loadSavedFeeds()
    return savedFeeds.length > 0 ? savedFeeds : (isDemoMode ? RSS_DEMO_FEEDS : [])
  }

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
      if (cached && cached.items.length > 0) return cached.items
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
  const [showSettings, setShowSettings] = useState(false)
  const [showFeedSelector, setShowFeedSelector] = useState(false)
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [newFeedName, setNewFeedName] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [fetchSuccess, setFetchSuccess] = useState<string | null>(null)
  const [showFilterEditor, setShowFilterEditor] = useState(false)
  const [tempIncludeTerms, setTempIncludeTerms] = useState('')
  const [tempExcludeTerms, setTempExcludeTerms] = useState('')
  const [showAggregateCreator, setShowAggregateCreator] = useState(false)
  const [editingAggregateIndex, setEditingAggregateIndex] = useState<number | null>(null)
  const [aggregateName, setAggregateName] = useState('')
  const [selectedSourceUrls, setSelectedSourceUrls] = useState<string[]>([])
  const [aggregateIncludeTerms, setAggregateIncludeTerms] = useState('')
  const [aggregateExcludeTerms, setAggregateExcludeTerms] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string[]>([])
  const [showSourceFilter, setShowSourceFilter] = useState(false)

  const hasData = items.length > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isDemoMode })

  const activeFeed = feeds[activeFeedIndex] || feeds[0]

  const currentCacheKey = activeFeed?.isAggregate
    ? `aggregate:${(activeFeed.sourceUrls ?? []).join(',')}:${activeFeed.name}`
    : activeFeed?.url

  const itemsMatchActiveFeed = itemsSourceUrl === currentCacheKey

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
            const fetchedItems = await fetchSingleFeed(url)
            const sourceFeed = feeds.find(f => f.url === url) || PRESET_FEEDS.find(p => p.url === url)
            let sourceName: string
            try {
              sourceName = sourceFeed?.name || new URL(url).hostname
            } catch {
              sourceName = sourceFeed?.name || url
            }
            const sourceIcon = sourceFeed?.icon || '📰'
            return fetchedItems.map(item => ({
              ...item,
              sourceUrl: url,
              sourceName,
              sourceIcon,
            }))
          })
        )
        const seen = new Set<string>()
        for (const fetchedItems of results) {
          for (const item of fetchedItems) {
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
    fetchFeed()
    return () => {
      feedInitRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSourceFilter([])
    setShowSourceFilter(false)
  }, [activeFeedIndex])

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

  const normalizeUrl = useCallback((url: string): string => {
    let normalized = url.trim()
    if (normalized.match(/^r\/\w+$/i)) {
      normalized = `https://www.reddit.com/${normalized}.rss`
      return normalized
    }
    if (normalized.match(/^\/r\/\w+$/i)) {
      normalized = `https://www.reddit.com${normalized}.rss`
      return normalized
    }
    const withScheme = normalized.startsWith('http://') || normalized.startsWith('https://')
      ? normalized
      : 'https://' + normalized
    if (hostnameEndsWith(withScheme, 'reddit.com') && !normalized.endsWith('.rss')) {
      normalized = withScheme.replace(/\/?$/, '.rss')
    }
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized
    }
    return normalized
  }, [])

  const addFeed = useCallback((feed: FeedConfig) => {
    if (!feeds.some(f => f.url === feed.url && !f.isAggregate)) {
      setFeeds(prev => [...prev, feed])
      setActiveFeedIndex(feeds.length)
      setIsRefreshing(true)
      setError(null)
    } else {
      const existingIndex = feeds.findIndex(f => f.url === feed.url)
      if (existingIndex !== -1 && existingIndex !== activeFeedIndex) {
        setActiveFeedIndex(existingIndex)
        setIsRefreshing(true)
        setError(null)
      }
    }
    setNewFeedUrl('')
    setNewFeedName('')
    setShowSettings(false)
  }, [feeds, activeFeedIndex])

  const isRedditFeed = activeFeed?.url ? hostnameEndsWith(activeFeed.url, 'reddit.com') : false

  const availableSources = useMemo(() => {
    if (!activeFeed?.isAggregate) return []
    const sources = new Map<string, { url: string; name: string; icon: string }>()
    for (const item of items) {
      if (item.sourceUrl && !sources.has(item.sourceUrl)) {
        sources.set(item.sourceUrl, {
          url: item.sourceUrl,
          name: item.sourceName || 'Unknown',
          icon: item.sourceIcon || '📰',
        })
      }
    }
    return Array.from(sources.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [items, activeFeed?.isAggregate])

  const preFilteredItems = useMemo(() => {
    let result = [...items]
    if (sourceFilter.length > 0 && activeFeed?.isAggregate) {
      result = result.filter(item => item.sourceUrl && sourceFilter.includes(item.sourceUrl))
    }
    const filter = activeFeed?.filter
    if (filter) {
      if (filter.includeTerms.length > 0) {
        result = result.filter(item => {
          const text = `${item.title} ${item.description || ''} ${item.author || ''}`.toLowerCase()
          return filter.includeTerms.some(term => text.includes(term.toLowerCase()))
        })
      }
      if (filter.excludeTerms.length > 0) {
        result = result.filter(item => {
          const text = `${item.title} ${item.description || ''} ${item.author || ''}`.toLowerCase()
          return !filter.excludeTerms.some(term => text.includes(term.toLowerCase()))
        })
      }
    }
    return result
  }, [items, activeFeed?.filter, activeFeed?.isAggregate, sourceFilter])

  return {
    feeds, setFeeds,
    activeFeedIndex, setActiveFeedIndex,
    items,
    isLoading, isRefreshing,
    error,
    showSettings, setShowSettings,
    showFeedSelector, setShowFeedSelector,
    newFeedUrl, setNewFeedUrl,
    newFeedName, setNewFeedName,
    lastRefresh,
    fetchSuccess,
    showFilterEditor, setShowFilterEditor,
    tempIncludeTerms, setTempIncludeTerms,
    tempExcludeTerms, setTempExcludeTerms,
    showAggregateCreator, setShowAggregateCreator,
    editingAggregateIndex, setEditingAggregateIndex,
    aggregateName, setAggregateName,
    selectedSourceUrls, setSelectedSourceUrls,
    aggregateIncludeTerms, setAggregateIncludeTerms,
    aggregateExcludeTerms, setAggregateExcludeTerms,
    sourceFilter, setSourceFilter,
    showSourceFilter, setShowSourceFilter,
    itemsSourceUrl,
    fetchFeed,
    normalizeUrl,
    addFeed,
    activeFeed,
    currentCacheKey,
    itemsMatchActiveFeed,
    isRedditFeed,
    setError,
    availableSources,
    preFilteredItems,
  }
}

/** Build the filter object for a feed from raw include/exclude term strings. */
export function buildFeedFilter(
  includeStr: string,
  excludeStr: string
): FeedFilter | undefined {
  const includeTerms = includeStr.split(',').map(t => t.trim()).filter(t => t)
  const excludeTerms = excludeStr.split(',').map(t => t.trim()).filter(t => t)
  if (includeTerms.length === 0 && excludeTerms.length === 0) return undefined
  return { includeTerms, excludeTerms }
}

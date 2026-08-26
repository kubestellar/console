import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commonComparators, useCardData } from '../../../lib/cards/cardHooks'
import { TOAST_DISMISS_MS } from '../../../lib/constants/network'
import { hostnameEndsWith } from '../../../lib/utils/urlHostname'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { fetchSingleFeed } from './feedFetcher'
import { PRESET_FEEDS } from './constants'
import { RSS_DEMO_FEEDS, getDemoRSSItems } from './demoData'
import { cacheFeed, getCachedFeed, loadSavedFeeds, saveFeeds } from './storage'
import { RSS_UI_STRINGS } from './strings'
import type { FeedConfig, FeedFilter, FeedItem, RSSFeedProps } from './types'

type SortByOption = 'date' | 'title'

const SORT_COMPARATORS: Record<SortByOption, (a: FeedItem, b: FeedItem) => number> = {
  date: (a, b) => {
    const aTime = a.pubDate?.getTime() || 0
    const bTime = b.pubDate?.getTime() || 0
    return aTime - bTime
  },
  title: commonComparators.string<FeedItem>('title'),
}

function buildCacheKey(feed?: FeedConfig): string | null {
  if (!feed) return null
  return feed.isAggregate
    ? `aggregate:${(feed.sourceUrls ?? []).join(',')}:${feed.name}`
    : feed.url
}

function getInitialFeeds(config: RSSFeedProps['config'], isDemoMode: boolean): FeedConfig[] {
  if (config?.feedUrl) {
    return [{ url: config.feedUrl, name: config.feedName || RSS_UI_STRINGS.defaultFeedName }]
  }
  const savedFeeds = loadSavedFeeds()
  return savedFeeds.length > 0 ? savedFeeds : (isDemoMode ? RSS_DEMO_FEEDS : [])
}

function getCachedInitialItems(feeds: FeedConfig[]): { items: FeedItem[]; sourceUrl: string | null; isLoading: boolean } {
  const firstFeed = feeds[0]
  const cacheKey = buildCacheKey(firstFeed)
  if (!cacheKey) return { items: [], sourceUrl: null, isLoading: true }
  const cached = getCachedFeed(cacheKey, true)
  if (cached && cached.items.length > 0) {
    return { items: cached.items, sourceUrl: cacheKey, isLoading: false }
  }
  return { items: [], sourceUrl: cacheKey, isLoading: true }
}

export function useRSSFeedState({ config, t }: RSSFeedProps & { t: (key: string) => string }) {
  const { isDemoMode } = useDemoMode()
  const initialFeeds = useMemo(() => getInitialFeeds(config, isDemoMode), [config, isDemoMode])
  const initialCache = useMemo(() => getCachedInitialItems(initialFeeds), [initialFeeds])

  const [feeds, setFeeds] = useState<FeedConfig[]>(initialFeeds)
  const [activeFeedIndex, setActiveFeedIndex] = useState(0)
  const [items, setItems] = useState<FeedItem[]>(initialCache.items)
  const [itemsSourceUrl, setItemsSourceUrl] = useState<string | null>(initialCache.sourceUrl)
  const [isLoading, setIsLoading] = useState(initialCache.isLoading)
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

  const activeFeed = feeds[activeFeedIndex] || feeds[0]
  const currentCacheKey = buildCacheKey(activeFeed)
  const itemsMatchActiveFeed = itemsSourceUrl === currentCacheKey
  const hasData = items.length > 0

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
  }, [activeFeed?.isAggregate, items])

  const preFilteredItems = useMemo(() => {
    let result = [...items]
    if (sourceFilter.length > 0 && activeFeed?.isAggregate) {
      result = result.filter(item => item.sourceUrl && sourceFilter.includes(item.sourceUrl))
    }
    const filter = activeFeed?.filter
    if (filter?.includeTerms.length) {
      result = result.filter(item => {
        const text = `${item.title} ${item.description || ''} ${item.author || ''}`.toLowerCase()
        return filter.includeTerms.some(term => text.includes(term.toLowerCase()))
      })
    }
    if (filter?.excludeTerms.length) {
      result = result.filter(item => {
        const text = `${item.title} ${item.description || ''} ${item.author || ''}`.toLowerCase()
        return !filter.excludeTerms.some(term => text.includes(term.toLowerCase()))
      })
    }
    return result
  }, [activeFeed?.filter, activeFeed?.isAggregate, items, sourceFilter])

  const cardData = useCardData<FeedItem, SortByOption>(preFilteredItems, {
    filter: {
      searchFields: ['title', 'description', 'author'] as (keyof FeedItem)[],
      customPredicate: (item, query) => {
        if (item.subreddit && item.subreddit.toLowerCase().includes(query)) return true
        if (item.sourceName && item.sourceName.toLowerCase().includes(query)) return true
        return false
      },
      storageKey: 'rss-feed',
    },
    sort: {
      defaultField: 'date',
      defaultDirection: 'desc',
      comparators: SORT_COMPARATORS,
    },
    defaultLimit: 10,
  })

  const fetchFeed = useCallback(async (isManualRefresh = false) => {
    if (isDemoMode) {
      const demoItems = getDemoRSSItems()
      setItems(demoItems)
      setItemsSourceUrl('demo')
      setIsLoading(false)
      setIsRefreshing(false)
      setLastRefresh(new Date())
      setError(null)
      if (currentCacheKey) cacheFeed(currentCacheKey, demoItems)
      return
    }

    if (!activeFeed?.url && !activeFeed?.isAggregate) return
    if (!currentCacheKey) return

    const cached = getCachedFeed(currentCacheKey, true)
    if (cached && cached.items.length > 0) {
      setItems(cached.items)
      setItemsSourceUrl(currentCacheKey)
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
        const results = await Promise.all(
          activeFeed.sourceUrls.map(async (url) => {
            const sourceItems = await fetchSingleFeed(url)
            const sourceFeed = feeds.find(f => f.url === url) || PRESET_FEEDS.find(p => p.url === url)
            let sourceName: string
            try {
              sourceName = sourceFeed?.name || new URL(url).hostname
            } catch {
              sourceName = sourceFeed?.name || url
            }
            const sourceIcon = sourceFeed?.icon || '📰'
            return sourceItems.map(item => ({ ...item, sourceUrl: url, sourceName, sourceIcon }))
          }),
        )
        const seen = new Set<string>()
        for (const resultItems of results) {
          for (const item of resultItems) {
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
      setItemsSourceUrl(currentCacheKey)
      setError(null)
      setLastRefresh(new Date())
      const sourceCount = activeFeed.isAggregate ? ` from ${activeFeed.sourceUrls?.length || 0} sources` : ''
      setFetchSuccess(`Fetched ${feedItems.length} items${sourceCount}`)
      cacheFeed(currentCacheKey, feedItems)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('rssFeed.failedToLoadFeed')
      const cachedFallback = getCachedFeed(currentCacheKey)
      if (cachedFallback && cachedFallback.items.length > 0) {
        setItems(cachedFallback.items)
        setItemsSourceUrl(currentCacheKey)
        setLastRefresh(new Date(cachedFallback.timestamp))
        setError(null)
      } else {
        setItems([])
        setItemsSourceUrl(currentCacheKey)
        setError(message)
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [activeFeed, currentCacheKey, feeds, isDemoMode, t])

  const feedInitRef = useRef(false)
  useEffect(() => {
    if (feedInitRef.current) return
    feedInitRef.current = true
    void fetchFeed()
    return () => {
      feedInitRef.current = false
    }
  }, [fetchFeed])

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
    if (!fetchSuccess) return
    const timer = setTimeout(() => setFetchSuccess(null), TOAST_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [fetchSuccess])

  useEffect(() => {
    if (config?.feedUrl) return
    if (feeds.length > 0 && feeds.every(feed => feed.url.startsWith('demo:'))) return
    saveFeeds(feeds)
  }, [config?.feedUrl, feeds])

  useEffect(() => {
    const hasOpenOverlay = showSettings || showFeedSelector || showFilterEditor || showSourceFilter || showAggregateCreator
    if (!hasOpenOverlay) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (showAggregateCreator) setShowAggregateCreator(false)
      else if (showFilterEditor) setShowFilterEditor(false)
      else if (showSourceFilter) setShowSourceFilter(false)
      else if (showFeedSelector) setShowFeedSelector(false)
      else if (showSettings) setShowSettings(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showAggregateCreator, showFeedSelector, showFilterEditor, showSettings, showSourceFilter])

  const normalizeUrl = useCallback((url: string): string => {
    let normalized = url.trim()
    if (normalized.match(/^r\/\w+$/i)) return `https://www.reddit.com/${normalized}.rss`
    if (normalized.match(/^\/r\/\w+$/i)) return `https://www.reddit.com${normalized}.rss`
    const withScheme = normalized.startsWith('http://') || normalized.startsWith('https://') ? normalized : `https://${normalized}`
    if (hostnameEndsWith(withScheme, 'reddit.com') && !normalized.endsWith('.rss')) {
      normalized = withScheme.replace(/\/?$/, '.rss')
    }
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`
    }
    return normalized
  }, [])

  const selectFeed = useCallback((idx: number, closeSelector: boolean) => {
    if (idx !== activeFeedIndex) {
      setActiveFeedIndex(idx)
      setIsRefreshing(true)
      setError(null)
    }
    if (closeSelector) setShowFeedSelector(false)
  }, [activeFeedIndex])

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
  }, [activeFeedIndex, feeds])

  const handleAddCustomFeed = useCallback(() => {
    if (!newFeedUrl.trim()) return
    const rawUrl = newFeedUrl.trim()
    const url = normalizeUrl(rawUrl)
    let defaultName: string
    const subredditMatch = rawUrl.match(/^r\/(\w+)$/i) || url.match(/reddit\.com\/r\/(\w+)/)
    if (subredditMatch) {
      defaultName = `r/${subredditMatch[1]}`
    } else {
      try {
        defaultName = new URL(url).hostname
      } catch {
        defaultName = rawUrl
      }
    }
    addFeed({
      url,
      name: newFeedName || defaultName,
      icon: hostnameEndsWith(url, 'reddit.com') ? '🔴' : '📰',
    })
  }, [addFeed, newFeedName, newFeedUrl, normalizeUrl])

  const handleSaveFilter = useCallback(() => {
    const includeTerms = tempIncludeTerms.split(',').map(term => term.trim()).filter(Boolean)
    const excludeTerms = tempExcludeTerms.split(',').map(term => term.trim()).filter(Boolean)
    const newFilter: FeedFilter | undefined = includeTerms.length === 0 && excludeTerms.length === 0
      ? undefined
      : { includeTerms, excludeTerms }
    setFeeds(prev => prev.map((feed, index) => (index === activeFeedIndex ? { ...feed, filter: newFilter } : feed)))
    setShowFilterEditor(false)
  }, [activeFeedIndex, tempExcludeTerms, tempIncludeTerms])

  const handleClearFilter = useCallback(() => {
    setFeeds(prev => prev.map((feed, index) => (index === activeFeedIndex ? { ...feed, filter: undefined } : feed)))
    setShowFilterEditor(false)
  }, [activeFeedIndex])

  const handleEditAggregate = useCallback((index: number) => {
    const feed = feeds[index]
    if (!feed?.isAggregate) return
    setEditingAggregateIndex(index)
    setAggregateName(feed.name)
    setSelectedSourceUrls(feed.sourceUrls || [])
    setAggregateIncludeTerms((feed.filter?.includeTerms ?? []).join(', '))
    setAggregateExcludeTerms((feed.filter?.excludeTerms ?? []).join(', '))
    setShowAggregateCreator(true)
  }, [feeds])

  const resetAggregateEditor = useCallback(() => {
    setShowAggregateCreator(false)
    setEditingAggregateIndex(null)
    setAggregateName('')
    setSelectedSourceUrls([])
    setAggregateIncludeTerms('')
    setAggregateExcludeTerms('')
  }, [])

  const handleSaveAggregate = useCallback(() => {
    if (!aggregateName.trim() || selectedSourceUrls.length === 0) return
    const includeTerms = aggregateIncludeTerms.split(',').map(term => term.trim()).filter(Boolean)
    const excludeTerms = aggregateExcludeTerms.split(',').map(term => term.trim()).filter(Boolean)
    const aggregate: FeedConfig = {
      url: editingAggregateIndex !== null ? feeds[editingAggregateIndex].url : `aggregate:${Date.now()}`,
      name: aggregateName.trim(),
      icon: '📚',
      isAggregate: true,
      sourceUrls: selectedSourceUrls,
      filter: includeTerms.length > 0 || excludeTerms.length > 0 ? { includeTerms, excludeTerms } : undefined,
    }
    if (editingAggregateIndex !== null) {
      setFeeds(prev => prev.map((feed, index) => (index === editingAggregateIndex ? aggregate : feed)))
      setActiveFeedIndex(editingAggregateIndex)
    } else {
      setFeeds(prev => [...prev, aggregate])
      setActiveFeedIndex(feeds.length)
    }
    setIsRefreshing(true)
    setError(null)
    resetAggregateEditor()
    setShowSettings(false)
  }, [aggregateExcludeTerms, aggregateIncludeTerms, aggregateName, editingAggregateIndex, feeds, resetAggregateEditor, selectedSourceUrls])

  const handleClearFilters = useCallback(() => {
    cardData.filters.setSearch('')
    if (activeFeed?.filter) {
      setFeeds(prev => prev.map((feed, index) => (index === activeFeedIndex ? { ...feed, filter: undefined } : feed)))
    }
  }, [activeFeed?.filter, activeFeedIndex, cardData.filters])

  return {
    isDemoMode,
    feeds,
    setFeeds,
    activeFeed,
    activeFeedIndex,
    items,
    isLoading,
    isRefreshing,
    error,
    lastRefresh,
    fetchSuccess,
    availableSources,
    sourceFilter,
    showSourceFilter,
    showSettings,
    showFeedSelector,
    showFilterEditor,
    tempIncludeTerms,
    tempExcludeTerms,
    showAggregateCreator,
    editingAggregateIndex,
    aggregateName,
    selectedSourceUrls,
    aggregateIncludeTerms,
    aggregateExcludeTerms,
    newFeedUrl,
    newFeedName,
    hasData,
    itemsMatchActiveFeed,
    isRedditFeed: activeFeed?.url ? hostnameEndsWith(activeFeed.url, 'reddit.com') : false,
    showFullSkeleton: isLoading && items.length === 0 && !feeds.length,
    showListSkeleton: (isLoading && items.length === 0) || (isRefreshing && !itemsMatchActiveFeed),
    cardData,
    setShowSettings,
    setShowFeedSelector,
    setShowFilterEditor,
    setShowSourceFilter,
    setTempIncludeTerms,
    setTempExcludeTerms,
    setShowAggregateCreator,
    setAggregateName,
    setSelectedSourceUrls,
    setAggregateIncludeTerms,
    setAggregateExcludeTerms,
    setNewFeedUrl,
    setNewFeedName,
    fetchFeed,
    addFeed,
    handleAddCustomFeed,
    handleSelectFeed: (idx: number) => selectFeed(idx, true),
    handlePillSelect: (idx: number) => selectFeed(idx, false),
    handleOpenSettings: () => {
      setShowFeedSelector(false)
      setShowSettings(true)
    },
    handleToggleFeedSelector: () => setShowFeedSelector(prev => !prev),
    handleRefresh: () => void fetchFeed(true),
    handleToggleSettings: () => setShowSettings(prev => !prev),
    handleOpenFilterEditor: () => {
      const filter = activeFeed?.filter
      setTempIncludeTerms((filter?.includeTerms ?? []).join(', '))
      setTempExcludeTerms((filter?.excludeTerms ?? []).join(', '))
      setShowFilterEditor(true)
    },
    handleSaveFilter,
    handleClearFilter,
    handleCloseFilterEditor: () => setShowFilterEditor(false),
    handleToggleSourceFilter: () => setShowSourceFilter(prev => !prev),
    handleCloseSourceFilter: () => setShowSourceFilter(false),
    handleSelectFeedFromSettings: (idx: number) => {
      setActiveFeedIndex(idx)
      setShowSettings(false)
    },
    handleRemoveFeed: (index: number) => {
      if (feeds.length <= 1) return
      setFeeds(prev => prev.filter((_, itemIndex) => itemIndex !== index))
      if (activeFeedIndex >= index && activeFeedIndex > 0) {
        setActiveFeedIndex(prev => prev - 1)
      }
    },
    handleEditAggregate,
    handleToggleAggregateCreator: () => {
      if (showAggregateCreator) {
        resetAggregateEditor()
      } else {
        setShowAggregateCreator(true)
      }
    },
    handleSaveAggregate,
    handleCancelAggregateEdit: resetAggregateEditor,
    handleClearFilters,
  }
}

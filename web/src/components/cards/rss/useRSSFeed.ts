import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'
import { hostnameEndsWith } from '../../../lib/utils/urlHostname'
import { PRESET_FEEDS } from './constants'
import { loadSavedFeeds, saveFeeds, getCachedFeed, cacheFeed } from './storage'
import { fetchSingleFeed } from './feedFetcher'
import { RSS_DEMO_FEEDS, getDemoRSSItems } from './demoData'
import { RSS_UI_STRINGS } from './strings'
import { TOAST_DISMISS_MS } from '../../../lib/constants/network'
import type { FeedItem, FeedConfig, FeedFilter, RSSFeedProps } from './types'

export interface UseRSSFeedReturn {
  // Feed state
  feeds: FeedConfig[]
  activeFeedIndex: number
  activeFeed: FeedConfig | undefined
  items: FeedItem[]
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  lastRefresh: Date | null
  fetchSuccess: string | null
  itemsMatchActiveFeed: boolean
  availableSources: Array<{ url: string; name: string; icon: string }>

  // UI visibility state
  showSettings: boolean
  showFeedSelector: boolean
  showFilterEditor: boolean
  showSourceFilter: boolean
  showAggregateCreator: boolean

  // Feed selector / settings form state
  newFeedUrl: string
  newFeedName: string

  // Filter editor state
  tempIncludeTerms: string
  tempExcludeTerms: string

  // Aggregate editor state
  editingAggregateIndex: number | null
  aggregateName: string
  selectedSourceUrls: string[]
  aggregateIncludeTerms: string
  aggregateExcludeTerms: string

  // Source filter state
  sourceFilter: string[]

  // Callbacks
  handleSelectFeed: (idx: number) => void
  handleOpenSettings: () => void
  handleToggleFeedSelector: () => void
  handleRefresh: () => void
  handleToggleSettings: () => void
  handlePillSelect: (idx: number) => void
  handleOpenFilterEditor: () => void
  handleSaveFilter: () => void
  handleClearFilter: () => void
  handleCloseFilterEditor: () => void
  handleToggleSourceFilter: () => void
  handleCloseSourceFilter: () => void
  handleAddCustomFeed: () => void
  handleSelectFeedFromSettings: (idx: number) => void
  handleRemoveFeed: (index: number) => void
  handleEditAggregate: (index: number) => void
  handleToggleAggregateCreator: () => void
  handleSaveAggregate: () => void
  handleCancelAggregateEdit: () => void
  addFeed: (feed: FeedConfig) => void

  // Setters exposed for controlled inputs
  setNewFeedUrl: (v: string) => void
  setNewFeedName: (v: string) => void
  setTempIncludeTerms: (v: string) => void
  setTempExcludeTerms: (v: string) => void
  setAggregateName: (v: string) => void
  setSelectedSourceUrls: (v: string[]) => void
  setAggregateIncludeTerms: (v: string) => void
  setAggregateExcludeTerms: (v: string) => void
  setSourceFilter: (v: string[]) => void
}

export function useRSSFeed({ config }: RSSFeedProps): UseRSSFeedReturn {
  const { t } = useTranslation(['cards', 'common'])
  const { isDemoMode } = useDemoMode()

  const getInitialFeeds = useCallback((): FeedConfig[] => {
    if (config?.feedUrl) {
      return [{ url: config.feedUrl, name: config.feedName || RSS_UI_STRINGS.defaultFeedName }]
    }
    const savedFeeds = loadSavedFeeds()
    return savedFeeds.length > 0 ? savedFeeds : (isDemoMode ? RSS_DEMO_FEEDS : [])
  }, [config?.feedUrl, config?.feedName, isDemoMode])

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
    if (!firstFeed) return null
    return firstFeed.isAggregate
      ? `aggregate:${(firstFeed.sourceUrls ?? []).join(',')}:${firstFeed.name}`
      : firstFeed.url
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

  const activeFeed = feeds[activeFeedIndex] || feeds[0]

  const currentCacheKey = activeFeed?.isAggregate
    ? `aggregate:${(activeFeed.sourceUrls ?? []).join(',')}:${activeFeed.name}`
    : activeFeed?.url

  const itemsMatchActiveFeed = itemsSourceUrl === currentCacheKey

  const hasData = items.length > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isDemoMode })

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

  // Close overlay panels on Escape key
  useEffect(() => {
    const hasOpenOverlay = showSettings || showFeedSelector || showFilterEditor || showSourceFilter || showAggregateCreator
    if (!hasOpenOverlay) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showAggregateCreator) setShowAggregateCreator(false)
        else if (showFilterEditor) setShowFilterEditor(false)
        else if (showSourceFilter) setShowSourceFilter(false)
        else if (showFeedSelector) setShowFeedSelector(false)
        else if (showSettings) setShowSettings(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, showFeedSelector, showFilterEditor, showSourceFilter, showAggregateCreator])

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
            const feedItemsForUrl = await fetchSingleFeed(url)
            const sourceFeed = feeds.find(f => f.url === url) || PRESET_FEEDS.find(p => p.url === url)
            let sourceName: string
            try {
              sourceName = sourceFeed?.name || new URL(url).hostname
            } catch {
              sourceName = sourceFeed?.name || url
            }
            const sourceIcon = sourceFeed?.icon || '📰'
            return feedItemsForUrl.map(item => ({
              ...item,
              sourceUrl: url,
              sourceName,
              sourceIcon,
            }))
          })
        )
        const seen = new Set<string>()
        for (const groupItems of results) {
          for (const item of groupItems) {
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
  }, [activeFeed?.url, activeFeed?.name, activeFeed?.isAggregate, activeFeed?.sourceUrls, isDemoMode, feeds, t])

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

  // Reset source filter when feed changes
  useEffect(() => {
    setSourceFilter([])
    setShowSourceFilter(false)
  }, [activeFeedIndex])

  // Keep demo mode usable even before any feeds have been configured
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

  // Clear success message after timeout
  useEffect(() => {
    if (fetchSuccess) {
      const timer = setTimeout(() => setFetchSuccess(null), TOAST_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [fetchSuccess])

  // Save feeds when changed
  useEffect(() => {
    if (config?.feedUrl) return
    if (feeds.length > 0 && feeds.every(feed => feed.url.startsWith('demo:'))) return
    saveFeeds(feeds)
  }, [feeds, config?.feedUrl])

  // --- Callbacks ---

  const handleSelectFeed = useCallback((idx: number) => {
    if (idx !== activeFeedIndex) {
      setActiveFeedIndex(idx)
      setIsRefreshing(true)
      setError(null)
    }
    setShowFeedSelector(false)
  }, [activeFeedIndex])

  const handleOpenSettings = useCallback(() => {
    setShowFeedSelector(false)
    setShowSettings(true)
  }, [])

  const handleToggleFeedSelector = useCallback(() => {
    setShowFeedSelector(prev => !prev)
  }, [])

  const handleRefresh = useCallback(() => {
    fetchFeed(true)
  }, [fetchFeed])

  const handleToggleSettings = useCallback(() => {
    setShowSettings(prev => !prev)
  }, [])

  const handlePillSelect = useCallback((idx: number) => {
    if (idx !== activeFeedIndex) {
      setActiveFeedIndex(idx)
      setIsRefreshing(true)
      setError(null)
    }
  }, [activeFeedIndex])

  const handleOpenFilterEditor = useCallback(() => {
    const filter = activeFeed?.filter
    setTempIncludeTerms((filter?.includeTerms ?? []).join(', '))
    setTempExcludeTerms((filter?.excludeTerms ?? []).join(', '))
    setShowFilterEditor(true)
  }, [activeFeed?.filter])

  const handleSaveFilter = useCallback(() => {
    const includeTerms = tempIncludeTerms.split(',').map(term => term.trim()).filter(term => term)
    const excludeTerms = tempExcludeTerms.split(',').map(term => term.trim()).filter(term => term)

    const newFilter: FeedFilter | undefined = (includeTerms.length === 0 && excludeTerms.length === 0)
      ? undefined
      : { includeTerms, excludeTerms }

    setFeeds(prev => prev.map((feed, i) =>
      i === activeFeedIndex ? { ...feed, filter: newFilter } : feed
    ))
    setShowFilterEditor(false)
  }, [tempIncludeTerms, tempExcludeTerms, activeFeedIndex])

  const handleClearFilter = useCallback(() => {
    setFeeds(prev => prev.map((feed, i) =>
      i === activeFeedIndex ? { ...feed, filter: undefined } : feed
    ))
    setShowFilterEditor(false)
  }, [activeFeedIndex])

  const handleCloseFilterEditor = useCallback(() => {
    setShowFilterEditor(false)
  }, [])

  const handleToggleSourceFilter = useCallback(() => {
    setShowSourceFilter(prev => !prev)
  }, [])

  const handleCloseSourceFilter = useCallback(() => {
    setShowSourceFilter(false)
  }, [])

  const normalizeUrl = useCallback((url: string): string => {
    let normalized = url.trim()

    if (normalized.match(/^r\/\w+$/i)) {
      return `https://www.reddit.com/${normalized}.rss`
    }
    if (normalized.match(/^\/r\/\w+$/i)) {
      return `https://www.reddit.com${normalized}.rss`
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

  const handleAddCustomFeed = useCallback(() => {
    if (newFeedUrl.trim()) {
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
    }
  }, [newFeedUrl, newFeedName, normalizeUrl, addFeed])

  const handleSelectFeedFromSettings = useCallback((idx: number) => {
    setActiveFeedIndex(idx)
    setShowSettings(false)
  }, [])

  const handleRemoveFeed = useCallback((index: number) => {
    if (feeds.length > 1) {
      setFeeds(prev => prev.filter((_, i) => i !== index))
      if (activeFeedIndex >= index && activeFeedIndex > 0) {
        setActiveFeedIndex(prev => prev - 1)
      }
    }
  }, [feeds.length, activeFeedIndex])

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

  const handleToggleAggregateCreator = useCallback(() => {
    if (showAggregateCreator) {
      setShowAggregateCreator(false)
      setEditingAggregateIndex(null)
      setAggregateName('')
      setSelectedSourceUrls([])
      setAggregateIncludeTerms('')
      setAggregateExcludeTerms('')
    } else {
      setShowAggregateCreator(true)
    }
  }, [showAggregateCreator])

  const handleSaveAggregate = useCallback(() => {
    if (!aggregateName.trim() || selectedSourceUrls.length === 0) return

    const includeTerms = aggregateIncludeTerms.split(',').map(term => term.trim()).filter(term => term)
    const excludeTerms = aggregateExcludeTerms.split(',').map(term => term.trim()).filter(term => term)

    const aggregate: FeedConfig = {
      url: editingAggregateIndex !== null
        ? feeds[editingAggregateIndex].url
        : `aggregate:${Date.now()}`,
      name: aggregateName.trim(),
      icon: '📚',
      isAggregate: true,
      sourceUrls: selectedSourceUrls,
      filter: includeTerms.length > 0 || excludeTerms.length > 0
        ? { includeTerms, excludeTerms }
        : undefined,
    }

    if (editingAggregateIndex !== null) {
      setFeeds(prev => prev.map((f, i) => i === editingAggregateIndex ? aggregate : f))
      setActiveFeedIndex(editingAggregateIndex)
    } else {
      setFeeds(prev => [...prev, aggregate])
      setActiveFeedIndex(feeds.length)
    }

    setIsRefreshing(true)
    setError(null)
    setShowAggregateCreator(false)
    setEditingAggregateIndex(null)
    setAggregateName('')
    setSelectedSourceUrls([])
    setAggregateIncludeTerms('')
    setAggregateExcludeTerms('')
    setShowSettings(false)
  }, [aggregateName, selectedSourceUrls, aggregateIncludeTerms, aggregateExcludeTerms, editingAggregateIndex, feeds])

  const handleCancelAggregateEdit = useCallback(() => {
    setShowAggregateCreator(false)
    setEditingAggregateIndex(null)
    setAggregateName('')
    setSelectedSourceUrls([])
    setAggregateIncludeTerms('')
    setAggregateExcludeTerms('')
  }, [])

  return {
    feeds,
    activeFeedIndex,
    activeFeed,
    items,
    isLoading,
    isRefreshing,
    error,
    lastRefresh,
    fetchSuccess,
    itemsMatchActiveFeed,
    availableSources,
    showSettings,
    showFeedSelector,
    showFilterEditor,
    showSourceFilter,
    showAggregateCreator,
    newFeedUrl,
    newFeedName,
    tempIncludeTerms,
    tempExcludeTerms,
    editingAggregateIndex,
    aggregateName,
    selectedSourceUrls,
    aggregateIncludeTerms,
    aggregateExcludeTerms,
    sourceFilter,
    handleSelectFeed,
    handleOpenSettings,
    handleToggleFeedSelector,
    handleRefresh,
    handleToggleSettings,
    handlePillSelect,
    handleOpenFilterEditor,
    handleSaveFilter,
    handleClearFilter,
    handleCloseFilterEditor,
    handleToggleSourceFilter,
    handleCloseSourceFilter,
    handleAddCustomFeed,
    handleSelectFeedFromSettings,
    handleRemoveFeed,
    handleEditAggregate,
    handleToggleAggregateCreator,
    handleSaveAggregate,
    handleCancelAggregateEdit,
    addFeed,
    setNewFeedUrl,
    setNewFeedName,
    setTempIncludeTerms,
    setTempExcludeTerms,
    setAggregateName,
    setSelectedSourceUrls,
    setAggregateIncludeTerms,
    setAggregateExcludeTerms,
    setSourceFilter,
  }
}

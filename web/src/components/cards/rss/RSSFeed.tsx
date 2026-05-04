// Modal safety: the filter/settings panels here are inline flyouts, not portal
// modals — no backdrop to click. Any form state lives in local React state and
// is only written on explicit save. Treat as closeOnBackdropClick={false}.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { RefreshCw, Settings, Filter } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import type { FeedItem, FeedConfig, FeedFilter, RSSFeedProps, RSSItemRaw } from './types'
import { PRESET_FEEDS, CORS_PROXIES } from './constants'
import { loadSavedFeeds, saveFeeds, getCachedFeed, cacheFeed } from './storage'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import {
  parseRSSFeed, stripHTML, decodeHTMLEntities,
  isValidThumbnail } from './RSSParser'
import { formatTimeAgo } from '../../../lib/formatters'
import { useTranslation } from 'react-i18next'
import { TOAST_DISMISS_MS } from '../../../lib/constants/network'
import { hostnameEndsWith } from '../../../lib/utils/urlHostname'
import { FeedSelector, FeedPills } from './FeedSelector'
import { FeedFilterEditor } from './FeedFilterEditor'
import { FeedSettingsPanel } from './FeedSettingsPanel'
import { FeedItemsList } from './FeedItemsList'
import { SourceFilterDropdown } from './SourceFilterDropdown'
import { RSS_DEMO_FEEDS, getDemoRSSItems } from './demoData'
import { RSS_UI_STRINGS } from './strings'

const MIN_VALID_FEED_LENGTH = 50

type SortByOption = 'date' | 'title'

const SORT_COMPARATORS: Record<SortByOption, (a: FeedItem, b: FeedItem) => number> = {
  date: (a, b) => {
    const aTime = a.pubDate?.getTime() || 0
    const bTime = b.pubDate?.getTime() || 0
    return aTime - bTime
  },
  title: commonComparators.string<FeedItem>('title') }

function RSSFeedInternal({ config }: RSSFeedProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { isDemoMode } = useDemoMode()
  const getInitialFeeds = () => {
    if (config?.feedUrl) {
      return [{ url: config.feedUrl, name: config.feedName || RSS_UI_STRINGS.defaultFeedName }]
    }
    const savedFeeds = loadSavedFeeds()
    return savedFeeds.length > 0 ? savedFeeds : (isDemoMode ? RSS_DEMO_FEEDS : [])
  }
  const [feeds, setFeeds] = useState<FeedConfig[]>(() => getInitialFeeds())
  const [activeFeedIndex, setActiveFeedIndex] = useState(0)

  // Initialize with cached items immediately on mount
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
  const [showSettings, setShowSettings] = useState(false)
  const [showFeedSelector, setShowFeedSelector] = useState(false)
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [newFeedName, setNewFeedName] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [fetchSuccess, setFetchSuccess] = useState<string | null>(null)
  const [showFilterEditor, setShowFilterEditor] = useState(false)
  const [tempIncludeTerms, setTempIncludeTerms] = useState('')
  const [tempExcludeTerms, setTempExcludeTerms] = useState('')
  // Aggregate feed creator/editor
  const [showAggregateCreator, setShowAggregateCreator] = useState(false)
  const [editingAggregateIndex, setEditingAggregateIndex] = useState<number | null>(null)
  const [aggregateName, setAggregateName] = useState('')
  const [selectedSourceUrls, setSelectedSourceUrls] = useState<string[]>([])
  const [aggregateIncludeTerms, setAggregateIncludeTerms] = useState('')
  const [aggregateExcludeTerms, setAggregateExcludeTerms] = useState('')
  // Source feed filter for aggregate feeds
  const [sourceFilter, setSourceFilter] = useState<string[]>([])
  const [showSourceFilter, setShowSourceFilter] = useState(false)

  const hasData = items.length > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isDemoMode })

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

  const activeFeed = feeds[activeFeedIndex] || feeds[0]

  // Get cache key for current feed
  const currentCacheKey = activeFeed?.isAggregate
    ? `aggregate:${(activeFeed.sourceUrls ?? []).join(',')}:${activeFeed.name}`
    : activeFeed?.url

  // Check if displayed items match the active feed
  const itemsMatchActiveFeed = itemsSourceUrl === currentCacheKey

  // Get unique sources from items (for aggregate feed source filter)
  const availableSources = useMemo(() => {
    if (!activeFeed?.isAggregate) return []
    const sources = new Map<string, { url: string, name: string, icon: string }>()
    for (const item of items) {
      if (item.sourceUrl && !sources.has(item.sourceUrl)) {
        sources.set(item.sourceUrl, {
          url: item.sourceUrl,
          name: item.sourceName || 'Unknown',
          icon: item.sourceIcon || '📰' })
      }
    }
    return Array.from(sources.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [items, activeFeed?.isAggregate])

  // Pre-filter: apply RSS-specific source filter and include/exclude filters
  const preFilteredItems = useMemo(() => {
    let result = [...items]

    // Apply source filter (for aggregate feeds)
    if (sourceFilter.length > 0 && activeFeed?.isAggregate) {
      result = result.filter(item => item.sourceUrl && sourceFilter.includes(item.sourceUrl))
    }

    // Apply feed-specific include/exclude filters
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

  // useCardData: handles search, sort, and pagination
  const {
    items: paginatedItems,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters,
    sorting,
    containerRef,
    containerStyle } = useCardData<FeedItem, SortByOption>(preFilteredItems, {
    filter: {
      searchFields: ['title', 'description', 'author'] as (keyof FeedItem)[],
      customPredicate: (item, query) => {
        if (item.subreddit && item.subreddit.toLowerCase().includes(query)) return true
        if (item.sourceName && item.sourceName.toLowerCase().includes(query)) return true
        return false
      },
      storageKey: 'rss-feed' },
    sort: {
      defaultField: 'date',
      defaultDirection: 'desc',
      comparators: SORT_COMPARATORS },
    defaultLimit: 10 })

  // Fetch with timeout helper
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

  // Helper: Fetch a single RSS feed URL
  const fetchSingleFeed = useCallback(async (feedUrl: string): Promise<FeedItem[]> => {
    const FETCH_TIMEOUT_MS = 10000

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
                subreddit: item.link?.match(/reddit\.com\/r\/([^/]+)/)?.[1] }
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

  // Fetch RSS feed (or aggregate) — uses demo data in demo mode
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
      const message = err instanceof Error ? err.message : 'Failed to load feed'

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
  }, [activeFeed?.url, activeFeed?.name, activeFeed?.isAggregate, activeFeed?.sourceUrls, isDemoMode, feeds, fetchSingleFeed])

  // Fetch on mount
  const feedInitRef = useRef(false)
  useEffect(() => {
    if (feedInitRef.current) return
    feedInitRef.current = true
    fetchFeed()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset source filter when feed changes
  useEffect(() => {
    setSourceFilter([])
    setShowSourceFilter(false)
  }, [activeFeedIndex])

  // Keep demo mode usable even before any feeds have been configured.
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

  // --- Callbacks for subcomponents ---

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

  // Feed pill selection (no close of selector needed)
  const handlePillSelect = useCallback((idx: number) => {
    if (idx !== activeFeedIndex) {
      setActiveFeedIndex(idx)
      setIsRefreshing(true)
      setError(null)
    }
  }, [activeFeedIndex])

  // Filter editor
  const handleOpenFilterEditor = useCallback(() => {
    const filter = activeFeed?.filter
    setTempIncludeTerms((filter?.includeTerms ?? []).join(', '))
    setTempExcludeTerms((filter?.excludeTerms ?? []).join(', '))
    setShowFilterEditor(true)
  }, [activeFeed?.filter])

  const handleSaveFilter = useCallback(() => {
    const includeTerms = tempIncludeTerms.split(',').map(t => t.trim()).filter(t => t)
    const excludeTerms = tempExcludeTerms.split(',').map(t => t.trim()).filter(t => t)

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

  // Source filter
  const handleToggleSourceFilter = useCallback(() => {
    setShowSourceFilter(prev => !prev)
  }, [])

  const handleCloseSourceFilter = useCallback(() => {
    setShowSourceFilter(false)
  }, [])

  // Settings panel callbacks
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
        icon: hostnameEndsWith(url, 'reddit.com') ? '🔴' : '📰' })
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

    const includeTerms = aggregateIncludeTerms.split(',').map(t => t.trim()).filter(t => t)
    const excludeTerms = aggregateExcludeTerms.split(',').map(t => t.trim()).filter(t => t)

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
        : undefined }

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

  // Feed items list callbacks
  const handleClearFilters = useCallback(() => {
    filters.setSearch('')
    if (activeFeed?.filter) {
      setFeeds(prev => prev.map((feed, i) =>
        i === activeFeedIndex ? { ...feed, filter: undefined } : feed
      ))
    }
  }, [filters, activeFeed?.filter, activeFeedIndex])

  const isRedditFeed = activeFeed?.url ? hostnameEndsWith(activeFeed.url, 'reddit.com') : false

  const showFullSkeleton = isLoading && items.length === 0 && !feeds.length
  const showListSkeleton = (isLoading && items.length === 0) || (isRefreshing && !itemsMatchActiveFeed)

  if (showFullSkeleton) {
    return (
      <div className="h-full flex flex-col animate-pulse">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
          <div className="h-5 w-32 bg-secondary/50 rounded" />
          <div className="h-6 w-6 bg-secondary/50 rounded" />
        </div>
        <div className="space-y-3 flex-1">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="p-3 rounded-lg bg-secondary/20">
              <div className="h-4 w-3/4 bg-secondary/50 rounded mb-2" />
              <div className="h-3 w-1/2 bg-secondary/30 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden relative">
      {/* Row 1: Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <FeedSelector
          feeds={feeds}
          activeFeedIndex={activeFeedIndex}
          showFeedSelector={showFeedSelector}
          totalItems={totalItems}
          onToggleSelector={handleToggleFeedSelector}
          onSelectFeed={handleSelectFeed}
          onOpenSettings={handleOpenSettings}
        />

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title={lastRefresh ? `Refresh (last: ${formatTimeAgo(lastRefresh, { compact: true, extended: true })})` : t('common:common.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </button>
          <button
            onClick={handleToggleSettings}
            className={cn(
              'p-1.5 rounded transition-colors',
              showSettings
                ? 'bg-primary/20 text-primary'
                : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground'
            )}
            title={t('common:navigation.settings')}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Row 2: Search */}
      <div className="flex flex-col gap-2 mb-2 shrink-0">
        <CardSearchInput
          value={filters.search}
          onChange={filters.setSearch}
          placeholder={t('cards:rssFeed.searchItems')}
        />
      </div>

      {/* Row 3: Feed Pills */}
      <FeedPills
        feeds={feeds}
        activeFeedIndex={activeFeedIndex}
        onSelectFeed={handlePillSelect}
      />

      {/* Sort & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <CardControlsRow
            cardControls={{
              limit: itemsPerPage,
              onLimitChange: setItemsPerPage,
              sortBy: sorting.sortBy,
              sortOptions: [
                { value: 'date', label: t('common:common.date') },
                { value: 'title', label: t('cards:rssFeed.title') },
              ],
              onSortChange: (v) => sorting.setSortBy(v as SortByOption),
              sortDirection: sorting.sortDirection,
              onSortDirectionChange: sorting.setSortDirection }}
          />

          {/* Filter button */}
          <button
            onClick={handleOpenFilterEditor}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 text-2xs rounded border transition-colors',
              activeFeed?.filter
                ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
            )}
          >
            <Filter className="w-3 h-3" />
            {activeFeed?.filter ? t('cards:rssFeed.filtered') : t('common:common.filter')}
          </button>

          {/* Source filter for aggregate feeds */}
          {activeFeed?.isAggregate && availableSources.length > 1 && (
            <SourceFilterDropdown
              availableSources={availableSources}
              sourceFilter={sourceFilter}
              showSourceFilter={showSourceFilter}
              onToggle={handleToggleSourceFilter}
              onSetFilter={setSourceFilter}
              onClose={handleCloseSourceFilter}
            />
          )}
        </div>
      </div>

      {/* Filter Editor */}
      {showFilterEditor && (
        <FeedFilterEditor
          activeFeed={activeFeed}
          tempIncludeTerms={tempIncludeTerms}
          tempExcludeTerms={tempExcludeTerms}
          onIncludeChange={setTempIncludeTerms}
          onExcludeChange={setTempExcludeTerms}
          onSave={handleSaveFilter}
          onClear={handleClearFilter}
          onClose={handleCloseFilterEditor}
        />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <FeedSettingsPanel
          feeds={feeds}
          activeFeedIndex={activeFeedIndex}
          newFeedUrl={newFeedUrl}
          newFeedName={newFeedName}
          showAggregateCreator={showAggregateCreator}
          editingAggregateIndex={editingAggregateIndex}
          aggregateName={aggregateName}
          selectedSourceUrls={selectedSourceUrls}
          aggregateIncludeTerms={aggregateIncludeTerms}
          aggregateExcludeTerms={aggregateExcludeTerms}
          onClose={handleToggleSettings}
          onNewFeedUrlChange={setNewFeedUrl}
          onNewFeedNameChange={setNewFeedName}
          onAddCustomFeed={handleAddCustomFeed}
          onAddPresetFeed={addFeed}
          onSelectFeed={handleSelectFeedFromSettings}
          onEditAggregate={handleEditAggregate}
          onRemoveFeed={handleRemoveFeed}
          onToggleAggregateCreator={handleToggleAggregateCreator}
          onAggregateNameChange={setAggregateName}
          onSelectedSourceUrlsChange={setSelectedSourceUrls}
          onAggregateIncludeChange={setAggregateIncludeTerms}
          onAggregateExcludeChange={setAggregateExcludeTerms}
          onSaveAggregate={handleSaveAggregate}
          onCancelAggregateEdit={handleCancelAggregateEdit}
        />
      )}

      {/* Status area */}
      <div className="h-5 mb-1 shrink-0 flex items-center">
        {(isLoading || isRefreshing) && !error ? (
          <span className="text-2xs text-muted-foreground/60 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Loading {activeFeed?.name || 'feed'}...
          </span>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2 w-full px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded text-2xs text-yellow-400">
            <span className="truncate">
              ⚠ {error === 'Failed to fetch' || error.includes('failed')
                ? `Could not load ${activeFeed?.name || 'feed'}`
                : error}
            </span>
            <button
              onClick={handleRefresh}
              className="shrink-0 px-1.5 py-0.5 bg-yellow-500/20 hover:bg-yellow-500/30 rounded text-yellow-300 transition-colors"
            >
              {t('common:common.retry')}
            </button>
          </div>
        ) : fetchSuccess ? (
          <span className="text-2xs text-muted-foreground/60">✓ {fetchSuccess}</span>
        ) : (filters.search || activeFeed?.filter) ? (
          <span className="text-2xs text-muted-foreground">
            {totalItems} of {items.length} items
            {filters.search && ` matching "${filters.search}"`}
            {activeFeed?.filter && ' (filtered)'}
          </span>
        ) : null}
      </div>

      {/* Feed items */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2 min-h-0 scrollbar-thin" style={containerStyle}>
        <FeedItemsList
          paginatedItems={paginatedItems}
          totalItems={totalItems}
          showListSkeleton={showListSkeleton}
          activeFeed={activeFeed}
          isRedditFeed={isRedditFeed}
          hasSearchOrFilter={!!(filters.search || activeFeed?.filter)}
          onClearFilters={handleClearFilters}
        />
      </div>

      {/* Pagination */}
      <div className="shrink-0">
        <CardPaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
          onPageChange={goToPage}
          needsPagination={needsPagination}
        />
      </div>

    </div>
  )
}

export function RSSFeed(props: RSSFeedProps) {
  const { t } = useTranslation(['cards', 'common'])
  void t
  return (
    <DynamicCardErrorBoundary cardId="RSSFeed">
      <RSSFeedInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}

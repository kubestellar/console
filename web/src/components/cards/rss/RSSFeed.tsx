import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Rss, RefreshCw, ExternalLink, Settings, X, Plus,
  Clock, ArrowUp, ChevronDown, Star, Filter, Pencil, Search
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { Pagination, usePagination } from '../../ui/Pagination'
import type { FeedItem, FeedConfig, FeedFilter, SortOption, RSSFeedProps } from './types'
import { PRESET_FEEDS, CORS_PROXIES } from './constants'
import { loadSavedFeeds, saveFeeds, getCachedFeed, cacheFeed } from './storage'
import {
  parseRSSFeed, stripHTML, decodeHTMLEntities,
  isValidThumbnail, normalizeRedditLink, formatTimeAgo,
} from './RSSParser'

export function RSSFeed({ config }: RSSFeedProps) {
  const [feeds, setFeeds] = useState<FeedConfig[]>(() => {
    if (config?.feedUrl) {
      return [{ url: config.feedUrl, name: config.feedName || 'Custom Feed' }]
    }
    return loadSavedFeeds()
  })
  const [activeFeedIndex, setActiveFeedIndex] = useState(0)

  // Initialize with cached items immediately on mount
  const [items, setItems] = useState<FeedItem[]>(() => {
    const savedFeeds = config?.feedUrl
      ? [{ url: config.feedUrl, name: config.feedName || 'Custom Feed' }]
      : loadSavedFeeds()
    const firstFeed = savedFeeds[0]
    if (firstFeed) {
      const cacheKey = firstFeed.isAggregate
        ? `aggregate:${firstFeed.sourceUrls?.join(',')}:${firstFeed.name}`
        : firstFeed.url
      const cached = getCachedFeed(cacheKey, true)
      if (cached && cached.items.length > 0) {
        return cached.items
      }
    }
    return []
  })
  const [itemsSourceUrl, setItemsSourceUrl] = useState<string | null>(() => {
    const savedFeeds = config?.feedUrl
      ? [{ url: config.feedUrl, name: config.feedName || 'Custom Feed' }]
      : loadSavedFeeds()
    const firstFeed = savedFeeds[0]
    if (firstFeed) {
      return firstFeed.isAggregate
        ? `aggregate:${firstFeed.sourceUrls?.join(',')}:${firstFeed.name}`
        : firstFeed.url
    }
    return null
  })
  const [isLoading, setIsLoading] = useState(() => {
    // Not loading if we have cached items
    const savedFeeds = config?.feedUrl
      ? [{ url: config.feedUrl, name: config.feedName || 'Custom Feed' }]
      : loadSavedFeeds()
    const firstFeed = savedFeeds[0]
    if (firstFeed) {
      const cacheKey = firstFeed.isAggregate
        ? `aggregate:${firstFeed.sourceUrls?.join(',')}:${firstFeed.name}`
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
  const [searchQuery, setSearchQuery] = useState('')
  const [fetchSuccess, setFetchSuccess] = useState<string | null>(null) // Success message
  const [sortBy, setSortBy] = useState<SortOption>('date-desc')
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [showFilterEditor, setShowFilterEditor] = useState(false)
  const [tempIncludeTerms, setTempIncludeTerms] = useState('')
  const [tempExcludeTerms, setTempExcludeTerms] = useState('')
  // Aggregate feed creator/editor
  const [showAggregateCreator, setShowAggregateCreator] = useState(false)
  const [editingAggregateIndex, setEditingAggregateIndex] = useState<number | null>(null) // null = creating new, number = editing existing
  const [aggregateName, setAggregateName] = useState('')
  const [selectedSourceUrls, setSelectedSourceUrls] = useState<string[]>([])
  const [aggregateIncludeTerms, setAggregateIncludeTerms] = useState('')
  const [aggregateExcludeTerms, setAggregateExcludeTerms] = useState('')
  // Source feed filter for aggregate feeds
  const [sourceFilter, setSourceFilter] = useState<string[]>([]) // Empty = all sources
  const [showSourceFilter, setShowSourceFilter] = useState(false)
  const sourceFilterRef = useRef<HTMLDivElement>(null)

  const activeFeed = feeds[activeFeedIndex] || feeds[0]

  // Get cache key for current feed
  const currentCacheKey = activeFeed?.isAggregate
    ? `aggregate:${activeFeed.sourceUrls?.join(',')}:${activeFeed.name}`
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
          icon: item.sourceIcon || '📰',
        })
      }
    }
    return Array.from(sources.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [items, activeFeed?.isAggregate])

  // Apply filters, search, and sort
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items]

    // Apply source filter (for aggregate feeds)
    if (sourceFilter.length > 0 && activeFeed?.isAggregate) {
      result = result.filter(item => item.sourceUrl && sourceFilter.includes(item.sourceUrl))
    }

    // Apply feed-specific include/exclude filters
    const filter = activeFeed?.filter
    if (filter) {
      // Include filter (OR logic) - show if matches ANY include term
      if (filter.includeTerms.length > 0) {
        result = result.filter(item => {
          const text = `${item.title} ${item.description || ''} ${item.author || ''}`.toLowerCase()
          return filter.includeTerms.some(term => text.includes(term.toLowerCase()))
        })
      }
      // Exclude filter (AND logic) - hide if matches ANY exclude term
      if (filter.excludeTerms.length > 0) {
        result = result.filter(item => {
          const text = `${item.title} ${item.description || ''} ${item.author || ''}`.toLowerCase()
          return !filter.excludeTerms.some(term => text.includes(term.toLowerCase()))
        })
      }
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(item =>
        item.title.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        (item.author && item.author.toLowerCase().includes(query)) ||
        (item.subreddit && item.subreddit.toLowerCase().includes(query)) ||
        (item.sourceName && item.sourceName.toLowerCase().includes(query))
      )
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return (b.pubDate?.getTime() || 0) - (a.pubDate?.getTime() || 0)
        case 'date-asc':
          return (a.pubDate?.getTime() || 0) - (b.pubDate?.getTime() || 0)
        case 'title-asc':
          return a.title.localeCompare(b.title)
        case 'title-desc':
          return b.title.localeCompare(a.title)
        default:
          return 0
      }
    })

    return result
  }, [items, activeFeed?.filter, activeFeed?.isAggregate, searchQuery, sortBy, sourceFilter])

  // Pagination
  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSortedItems, itemsPerPage)

  // Fetch with timeout helper
  const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { signal: controller.signal })
      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // Helper: Fetch a single RSS feed URL
  const fetchSingleFeed = async (feedUrl: string): Promise<FeedItem[]> => {
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
            items = data.items.map((item: any, idx: number) => {
              // Get thumbnail, validating it's not a placeholder
              let thumb = item.thumbnail || item.enclosure?.thumbnail || item.enclosure?.link || ''
              if (!isValidThumbnail(thumb)) thumb = ''
              // Try to extract from description if no valid thumbnail
              if (!thumb && (item.description || item.content)) {
                const imgMatch = (item.description || item.content).match(/<img[^>]+src=["']([^"']+)["']/)
                if (imgMatch && isValidThumbnail(imgMatch[1])) {
                  thumb = imgMatch[1]
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
            // Handle base64-encoded data URLs (allorigins sometimes returns these)
            if (contents.startsWith('data:') && contents.includes('base64,')) {
              const base64Part = contents.split('base64,')[1]
              contents = atob(base64Part)
            }
            // Check for error HTML in response
            if (contents.includes('<title>500') || contents.includes('Internal Server Error')) {
              throw new Error('Proxy returned error page')
            }
            items = parseRSSFeed(contents, feedUrl)
          } else {
            throw new Error('No content in response')
          }
        } else {
          const feedXml = await response.text()
          // Check for empty or error response
          if (!feedXml || feedXml.length < 50) {
            throw new Error('Empty response')
          }
          // Check for error pages
          if (feedXml.includes('Internal Server Error') || feedXml.includes('<!DOCTYPE html>') && !feedXml.includes('<rss') && !feedXml.includes('<feed')) {
            throw new Error('Received error page instead of feed')
          }
          items = parseRSSFeed(feedXml, feedUrl)
        }

        // If we got items, return them; otherwise try next proxy
        if (items.length > 0) {
          return items
        }
        throw new Error('No items parsed from feed')
      } catch {
        continue // Try next proxy
      }
    }
    return [] // All proxies failed
  }

  // Fetch RSS feed (or aggregate)
  const fetchFeed = useCallback(async (isManualRefresh = false) => {
    if (!activeFeed?.url && !activeFeed?.isAggregate) return

    const cacheKey = activeFeed.isAggregate
      ? `aggregate:${activeFeed.sourceUrls?.join(',')}:${activeFeed.name}`
      : activeFeed.url

    // Always show cached content first (even if stale) for better UX
    const cached = getCachedFeed(cacheKey, true) // ignoreExpiry=true to get stale cache
    if (cached && cached.items.length > 0) {
      setItems(cached.items)
      setItemsSourceUrl(cacheKey)
      setLastRefresh(new Date(cached.timestamp))
      setError(null)
      setIsLoading(false)

      // If cache is fresh and not manual refresh, we're done
      if (!cached.isStale && !isManualRefresh) {
        setIsRefreshing(false)
        return
      }
      // Otherwise, continue to background refresh
      setIsRefreshing(true)
    } else {
      // No cache, show loading state
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
        // Aggregate feed: fetch from all sources in parallel
        const results = await Promise.all(
          activeFeed.sourceUrls.map(async (url) => {
            const items = await fetchSingleFeed(url)
            // Find source feed info
            const sourceFeed = feeds.find(f => f.url === url) || PRESET_FEEDS.find(p => p.url === url)
            const sourceName = sourceFeed?.name || new URL(url).hostname
            const sourceIcon = sourceFeed?.icon || '📰'
            // Attach source info to each item
            return items.map(item => ({
              ...item,
              sourceUrl: url,
              sourceName,
              sourceIcon,
            }))
          })
        )
        // Combine and deduplicate by link
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
        // Single feed
        feedItems = await fetchSingleFeed(activeFeed.url)
      }

      if (feedItems.length === 0) {
        throw new Error(activeFeed.isAggregate ? 'No items found in any source feed' : 'No items found in feed')
      }

      setItems(feedItems)
      setItemsSourceUrl(cacheKey)
      setError(null) // Clear any previous errors on successful load
      setLastRefresh(new Date())
      const sourceCount = activeFeed.isAggregate ? ` from ${activeFeed.sourceUrls?.length || 0} sources` : ''
      setFetchSuccess(`Fetched ${feedItems.length} items${sourceCount}`)
      cacheFeed(cacheKey, feedItems)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load feed'

      // Try to use stale cache - if we have cached items, don't show error
      const cached = getCachedFeed(cacheKey)
      if (cached && cached.items.length > 0) {
        setItems(cached.items)
        setItemsSourceUrl(cacheKey)
        setLastRefresh(new Date(cached.timestamp))
        setError(null) // Clear error since we have items to show
      } else {
        // Clear stale items from previous feed to avoid confusion
        setItems([])
        setItemsSourceUrl(cacheKey)
        setError(message)
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [activeFeed?.url, activeFeed?.name, activeFeed?.isAggregate, activeFeed?.sourceUrls])

  // Fetch on mount and when feed changes
  useEffect(() => {
    fetchFeed()
  }, [fetchFeed])

  // Reset source filter when feed changes
  useEffect(() => {
    setSourceFilter([])
    setShowSourceFilter(false)
  }, [activeFeedIndex])

  // Close source filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sourceFilterRef.current && !sourceFilterRef.current.contains(event.target as Node)) {
        setShowSourceFilter(false)
      }
    }
    if (showSourceFilter) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSourceFilter])

  // Clear success message after 3 seconds
  useEffect(() => {
    if (fetchSuccess) {
      const timer = setTimeout(() => setFetchSuccess(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [fetchSuccess])

  // Save feeds when changed
  useEffect(() => {
    if (!config?.feedUrl) {
      saveFeeds(feeds)
    }
  }, [feeds, config?.feedUrl])

  // Add a new feed
  const addFeed = useCallback((feed: FeedConfig) => {
    if (!feeds.some(f => f.url === feed.url && !f.isAggregate)) {
      setFeeds(prev => [...prev, feed])
      setActiveFeedIndex(feeds.length)
      // Show loading indicator but keep existing items visible (better UX)
      setIsRefreshing(true)
      setError(null) // Clear any previous errors
    } else {
      // Feed already exists, just switch to it
      const existingIndex = feeds.findIndex(f => f.url === feed.url)
      if (existingIndex !== -1 && existingIndex !== activeFeedIndex) {
        setActiveFeedIndex(existingIndex)
        // Show loading indicator but keep existing items visible
        setIsRefreshing(true)
        setError(null) // Clear any previous errors
      }
    }
    setNewFeedUrl('')
    setNewFeedName('')
    setShowSettings(false)
  }, [feeds, activeFeedIndex])

  // Create an aggregate feed from multiple sources
  // Open aggregate editor with existing values
  const editAggregate = useCallback((index: number) => {
    const feed = feeds[index]
    if (!feed?.isAggregate) return

    setEditingAggregateIndex(index)
    setAggregateName(feed.name)
    setSelectedSourceUrls(feed.sourceUrls || [])
    setAggregateIncludeTerms(feed.filter?.includeTerms.join(', ') || '')
    setAggregateExcludeTerms(feed.filter?.excludeTerms.join(', ') || '')
    setShowAggregateCreator(true)
  }, [feeds])

  // Create or update aggregate feed
  const saveAggregate = useCallback(() => {
    if (!aggregateName.trim() || selectedSourceUrls.length === 0) return

    const includeTerms = aggregateIncludeTerms.split(',').map(t => t.trim()).filter(t => t)
    const excludeTerms = aggregateExcludeTerms.split(',').map(t => t.trim()).filter(t => t)

    const aggregate: FeedConfig = {
      url: editingAggregateIndex !== null
        ? feeds[editingAggregateIndex].url // Keep existing URL for edits
        : `aggregate:${Date.now()}`, // New unique identifier
      name: aggregateName.trim(),
      icon: '📚',
      isAggregate: true,
      sourceUrls: selectedSourceUrls,
      filter: includeTerms.length > 0 || excludeTerms.length > 0
        ? { includeTerms, excludeTerms }
        : undefined,
    }

    if (editingAggregateIndex !== null) {
      // Update existing aggregate
      setFeeds(prev => prev.map((f, i) => i === editingAggregateIndex ? aggregate : f))
      setActiveFeedIndex(editingAggregateIndex)
    } else {
      // Create new aggregate
      setFeeds(prev => [...prev, aggregate])
      setActiveFeedIndex(feeds.length)
    }

    setIsRefreshing(true)
    setError(null)

    // Reset creator state
    setShowAggregateCreator(false)
    setEditingAggregateIndex(null)
    setAggregateName('')
    setSelectedSourceUrls([])
    setAggregateIncludeTerms('')
    setAggregateExcludeTerms('')
    setShowSettings(false)
  }, [aggregateName, selectedSourceUrls, aggregateIncludeTerms, aggregateExcludeTerms, feeds, editingAggregateIndex])

  // Remove a feed
  const removeFeed = useCallback((index: number) => {
    if (feeds.length > 1) {
      setFeeds(prev => prev.filter((_, i) => i !== index))
      if (activeFeedIndex >= index && activeFeedIndex > 0) {
        setActiveFeedIndex(prev => prev - 1)
      }
    }
  }, [feeds.length, activeFeedIndex])

  // Update feed filter
  const updateFeedFilter = useCallback((index: number, filter: FeedFilter | undefined) => {
    setFeeds(prev => prev.map((feed, i) =>
      i === index ? { ...feed, filter } : feed
    ))
  }, [])

  // Initialize filter editor with current feed's filter
  const openFilterEditor = useCallback(() => {
    const filter = activeFeed?.filter
    setTempIncludeTerms(filter?.includeTerms.join(', ') || '')
    setTempExcludeTerms(filter?.excludeTerms.join(', ') || '')
    setShowFilterEditor(true)
  }, [activeFeed?.filter])

  // Save filter from editor
  const saveFilter = useCallback(() => {
    const includeTerms = tempIncludeTerms.split(',').map(t => t.trim()).filter(t => t)
    const excludeTerms = tempExcludeTerms.split(',').map(t => t.trim()).filter(t => t)

    if (includeTerms.length === 0 && excludeTerms.length === 0) {
      updateFeedFilter(activeFeedIndex, undefined)
    } else {
      updateFeedFilter(activeFeedIndex, { includeTerms, excludeTerms })
    }
    setShowFilterEditor(false)
  }, [activeFeedIndex, tempIncludeTerms, tempExcludeTerms, updateFeedFilter])

  // Check if URL looks like a Reddit URL and convert to RSS
  const normalizeUrl = (url: string): string => {
    let normalized = url.trim()

    // Handle r/subreddit shorthand (convert to full Reddit RSS URL)
    if (normalized.match(/^r\/\w+$/i)) {
      normalized = `https://www.reddit.com/${normalized}.rss`
      return normalized
    }

    // Handle /r/subreddit shorthand
    if (normalized.match(/^\/r\/\w+$/i)) {
      normalized = `https://www.reddit.com${normalized}.rss`
      return normalized
    }

    // Convert Reddit URLs to RSS
    if (normalized.includes('reddit.com') && !normalized.endsWith('.rss')) {
      normalized = normalized.replace(/\/?$/, '.rss')
    }

    // Add https if missing
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized
    }

    return normalized
  }

  const isRedditFeed = activeFeed?.url?.includes('reddit.com')

  // Show full skeleton only on initial load with no items
  // When switching feeds, keep the controls visible and only skeleton the list
  const showFullSkeleton = isLoading && items.length === 0 && !feeds.length
  const showListSkeleton = (isLoading && items.length === 0) || (isRefreshing && !itemsMatchActiveFeed)

  if (showFullSkeleton) {
    return (
      <div className="h-full flex flex-col animate-pulse">
        <div className="flex items-center justify-between mb-3">
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
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Feed Selector */}
          <div className="relative">
            <button
              onClick={() => setShowFeedSelector(!showFeedSelector)}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              <span>{activeFeed?.icon || '📰'}</span>
              <span className="truncate max-w-[150px]">{activeFeed?.name || 'Select Feed'}</span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', showFeedSelector && 'rotate-180')} />
            </button>

            {showFeedSelector && (
              <div className="absolute top-full left-0 mt-1 w-56 max-h-64 overflow-y-auto bg-card border border-border rounded-lg shadow-lg z-50">
                <div className="p-1">
                  {feeds.map((feed, idx) => (
                    <button
                      key={feed.url}
                      onClick={() => {
                        if (idx !== activeFeedIndex) {
                          setActiveFeedIndex(idx)
                          // Show loading indicator but keep existing items visible
                          setIsRefreshing(true)
                          setError(null) // Clear previous errors
                        }
                        setShowFeedSelector(false)
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors',
                        idx === activeFeedIndex
                          ? 'bg-primary/20 text-primary'
                          : 'hover:bg-secondary text-foreground'
                      )}
                    >
                      <span>{feed.icon || '📰'}</span>
                      <span className="truncate">{feed.name}</span>
                    </button>
                  ))}
                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      onClick={() => {
                        setShowFeedSelector(false)
                        setShowSettings(true)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary rounded"
                    >
                      <Plus className="w-4 h-4" />
                      Add Feed...
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Count badge */}
          <span className="text-sm font-medium text-muted-foreground">
            {filteredAndSortedItems.length} items
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchFeed(true)}
            disabled={isRefreshing}
            className="p-1.5 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title={lastRefresh ? `Refresh (last: ${formatTimeAgo(lastRefresh)})` : 'Refresh'}
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'p-1.5 rounded transition-colors',
              showSettings
                ? 'bg-primary/20 text-primary'
                : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground'
            )}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Row 2: Search */}
      <div className="flex flex-col gap-2 mb-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
        </div>
      </div>

      {/* Row 3: Feed Pills - Quick Navigation */}
      {feeds.length > 1 && (
        <div className="flex items-center gap-1 mb-2 overflow-x-auto scrollbar-thin flex-shrink-0 h-6">
          {feeds.map((feed, idx) => (
            <button
              key={feed.url}
              onClick={() => {
                if (idx !== activeFeedIndex) {
                  setActiveFeedIndex(idx)
                  setIsRefreshing(true)
                  setError(null)
                }
              }}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap transition-colors flex-shrink-0',
                idx === activeFeedIndex
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent'
              )}
            >
              <span>{feed.icon || '📰'}</span>
              <span className="max-w-[80px] truncate">{feed.name}</span>
              {feed.filter && <Filter className="w-2.5 h-2.5 text-purple-400" />}
            </button>
          ))}
        </div>
      )}

      {/* Sort & Filter Controls */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-2 py-0.5 text-[10px] bg-secondary/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="date-desc">Newest</option>
            <option value="date-asc">Oldest</option>
            <option value="title-asc">A-Z</option>
            <option value="title-desc">Z-A</option>
          </select>

          {/* Filter button */}
          <button
            onClick={openFilterEditor}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border transition-colors',
              activeFeed?.filter
                ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
            )}
          >
            <Filter className="w-3 h-3" />
            {activeFeed?.filter ? 'Filtered' : 'Filter'}
          </button>

          {/* Source filter for aggregate feeds */}
          {activeFeed?.isAggregate && availableSources.length > 1 && (
            <div ref={sourceFilterRef} className="relative">
              <button
                onClick={() => setShowSourceFilter(!showSourceFilter)}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border transition-colors',
                  sourceFilter.length > 0
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                    : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
                )}
                title="Filter by source feed"
              >
                <Rss className="w-3 h-3" />
                {sourceFilter.length > 0 ? `${sourceFilter.length}/${availableSources.length}` : 'Sources'}
                <ChevronDown className={cn('w-3 h-3 transition-transform', showSourceFilter && 'rotate-180')} />
              </button>

              {showSourceFilter && (
                <div className="absolute top-full left-0 mt-1 w-56 max-h-64 overflow-y-auto bg-card border border-border rounded-lg shadow-lg z-50">
                  <div className="p-1">
                    <button
                      onClick={() => setSourceFilter([])}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded transition-colors',
                        sourceFilter.length === 0 ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-secondary text-foreground'
                      )}
                    >
                      All sources ({availableSources.length})
                    </button>
                    <div className="border-t border-border my-1" />
                    {availableSources.map(source => (
                      <button
                        key={source.url}
                        onClick={() => {
                          setSourceFilter(prev =>
                            prev.includes(source.url)
                              ? prev.filter(u => u !== source.url)
                              : [...prev, source.url]
                          )
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded transition-colors',
                          sourceFilter.includes(source.url) ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-secondary text-foreground'
                        )}
                      >
                        <span title={source.name}>{source.icon}</span>
                        <span className="truncate">{source.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Items per page */}
        <select
          value={itemsPerPage}
          onChange={(e) => setItemsPerPage(Number(e.target.value))}
          className="px-2 py-0.5 text-[10px] bg-secondary/50 border border-border rounded focus:outline-none"
        >
          <option value={5}>5/page</option>
          <option value={10}>10/page</option>
          <option value={20}>20/page</option>
          <option value={50}>50/page</option>
        </select>
      </div>

      {/* Filter Editor Modal */}
      {showFilterEditor && (
        <div className="mb-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg flex-shrink-0 max-h-36 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-purple-300">Filter: {activeFeed?.name}</span>
            <button
              onClick={() => setShowFilterEditor(false)}
              className="p-1 rounded hover:bg-secondary text-muted-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Include (show items with ANY of these terms, comma-separated)</label>
              <input
                type="text"
                value={tempIncludeTerms}
                onChange={(e) => setTempIncludeTerms(e.target.value)}
                placeholder="kubernetes, docker, cloud..."
                className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Exclude (hide items with ANY of these terms, comma-separated)</label>
              <input
                type="text"
                value={tempExcludeTerms}
                onChange={(e) => setTempExcludeTerms(e.target.value)}
                placeholder="spam, politics, off-topic..."
                className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveFilter}
                className="px-3 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
              >
                Apply Filter
              </button>
              {activeFeed?.filter && (
                <button
                  onClick={() => {
                    updateFeedFilter(activeFeedIndex, undefined)
                    setShowFilterEditor(false)
                  }}
                  className="px-3 py-1 text-xs bg-secondary text-foreground rounded hover:bg-secondary/80 transition-colors"
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel - absolute positioned to not affect card height */}
      {showSettings && (
        <div className="absolute inset-x-3 top-16 bottom-3 p-3 bg-card border border-border rounded-lg shadow-lg z-40 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Manage Feeds</span>
            <button
              onClick={() => setShowSettings(false)}
              className="p-1 rounded hover:bg-secondary text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Add custom feed */}
          <div className="space-y-2 mb-3">
            <input
              type="text"
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              placeholder="Feed URL (e.g., r/kubernetes or hnrss.org/frontpage)"
              className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newFeedName}
                onChange={(e) => setNewFeedName(e.target.value)}
                placeholder="Name (optional)"
                className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => {
                  if (newFeedUrl.trim()) {
                    const rawUrl = newFeedUrl.trim()
                    const url = normalizeUrl(rawUrl)
                    // Extract name: use subreddit name for r/... shorthand, otherwise hostname
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
                      icon: url.includes('reddit.com') ? '🔴' : '📰',
                    })
                  }
                }}
                disabled={!newFeedUrl.trim()}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Examples: r/kubernetes, r/devops, hnrss.org/frontpage, techcrunch.com/feed
            </p>
          </div>

          {/* Current feeds (favorites) */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              <span className="text-xs text-muted-foreground">Your saved feeds ({feeds.length}):</span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {feeds.map((feed, idx) => (
                <div
                  key={feed.url}
                  className={cn(
                    "flex items-center justify-between px-2 py-1.5 rounded transition-colors",
                    idx === activeFeedIndex
                      ? "bg-primary/20 border border-primary/30"
                      : "bg-secondary/30 hover:bg-secondary/50"
                  )}
                >
                  <button
                    onClick={() => {
                      setActiveFeedIndex(idx)
                      setShowSettings(false)
                    }}
                    className="flex-1 text-xs flex items-center gap-2 truncate text-left"
                  >
                    <span>{feed.icon || '📰'}</span>
                    <span className={idx === activeFeedIndex ? 'text-primary font-medium' : ''}>{feed.name}</span>
                    {feed.isAggregate && <span className="text-[9px] text-purple-400">(agg)</span>}
                  </button>
                  <div className="flex items-center">
                    {feed.isAggregate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          editAggregate(idx)
                        }}
                        className="p-1 text-muted-foreground hover:text-purple-400"
                        title="Edit aggregate"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    {feeds.length > 1 && (
                      <button
                        onClick={() => removeFeed(idx)}
                        className="p-1 text-muted-foreground hover:text-red-400"
                        title="Remove from favorites"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preset feeds by category */}
          <div>
            <span className="text-xs text-muted-foreground block mb-2">Popular feeds (click to add):</span>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {/* Reddit */}
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Reddit</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {PRESET_FEEDS.filter(p => p.url.includes('reddit.com') && !feeds.some(f => f.url === p.url)).slice(0, 8).map(preset => (
                    <button
                      key={preset.url}
                      onClick={() => addFeed(preset)}
                      className="px-2 py-0.5 text-[10px] rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 hover:bg-orange-500/20 transition-colors"
                    >
                      {preset.icon} {preset.name.replace('r/', '')}
                    </button>
                  ))}
                </div>
              </div>
              {/* Tech News */}
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Tech News</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {PRESET_FEEDS.filter(p => !p.url.includes('reddit.com') && !p.url.includes('kubernetes') && !p.url.includes('cncf') && !p.url.includes('docker') && !p.url.includes('hashicorp') && !p.url.includes('istio') && !p.url.includes('prometheus') && !p.url.includes('netflix') && !p.url.includes('cloudflare') && !p.url.includes('github.blog') && !p.url.includes('infoq') && !p.url.includes('dev.to') && !p.url.includes('css-tricks') && !p.url.includes('smashing') && !feeds.some(f => f.url === p.url)).slice(0, 10).map(preset => (
                    <button
                      key={preset.url}
                      onClick={() => addFeed(preset)}
                      className="px-2 py-0.5 text-[10px] rounded-full bg-secondary/50 border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      {preset.icon} {preset.name}
                    </button>
                  ))}
                </div>
              </div>
              {/* Cloud Native */}
              <div>
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Cloud Native</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {PRESET_FEEDS.filter(p => (p.url.includes('kubernetes') || p.url.includes('cncf') || p.url.includes('docker') || p.url.includes('hashicorp') || p.url.includes('istio') || p.url.includes('prometheus')) && !feeds.some(f => f.url === p.url)).map(preset => (
                    <button
                      key={preset.url}
                      onClick={() => addFeed(preset)}
                      className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-colors"
                    >
                      {preset.icon} {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              Tip: For any Reddit subreddit, just type: r/subreddit
            </p>
          </div>

          {/* Create Aggregate Feed */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <button
              onClick={() => {
                if (showAggregateCreator) {
                  // Closing - reset editing state
                  setShowAggregateCreator(false)
                  setEditingAggregateIndex(null)
                  setAggregateName('')
                  setSelectedSourceUrls([])
                  setAggregateIncludeTerms('')
                  setAggregateExcludeTerms('')
                } else {
                  setShowAggregateCreator(true)
                }
              }}
              className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              <span>📚</span>
              {showAggregateCreator
                ? 'Hide'
                : editingAggregateIndex !== null
                  ? 'Edit Aggregate Feed'
                  : 'Create Custom Aggregate Feed'}
            </button>

            {showAggregateCreator && (
              <div className="mt-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <input
                  type="text"
                  value={aggregateName}
                  onChange={(e) => setAggregateName(e.target.value)}
                  placeholder="Aggregate name (e.g., My Tech News)"
                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-purple-500 mb-2"
                />

                {/* Source feed selector */}
                <div className="mb-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-muted-foreground">Select source feeds:</label>
                    <button
                      type="button"
                      onClick={() => {
                        const nonAggregateUrls = feeds.filter(f => !f.isAggregate).map(f => f.url)
                        if (selectedSourceUrls.length === nonAggregateUrls.length) {
                          setSelectedSourceUrls([])
                        } else {
                          setSelectedSourceUrls(nonAggregateUrls)
                        }
                      }}
                      className="text-[10px] text-purple-400 hover:text-purple-300"
                    >
                      {selectedSourceUrls.length === feeds.filter(f => !f.isAggregate).length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto mt-1 space-y-1">
                    {feeds.filter(f => !f.isAggregate).map(feed => (
                      <label
                        key={feed.url}
                        className="flex items-center gap-2 text-xs cursor-pointer hover:bg-secondary/30 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSourceUrls.includes(feed.url)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSourceUrls(prev => [...prev, feed.url])
                            } else {
                              setSelectedSourceUrls(prev => prev.filter(u => u !== feed.url))
                            }
                          }}
                          className="rounded border-border"
                        />
                        <span>{feed.icon || '📰'}</span>
                        <span className="truncate">{feed.name}</span>
                      </label>
                    ))}
                    {feeds.filter(f => !f.isAggregate).length === 0 && (
                      <span className="text-[10px] text-muted-foreground">Add feeds first to create an aggregate</span>
                    )}
                  </div>
                </div>

                {/* Include/Exclude terms */}
                <div className="space-y-2 mb-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Include terms (comma-separated)</label>
                    <input
                      type="text"
                      value={aggregateIncludeTerms}
                      onChange={(e) => setAggregateIncludeTerms(e.target.value)}
                      placeholder="kubernetes, AI, cloud..."
                      className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Exclude terms (comma-separated)</label>
                    <input
                      type="text"
                      value={aggregateExcludeTerms}
                      onChange={(e) => setAggregateExcludeTerms(e.target.value)}
                      placeholder="spam, off-topic..."
                      className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={saveAggregate}
                    disabled={!aggregateName.trim() || selectedSourceUrls.length === 0}
                    className="flex-1 px-3 py-1.5 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {editingAggregateIndex !== null ? 'Update' : 'Create'} Aggregate ({selectedSourceUrls.length} sources)
                  </button>
                  {editingAggregateIndex !== null && (
                    <button
                      onClick={() => {
                        setShowAggregateCreator(false)
                        setEditingAggregateIndex(null)
                        setAggregateName('')
                        setSelectedSourceUrls([])
                        setAggregateIncludeTerms('')
                        setAggregateExcludeTerms('')
                      }}
                      className="px-3 py-1.5 text-xs bg-secondary text-foreground rounded hover:bg-secondary/80 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status area - fixed height to prevent layout shifts */}
      <div className="h-5 mb-1 flex-shrink-0 flex items-center">
        {(isLoading || isRefreshing) && !error ? (
          <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Loading {activeFeed?.name || 'feed'}...
          </span>
        ) : error ? (
          <div className="flex items-center justify-between gap-2 w-full px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400">
            <span className="truncate">
              ⚠ {error === 'Failed to fetch' || error.includes('failed')
                ? `Could not load ${activeFeed?.name || 'feed'}`
                : error}
            </span>
            <button
              onClick={() => fetchFeed(true)}
              className="flex-shrink-0 px-1.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 rounded text-amber-300 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : fetchSuccess ? (
          <span className="text-[10px] text-muted-foreground/60">✓ {fetchSuccess}</span>
        ) : (searchQuery || activeFeed?.filter) ? (
          <span className="text-[10px] text-muted-foreground">
            {filteredAndSortedItems.length} of {items.length} items
            {searchQuery && ` matching "${searchQuery}"`}
            {activeFeed?.filter && ' (filtered)'}
          </span>
        ) : null}
      </div>

      {/* Feed items */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 scrollbar-thin">
        {showListSkeleton ? (
          /* Show skeleton items while loading */
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="p-3 rounded-lg bg-secondary/20 border border-border/50">
                <div className="h-4 w-3/4 bg-secondary/50 rounded mb-2" />
                <div className="h-3 w-1/2 bg-secondary/30 rounded" />
              </div>
            ))}
          </div>
        ) : filteredAndSortedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Rss className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">{searchQuery || activeFeed?.filter ? 'No matching items' : 'No items in feed'}</span>
            {(searchQuery || activeFeed?.filter) && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  if (activeFeed?.filter) {
                    updateFeedFilter(activeFeedIndex, undefined)
                  }
                }}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          paginatedItems.map((item) => (
            <a
              key={item.id}
              href={normalizeRedditLink(item.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 border border-border/50 transition-colors group"
            >
              <div className="flex gap-3">
                {/* Thumbnail for Reddit posts */}
                {item.thumbnail && item.thumbnail.startsWith('http') && (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-16 h-16 object-cover rounded flex-shrink-0"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}

                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                    {item.title}
                  </h3>

                  {/* Meta info */}
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    {/* Feed icon - show source icon for aggregates, or current feed icon for single feeds */}
                    <span
                      className="cursor-default text-base leading-none"
                      title={activeFeed?.isAggregate ? (item.sourceName || 'Unknown source') : (activeFeed?.name || 'Feed')}
                    >
                      {activeFeed?.isAggregate ? (item.sourceIcon || '📰') : (activeFeed?.icon || '📰')}
                    </span>

                    {/* Reddit score */}
                    {item.score !== undefined && (
                      <span className="flex items-center gap-0.5 text-orange-400">
                        <ArrowUp className="w-3 h-3" />
                        {item.score}
                      </span>
                    )}

                    {/* Subreddit */}
                    {item.subreddit && (
                      <span className="text-blue-400">r/{item.subreddit}</span>
                    )}

                    {/* Author */}
                    {item.author && !isRedditFeed && (
                      <span>{item.author}</span>
                    )}

                    {/* Time */}
                    {item.pubDate && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(item.pubDate)}
                      </span>
                    )}

                    {/* External link indicator */}
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                  </div>

                  {/* Description preview - show for all feeds */}
                  {item.description && (
                    <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            </a>
          ))
        )}
      </div>

      {/* Pagination */}
      {needsPagination && (
        <div className="mt-2 pt-2 border-t border-border/50 flex-shrink-0">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}

    </div>
  )
}

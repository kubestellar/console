import { useEffect, useRef, useCallback } from 'react'
import { TOAST_DISMISS_MS } from '../../../lib/constants/network'
import { hostnameEndsWith } from '../../../lib/utils/urlHostname'
import type { FeedConfig, FeedFilter } from './types'
import { loadSavedFeeds } from './storage'
import { RSS_DEMO_FEEDS } from './demoData'

interface UseRSSFeedEffectsArgs {
  showSettings: boolean
  showFeedSelector: boolean
  showFilterEditor: boolean
  showSourceFilter: boolean
  showAggregateCreator: boolean
  setShowAggregateCreator: (open: boolean) => void
  setShowFilterEditor: (open: boolean) => void
  setShowSourceFilter: (open: boolean) => void
  setShowFeedSelector: (open: boolean) => void
  setShowSettings: (open: boolean) => void
  activeFeedIndex: number
  setSourceFilter: (value: string[]) => void
  setShowSourceFilterState: (open: boolean) => void
  configFeedUrl?: string
  feeds: FeedConfig[]
  isDemoMode: boolean
  setFeeds: React.Dispatch<React.SetStateAction<FeedConfig[]>>
  setActiveFeedIndex: React.Dispatch<React.SetStateAction<number>>
  fetchSuccess: string | null
  setFetchSuccess: (value: string | null) => void
  saveFeeds: (feeds: FeedConfig[]) => void
  fetchFeed: () => void | Promise<void>
}

export function useRSSFeedEffects(args: UseRSSFeedEffectsArgs) {
  const feedInitRef = useRef(false)
  const {
    showSettings,
    showFeedSelector,
    showFilterEditor,
    showSourceFilter,
    showAggregateCreator,
    setShowAggregateCreator,
    setShowFilterEditor,
    setShowSourceFilter,
    setShowFeedSelector,
    setShowSettings,
    activeFeedIndex,
    setSourceFilter,
    setShowSourceFilterState,
    configFeedUrl,
    feeds,
    isDemoMode,
    setFeeds,
    setActiveFeedIndex,
    fetchSuccess,
    setFetchSuccess,
    saveFeeds,
    fetchFeed,
  } = args

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
  }, [showSettings, showFeedSelector, showFilterEditor, showSourceFilter, showAggregateCreator, setShowAggregateCreator, setShowFilterEditor, setShowSourceFilter, setShowFeedSelector, setShowSettings])

  useEffect(() => {
    setSourceFilter([])
    setShowSourceFilterState(false)
  }, [activeFeedIndex, setSourceFilter, setShowSourceFilterState])

  useEffect(() => {
    if (feedInitRef.current) return
    feedInitRef.current = true
    void fetchFeed()
    return () => {
      feedInitRef.current = false
    }
  }, [fetchFeed])

  useEffect(() => {
    if (configFeedUrl) return
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
  }, [configFeedUrl, feeds, isDemoMode, setFeeds, setActiveFeedIndex])

  useEffect(() => {
    if (!fetchSuccess) return
    const timer = setTimeout(() => setFetchSuccess(null), TOAST_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [fetchSuccess, setFetchSuccess])

  useEffect(() => {
    if (configFeedUrl) return
    if (feeds.length > 0 && feeds.every(feed => feed.url.startsWith('demo:'))) return
    saveFeeds(feeds)
  }, [feeds, configFeedUrl, saveFeeds])
}

interface UseRSSFeedActionsArgs {
  activeFeedIndex: number
  setActiveFeedIndex: React.Dispatch<React.SetStateAction<number>>
  setShowFeedSelector: React.Dispatch<React.SetStateAction<boolean>>
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>
  fetchFeed: (manual?: boolean) => void
  activeFeed?: FeedConfig
  setTempIncludeTerms: (value: string) => void
  setTempExcludeTerms: (value: string) => void
  setShowFilterEditor: (open: boolean) => void
  tempIncludeTerms: string
  tempExcludeTerms: string
  setFeeds: React.Dispatch<React.SetStateAction<FeedConfig[]>>
  setShowSourceFilter: React.Dispatch<React.SetStateAction<boolean>>
  newFeedUrl: string
  newFeedName: string
  setNewFeedUrl: (value: string) => void
  setNewFeedName: (value: string) => void
  feeds: FeedConfig[]
  setIsRefreshing: (value: boolean) => void
  setError: (value: string | null) => void
  editingAggregateIndex: number | null
  aggregateName: string
  selectedSourceUrls: string[]
  aggregateIncludeTerms: string
  aggregateExcludeTerms: string
  setEditingAggregateIndex: (value: number | null) => void
  setAggregateName: (value: string) => void
  setSelectedSourceUrls: (value: string[]) => void
  setAggregateIncludeTerms: (value: string) => void
  setAggregateExcludeTerms: (value: string) => void
  setShowAggregateCreator: (value: boolean) => void
  showAggregateCreator: boolean
  filtersSetSearch: (value: string) => void
}

export function useRSSFeedActions(args: UseRSSFeedActionsArgs) {
  const normalizeUrl = useCallback((url: string): string => {
    let normalized = url.trim()
    if (normalized.match(/^r\/\w+$/i)) return `https://www.reddit.com/${normalized}.rss`
    if (normalized.match(/^\/r\/\w+$/i)) return `https://www.reddit.com${normalized}.rss`
    const withScheme = normalized.startsWith('http://') || normalized.startsWith('https://') ? normalized : 'https://' + normalized
    if (hostnameEndsWith(withScheme, 'reddit.com') && !normalized.endsWith('.rss')) normalized = withScheme.replace(/\/?$/, '.rss')
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) normalized = 'https://' + normalized
    return normalized
  }, [])

  const handleSelectFeed = useCallback((idx: number) => {
    if (idx !== args.activeFeedIndex) {
      args.setActiveFeedIndex(idx)
      args.setIsRefreshing(true)
      args.setError(null)
    }
    args.setShowFeedSelector(false)
  }, [args])

  const handleOpenSettings = useCallback(() => {
    args.setShowFeedSelector(false)
    args.setShowSettings(true)
  }, [args])

  const handleToggleFeedSelector = useCallback(() => {
    args.setShowFeedSelector(prev => !prev)
  }, [args])

  const handleRefresh = useCallback(() => {
    args.fetchFeed(true)
  }, [args])

  const handleToggleSettings = useCallback(() => {
    args.setShowSettings(prev => !prev)
  }, [args])

  const handlePillSelect = useCallback((idx: number) => {
    if (idx !== args.activeFeedIndex) {
      args.setActiveFeedIndex(idx)
      args.setIsRefreshing(true)
      args.setError(null)
    }
  }, [args])

  const handleOpenFilterEditor = useCallback(() => {
    const filter = args.activeFeed?.filter
    args.setTempIncludeTerms((filter?.includeTerms ?? []).join(', '))
    args.setTempExcludeTerms((filter?.excludeTerms ?? []).join(', '))
    args.setShowFilterEditor(true)
  }, [args])

  const handleSaveFilter = useCallback(() => {
    const includeTerms = args.tempIncludeTerms.split(',').map(t => t.trim()).filter(Boolean)
    const excludeTerms = args.tempExcludeTerms.split(',').map(t => t.trim()).filter(Boolean)
    const newFilter: FeedFilter | undefined = includeTerms.length === 0 && excludeTerms.length === 0 ? undefined : { includeTerms, excludeTerms }
    args.setFeeds(prev => prev.map((feed, i) => i === args.activeFeedIndex ? { ...feed, filter: newFilter } : feed))
    args.setShowFilterEditor(false)
  }, [args])

  const handleClearFilter = useCallback(() => {
    args.setFeeds(prev => prev.map((feed, i) => i === args.activeFeedIndex ? { ...feed, filter: undefined } : feed))
    args.setShowFilterEditor(false)
  }, [args])

  const handleAddCustomFeed = useCallback(() => {
    if (!args.newFeedUrl.trim()) return
    const rawUrl = args.newFeedUrl.trim()
    const url = normalizeUrl(rawUrl)
    let defaultName: string
    const subredditMatch = rawUrl.match(/^r\/(\w+)$/i) || url.match(/reddit\.com\/r\/(\w+)/)
    if (subredditMatch) defaultName = `r/${subredditMatch[1]}`
    else {
      try { defaultName = new URL(url).hostname } catch { defaultName = rawUrl }
    }
    const feed = { url, name: args.newFeedName || defaultName, icon: hostnameEndsWith(url, 'reddit.com') ? '🔴' : '📰' }
    const existingIndex = args.feeds.findIndex(f => f.url === feed.url && !f.isAggregate)
    if (existingIndex === -1) {
      args.setFeeds(prev => [...prev, feed])
      args.setActiveFeedIndex(args.feeds.length)
      args.setIsRefreshing(true)
      args.setError(null)
    } else if (existingIndex !== args.activeFeedIndex) {
      args.setActiveFeedIndex(existingIndex)
      args.setIsRefreshing(true)
      args.setError(null)
    }
    args.setNewFeedUrl('')
    args.setNewFeedName('')
    args.setShowSettings(false)
  }, [args, normalizeUrl])

  const handleSelectFeedFromSettings = useCallback((idx: number) => {
    args.setActiveFeedIndex(idx)
    args.setShowSettings(false)
  }, [args])

  const handleRemoveFeed = useCallback((index: number) => {
    if (args.feeds.length <= 1) return
    args.setFeeds(prev => prev.filter((_, i) => i !== index))
    if (args.activeFeedIndex >= index && args.activeFeedIndex > 0) args.setActiveFeedIndex(prev => prev - 1)
  }, [args])

  const handleEditAggregate = useCallback((index: number) => {
    const feed = args.feeds[index]
    if (!feed?.isAggregate) return
    args.setEditingAggregateIndex(index)
    args.setAggregateName(feed.name)
    args.setSelectedSourceUrls(feed.sourceUrls || [])
    args.setAggregateIncludeTerms((feed.filter?.includeTerms ?? []).join(', '))
    args.setAggregateExcludeTerms((feed.filter?.excludeTerms ?? []).join(', '))
    args.setShowAggregateCreator(true)
  }, [args])

  const handleToggleAggregateCreator = useCallback(() => {
    if (args.showAggregateCreator) {
      args.setShowAggregateCreator(false)
      args.setEditingAggregateIndex(null)
      args.setAggregateName('')
      args.setSelectedSourceUrls([])
      args.setAggregateIncludeTerms('')
      args.setAggregateExcludeTerms('')
    } else {
      args.setShowAggregateCreator(true)
    }
  }, [args])

  const handleSaveAggregate = useCallback(() => {
    if (!args.aggregateName.trim() || args.selectedSourceUrls.length === 0) return
    const includeTerms = args.aggregateIncludeTerms.split(',').map(t => t.trim()).filter(Boolean)
    const excludeTerms = args.aggregateExcludeTerms.split(',').map(t => t.trim()).filter(Boolean)
    const aggregate: FeedConfig = {
      url: args.editingAggregateIndex !== null ? args.feeds[args.editingAggregateIndex].url : `aggregate:${Date.now()}`,
      name: args.aggregateName.trim(),
      icon: '📚',
      isAggregate: true,
      sourceUrls: args.selectedSourceUrls,
      filter: includeTerms.length > 0 || excludeTerms.length > 0 ? { includeTerms, excludeTerms } : undefined,
    }
    if (args.editingAggregateIndex !== null) {
      args.setFeeds(prev => prev.map((f, i) => i === args.editingAggregateIndex ? aggregate : f))
      args.setActiveFeedIndex(args.editingAggregateIndex)
    } else {
      args.setFeeds(prev => [...prev, aggregate])
      args.setActiveFeedIndex(args.feeds.length)
    }
    args.setIsRefreshing(true)
    args.setError(null)
    args.setShowAggregateCreator(false)
    args.setEditingAggregateIndex(null)
    args.setAggregateName('')
    args.setSelectedSourceUrls([])
    args.setAggregateIncludeTerms('')
    args.setAggregateExcludeTerms('')
    args.setShowSettings(false)
  }, [args])

  const handleCancelAggregateEdit = useCallback(() => {
    args.setShowAggregateCreator(false)
    args.setEditingAggregateIndex(null)
    args.setAggregateName('')
    args.setSelectedSourceUrls([])
    args.setAggregateIncludeTerms('')
    args.setAggregateExcludeTerms('')
  }, [args])

  const handleClearFilters = useCallback(() => {
    args.filtersSetSearch('')
    if (args.activeFeed?.filter) {
      args.setFeeds(prev => prev.map((feed, i) => i === args.activeFeedIndex ? { ...feed, filter: undefined } : feed))
    }
  }, [args])

  return {
    handleSelectFeed,
    handleOpenSettings,
    handleToggleFeedSelector,
    handleRefresh,
    handleToggleSettings,
    handlePillSelect,
    handleOpenFilterEditor,
    handleSaveFilter,
    handleClearFilter,
    handleToggleSourceFilter: () => args.setShowSourceFilter(prev => !prev),
    handleCloseSourceFilter: () => args.setShowSourceFilter(false),
    handleAddCustomFeed,
    handleSelectFeedFromSettings,
    handleRemoveFeed,
    handleEditAggregate,
    handleToggleAggregateCreator,
    handleSaveAggregate,
    handleCancelAggregateEdit,
    handleClearFilters,
  }
}

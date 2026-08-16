import { useState } from 'react'
import type { FeedConfig, FeedItem } from './types'
import { getCachedFeed } from './storage'
import { RSS_DEMO_FEEDS } from './demoData'
import { RSS_UI_STRINGS } from './strings'

export function getInitialFeeds(config: { feedUrl?: string; feedName?: string } | undefined, isDemoMode: boolean, loadSavedFeeds: () => FeedConfig[]): FeedConfig[] {
  if (config?.feedUrl) {
    return [{ url: config.feedUrl, name: config.feedName || RSS_UI_STRINGS.defaultFeedName }]
  }
  const savedFeeds = loadSavedFeeds()
  return savedFeeds.length > 0 ? savedFeeds : (isDemoMode ? RSS_DEMO_FEEDS : [])
}

export function useRSSFeedState(config: { feedUrl?: string; feedName?: string } | undefined, isDemoMode: boolean, loadSavedFeeds: () => FeedConfig[]) {
  const initialFeeds = getInitialFeeds(config, isDemoMode, loadSavedFeeds)
  const [feeds, setFeeds] = useState<FeedConfig[]>(() => initialFeeds)
  const [activeFeedIndex, setActiveFeedIndex] = useState(0)
  const [items, setItems] = useState<FeedItem[]>(() => {
    const firstFeed = initialFeeds[0]
    if (!firstFeed) return []
    const cacheKey = firstFeed.isAggregate ? `aggregate:${(firstFeed.sourceUrls ?? []).join(',')}:${firstFeed.name}` : firstFeed.url
    const cached = getCachedFeed(cacheKey, true)
    return cached?.items.length ? cached.items : []
  })
  const [itemsSourceUrl, setItemsSourceUrl] = useState<string | null>(() => {
    const firstFeed = initialFeeds[0]
    if (!firstFeed) return null
    return firstFeed.isAggregate ? `aggregate:${(firstFeed.sourceUrls ?? []).join(',')}:${firstFeed.name}` : firstFeed.url
  })
  const [isLoading, setIsLoading] = useState(() => {
    const firstFeed = initialFeeds[0]
    if (!firstFeed) return true
    const cacheKey = firstFeed.isAggregate ? `aggregate:${(firstFeed.sourceUrls ?? []).join(',')}:${firstFeed.name}` : firstFeed.url
    const cached = getCachedFeed(cacheKey, true)
    return !cached || cached.items.length === 0
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

  return {
    feeds, setFeeds, activeFeedIndex, setActiveFeedIndex, items, setItems, itemsSourceUrl, setItemsSourceUrl,
    isLoading, setIsLoading, isRefreshing, setIsRefreshing, error, setError, showSettings, setShowSettings,
    showFeedSelector, setShowFeedSelector, newFeedUrl, setNewFeedUrl, newFeedName, setNewFeedName,
    lastRefresh, setLastRefresh, fetchSuccess, setFetchSuccess, showFilterEditor, setShowFilterEditor,
    tempIncludeTerms, setTempIncludeTerms, tempExcludeTerms, setTempExcludeTerms, showAggregateCreator,
    setShowAggregateCreator, editingAggregateIndex, setEditingAggregateIndex, aggregateName, setAggregateName,
    selectedSourceUrls, setSelectedSourceUrls, aggregateIncludeTerms, setAggregateIncludeTerms,
    aggregateExcludeTerms, setAggregateExcludeTerms, sourceFilter, setSourceFilter, showSourceFilter, setShowSourceFilter,
  }
}

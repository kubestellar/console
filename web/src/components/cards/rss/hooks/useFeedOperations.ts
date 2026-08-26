import { useCallback } from 'react'
import { hostnameEndsWith } from '../../../../lib/utils/urlHostname'
import type { FeedConfig } from '../types'

interface UseFeedOperationsProps {
  feeds: FeedConfig[]
  activeFeedIndex: number
  setFeeds: React.Dispatch<React.SetStateAction<FeedConfig[]>>
  setActiveFeedIndex: React.Dispatch<React.SetStateAction<number>>
  setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>
  newFeedUrl: string
  newFeedName: string
  setNewFeedUrl: React.Dispatch<React.SetStateAction<string>>
  setNewFeedName: React.Dispatch<React.SetStateAction<string>>
}

export function useFeedOperations({
  feeds,
  activeFeedIndex,
  setFeeds,
  setActiveFeedIndex,
  setIsRefreshing,
  setError,
  setShowSettings,
  newFeedUrl,
  newFeedName,
  setNewFeedUrl,
  setNewFeedName,
}: UseFeedOperationsProps) {
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
  }, [feeds, activeFeedIndex, setFeeds, setActiveFeedIndex, setIsRefreshing, setError, setNewFeedUrl, setNewFeedName, setShowSettings])

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
  }, [newFeedUrl, newFeedName, normalizeUrl, addFeed])

  const handleSelectFeedFromSettings = useCallback((idx: number) => {
    setActiveFeedIndex(idx)
    setShowSettings(false)
  }, [setActiveFeedIndex, setShowSettings])

  const handleRemoveFeed = useCallback((index: number) => {
    if (feeds.length > 1) {
      setFeeds(prev => prev.filter((_, i) => i !== index))
      if (activeFeedIndex >= index && activeFeedIndex > 0) {
        setActiveFeedIndex(prev => prev - 1)
      }
    }
  }, [feeds.length, activeFeedIndex, setFeeds, setActiveFeedIndex])

  return {
    normalizeUrl,
    addFeed,
    handleAddCustomFeed,
    handleSelectFeedFromSettings,
    handleRemoveFeed,
  }
}

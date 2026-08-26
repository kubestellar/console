import { useState, useCallback } from 'react'
import type { FeedConfig } from '../types'

interface UseAggregateFeedProps {
  feeds: FeedConfig[]
  setFeeds: React.Dispatch<React.SetStateAction<FeedConfig[]>>
  setActiveFeedIndex: React.Dispatch<React.SetStateAction<number>>
  setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>
}

export function useAggregateFeed({
  feeds,
  setFeeds,
  setActiveFeedIndex,
  setIsRefreshing,
  setError,
  setShowSettings,
}: UseAggregateFeedProps) {
  const [showAggregateCreator, setShowAggregateCreator] = useState(false)
  const [editingAggregateIndex, setEditingAggregateIndex] = useState<number | null>(null)
  const [aggregateName, setAggregateName] = useState('')
  const [selectedSourceUrls, setSelectedSourceUrls] = useState<string[]>([])
  const [aggregateIncludeTerms, setAggregateIncludeTerms] = useState('')
  const [aggregateExcludeTerms, setAggregateExcludeTerms] = useState('')

  const resetAggregateForm = useCallback(() => {
    setEditingAggregateIndex(null)
    setAggregateName('')
    setSelectedSourceUrls([])
    setAggregateIncludeTerms('')
    setAggregateExcludeTerms('')
  }, [])

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
      resetAggregateForm()
    } else {
      setShowAggregateCreator(true)
    }
  }, [showAggregateCreator, resetAggregateForm])

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
    resetAggregateForm()
    setShowSettings(false)
  }, [
    aggregateName,
    selectedSourceUrls,
    aggregateIncludeTerms,
    aggregateExcludeTerms,
    editingAggregateIndex,
    feeds,
    setFeeds,
    setActiveFeedIndex,
    setIsRefreshing,
    setError,
    setShowSettings,
    resetAggregateForm,
  ])

  const handleCancelAggregateEdit = useCallback(() => {
    setShowAggregateCreator(false)
    resetAggregateForm()
  }, [resetAggregateForm])

  return {
    showAggregateCreator,
    setShowAggregateCreator,
    editingAggregateIndex,
    aggregateName,
    setAggregateName,
    selectedSourceUrls,
    setSelectedSourceUrls,
    aggregateIncludeTerms,
    setAggregateIncludeTerms,
    aggregateExcludeTerms,
    setAggregateExcludeTerms,
    handleEditAggregate,
    handleToggleAggregateCreator,
    handleSaveAggregate,
    handleCancelAggregateEdit,
  }
}

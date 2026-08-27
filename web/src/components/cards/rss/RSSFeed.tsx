// Modal safety: the filter/settings panels here are inline flyouts, not portal
// modals — no backdrop to click. Any form state lives in local React state and
// is only written on explicit save. Treat as closeOnBackdropClick={false}.
import { useEffect, useCallback } from 'react'
import { RefreshCw, Settings, Filter } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useCardData } from '../../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import type { FeedItem, RSSFeedProps } from './types'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { formatTimeAgo } from '../../../lib/formatters'
import { useTranslation } from 'react-i18next'
import { FeedSelector, FeedPills } from './FeedSelector'
import { FeedFilterEditor } from './FeedFilterEditor'
import { FeedSettingsPanel } from './FeedSettingsPanel'
import { FeedItemsList } from './FeedItemsList'
import { SourceFilterDropdown } from './SourceFilterDropdown'
import { useRSSFeedState, buildFeedFilter, SORT_COMPARATORS } from './useRSSFeedState'
import type { SortByOption } from './useRSSFeedState'

function RSSFeedInternal({ config }: RSSFeedProps) {
  const { t } = useTranslation(['cards', 'common'])
  const {
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
    fetchFeed,
    normalizeUrl,
    addFeed,
    activeFeed,
    itemsMatchActiveFeed,
    isRedditFeed,
    setError,
    availableSources,
    preFilteredItems,
  } = useRSSFeedState(config)

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

  // Callbacks
  const handleSelectFeed = useCallback((idx: number) => {
    if (idx !== activeFeedIndex) {
      setActiveFeedIndex(idx)
      setError(null)
    }
    setShowFeedSelector(false)
  }, [activeFeedIndex])

  const handleOpenSettings = useCallback(() => { setShowFeedSelector(false); setShowSettings(true) }, [])

  const handleToggleFeedSelector = useCallback(() => { setShowFeedSelector(prev => !prev) }, [])

  const handleRefresh = useCallback(() => { fetchFeed(true) }, [fetchFeed])

  const handleToggleSettings = useCallback(() => { setShowSettings(prev => !prev) }, [])

  const handlePillSelect = useCallback((idx: number) => {
    if (idx !== activeFeedIndex) {
      setActiveFeedIndex(idx)
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
    const newFilter = buildFeedFilter(tempIncludeTerms, tempExcludeTerms)
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

  const handleCloseFilterEditor = useCallback(() => { setShowFilterEditor(false) }, [])

  const handleToggleSourceFilter = useCallback(() => { setShowSourceFilter(prev => !prev) }, [])

  const handleCloseSourceFilter = useCallback(() => { setShowSourceFilter(false) }, [])

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
      addFeed({ url, name: newFeedName || defaultName, icon: url.includes('reddit.com') ? '🔴' : '📰' })
    }
  }, [newFeedUrl, newFeedName, normalizeUrl, addFeed])

  const handleSelectFeedFromSettings = useCallback((idx: number) => { setActiveFeedIndex(idx); setShowSettings(false) }, [])

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
    const aggregateFilter = buildFeedFilter(aggregateIncludeTerms, aggregateExcludeTerms)
    const aggregate = {
      url: editingAggregateIndex !== null
        ? feeds[editingAggregateIndex].url
        : `aggregate:${Date.now()}`,
      name: aggregateName.trim(),
      icon: '📚',
      isAggregate: true as const,
      sourceUrls: selectedSourceUrls,
      filter: aggregateFilter,
    }
    if (editingAggregateIndex !== null) {
      setFeeds(prev => prev.map((f, i) => i === editingAggregateIndex ? aggregate : f))
      setActiveFeedIndex(editingAggregateIndex)
    } else {
      setFeeds(prev => [...prev, aggregate])
      setActiveFeedIndex(feeds.length)
    }
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

  const handleClearFilters = useCallback(() => {
    filters.setSearch('')
    if (activeFeed?.filter) {
      setFeeds(prev => prev.map((feed, i) =>
        i === activeFeedIndex ? { ...feed, filter: undefined } : feed
      ))
    }
  }, [filters, activeFeed?.filter, activeFeedIndex])

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

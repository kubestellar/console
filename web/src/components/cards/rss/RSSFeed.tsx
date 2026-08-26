// Modal safety: the filter/settings panels here are inline flyouts, not portal
// modals — no backdrop to click. Any form state lives in local React state and
// is only written on explicit save. Treat as closeOnBackdropClick={false}.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Settings, Filter } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import type { FeedItem, FeedConfig, RSSFeedProps } from './types'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { formatTimeAgo } from '../../../lib/formatters'
import { useTranslation } from 'react-i18next'
import { hostnameEndsWith } from '../../../lib/utils/urlHostname'
import { FeedSelector, FeedPills } from './FeedSelector'
import { FeedFilterEditor } from './FeedFilterEditor'
import { FeedSettingsPanel } from './FeedSettingsPanel'
import { FeedItemsList } from './FeedItemsList'
import { SourceFilterDropdown } from './SourceFilterDropdown'
import { FeedStatusBar } from './FeedStatusBar'
import { FeedLoadingSkeleton } from './FeedLoadingSkeleton'
import { useRSSFeedManagement } from './hooks/useRSSFeedManagement'
import { useFeedOperations } from './hooks/useFeedOperations'
import { useAggregateFeed } from './hooks/useAggregateFeed'

type SortByOption = 'date' | 'title'

const SORT_COMPARATORS: Record<SortByOption, (a: FeedItem, b: FeedItem) => number> = {
  date: (a, b) => {
    const aTime = a.pubDate?.getTime() || 0
    const bTime = b.pubDate?.getTime() || 0
    return aTime - bTime
  },
  title: commonComparators.string<FeedItem>('title'),
}

function RSSFeedInternal({ config }: RSSFeedProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { isDemoMode } = useDemoMode()

  const {
    feeds,
    setFeeds,
    activeFeedIndex,
    setActiveFeedIndex,
    items,
    isLoading,
    isRefreshing,
    setIsRefreshing,
    error,
    setError,
    lastRefresh,
    fetchSuccess,
    activeFeed,
    itemsMatchActiveFeed,
    handleRefresh,
  } = useRSSFeedManagement({ isDemoMode, config })

  const [showSettings, setShowSettings] = useState(false)
  const [showFeedSelector, setShowFeedSelector] = useState(false)
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [newFeedName, setNewFeedName] = useState('')
  const [showFilterEditor, setShowFilterEditor] = useState(false)
  const [tempIncludeTerms, setTempIncludeTerms] = useState('')
  const [tempExcludeTerms, setTempExcludeTerms] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string[]>([])
  const [showSourceFilter, setShowSourceFilter] = useState(false)

  const {
    showAggregateCreator,
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
  } = useAggregateFeed({
    feeds,
    setFeeds,
    setActiveFeedIndex,
    setIsRefreshing,
    setError,
    setShowSettings,
  })

  const { addFeed, handleAddCustomFeed, handleSelectFeedFromSettings, handleRemoveFeed } = useFeedOperations({
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
  })

  const hasData = items.length > 0
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isDemoMode })

  // Close overlay panels on Escape key
  useEffect(() => {
    const hasOpenOverlay = showSettings || showFeedSelector || showFilterEditor || showSourceFilter || showAggregateCreator
    if (!hasOpenOverlay) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showAggregateCreator) handleToggleAggregateCreator()
        else if (showFilterEditor) setShowFilterEditor(false)
        else if (showSourceFilter) setShowSourceFilter(false)
        else if (showFeedSelector) setShowFeedSelector(false)
        else if (showSettings) setShowSettings(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, showFeedSelector, showFilterEditor, showSourceFilter, showAggregateCreator, handleToggleAggregateCreator])

  // Reset source filter when feed changes
  useEffect(() => {
    setSourceFilter([])
    setShowSourceFilter(false)
  }, [activeFeedIndex])

  // Unique sources from items (for aggregate feed source filter)
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

  // Pre-filter: apply RSS-specific source filter and include/exclude filters
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
    containerStyle,
  } = useCardData<FeedItem, SortByOption>(preFilteredItems, {
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

  const handleSelectFeed = useCallback((idx: number) => {
    if (idx !== activeFeedIndex) {
      setActiveFeedIndex(idx)
      setError(null)
    }
    setShowFeedSelector(false)
  }, [activeFeedIndex, setActiveFeedIndex, setError])

  const handleOpenSettings = useCallback(() => {
    setShowFeedSelector(false)
    setShowSettings(true)
  }, [])

  const handleToggleFeedSelector = useCallback(() => {
    setShowFeedSelector(prev => !prev)
  }, [])

  const handleToggleSettings = useCallback(() => {
    setShowSettings(prev => !prev)
  }, [])

  const handlePillSelect = useCallback((idx: number) => {
    if (idx !== activeFeedIndex) {
      setActiveFeedIndex(idx)
      setIsRefreshing(true)
      setError(null)
    }
  }, [activeFeedIndex, setActiveFeedIndex, setIsRefreshing, setError])

  const handleOpenFilterEditor = useCallback(() => {
    const filter = activeFeed?.filter
    setTempIncludeTerms((filter?.includeTerms ?? []).join(', '))
    setTempExcludeTerms((filter?.excludeTerms ?? []).join(', '))
    setShowFilterEditor(true)
  }, [activeFeed?.filter])

  const handleSaveFilter = useCallback(() => {
    const includeTerms = tempIncludeTerms.split(',').map(s => s.trim()).filter(s => s)
    const excludeTerms = tempExcludeTerms.split(',').map(s => s.trim()).filter(s => s)
    const newFilter = (includeTerms.length === 0 && excludeTerms.length === 0)
      ? undefined
      : { includeTerms, excludeTerms }
    setFeeds(prev => prev.map((feed, i) => i === activeFeedIndex ? { ...feed, filter: newFilter } : feed))
    setShowFilterEditor(false)
  }, [tempIncludeTerms, tempExcludeTerms, activeFeedIndex, setFeeds])

  const handleClearFilter = useCallback(() => {
    setFeeds(prev => prev.map((feed, i) => i === activeFeedIndex ? { ...feed, filter: undefined } : feed))
    setShowFilterEditor(false)
  }, [activeFeedIndex, setFeeds])

  const handleClearFilters = useCallback(() => {
    filters.setSearch('')
    if (activeFeed?.filter) {
      setFeeds(prev => prev.map((feed, i) => i === activeFeedIndex ? { ...feed, filter: undefined } : feed))
    }
  }, [filters, activeFeed?.filter, activeFeedIndex, setFeeds])

  const isRedditFeed = activeFeed?.url ? hostnameEndsWith(activeFeed.url, 'reddit.com') : false
  const showFullSkeleton = isLoading && items.length === 0 && !feeds.length
  const showListSkeleton = (isLoading && items.length === 0) || (isRefreshing && !itemsMatchActiveFeed)

  if (showFullSkeleton) {
    return <FeedLoadingSkeleton />
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
            onClick={() => handleRefresh(t)}
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
              onSortDirectionChange: sorting.setSortDirection,
            }}
          />
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
          {activeFeed?.isAggregate && availableSources.length > 1 && (
            <SourceFilterDropdown
              availableSources={availableSources}
              sourceFilter={sourceFilter}
              showSourceFilter={showSourceFilter}
              onToggle={() => setShowSourceFilter(prev => !prev)}
              onSetFilter={setSourceFilter}
              onClose={() => setShowSourceFilter(false)}
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
          onClose={() => setShowFilterEditor(false)}
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
        <FeedStatusBar
          isLoading={isLoading}
          isRefreshing={isRefreshing}
          error={error}
          fetchSuccess={fetchSuccess}
          activeFeed={activeFeed}
          search={filters.search}
          feedFilter={activeFeed?.filter}
          totalItems={totalItems}
          itemsCount={items.length}
          onRefresh={() => handleRefresh(t)}
        />
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

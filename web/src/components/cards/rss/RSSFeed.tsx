// Modal safety: the filter/settings panels here are inline flyouts, not portal
// modals — no backdrop to click. Any form state lives in local React state and
// is only written on explicit save. Treat as closeOnBackdropClick={false}.
import { useMemo } from 'react'
import { RefreshCw, Settings, Filter } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import type { FeedItem, RSSFeedProps } from './types'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { formatTimeAgo } from '../../../lib/formatters'
import { useTranslation } from 'react-i18next'
import { hostnameEndsWith } from '../../../lib/utils/urlHostname'
import { FeedSelector, FeedPills } from './FeedSelector'
import { FeedFilterEditor } from './FeedFilterEditor'
import { FeedSettingsPanel } from './FeedSettingsPanel'
import { FeedItemsList } from './FeedItemsList'
import { SourceFilterDropdown } from './SourceFilterDropdown'
import { useRSSFeed } from './useRSSFeed'

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

  const {
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
  } = useRSSFeed({ config })

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

  const handleClearFilters = () => {
    filters.setSearch('')
    if (activeFeed?.filter) {
      handleClearFilter()
    }
  }

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
              onSortDirectionChange: sorting.setSortDirection,
            }}
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

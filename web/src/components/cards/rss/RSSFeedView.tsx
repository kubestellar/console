import { Filter, RefreshCw, Settings } from 'lucide-react'
import { useCardLoadingState } from '../CardDataContext'
import { CardControlsRow, CardPaginationFooter, CardSearchInput } from '../../../lib/cards/CardComponents'
import { cn } from '../../../lib/cn'
import { formatTimeAgo } from '../../../lib/formatters'
import { FeedFilterEditor } from './FeedFilterEditor'
import { FeedItemsList } from './FeedItemsList'
import { FeedPills, FeedSelector } from './FeedSelector'
import { FeedSettingsPanel } from './FeedSettingsPanel'
import { SourceFilterDropdown } from './SourceFilterDropdown'
import { useRSSFeedState } from './useRSSFeedState'
import type { RSSFeedProps } from './types'

export function RSSFeedView(props: RSSFeedProps & { t: (key: string) => string }) {
  const state = useRSSFeedState(props)
  const {
    t,
    isDemoMode,
    activeFeed,
    activeFeedIndex,
    aggregateExcludeTerms,
    aggregateIncludeTerms,
    aggregateName,
    availableSources,
    cardData,
    editingAggregateIndex,
    error,
    fetchSuccess,
    feeds,
    handleAddCustomFeed,
    handleCancelAggregateEdit,
    handleClearFilter,
    handleClearFilters,
    handleCloseFilterEditor,
    handleCloseSourceFilter,
    handleEditAggregate,
    handleOpenFilterEditor,
    handleOpenSettings,
    handlePillSelect,
    handleRefresh,
    handleRemoveFeed,
    handleSaveAggregate,
    handleSaveFilter,
    handleSelectFeed,
    handleSelectFeedFromSettings,
    handleToggleAggregateCreator,
    handleToggleFeedSelector,
    handleToggleSettings,
    handleToggleSourceFilter,
    isLoading,
    isRedditFeed,
    isRefreshing,
    items,
    lastRefresh,
    newFeedName,
    newFeedUrl,
    selectedSourceUrls,
    showAggregateCreator,
    showFeedSelector,
    showFilterEditor,
    showFullSkeleton,
    showListSkeleton,
    showSettings,
    showSourceFilter,
    sourceFilter,
    tempExcludeTerms,
    tempIncludeTerms,
    setAggregateExcludeTerms,
    setAggregateIncludeTerms,
    setAggregateName,
    setNewFeedName,
    setNewFeedUrl,
    setSelectedSourceUrls,
    setTempExcludeTerms,
    setTempIncludeTerms,
    setShowSourceFilter,
    setSourceFilter,
    addFeed,
  } = state

  const { containerRef, containerStyle, currentPage, filters, goToPage, items: paginatedItems, itemsPerPage, needsPagination, setItemsPerPage, sorting, totalItems, totalPages } = cardData

  useCardLoadingState({
    isLoading: isLoading && !state.hasData,
    isRefreshing,
    hasAnyData: state.hasData,
    isDemoData: isDemoMode,
  })

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
              showSettings ? 'bg-primary/20 text-primary' : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground',
            )}
            title={t('common:navigation.settings')}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-2 shrink-0">
        <CardSearchInput value={filters.search} onChange={filters.setSearch} placeholder={t('cards:rssFeed.searchItems')} />
      </div>

      <FeedPills feeds={feeds} activeFeedIndex={activeFeedIndex} onSelectFeed={handlePillSelect} />

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
              onSortChange: value => sorting.setSortBy(value as 'date' | 'title'),
              sortDirection: sorting.sortDirection,
              onSortDirectionChange: sorting.setSortDirection,
            }}
          />
          <button
            onClick={handleOpenFilterEditor}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 text-2xs rounded border transition-colors',
              activeFeed?.filter ? 'bg-purple-500/20 border-purple-500/30 text-purple-400' : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground',
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
              onToggle={handleToggleSourceFilter}
              onSetFilter={state.setSourceFilter}
              onClose={handleCloseSourceFilter}
            />
          )}
        </div>
      </div>

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

      <div className="h-5 mb-1 shrink-0 flex items-center">
        {(isLoading || isRefreshing) && !error ? (
          <span className="text-2xs text-muted-foreground/60 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Loading {activeFeed?.name || 'feed'}...
          </span>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2 w-full px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded text-2xs text-yellow-400">
            <span className="truncate">⚠ {error === 'Failed to fetch' || error.includes('failed') ? `Could not load ${activeFeed?.name || 'feed'}` : error}</span>
            <button onClick={handleRefresh} className="shrink-0 px-1.5 py-0.5 bg-yellow-500/20 hover:bg-yellow-500/30 rounded text-yellow-300 transition-colors">
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

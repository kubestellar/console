import { useState, useMemo, useImperativeHandle, type Ref } from 'react'
import { Settings, AlertCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { useDemoMode } from '../../hooks/useDemoMode'
import { cn } from '../../lib/cn'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import type { SortDirection } from '../../lib/cards/cardHooks'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { usePipelineFilter } from './pipelines/PipelineFilterContext'
import { RepoSubtitle } from './pipelines/RepoSubtitle'

import type { GitHubPR, GitHubIssue, GitHubRelease, GitHubContributor, GitHubActivityConfig, ViewMode, SortByOption, GitHubItem, GitHubItemUnknown } from './GitHubActivity.types'
import { PRItem, IssueItem, ReleaseItem, ContributorItem } from './GitHubActivityItems'
import { useGitHubActivity, useGitHubRepoSelection } from './GitHubActivity.hooks'
import {
  SORT_OPTIONS,
  SORT_COMPARATORS,
  githubSearchPredicate,
  buildPreFilteredItems,
  applyOpenFirstOrder,
  computeGitHubActivityStats,
  type TimeRange,
} from './GitHubActivity.sorting'
import {
  GitHubActivitySkeleton,
  GitHubRepoEditor,
  GitHubStatsPlaceholder,
  GitHubStatsGrid,
  GitHubViewModeTabs,
  GitHubTimeRangeControls,
} from './github-activity/GitHubActivityParts'

// Expose refresh method for CardWrapper
export interface GitHubActivityRef {
  refresh: () => void
}

export function GitHubActivity({ config, ref }: { config?: GitHubActivityConfig; ref?: Ref<GitHubActivityRef> }) {
  const { t } = useTranslation(['cards', 'common'])
  const [viewMode, setViewMode] = useState<ViewMode>('prs')
  const [timeRange, setTimeRange] = useState<TimeRange>(config?.timeRange || '30d')

  // Shared pipeline filter (if on /ci-cd inside PipelineFilterProvider).
  const shared = usePipelineFilter()

  const {
    savedRepos,
    currentRepo,
    repoInput,
    setRepoInput,
    isEditingRepos,
    setIsEditingRepos,
    handleSelectRepo,
    handleAddRepo,
    handleRemoveRepo } = useGitHubRepoSelection()

  // Use shared filter repo if available, otherwise per-card selection
  const effectiveRepo = shared?.repoFilter || currentRepo
  const effectiveConfig = { ...config, repos: [effectiveRepo] }

  const {
    prs,
    issues,
    releases,
    contributors,
    repoInfo,
    isLoading,
    isRefreshing,
    error,
    isDemoData,
    refetch } = useGitHubActivity(effectiveConfig)
  const { isDemoMode } = useDemoMode()

  const hasData = !!repoInfo
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: isDemoMode || isDemoData })

  // Expose refresh method via ref for CardWrapper refresh button
  useImperativeHandle(ref, () => ({
    refresh: () => refetch()
  }), [refetch])

  // Pre-filter data by viewMode and timeRange before passing to useCardData
  const preFilteredData = useMemo(
    () => buildPreFilteredItems(viewMode, timeRange, { prs, issues, releases, contributors }),
    [viewMode, prs, issues, releases, contributors, timeRange]
  )

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: rawPaginatedItems,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: searchQuery,
      setSearch: setSearchQuery },
    sorting,
    containerRef,
    containerStyle } = useCardData<GitHubItem, SortByOption>(preFilteredData, {
    filter: {
      searchFields: [] as (keyof GitHubItem)[],
      customPredicate: githubSearchPredicate,
      storageKey: 'github-activity' },
    sort: {
      defaultField: 'date',
      defaultDirection: 'desc' as SortDirection,
      comparators: SORT_COMPARATORS },
    defaultLimit: 10 })

  const paginatedItems = applyOpenFirstOrder(rawPaginatedItems, viewMode)

  const stats = computeGitHubActivityStats(prs, issues, contributors, repoInfo)

  if (isLoading && !repoInfo) {
    return <GitHubActivitySkeleton />
  }

  if (error) {
    return (
      <div className="h-full flex flex-col content-loaded">
        {/* Header with inline repo editor */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
          <StatusBadge color="red" variant="outline" rounded="full">
            {t('common:common.error')}
          </StatusBadge>
          <button
            onClick={() => setIsEditingRepos(!isEditingRepos)}
            className={cn(
              "text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1",
              isEditingRepos && "text-purple-400"
            )}
            title={t('cards:github.configureRepo')}
          >
            <RepoSubtitle repo={currentRepo} />
            <Settings className="w-3 h-3" />
          </button>
        </div>

        {isEditingRepos && (
          <GitHubRepoEditor
            variant="error"
            savedRepos={savedRepos}
            currentRepo={currentRepo}
            repoInput={repoInput}
            setRepoInput={setRepoInput}
            onAddRepo={handleAddRepo}
            onSelectRepo={handleSelectRepo}
            onRemoveRepo={handleRemoveRepo}
            onDone={() => setIsEditingRepos(false)}
            t={t}
          />
        )}

        <GitHubStatsPlaceholder t={t} />

        {/* Prominent error message */}
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 rounded-lg bg-red-500/5 border border-red-500/20">
          <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
          <p className="text-sm text-foreground mb-2">{t('cards:github.fetchError')}</p>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs">{error}</p>
          <Button
            variant="primary"
            size="lg"
            onClick={refetch}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {t('common:common.retry')}
          </Button>
          <p className="mt-4 text-xs text-muted-foreground/70 max-w-xs">
            {t('cards:github.configureToken')}
          </p>
        </div>
      </div>
    )
  }

  const effectivePerPage = itemsPerPage === 'unlimited' ? 1000 : itemsPerPage

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Row 1: Header with repo selector and controls - inline CRUD style */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t('common:common.itemCount', { count: totalItems, item: viewMode })}
          </span>
          <button
            onClick={() => setIsEditingRepos(!isEditingRepos)}
            className={cn(
              "text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1",
              isEditingRepos && "text-purple-400"
            )}
            title={t('cards:github.configureRepo')}
          >
            <RepoSubtitle repo={repoInfo?.full_name || currentRepo} />
            <Settings className="w-3 h-3" />
          </button>
        </div>
        <CardControlsRow
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection }}
        />
      </div>

      {isEditingRepos && (
        <GitHubRepoEditor
          savedRepos={savedRepos}
          currentRepo={currentRepo}
          repoInput={repoInput}
          setRepoInput={setRepoInput}
          onAddRepo={handleAddRepo}
          onSelectRepo={handleSelectRepo}
          onRemoveRepo={handleRemoveRepo}
          onDone={() => setIsEditingRepos(false)}
          t={t}
        />
      )}

      {/* Row 2: Search input */}
      <CardSearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={`Search ${viewMode}...`}
        className="mb-2 shrink-0"
      />

      <GitHubViewModeTabs viewMode={viewMode} setViewMode={setViewMode} t={t} />

      <GitHubStatsGrid stats={stats} t={t} />

      <GitHubTimeRangeControls timeRange={timeRange} setTimeRange={setTimeRange} t={t} />

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2 scrollbar-thin min-h-0" style={containerStyle}>
        {paginatedItems.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No {viewMode} found{searchQuery ? ' matching search' : ' for this time range'}
          </div>
        ) : (
          paginatedItems.map((item) => {
            const itemUnknown = item as unknown as GitHubItemUnknown
            if (viewMode === 'prs') {
              return <PRItem key={itemUnknown.number as number} pr={item as GitHubPR} />
            } else if (viewMode === 'issues') {
              return <IssueItem key={itemUnknown.number as number} issue={item as GitHubIssue} />
            } else if (viewMode === 'releases') {
              return <ReleaseItem key={itemUnknown.id as number} release={item as GitHubRelease} />
            } else if (viewMode === 'contributors') {
              return <ContributorItem key={itemUnknown.login as string} contributor={item as GitHubContributor} />
            }
            return null
          })
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={effectivePerPage}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}

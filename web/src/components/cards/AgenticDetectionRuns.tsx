import { AlertTriangle, CheckCircle, XCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { useAgenticDetectionRuns, type DetectionRun } from '../../hooks/useAgenticDetectionRuns'
import { CardSearchInput, useCardData } from '../../lib/cards'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { validateExternalUrl } from '../../lib/validateExternalUrl'

const ITEMS_PER_PAGE = 10

type SortByOption = 'conclusion' | 'reason' | 'commentedAt'

interface AgenticDetectionRunsProps {
  config?: Record<string, unknown>
}

const SORT_OPTIONS: Array<{ value: SortByOption; label: string }> = [
  { value: 'commentedAt', label: 'Recent' },
  { value: 'conclusion', label: 'Conclusion' },
  { value: 'reason', label: 'Reason' },
]

const CONCLUSION_ORDER: Record<string, number> = {
  failure: 0,
  warning: 1,
  success: 2,
}

function getConclusionIcon(conclusion: string) {
  switch (conclusion) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-400" />
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-400" />
    case 'failure':
      return <XCircle className="h-4 w-4 text-red-400" />
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />
  }
}

function getConclusionColor(conclusion: string): string {
  switch (conclusion) {
    case 'success':
      return 'text-green-400'
    case 'warning':
      return 'text-yellow-400'
    case 'failure':
      return 'text-red-400'
    default:
      return 'text-muted-foreground'
  }
}

function formatReason(reason: string): string {
  return reason
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatTimeAgo(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export function AgenticDetectionRuns({ config: _config }: AgenticDetectionRunsProps) {
  const { t } = useTranslation(['cards', 'common'])
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useAgenticDetectionRuns()
  const { runs, issueUrl, totalCount } = data
  const hasData = (runs || []).length > 0

  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    isDemoData: isDemoFallback,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  const {
    items,
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
  } = useCardData<DetectionRun, SortByOption>(runs || [], {
    filter: {
      searchFields: ['conclusion', 'reason'] as Array<keyof DetectionRun>,
      storageKey: 'agentic-detection-runs',
    },
    sort: {
      defaultField: 'commentedAt',
      defaultDirection: 'desc',
      comparators: {
        commentedAt: (a, b) => new Date(a.commentedAt).getTime() - new Date(b.commentedAt).getTime(),
        conclusion: (a, b) => (CONCLUSION_ORDER[a.conclusion] ?? 999) - (CONCLUSION_ORDER[b.conclusion] ?? 999),
        reason: (a, b) => a.reason.localeCompare(b.reason),
      },
    },
    defaultLimit: ITEMS_PER_PAGE,
  })

  if (!hasData && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <CheckCircle className="h-12 w-12 text-green-400 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">
          {t('cards:agenticDetectionRuns.noDetections')}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {t('cards:agenticDetectionRuns.noDetectionsDesc')}
        </p>
        {issueUrl && validateExternalUrl(issueUrl) && (
          <a
            href={validateExternalUrl(issueUrl)!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            {t('cards:agenticDetectionRuns.viewIssue')}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-card">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t('cards:agenticDetectionRuns.viewAllIssue')}</span>
          <span>•</span>
          <span>{totalCount} total</span>
          {filters.search && (
            <>
              <span>•</span>
              <span>{totalItems} filtered</span>
            </>
          )}
        </div>
        <CardControls
          limit={itemsPerPage}
          onLimitChange={setItemsPerPage}
          sortBy={sorting.sortBy}
          sortOptions={SORT_OPTIONS}
          onSortChange={(value) => sorting.setSortBy(value as SortByOption)}
          sortDirection={sorting.sortDirection}
          onSortDirectionChange={sorting.setSortDirection}
        />
      </div>

      <CardSearchInput
        value={filters.search}
        onChange={filters.setSearch}
        placeholder={t('cards:agenticDetectionRuns.searchPlaceholder')}
        className="mb-2"
      />

      <div ref={containerRef} className="flex-1 overflow-auto space-y-2" style={containerStyle}>
        {items.map((run: DetectionRun, idx: number) => (
          <div
            key={`${run.runId}-${idx}`}
            className="p-3 rounded-md border border-border hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="mt-0.5">{getConclusionIcon(run.conclusion)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('font-medium text-sm', getConclusionColor(run.conclusion))}>
                      {run.conclusion.toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground">{formatReason(run.reason)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatTimeAgo(run.commentedAt)}</div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {run.workflowUrl && validateExternalUrl(run.workflowUrl) && (
                  <a
                    href={validateExternalUrl(run.workflowUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {t('cards:agenticDetectionRuns.viewRun')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {needsPagination && itemsPerPage !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : ITEMS_PER_PAGE}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}

      {issueUrl && validateExternalUrl(issueUrl) && (
        <div className="mt-3 pt-3 border-t border-border">
          <a
            href={validateExternalUrl(issueUrl)!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1.5"
          >
            {t('cards:agenticDetectionRuns.viewAllIssue')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  )
}

import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FeedConfig } from './types'

interface FeedStatusBarProps {
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  fetchSuccess: string | null
  activeFeed: FeedConfig | undefined
  search: string
  feedFilter: FeedConfig['filter']
  totalItems: number
  itemsCount: number
  onRefresh: () => void
}

export function FeedStatusBar({
  isLoading,
  isRefreshing,
  error,
  fetchSuccess,
  activeFeed,
  search,
  feedFilter,
  totalItems,
  itemsCount,
  onRefresh,
}: FeedStatusBarProps) {
  const { t } = useTranslation(['common'])

  if ((isLoading || isRefreshing) && !error) {
    return (
      <span className="text-2xs text-muted-foreground/60 flex items-center gap-1">
        <RefreshCw className="w-3 h-3 animate-spin" />
        Loading {activeFeed?.name || 'feed'}...
      </span>
    )
  }

  if (error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2 w-full px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded text-2xs text-yellow-400">
        <span className="truncate">
          ⚠ {error === 'Failed to fetch' || error.includes('failed')
            ? `Could not load ${activeFeed?.name || 'feed'}`
            : error}
        </span>
        <button
          onClick={onRefresh}
          className="shrink-0 px-1.5 py-0.5 bg-yellow-500/20 hover:bg-yellow-500/30 rounded text-yellow-300 transition-colors"
        >
          {t('common:common.retry')}
        </button>
      </div>
    )
  }

  if (fetchSuccess) {
    return <span className="text-2xs text-muted-foreground/60">✓ {fetchSuccess}</span>
  }

  if (search || feedFilter) {
    return (
      <span className="text-2xs text-muted-foreground">
        {totalItems} of {itemsCount} items
        {search && ` matching "${search}"`}
        {feedFilter && ' (filtered)'}
      </span>
    )
  }

  return null
}

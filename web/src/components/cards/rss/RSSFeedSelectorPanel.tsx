import { RefreshCw, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { formatTimeAgo } from '../../../lib/formatters'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { FeedSelector, FeedPills } from './FeedSelector'
import type { FeedConfig } from './types'

interface RSSFeedSelectorPanelProps {
  feeds: FeedConfig[]
  activeFeedIndex: number
  showFeedSelector: boolean
  totalItems: number
  filtersSearch: string
  onSearchChange: (value: string) => void
  onToggleSelector: () => void
  onSelectFeed: (idx: number) => void
  onOpenSettings: () => void
  onPillSelect: (idx: number) => void
  onRefresh: () => void
  onToggleSettings: () => void
  isRefreshing: boolean
  showSettings: boolean
  lastRefresh: Date | null
}

export function RSSFeedSelectorPanel({
  feeds,
  activeFeedIndex,
  showFeedSelector,
  totalItems,
  filtersSearch,
  onSearchChange,
  onToggleSelector,
  onSelectFeed,
  onOpenSettings,
  onPillSelect,
  onRefresh,
  onToggleSettings,
  isRefreshing,
  showSettings,
  lastRefresh,
}: RSSFeedSelectorPanelProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <FeedSelector
          feeds={feeds}
          activeFeedIndex={activeFeedIndex}
          showFeedSelector={showFeedSelector}
          totalItems={totalItems}
          onToggleSelector={onToggleSelector}
          onSelectFeed={onSelectFeed}
          onOpenSettings={onOpenSettings}
        />

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title={lastRefresh ? `Refresh (last: ${formatTimeAgo(lastRefresh, { compact: true, extended: true })})` : t('common:common.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </button>
          <button
            onClick={onToggleSettings}
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

      <div className="flex flex-col gap-2 mb-2 shrink-0">
        <CardSearchInput
          value={filtersSearch}
          onChange={onSearchChange}
          placeholder={t('cards:rssFeed.searchItems')}
        />
      </div>

      <FeedPills
        feeds={feeds}
        activeFeedIndex={activeFeedIndex}
        onSelectFeed={onPillSelect}
      />
    </>
  )
}

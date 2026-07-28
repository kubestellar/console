import { RefreshCw, Settings } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { formatTimeAgo } from '../../../lib/formatters'
import { FeedSelector } from './FeedSelector'
import type { FeedConfig } from './types'

interface RSSFeedSelectorPanelProps {
  feeds: FeedConfig[]
  activeFeedIndex: number
  showFeedSelector: boolean
  totalItems: number
  isRefreshing: boolean
  showSettings: boolean
  lastRefresh: Date | null
  refreshLabel: string
  settingsLabel: string
  onToggleSelector: () => void
  onSelectFeed: (idx: number) => void
  onOpenSettings: () => void
  onRefresh: () => void
  onToggleSettings: () => void
}

export function RSSFeedSelectorPanel({
  feeds,
  activeFeedIndex,
  showFeedSelector,
  totalItems,
  isRefreshing,
  showSettings,
  lastRefresh,
  refreshLabel,
  settingsLabel,
  onToggleSelector,
  onSelectFeed,
  onOpenSettings,
  onRefresh,
  onToggleSettings,
}: RSSFeedSelectorPanelProps) {
  return (
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
          title={lastRefresh ? `Refresh (last: ${formatTimeAgo(lastRefresh, { compact: true, extended: true })})` : refreshLabel}
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
          title={settingsLabel}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

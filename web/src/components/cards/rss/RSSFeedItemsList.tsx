import { Rss } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { RSS_DEMO_ACTIVE_FEED, RSS_DEMO_ITEMS } from './demoData'
import type { FeedItem, FeedConfig } from './types'
import { RSSFeedItemRow } from './RSSFeedItemRow'

interface RSSFeedItemsListProps {
  paginatedItems?: FeedItem[]
  totalItems?: number
  showListSkeleton?: boolean
  activeFeed?: FeedConfig
  isRedditFeed?: boolean
  hasSearchOrFilter?: boolean
  onClearFilters?: () => void
}

export function RSSFeedItemsList({
  paginatedItems = RSS_DEMO_ITEMS,
  totalItems = RSS_DEMO_ITEMS.length,
  showListSkeleton = false,
  activeFeed = RSS_DEMO_ACTIVE_FEED,
  isRedditFeed = false,
  hasSearchOrFilter = false,
  onClearFilters = () => {},
}: RSSFeedItemsListProps) {
  const { t } = useTranslation(['cards', 'common'])

  if (showListSkeleton) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="p-3 rounded-lg bg-secondary/20 border border-border/50">
            <div className="h-4 w-3/4 bg-secondary/50 rounded mb-2" />
            <div className="h-3 w-1/2 bg-secondary/30 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (totalItems === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Rss className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-sm">{hasSearchOrFilter ? t('cards:rssFeed.noMatchingItems') : t('cards:rssFeed.noItemsInFeed')}</span>
        {hasSearchOrFilter && (
          <button
            onClick={onClearFilters}
            className="mt-2 text-xs text-primary hover:underline"
          >
            {t('common:common.clearFilters')}
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      {paginatedItems.map((item) => (
        <RSSFeedItemRow
          key={item.id}
          item={item}
          activeFeed={activeFeed}
          isRedditFeed={isRedditFeed}
        />
      ))}
    </>
  )
}

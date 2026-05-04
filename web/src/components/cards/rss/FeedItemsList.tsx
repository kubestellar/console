import { memo } from 'react'
import { Rss, ExternalLink, Clock, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { normalizeRedditLink } from './RSSParser'
import { formatTimeAgo } from '../../../lib/formatters'
import { RSS_DEMO_ACTIVE_FEED, RSS_DEMO_ITEMS } from './demoData'
import { RSS_UI_STRINGS } from './strings'
import type { FeedItem, FeedConfig } from './types'

interface FeedItemsListProps {
  paginatedItems?: FeedItem[]
  totalItems?: number
  showListSkeleton?: boolean
  activeFeed?: FeedConfig
  isRedditFeed?: boolean
  hasSearchOrFilter?: boolean
  onClearFilters?: () => void
}

export const FeedItemsList = memo(function FeedItemsList({
  paginatedItems = RSS_DEMO_ITEMS,
  totalItems = RSS_DEMO_ITEMS.length,
  showListSkeleton = false,
  activeFeed = RSS_DEMO_ACTIVE_FEED,
  isRedditFeed = false,
  hasSearchOrFilter = false,
  onClearFilters = () => {},
}: FeedItemsListProps) {
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
        <a
          key={item.id}
          href={normalizeRedditLink(item.link)}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 border border-border/50 transition-colors group"
        >
          <div className="flex gap-3">
            {/* Thumbnail for Reddit posts */}
            {item.thumbnail && item.thumbnail.startsWith('http') && (
              <img
                src={item.thumbnail}
                alt={item.title || RSS_UI_STRINGS.feedThumbnailAlt}
                className="w-16 h-16 object-cover rounded shrink-0"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}

            <div className="flex-1 min-w-0">
              {/* Title */}
              <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                {item.title}
              </h3>

              {/* Meta info */}
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                {/* Feed icon */}
                <span
                  className="cursor-default text-base leading-none"
                  title={activeFeed.isAggregate ? (item.sourceName || RSS_UI_STRINGS.unknownSource) : (activeFeed.name || RSS_UI_STRINGS.feedFallbackName)}
                >
                  {activeFeed.isAggregate ? (item.sourceIcon || '📰') : (activeFeed.icon || '📰')}
                </span>

                {/* Reddit score */}
                {item.score !== undefined && (
                  <span className="flex items-center gap-0.5 text-orange-400">
                    <ArrowUp className="w-3 h-3" />
                    {item.score}
                  </span>
                )}

                {/* Subreddit */}
                {item.subreddit && (
                  <span className="text-blue-400">r/{item.subreddit}</span>
                )}

                {/* Author */}
                {item.author && !isRedditFeed && (
                  <span>{item.author}</span>
                )}

                {/* Time */}
                {item.pubDate && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {formatTimeAgo(item.pubDate, { compact: true, extended: true })}
                  </span>
                )}

                {/* External link indicator */}
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
              </div>

              {/* Description preview */}
              {item.description && (
                <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                  {item.description}
                </p>
              )}
            </div>
          </div>
        </a>
      ))}
    </>
  )
})

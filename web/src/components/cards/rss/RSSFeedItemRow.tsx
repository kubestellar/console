import { ArrowUp, Clock, ExternalLink } from 'lucide-react'
import { normalizeRedditLink } from './RSSParser'
import { formatTimeAgo } from '../../../lib/formatters'
import type { FeedItem, FeedConfig } from './types'
import { RSS_UI_STRINGS } from './strings'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'

interface RSSFeedItemRowProps {
  item: FeedItem
  activeFeed: FeedConfig
  isRedditFeed: boolean
}

export function RSSFeedItemRow({ item, activeFeed, isRedditFeed }: RSSFeedItemRowProps) {
  return (
    <a
      key={item.id}
      href={sanitizeUrl(normalizeRedditLink(item.link))}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 border border-border/50 transition-colors group"
    >
      <div className="flex gap-3">
        {item.thumbnail && item.thumbnail.startsWith('http') && (
          <img
            src={item.thumbnail}
            alt={item.title || 'Feed item thumbnail'}
            className="w-16 h-16 object-cover rounded shrink-0"
            loading="lazy"
            width={64}
            height={64}
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
            {item.title}
          </h3>

          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
            <span
              className="cursor-default text-base leading-none"
              title={activeFeed.isAggregate ? (item.sourceName || RSS_UI_STRINGS.unknownSource) : (activeFeed.name || RSS_UI_STRINGS.feedFallbackName)}
            >
              {activeFeed.isAggregate ? (item.sourceIcon || '📰') : (activeFeed.icon || '📰')}
            </span>

            {item.score !== undefined && (
              <span className="flex items-center gap-0.5 text-orange-400">
                <ArrowUp className="w-3 h-3" />
                {item.score}
              </span>
            )}

            {item.subreddit && (
              <span className="text-blue-400">r/{item.subreddit}</span>
            )}

            {item.author && !isRedditFeed && (
              <span>{item.author}</span>
            )}

            {item.pubDate && (
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {formatTimeAgo(item.pubDate, { compact: true, extended: true })}
              </span>
            )}

            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
          </div>

          {item.description && (
            <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
              {item.description}
            </p>
          )}
        </div>
      </div>
    </a>
  )
}

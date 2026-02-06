export interface FeedItem {
  id: string
  title: string
  link: string
  description?: string
  pubDate?: Date
  author?: string
  thumbnail?: string
  comments?: string
  score?: number // For Reddit
  subreddit?: string // For Reddit
  // Source feed info (for aggregate feeds)
  sourceUrl?: string
  sourceName?: string
  sourceIcon?: string
}

export interface FeedFilter {
  includeTerms: string[] // Show items matching ANY of these (OR)
  excludeTerms: string[] // Hide items matching ANY of these (AND)
}

export interface FeedConfig {
  url: string
  name: string
  icon?: string
  filter?: FeedFilter // Optional filter for this feed
  // For aggregate feeds
  isAggregate?: boolean // True if this is a custom aggregate feed
  sourceUrls?: string[] // URLs of source feeds to aggregate
}

export type SortOption = 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc'

// CORS proxies to fetch RSS feeds (needed for browser security)
// We try multiple proxies in case one is down or rate-limited
export interface CorsProxy {
  url: string
  type: 'json-contents' | 'json-rss2json' | 'raw'
}

export interface RSSFeedProps {
  config?: {
    feedUrl?: string
    feedName?: string
  }
}

// Raw RSS item from external API (rss2json)
export interface RSSItemRaw {
  guid?: string
  link?: string
  title?: string
  description?: string
  content?: string
  pubDate?: string
  author?: string
  thumbnail?: string
  enclosure?: {
    thumbnail?: string
    link?: string
  }
}

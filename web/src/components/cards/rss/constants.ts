import type { FeedConfig, CorsProxy } from './types'

// Storage keys
export const FEEDS_STORAGE_KEY = 'rss_feed_configs'
export const CACHE_KEY_PREFIX = 'rss_feed_cache_'
export const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Popular feed presets organized by category.
// Each entry carries an explicit `category` field so the UI can group presets
// without URL substring checks (which CodeQL flags as js/incomplete-url-substring-sanitization, #9119).
export const PRESET_FEEDS: FeedConfig[] = [
  // Aggregators & Tech News
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', icon: '📰', category: 'tech-news' },
  { name: 'Lobsters', url: 'https://lobste.rs/rss', icon: '🦞', category: 'tech-news' },
  { name: 'Slashdot', url: 'https://rss.slashdot.org/Slashdot/slashdotMain', icon: '📡', category: 'tech-news' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', icon: '📱', category: 'tech-news' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', icon: '🔮', category: 'tech-news' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', icon: '🔬', category: 'tech-news' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', icon: '⚡', category: 'tech-news' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', icon: '🎮', category: 'tech-news' },
  { name: 'Gizmodo', url: 'https://gizmodo.com/feed', icon: '🤖', category: 'tech-news' },

  // Reddit - Technology & Programming
  { name: 'r/technology', url: 'https://www.reddit.com/r/technology.rss', icon: '💻', category: 'reddit' },
  { name: 'r/programming', url: 'https://www.reddit.com/r/programming.rss', icon: '👨‍💻', category: 'reddit' },
  { name: 'r/kubernetes', url: 'https://www.reddit.com/r/kubernetes.rss', icon: '☸️', category: 'reddit' },
  { name: 'r/devops', url: 'https://www.reddit.com/r/devops.rss', icon: '🔧', category: 'reddit' },
  { name: 'r/sysadmin', url: 'https://www.reddit.com/r/sysadmin.rss', icon: '🖥️', category: 'reddit' },
  { name: 'r/golang', url: 'https://www.reddit.com/r/golang.rss', icon: '🐹', category: 'reddit' },
  { name: 'r/python', url: 'https://www.reddit.com/r/python.rss', icon: '🐍', category: 'reddit' },
  { name: 'r/rust', url: 'https://www.reddit.com/r/rust.rss', icon: '🦀', category: 'reddit' },
  { name: 'r/javascript', url: 'https://www.reddit.com/r/javascript.rss', icon: '🟨', category: 'reddit' },
  { name: 'r/typescript', url: 'https://www.reddit.com/r/typescript.rss', icon: '🔷', category: 'reddit' },
  { name: 'r/reactjs', url: 'https://www.reddit.com/r/reactjs.rss', icon: '⚛️', category: 'reddit' },
  { name: 'r/linux', url: 'https://www.reddit.com/r/linux.rss', icon: '🐧', category: 'reddit' },
  { name: 'r/selfhosted', url: 'https://www.reddit.com/r/selfhosted.rss', icon: '🏠', category: 'reddit' },
  { name: 'r/homelab', url: 'https://www.reddit.com/r/homelab.rss', icon: '🔬', category: 'reddit' },
  { name: 'r/docker', url: 'https://www.reddit.com/r/docker.rss', icon: '🐳', category: 'reddit' },
  { name: 'r/aws', url: 'https://www.reddit.com/r/aws.rss', icon: '☁️', category: 'reddit' },

  // Reddit - General Interest
  { name: 'r/science', url: 'https://www.reddit.com/r/science.rss', icon: '🔭', category: 'reddit' },
  { name: 'r/space', url: 'https://www.reddit.com/r/space.rss', icon: '🚀', category: 'reddit' },
  { name: 'r/worldnews', url: 'https://www.reddit.com/r/worldnews.rss', icon: '🌍', category: 'reddit' },
  { name: 'r/news', url: 'https://www.reddit.com/r/news.rss', icon: '📰', category: 'reddit' },
  { name: 'r/movies', url: 'https://www.reddit.com/r/movies.rss', icon: '🎬', category: 'reddit' },
  { name: 'r/gaming', url: 'https://www.reddit.com/r/gaming.rss', icon: '🎮', category: 'reddit' },
  { name: 'r/todayilearned', url: 'https://www.reddit.com/r/todayilearned.rss', icon: '💡', category: 'reddit' },

  // Cloud Native & Kubernetes
  { name: 'CNCF Blog', url: 'https://www.cncf.io/blog/feed/', icon: '🌐', category: 'cloud-native' },
  { name: 'Kubernetes Blog', url: 'https://kubernetes.io/feed.xml', icon: '☸️', category: 'cloud-native' },
  { name: 'Docker Blog', url: 'https://www.docker.com/blog/feed/', icon: '🐳', category: 'cloud-native' },
  { name: 'HashiCorp Blog', url: 'https://www.hashicorp.com/blog/feed.xml', icon: '🔐', category: 'cloud-native' },
  { name: 'Istio Blog', url: 'https://istio.io/latest/blog/feed.xml', icon: '🕸️', category: 'cloud-native' },
  { name: 'Prometheus Blog', url: 'https://prometheus.io/blog/feed.xml', icon: '📊', category: 'cloud-native' },

  // Developer Blogs (tech-news category)
  { name: 'Netflix Tech Blog', url: 'https://netflixtechblog.com/feed', icon: '🎬', category: 'tech-news' },
  { name: 'Cloudflare Blog', url: 'https://blog.cloudflare.com/rss/', icon: '☁️', category: 'tech-news' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/', icon: '🐙', category: 'tech-news' },
  { name: 'InfoQ', url: 'https://www.infoq.com/feed', icon: '📚', category: 'tech-news' },
  { name: 'Dev.to', url: 'https://dev.to/feed', icon: '👩‍💻', category: 'tech-news' },
  { name: 'CSS Tricks', url: 'https://css-tricks.com/feed/', icon: '🎨', category: 'tech-news' },
  { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', icon: '💥', category: 'tech-news' },

  // News & World
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', icon: '📺', category: 'news' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', icon: '📻', category: 'news' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', icon: '📰', category: 'news' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', icon: '🌍', category: 'news' },
]

// CORS proxies to fetch RSS feeds (needed for browser security)
// We try multiple proxies in case one is down or rate-limited
export const CORS_PROXIES: CorsProxy[] = [
  // allorigins /raw endpoint first - most reliable, no rate limits
  { url: 'https://api.allorigins.win/raw?url=', type: 'raw' },
  // rss2json - good for thumbnails but has rate limits
  { url: 'https://api.rss2json.com/v1/api.json?rss_url=', type: 'json-rss2json' },
  // allorigins /get endpoint (JSON wrapped, sometimes base64)
  { url: 'https://api.allorigins.win/get?url=', type: 'json-contents' },
  // corsproxy.io as last resort
  { url: 'https://corsproxy.io/?', type: 'raw' },
]

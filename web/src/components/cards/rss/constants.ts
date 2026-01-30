import type { FeedConfig, CorsProxy } from './types'

// Storage keys
export const FEEDS_KEY = 'rss_feed_configs'
export const CACHE_KEY_PREFIX = 'rss_feed_cache_'
export const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Popular feed presets organized by category
export const PRESET_FEEDS: FeedConfig[] = [
  // Aggregators & Tech News
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', icon: '📰' },
  { name: 'Lobsters', url: 'https://lobste.rs/rss', icon: '🦞' },
  { name: 'Slashdot', url: 'https://rss.slashdot.org/Slashdot/slashdotMain', icon: '📡' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', icon: '📱' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', icon: '🔮' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', icon: '🔬' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', icon: '⚡' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', icon: '🎮' },
  { name: 'Gizmodo', url: 'https://gizmodo.com/feed', icon: '🤖' },

  // Reddit - Technology & Programming
  { name: 'r/technology', url: 'https://www.reddit.com/r/technology.rss', icon: '💻' },
  { name: 'r/programming', url: 'https://www.reddit.com/r/programming.rss', icon: '👨‍💻' },
  { name: 'r/kubernetes', url: 'https://www.reddit.com/r/kubernetes.rss', icon: '☸️' },
  { name: 'r/devops', url: 'https://www.reddit.com/r/devops.rss', icon: '🔧' },
  { name: 'r/sysadmin', url: 'https://www.reddit.com/r/sysadmin.rss', icon: '🖥️' },
  { name: 'r/golang', url: 'https://www.reddit.com/r/golang.rss', icon: '🐹' },
  { name: 'r/python', url: 'https://www.reddit.com/r/python.rss', icon: '🐍' },
  { name: 'r/rust', url: 'https://www.reddit.com/r/rust.rss', icon: '🦀' },
  { name: 'r/javascript', url: 'https://www.reddit.com/r/javascript.rss', icon: '🟨' },
  { name: 'r/typescript', url: 'https://www.reddit.com/r/typescript.rss', icon: '🔷' },
  { name: 'r/reactjs', url: 'https://www.reddit.com/r/reactjs.rss', icon: '⚛️' },
  { name: 'r/linux', url: 'https://www.reddit.com/r/linux.rss', icon: '🐧' },
  { name: 'r/selfhosted', url: 'https://www.reddit.com/r/selfhosted.rss', icon: '🏠' },
  { name: 'r/homelab', url: 'https://www.reddit.com/r/homelab.rss', icon: '🔬' },
  { name: 'r/docker', url: 'https://www.reddit.com/r/docker.rss', icon: '🐳' },
  { name: 'r/aws', url: 'https://www.reddit.com/r/aws.rss', icon: '☁️' },

  // Reddit - General Interest
  { name: 'r/science', url: 'https://www.reddit.com/r/science.rss', icon: '🔭' },
  { name: 'r/space', url: 'https://www.reddit.com/r/space.rss', icon: '🚀' },
  { name: 'r/worldnews', url: 'https://www.reddit.com/r/worldnews.rss', icon: '🌍' },
  { name: 'r/news', url: 'https://www.reddit.com/r/news.rss', icon: '📰' },
  { name: 'r/movies', url: 'https://www.reddit.com/r/movies.rss', icon: '🎬' },
  { name: 'r/gaming', url: 'https://www.reddit.com/r/gaming.rss', icon: '🎮' },
  { name: 'r/todayilearned', url: 'https://www.reddit.com/r/todayilearned.rss', icon: '💡' },

  // Cloud Native & Kubernetes
  { name: 'CNCF Blog', url: 'https://www.cncf.io/blog/feed/', icon: '🌐' },
  { name: 'Kubernetes Blog', url: 'https://kubernetes.io/feed.xml', icon: '☸️' },
  { name: 'Docker Blog', url: 'https://www.docker.com/blog/feed/', icon: '🐳' },
  { name: 'HashiCorp Blog', url: 'https://www.hashicorp.com/blog/feed.xml', icon: '🔐' },
  { name: 'Istio Blog', url: 'https://istio.io/latest/blog/feed.xml', icon: '🕸️' },
  { name: 'Prometheus Blog', url: 'https://prometheus.io/blog/feed.xml', icon: '📊' },

  // Developer Blogs
  { name: 'Netflix Tech Blog', url: 'https://netflixtechblog.com/feed', icon: '🎬' },
  { name: 'Cloudflare Blog', url: 'https://blog.cloudflare.com/rss/', icon: '☁️' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/', icon: '🐙' },
  { name: 'InfoQ', url: 'https://www.infoq.com/feed', icon: '📚' },
  { name: 'Dev.to', url: 'https://dev.to/feed', icon: '👩‍💻' },
  { name: 'CSS Tricks', url: 'https://css-tricks.com/feed/', icon: '🎨' },
  { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', icon: '💥' },

  // News & World
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', icon: '📺' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', icon: '📻' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', icon: '📰' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', icon: '🌍' },
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

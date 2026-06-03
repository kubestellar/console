import type { FeedConfig, CorsProxy } from './types'
import { MS_PER_MINUTE } from '../../../lib/constants/time'

// Storage keys
export const FEEDS_STORAGE_KEY = 'rss_feed_configs'
export const CACHE_KEY_PREFIX = 'rss_feed_cache_'
export const CACHE_TTL_MS = 5 * MS_PER_MINUTE // 5 minutes

/**
 * Validate a feed URL before proxying. Rejects non-HTTPS schemes,
 * private/reserved IP ranges, and URLs with embedded credentials.
 * Prevents SSRF via public CORS proxies (CWE-918).
 */
export function validateFeedUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  // Only allow https (and http for localhost dev feeds)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, error: 'Only HTTP/HTTPS feeds are allowed' }
  }

  // Block embedded credentials
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with embedded credentials are not allowed' }
  }

  // Block private/reserved IP ranges
  const hostname = parsed.hostname.toLowerCase()
  if (isPrivateHost(hostname)) {
    return { valid: false, error: 'URLs pointing to private/internal networks are not allowed' }
  }

  return { valid: true }
}

/** Check if a hostname resolves to a private/reserved address range. */
function isPrivateHost(hostname: string): boolean {
  // IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    if (a === 10) return true                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true   // 172.16.0.0/12
    if (a === 192 && b === 168) return true             // 192.168.0.0/16
    if (a === 127) return true                         // 127.0.0.0/8
    if (a === 169 && b === 254) return true             // 169.254.0.0/16 (link-local)
    if (a === 0) return true                           // 0.0.0.0/8
  }

  // IPv6 loopback and private
  if (hostname === '[::1]' || hostname === '[::ffff:127.0.0.1]') return true
  if (hostname.startsWith('[fc') || hostname.startsWith('[fd')) return true // fc00::/7
  if (hostname.startsWith('[fe80:')) return true // link-local

  // Common private hostnames
  if (hostname === 'localhost') return true
  if (hostname.endsWith('.local')) return true
  if (hostname.endsWith('.internal')) return true

  return false
}

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

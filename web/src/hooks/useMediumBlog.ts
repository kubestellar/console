import { useState, useEffect } from 'react'

export interface BlogPost {
  title: string
  link: string
  published: string
  preview: string
}

interface BlogResponse {
  posts: BlogPost[]
  feedUrl: string
  channelUrl: string
}

const CACHE_KEY = 'ks-medium-blog-cache'
/** Cache TTL — 1 hour */
const CACHE_TTL_MS = 60 * 60 * 1000
/** Fetch timeout for Medium blog API call (10 seconds) */
const BLOG_FETCH_TIMEOUT_MS = 10_000
/** Local relative endpoint — Go backend / Netlify Function */
const LOCAL_BLOG_ENDPOINT = '/api/medium/blog'
/** Public fallback used when the local endpoint is unreachable
 *  (e.g. Vite dev server with no Go backend, or a self-hosted install
 *  whose backend hasn't been started yet). The endpoint is public and
 *  CORS-enabled. */
const PUBLIC_BLOG_FALLBACK_URL = 'https://console.kubestellar.io/api/medium/blog'

interface CacheEntry {
  posts: BlogPost[]
  channelUrl: string
  timestamp: number
}

function isValidCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== 'object' || value === null) return false

  const entry = value as Record<string, unknown>

  return (
    Number.isFinite(entry.timestamp) &&
    Array.isArray(entry.posts) &&
    typeof entry.channelUrl === 'string'
  )
}

function readCache(): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry: unknown = JSON.parse(raw)
    if (!isValidCacheEntry(entry)) return null
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null
    return entry
  } catch {
    return null
  }
}

function writeCache(posts: BlogPost[], channelUrl: string): void {
  try {
    const entry: CacheEntry = { posts, channelUrl, timestamp: Date.now() }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // sessionStorage not available — ignore
  }
}

/**
 * Fetches the latest blog posts from the KubeStellar Medium publication.
 * Uses the backend proxy (/api/medium/blog) to avoid CORS issues.
 * Results are cached in sessionStorage for 1 hour.
 */
export function useMediumBlog() {
  // Read the cache synchronously during initial render via lazy useState
  // initializers. This avoids calling setState inside the effect for the
  // cache-hit path (react-hooks/set-state-in-effect).
  //
  // #6220: previously each useState initializer called readCache() — three
  // round-trips through sessionStorage.getItem + JSON.parse on every mount,
  // and a tiny race window if the cache changed between calls. Read once
  // into a useRef-like stable holder that all three lazy initializers
  // capture from the same closure.
  const [initialCache] = useState<CacheEntry | null>(() => readCache())
  const [posts, setPosts] = useState<BlogPost[]>(() => initialCache?.posts ?? [])
  const [channelUrl, setChannelUrl] = useState<string>(
    () => initialCache?.channelUrl ?? 'https://medium.com/@kubestellar'
  )
  const [loading, setLoading] = useState(() => initialCache === null)

  useEffect(() => {
    // If we already populated state from a fresh cache entry, nothing to do.
    if (readCache() !== null) return

    let cancelled = false

    async function fetchFrom(url: string): Promise<BlogResponse> {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(BLOG_FETCH_TIMEOUT_MS),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      return resp.json()
    }

    async function fetchBlog() {
      let data: BlogResponse | null = null
      try {
        data = await fetchFrom(LOCAL_BLOG_ENDPOINT)
      } catch {
        // Local endpoint unreachable (no backend / Vite-only dev / self-hosted
        // without the Go server). Fall back to the public production endpoint
        // so the blog section still renders.
        try {
          data = await fetchFrom(PUBLIC_BLOG_FALLBACK_URL)
        } catch {
          // Both failed — silently leave the section empty.
        }
      }
      if (cancelled) return
      if (data) {
        setPosts(data.posts || [])
        setChannelUrl(data.channelUrl)
        writeCache(data.posts || [], data.channelUrl)
      }
      setLoading(false)
    }

    fetchBlog()
    return () => { cancelled = true }
  }, [])

  return { posts, channelUrl, loading }
}

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
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [channelUrl, setChannelUrl] = useState('https://medium.com/@kubestellar')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setPosts(cached.posts)
      setChannelUrl(cached.channelUrl)
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchBlog() {
      try {
        const resp = await fetch('/api/medium/blog', {
          signal: AbortSignal.timeout(BLOG_FETCH_TIMEOUT_MS),
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data: BlogResponse = await resp.json()
        if (cancelled) return
        setPosts(data.posts || [])
        setChannelUrl(data.channelUrl)
        writeCache(data.posts || [], data.channelUrl)
      } catch {
        // Silently fail — the blog section just won't render
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchBlog()
    return () => { cancelled = true }
  }, [])

  return { posts, channelUrl, loading }
}

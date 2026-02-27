import { useState, useEffect, useCallback, useRef } from 'react'

export interface KBMissionEntry {
  path: string
  title: string
  description: string
  category: string
  tags: string[]
  cncfProjects: string[]
  targetResourceKinds: string[]
  difficulty: string
  issueTypes: string[]
  type: string
}

export interface KBIndex {
  version: number
  generatedAt: string
  count: number
  missions: KBMissionEntry[]
}

const CACHE_KEY = 'kc_kb_index'
const CACHE_TTL = 60 * 60 * 1000 // 1 hour
const FETCH_DELAY = 10_000 // 10 seconds after mount
const RAW_URL = 'https://raw.githubusercontent.com/kubestellar/console-kb/master/solutions/index.json'

interface CachedIndex {
  data: KBIndex
  cachedAt: number
  etag?: string
}

function getCachedIndex(): KBIndex | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached: CachedIndex = JSON.parse(raw)
    if (Date.now() - cached.cachedAt < CACHE_TTL) {
      return cached.data
    }
    return null // expired
  } catch {
    return null
  }
}

function setCachedIndex(data: KBIndex, etag?: string) {
  try {
    const cached: CachedIndex = { data, cachedAt: Date.now(), etag }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // localStorage might be full, ignore
  }
}

function getCachedEtag(): string | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return undefined
    return JSON.parse(raw).etag
  } catch {
    return undefined
  }
}

export function useConsoleKBIndex() {
  const [missions, setMissions] = useState<KBMissionEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const fetchedRef = useRef(false)

  const fetchIndex = useCallback(async () => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    // Stage 1: try cache first (instant, no network)
    const cached = getCachedIndex()
    if (cached) {
      if (mountedRef.current) {
        setMissions(cached.missions)
      }
      return // cache is warm and fresh, done
    }

    // Stage 2: fetch from GitHub CDN
    if (mountedRef.current) setIsLoading(true)
    try {
      const headers: HeadersInit = {}
      const etag = getCachedEtag()
      if (etag) headers['If-None-Match'] = etag

      const res = await fetch(RAW_URL, { headers })

      if (res.status === 304) {
        // Not modified, refresh cache TTL
        const oldRaw = localStorage.getItem(CACHE_KEY)
        if (oldRaw) {
          const old = JSON.parse(oldRaw)
          old.cachedAt = Date.now()
          localStorage.setItem(CACHE_KEY, JSON.stringify(old))
          if (mountedRef.current) setMissions(old.data.missions)
        }
        return
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data: KBIndex = await res.json()
      const newEtag = res.headers.get('etag') || undefined
      setCachedIndex(data, newEtag)

      if (mountedRef.current) {
        setMissions(data.missions)
        setError(null)
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to fetch KB index')
        // Fall back to expired cache if available
        try {
          const raw = localStorage.getItem(CACHE_KEY)
          if (raw) {
            const old: CachedIndex = JSON.parse(raw)
            setMissions(old.data.missions)
          }
        } catch {
          /* ignore */
        }
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    fetchedRef.current = false
    localStorage.removeItem(CACHE_KEY)
    fetchIndex()
  }, [fetchIndex])

  useEffect(() => {
    mountedRef.current = true

    // Deferred: wait 10s after mount, then use idle callback
    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        ;(window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(() => fetchIndex(), { timeout: 5000 })
      } else {
        fetchIndex()
      }
    }, FETCH_DELAY)

    return () => {
      mountedRef.current = false
      clearTimeout(timer)
    }
  }, [fetchIndex])

  return { missions, isLoading, error, refresh }
}

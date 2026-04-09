import { useState, useEffect } from 'react'

export interface PlaylistVideo {
  id: string
  title: string
  description?: string
  published?: string
}

interface PlaylistResponse {
  videos: PlaylistVideo[]
  playlistId: string
  playlistUrl: string
}

const CACHE_KEY = 'ks-playlist-cache'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
/** Fetch timeout for playlist API call (10 seconds) */
const PLAYLIST_FETCH_TIMEOUT_MS = 10_000

interface CacheEntry {
  videos: PlaylistVideo[]
  playlistUrl: string
  timestamp: number
}

function readCache(): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null
    return entry
  } catch {
    return null
  }
}

function writeCache(videos: PlaylistVideo[], playlistUrl: string): void {
  try {
    const entry: CacheEntry = { videos, playlistUrl, timestamp: Date.now() }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // sessionStorage not available — ignore
  }
}

/**
 * Fetches videos from the KubeStellar Console YouTube playlist.
 * Uses the backend proxy (/api/youtube/playlist) to avoid CORS issues.
 * Results are cached in sessionStorage for 1 hour.
 */
export function usePlaylistVideos() {
  const [videos, setVideos] = useState<PlaylistVideo[]>([])
  const [playlistUrl, setPlaylistUrl] = useState(
    'https://www.youtube.com/playlist?list=PL1ALKGr_qZKc-xehA_8iUCdiKsCo6p6nD'
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setVideos(cached.videos)
      setPlaylistUrl(cached.playlistUrl)
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchPlaylist() {
      try {
        const resp = await fetch('/api/youtube/playlist', {
          signal: AbortSignal.timeout(PLAYLIST_FETCH_TIMEOUT_MS),
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data: PlaylistResponse = await resp.json()
        if (cancelled) return
        setVideos(data.videos || [])
        setPlaylistUrl(data.playlistUrl)
        writeCache(data.videos || [], data.playlistUrl)
      } catch {
        // Silently fail — the UI shows "Coming soon" when videos is empty
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPlaylist()
    return () => { cancelled = true }
  }, [])

  return { videos, playlistUrl, loading }
}

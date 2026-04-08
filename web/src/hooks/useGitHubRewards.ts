/**
 * Hook for fetching GitHub-sourced reward data.
 * Queries the backend which proxies GitHub Search API for the logged-in user's
 * issues and PRs across configured orgs, computes points on the fly.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { BACKEND_DEFAULT_URL } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import type { GitHubRewardsResponse } from '../types/rewards'

/** Prefix for per-user localStorage cache keys */
const CACHE_KEY_PREFIX = 'github-rewards-cache'
/** Legacy cache key (pre-per-user). Cleared on first load to prevent stale data. */
const LEGACY_CACHE_KEY = 'github-rewards-cache'
/** How long client-side cached rewards data is considered fresh (15 minutes) */
const CLIENT_CACHE_TTL_MS = 15 * 60 * 1000
/** Interval between automatic background refreshes (10 minutes) */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000

/** Returns a per-user localStorage cache key */
function userCacheKey(login: string): string {
  return `${CACHE_KEY_PREFIX}:${login}`
}

interface CachedRewardsEntry {
  data: GitHubRewardsResponse
  /** Timestamp (ms) when the entry was stored in localStorage */
  storedAt: number
}

/**
 * Load cached rewards from localStorage for a specific user.
 * Returns null if the cache is missing, corrupt, or expired.
 */
function loadCache(login: string): GitHubRewardsResponse | null {
  try {
    // Clean up legacy global cache key (not per-user, caused cross-user leaks)
    localStorage.removeItem(LEGACY_CACHE_KEY)

    const raw = localStorage.getItem(userCacheKey(login))
    if (!raw) return null

    const entry = JSON.parse(raw) as CachedRewardsEntry

    // Validate shape — old format stored GitHubRewardsResponse directly
    if (!entry.storedAt || !entry.data) {
      localStorage.removeItem(userCacheKey(login))
      return null
    }

    // Check TTL — discard stale cache
    const ageMs = Date.now() - entry.storedAt
    if (ageMs > CLIENT_CACHE_TTL_MS) {
      localStorage.removeItem(userCacheKey(login))
      return null
    }

    return entry.data
  } catch {
    return null
  }
}

/** Save rewards data to per-user localStorage cache with a timestamp. */
function saveCache(login: string, data: GitHubRewardsResponse): void {
  try {
    const entry: CachedRewardsEntry = { data, storedAt: Date.now() }
    localStorage.setItem(userCacheKey(login), JSON.stringify(entry))
  } catch {
    // quota exceeded — ignore
  }
}

export function useGitHubRewards() {
  const { user, isAuthenticated } = useAuth()
  const [data, setData] = useState<GitHubRewardsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDemoUser = !user || user.github_login === 'demo-user'
  const githubLogin = user?.github_login ?? ''

  // Track the login so we can detect user switches and avoid stale closures
  const loginRef = useRef(githubLogin)
  loginRef.current = githubLogin

  // Load per-user cache when the user changes
  useEffect(() => {
    if (isDemoUser || !githubLogin) {
      setData(null)
      return
    }
    const cached = loadCache(githubLogin)
    if (cached) {
      setData(cached)
    } else {
      // No valid cache — clear any stale data from a previous user
      setData(null)
    }
  }, [githubLogin, isDemoUser])

  const fetchRewards = useCallback(async () => {
    if (!isAuthenticated || isDemoUser || !githubLogin) return

    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (!token) return

    setIsLoading(true)
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || BACKEND_DEFAULT_URL
      // Pass login as query param for Netlify Function compatibility (no JWT
      // validation on serverless). The Go backend ignores this param and reads
      // the login from the JWT instead — no security impact either way since
      // reward data is computed from public GitHub activity.
      const res = await fetch(`${apiBase}/api/rewards/github?login=${encodeURIComponent(githubLogin)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
      // before the outer try/catch processes the rejection (microtask timing issue).
      const result = await res.json().catch(() => null) as GitHubRewardsResponse | null
      if (!result) throw new Error('Invalid JSON response')

      // Guard against stale response arriving after user switched accounts
      if (loginRef.current !== githubLogin) return

      setData(result)
      saveCache(githubLogin, result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      // On failure, clear data if the cache has also expired (prevents
      // indefinite stale display). If cache is still valid, keep showing it.
      const cached = loadCache(githubLogin)
      if (!cached) {
        setData(null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, isDemoUser, githubLogin])

  // Fetch on mount and refresh periodically
  useEffect(() => {
    if (!isAuthenticated || isDemoUser || !githubLogin) return

    fetchRewards()
    const interval = setInterval(fetchRewards, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchRewards, isAuthenticated, isDemoUser, githubLogin])

  return {
    githubRewards: data,
    githubPoints: data?.total_points ?? 0,
    isLoading,
    error,
    refresh: fetchRewards,
  }
}

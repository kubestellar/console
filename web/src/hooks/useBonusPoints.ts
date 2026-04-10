/**
 * Hook for fetching bonus point awards from [bonus] issues.
 * Queries /api/rewards/bonus?login=X which scans GitHub issues
 * created by clubanderson with the bonus-points label.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { BACKEND_DEFAULT_URL } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

/** Client-side cache TTL (15 minutes) */
const CACHE_TTL_MS = 15 * 60 * 1000
const CACHE_KEY_PREFIX = 'bonus-points-cache'

interface BonusEntry {
  issue_number: number
  points: number
  reason: string
  created_at: string
  state: string
}

export interface BonusPointsResponse {
  login: string
  total_bonus_points: number
  entries: BonusEntry[]
}

function loadCache(login: string): BonusPointsResponse | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}:${login}`)
    if (!raw) return null
    const entry = JSON.parse(raw) as { data: BonusPointsResponse; storedAt: number }
    if (!entry.storedAt || !entry.data) return null
    if (Date.now() - entry.storedAt > CACHE_TTL_MS) return null
    return entry.data
  } catch {
    return null
  }
}

function saveCache(login: string, data: BonusPointsResponse): void {
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}:${login}`, JSON.stringify({ data, storedAt: Date.now() }))
  } catch {
    // quota exceeded
  }
}

export function useBonusPoints() {
  const { user, isAuthenticated } = useAuth()
  const [data, setData] = useState<BonusPointsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isDemoUser = !user || user.github_login === 'demo-user'
  const githubLogin = user?.github_login ?? ''
  const loginRef = useRef(githubLogin)
  loginRef.current = githubLogin

  // Load cache on user change
  useEffect(() => {
    if (isDemoUser || !githubLogin) {
      setData(null)
      return
    }
    const cached = loadCache(githubLogin)
    if (cached) setData(cached)
  }, [githubLogin, isDemoUser])

  // Issue #6011 removed the module-level `bonusEndpointUnavailable` flag:
  // the Go backend now persists bonus points alongside coins via
  // `/api/rewards/me`, and the legacy `/api/rewards/bonus?login=` route
  // still exists as a Netlify function in production. If either call fails
  // we simply fall through to the cached value rather than permanently
  // disabling the fetcher for the tab.
  const fetchBonus = useCallback(async () => {
    if (!isAuthenticated || isDemoUser || !githubLogin) return

    setIsLoading(true)
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || BACKEND_DEFAULT_URL
      const res = await fetch(`${apiBase}/api/rewards/bonus?login=${encodeURIComponent(githubLogin)}`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (res.status === 404) {
        // Route unavailable on this backend (e.g. dev Go server without the
        // scraping endpoint). Bonus points default to zero — this is not an
        // error path because the user's persistent bonus balance lives on
        // the backend `/api/rewards/me` row which is read by `useRewards`.
        if (loginRef.current === githubLogin) {
          setData({ login: githubLogin, total_bonus_points: 0, entries: [] })
        }
        return
      }
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const result = await res.json().catch(() => null) as BonusPointsResponse | null
      if (!result) throw new Error('Invalid JSON')

      if (loginRef.current !== githubLogin) return

      setData(result)
      saveCache(githubLogin, result)
    } catch {
      // Bonus points are optional — fail silently
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, isDemoUser, githubLogin])

  // Fetch on mount and when user changes
  useEffect(() => {
    fetchBonus()
  }, [fetchBonus])

  return {
    bonusPoints: data?.total_bonus_points ?? 0,
    bonusEntries: data?.entries ?? [],
    isBonusLoading: isLoading,
    refreshBonus: fetchBonus,
  }
}

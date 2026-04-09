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

  const fetchBonus = useCallback(async () => {
    if (!isAuthenticated || isDemoUser || !githubLogin) return

    setIsLoading(true)
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || BACKEND_DEFAULT_URL
      const res = await fetch(`${apiBase}/api/rewards/bonus?login=${encodeURIComponent(githubLogin)}`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
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

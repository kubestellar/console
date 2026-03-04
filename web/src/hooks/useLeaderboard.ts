/**
 * Hooks for fetching leaderboard and contributor detail data.
 */

import { useState, useEffect, useCallback } from 'react'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { BACKEND_DEFAULT_URL } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import type { LeaderboardResponse, LeaderboardEntry, ContributorStats } from '../types/rewards'

const LEADERBOARD_CACHE_KEY = 'leaderboard-cache'
const CONTRIBUTOR_CACHE_PREFIX = 'contributor-detail-'
const DEFAULT_LEADERBOARD_LIMIT = 5

function loadLeaderboardCache(): LeaderboardResponse | null {
  try {
    const raw = localStorage.getItem(LEADERBOARD_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveLeaderboardCache(data: LeaderboardResponse): void {
  try {
    localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify(data))
  } catch {
    // quota exceeded — ignore
  }
}

function loadContributorCache(login: string): ContributorStats | null {
  try {
    const raw = localStorage.getItem(`${CONTRIBUTOR_CACHE_PREFIX}${login}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveContributorCache(login: string, data: ContributorStats): void {
  try {
    localStorage.setItem(`${CONTRIBUTOR_CACHE_PREFIX}${login}`, JSON.stringify(data))
  } catch {
    // quota exceeded — ignore
  }
}

export function useLeaderboard(limit: number = DEFAULT_LEADERBOARD_LIMIT) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(() => {
    const cached = loadLeaderboardCache()
    return cached?.entries ?? []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLeaderboard = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (!token) return

    setIsLoading(true)
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || BACKEND_DEFAULT_URL
      const res = await fetch(`${apiBase}/api/rewards/leaderboard?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const result: LeaderboardResponse = await res.json()
      setEntries(result.entries || [])
      saveLeaderboardCache(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  return {
    entries,
    isLoading,
    error,
    refresh: fetchLeaderboard,
  }
}

export function useContributorDetail(login: string | null) {
  const [stats, setStats] = useState<ContributorStats | null>(() => {
    if (!login) return null
    return loadContributorCache(login)
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!login) {
      setStats(null)
      return
    }

    const cached = loadContributorCache(login)
    if (cached) {
      setStats(cached)
    }

    const fetchDetail = async () => {
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      if (!token) return

      setIsLoading(true)
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL || BACKEND_DEFAULT_URL
        const res = await fetch(`${apiBase}/api/rewards/contributor/${encodeURIComponent(login)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const result: ContributorStats = await res.json()
        setStats(result)
        saveContributorCache(login, result)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsLoading(false)
      }
    }

    fetchDetail()
  }, [login])

  return {
    stats,
    isLoading,
    error,
  }
}

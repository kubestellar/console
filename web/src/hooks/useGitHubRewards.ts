/**
 * Hook for fetching GitHub-sourced reward data.
 * Queries the backend which proxies GitHub Search API for the logged-in user's
 * issues and PRs across configured orgs, computes points on the fly.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { BACKEND_DEFAULT_URL } from '../lib/constants'
import type { GitHubRewardsResponse } from '../types/rewards'

const CACHE_KEY = 'github-rewards-cache'
const REFRESH_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

function loadCache(): GitHubRewardsResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveCache(data: GitHubRewardsResponse): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // quota exceeded — ignore
  }
}

export function useGitHubRewards() {
  const { user, isAuthenticated } = useAuth()
  const [data, setData] = useState<GitHubRewardsResponse | null>(loadCache)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDemoUser = !user || user.github_login === 'demo-user'

  const fetchRewards = useCallback(async () => {
    if (!isAuthenticated || isDemoUser) return

    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (!token) return

    setIsLoading(true)
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || BACKEND_DEFAULT_URL
      const res = await fetch(`${apiBase}/api/rewards/github`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const result: GitHubRewardsResponse = await res.json()
      setData(result)
      saveCache(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      // Keep stale data if we have it
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, isDemoUser])

  // Fetch on mount and refresh periodically
  useEffect(() => {
    if (!isAuthenticated || isDemoUser) return

    fetchRewards()
    const interval = setInterval(fetchRewards, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchRewards, isAuthenticated, isDemoUser])

  return {
    githubRewards: data,
    githubPoints: data?.total_points ?? 0,
    isLoading,
    error,
    refresh: fetchRewards,
  }
}

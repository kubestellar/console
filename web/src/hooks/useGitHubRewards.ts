/**
 * Hook for fetching GitHub-sourced reward data.
 * Calls the Netlify function on console.kubestellar.io (10-min Blob cache)
 * instead of the local Go backend, saving the user's GitHub API quota.
 *
 * Also fetches the last 20 contributions (issues/PRs) directly from the
 * public GitHub Search API (no auth needed for public repos).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import type { GitHubRewardsResponse, GitHubContribution, GitHubRewardType } from '../types/rewards'
import { GITHUB_REWARD_POINTS } from '../types/rewards'
import { MS_PER_MINUTE } from '../lib/constants/time'

/** Always fetch from the Netlify function (cached, no user token needed). */
const REWARDS_API_BASE = 'https://console.kubestellar.io'

/** Prefix for per-user localStorage cache keys */
const CACHE_KEY_PREFIX = 'github-rewards-cache'
/** Legacy cache key (pre-per-user). Cleared on first load to prevent stale data. */
const LEGACY_CACHE_KEY = 'github-rewards-cache'
/** How long client-side cached rewards data is considered fresh (15 minutes) */
const CLIENT_CACHE_TTL_MS = 15 * MS_PER_MINUTE
/** Interval between automatic background refreshes (10 minutes) */
const REFRESH_INTERVAL_MS = 10 * MS_PER_MINUTE
/** Max recent contributions to fetch from the GitHub Search API */
const CONTRIBUTIONS_PER_PAGE = 20
/** GitHub orgs to search for contributions */
const CONTRIBUTIONS_SEARCH_ORGS = ['kubestellar', 'llm-d']

/** Returns a per-user localStorage cache key */
export function userCacheKey(login: string): string {
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

export interface GitHubSearchItem {
  html_url: string
  title: string
  number: number
  created_at: string
  pull_request?: { merged_at: string | null }
  labels: Array<{ name: string }>
  repository_url: string
}

export function classifySearchItem(item: GitHubSearchItem): GitHubRewardType {
  const isPR = !!item.pull_request
  if (isPR) {
    return item.pull_request?.merged_at ? 'pr_merged' : 'pr_opened'
  }
  const labelNames = (item.labels || []).map(l => l.name.toLowerCase())
  if (labelNames.some(l => l.includes('bug'))) return 'issue_bug'
  if (labelNames.some(l => l.includes('feature') || l.includes('enhancement'))) return 'issue_feature'
  return 'issue_other'
}

export function repoFromUrl(repositoryUrl: string): string {
  const parts = repositoryUrl.split('/')
  const len = parts.length
  return len >= 2 ? `${parts[len - 2]}/${parts[len - 1]}` : repositoryUrl
}

/** GitHub Search API base — public, no auth needed for public repos */
const GITHUB_SEARCH_API = 'https://api.github.com/search/issues'

async function fetchRecentContributions(
  login: string,
): Promise<GitHubContribution[]> {
  const orgFilter = CONTRIBUTIONS_SEARCH_ORGS.map(o => `org:${o}`).join('+')
  const query = `author:${encodeURIComponent(login)}+${orgFilter}`
  const url = `${GITHUB_SEARCH_API}?q=${query}&sort=updated&per_page=${CONTRIBUTIONS_PER_PAGE}`

  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!res.ok) return []

  const json = await res.json().catch(() => null) as { items?: GitHubSearchItem[] } | null
  if (!json?.items) return []

  return (json.items || []).map((item): GitHubContribution => {
    const type = classifySearchItem(item)
    return {
      type,
      title: item.title,
      url: item.html_url,
      repo: repoFromUrl(item.repository_url),
      number: item.number,
      points: GITHUB_REWARD_POINTS[type],
      created_at: item.created_at,
    }
  })
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
      setData(null)
    }
  }, [githubLogin, isDemoUser])

  const fetchRewards = useCallback(async () => {
    if (!isAuthenticated || isDemoUser || !githubLogin) return

    setIsLoading(true)
    try {
      const [rewardsRes, contributions] = await Promise.all([
        fetch(`${REWARDS_API_BASE}/api/rewards/github?login=${encodeURIComponent(githubLogin)}`, {
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        }),
        fetchRecentContributions(githubLogin).catch(() => [] as GitHubContribution[]),
      ])

      if (!rewardsRes.ok) throw new Error(`API error: ${rewardsRes.status}`)
      const result = await rewardsRes.json().catch(() => null) as GitHubRewardsResponse | null
      if (!result) throw new Error('Invalid JSON response')

      if (loginRef.current !== githubLogin) return

      const merged: GitHubRewardsResponse = {
        ...result,
        contributions: contributions.length > 0 ? contributions : result.contributions,
      }

      setData(merged)
      saveCache(githubLogin, merged)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
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

import type { GitHubRelease, ParsedRelease } from '../../types/updates'
import { authFetch } from '../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS, FETCH_EXTERNAL_TIMEOUT_MS } from '../../lib/constants/network'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import {
  DEV_SHA_CACHE_KEY,
  GITHUB_API_URL,
  GITHUB_MAIN_SHA_URL,
  isCacheValid,
  loadCache,
  parseRelease,
  safeJsonParse,
  saveCache,
} from '../versionUtils'

export type CheckAttemptResult = {
  success: boolean
  errorMessage?: string
}

export type ReleasesFetchResult = CheckAttemptResult & {
  releases?: ParsedRelease[]
}

export type LatestMainSHAResult = CheckAttemptResult & {
  sha?: string
  rateLimited?: boolean
}

export type RecentCommit = {
  sha: string
  message: string
  author: string
  date: string
}

export const GITHUB_RATE_LIMIT_UNTIL_KEY = 'kc-github-rate-limit-until'

function getCachedDevSHA(): string | null {
  return localStorage.getItem(DEV_SHA_CACHE_KEY)
}

function setGithubRateLimitBackoff(until: number): void {
  localStorage.setItem(GITHUB_RATE_LIMIT_UNTIL_KEY, String(until))
}

function getGithubRateLimitBackoff(): number | null {
  const raw = localStorage.getItem(GITHUB_RATE_LIMIT_UNTIL_KEY)
  if (!raw) return null

  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function clearGithubRateLimitBackoff(): void {
  localStorage.removeItem(GITHUB_RATE_LIMIT_UNTIL_KEY)
}

export async function fetchReleases(force = false): Promise<ReleasesFetchResult> {
  const cache = loadCache()
  if (!force && cache && isCacheValid(cache)) {
    return {
      success: true,
      releases: cache.data.map(parseRelease),
    }
  }

  try {
    const headers = new Headers({ Accept: 'application/vnd.github.v3+json' })
    if (cache?.etag) {
      headers.set('If-None-Match', cache.etag)
    }

    const response = await authFetch(GITHUB_API_URL, {
      headers,
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS),
    })

    if (response.status === 403) {
      const resetTime = response.headers.get('X-RateLimit-Reset')
      if (resetTime) {
        const resetDate = new Date(parseInt(resetTime, 10) * 1000)
        throw new Error(`Rate limited. Try again after ${resetDate.toLocaleTimeString()}`)
      }
      throw new Error('Rate limited by GitHub API')
    }

    if (response.status === 304 && cache) {
      saveCache(cache.data, cache.etag)
      return {
        success: true,
        releases: cache.data.map(parseRelease),
      }
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const data = await safeJsonParse<GitHubRelease[]>(response, 'GitHub releases')
    const etag = response.headers.get('ETag')
    const validReleases = data.filter((release) => !release.draft)

    saveCache(validReleases, etag)
    return {
      success: true,
      releases: validReleases.map(parseRelease),
    }
  } catch (err: unknown) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : 'Failed to check for updates',
      releases: cache?.data.map(parseRelease),
    }
  }
}

export async function fetchLatestMainSHA(): Promise<LatestMainSHAResult> {
  const rateLimitUntil = getGithubRateLimitBackoff()
  if (rateLimitUntil && Date.now() < rateLimitUntil) {
    return {
      success: false,
      sha: getCachedDevSHA() ?? undefined,
      rateLimited: true,
      errorMessage: 'GitHub API rate limit — add a GitHub token in Settings for higher limits',
    }
  }

  try {
    const response = await authFetch(GITHUB_MAIN_SHA_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await safeJsonParse<{ object?: { sha?: string } }>(response, 'GitHub main SHA')
      const sha = data?.object?.sha
      if (sha) {
        localStorage.setItem(DEV_SHA_CACHE_KEY, sha)
        clearGithubRateLimitBackoff()
      }
      return { success: true, sha }
    }

    if (response.status === 403 || response.status === 429) {
      const resetHeader = response.headers.get('X-RateLimit-Reset')
      const backoffUntil = resetHeader
        ? parseInt(resetHeader, 10) * 1000
        : Date.now() + 15 * MS_PER_MINUTE
      setGithubRateLimitBackoff(backoffUntil)
      return {
        success: false,
        sha: getCachedDevSHA() ?? undefined,
        rateLimited: true,
        errorMessage: 'GitHub API rate limit — add a GitHub token in Settings for higher limits',
      }
    }

    return {
      success: false,
      errorMessage: `GitHub API error: ${response.status}`,
    }
  } catch (err: unknown) {
    return {
      success: false,
      sha: getCachedDevSHA() ?? undefined,
      errorMessage: err instanceof Error ? err.message : 'Failed to check for updates',
    }
  }
}

export async function fetchRecentCommits(
  currentSHA: string,
  latestSHA: string | null,
): Promise<RecentCommit[]> {
  if (!currentSHA || currentSHA === 'unknown' || !latestSHA) {
    return []
  }

  if (
    currentSHA === latestSHA
    || latestSHA.startsWith(currentSHA)
    || currentSHA.startsWith(latestSHA)
  ) {
    return []
  }

  const rateLimitUntil = getGithubRateLimitBackoff()
  if (rateLimitUntil && Date.now() < rateLimitUntil) {
    return []
  }

  try {
    const response = await authFetch(
      `/api/github/repos/kubestellar/console/compare/${currentSHA}...${latestSHA}`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      },
    )

    if (response.ok) {
      const data = await safeJsonParse<{
        commits?: Array<{
          sha: string
          commit: {
            message: string
            author: {
              name: string
              date: string
            }
          }
        }>
      }>(response, 'GitHub compare')

      return (data.commits || [])
        .slice(-20)
        .reverse()
        .map((commit) => ({
          sha: commit.sha,
          message: commit.commit.message.split('\n')[0],
          author: commit.commit.author.name,
          date: commit.commit.author.date,
        }))
    }

    if (response.status === 403 || response.status === 429) {
      setGithubRateLimitBackoff(Date.now() + 15 * MS_PER_MINUTE)
    }
  } catch {
    // Best-effort only.
  }

  return []
}

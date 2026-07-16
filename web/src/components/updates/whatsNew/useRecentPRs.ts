import { useState, useEffect } from 'react'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { api, RateLimitError } from '../../../lib/api'

const MAX_RECENT_PRS = 50

export interface RecentPR {
  number: number
  title: string
  merged_at: string
}

interface UseRecentPRsOptions {
  hasReleaseNotes: boolean
  isOpen: boolean
  commitHash: string | undefined
}

interface UseRecentPRsResult {
  recentPRs: RecentPR[]
  prsLoading: boolean
  prsError: string | null
}

export function useRecentPRs({ hasReleaseNotes, isOpen, commitHash }: UseRecentPRsOptions): UseRecentPRsResult {
  const [recentPRs, setRecentPRs] = useState<RecentPR[]>([])
  const [prsLoading, setPrsLoading] = useState(false)
  const [prsError, setPrsError] = useState<string | null>(null)

  // When release notes are empty, fetch merged PRs since the running commit.
  // First get the commit date for the running hash, then filter PRs merged after.
  useEffect(() => {
    if (hasReleaseNotes || !isOpen) return
    let cancelled = false
    const fetchPRs = async () => {
      setPrsLoading(true)
      setPrsError(null)
      try {
        // Step 1: Get the date of the currently running commit
        let sinceDate: string | null = null
        if (commitHash && commitHash !== 'unknown') {
          try {
            const { data: commitData } = await api.get<{ commit?: { committer?: { date?: string } } }>(
              `/api/github/repos/kubestellar/console/commits/${commitHash}`,
              { timeout: FETCH_DEFAULT_TIMEOUT_MS },
            )
            sinceDate = commitData?.commit?.committer?.date ?? null
          } catch {
            // Commit lookup failure is non-fatal — show all PRs
          }
        }

        // Step 2: Fetch recent merged PRs
        if (cancelled) return
        const { data } = await api.get<Array<{ number: number; title: string; merged_at: string | null }>>(
          `/api/github/repos/kubestellar/console/pulls?state=closed&sort=updated&direction=desc&per_page=${MAX_RECENT_PRS}`,
          { timeout: FETCH_DEFAULT_TIMEOUT_MS },
        )
        if (cancelled) return
        const merged = (data || [])
          .filter((pr) => pr.merged_at)
          .filter((pr) => {
            if (!sinceDate) return true
            return new Date(pr.merged_at!) > new Date(sinceDate)
          })
          .map((pr) => ({
            number: pr.number,
            title: pr.title,
            merged_at: pr.merged_at!,
          }))
        setRecentPRs(merged)
      } catch (err: unknown) {
        if (cancelled) return
        if (err instanceof RateLimitError) {
          setPrsError('GitHub API rate limit reached — data will refresh automatically. Try again in a moment.')
          return
        }
        const message = err instanceof Error ? err.message : 'Network error'
        setPrsError(message)
      } finally {
        if (!cancelled) setPrsLoading(false)
      }
    }
    fetchPRs()
    return () => { cancelled = true }
  }, [hasReleaseNotes, isOpen, commitHash])

  return { recentPRs, prsLoading, prsError }
}

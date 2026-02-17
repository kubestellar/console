/**
 * Hook for fetching nightly E2E workflow run status.
 *
 * Primary: fetches from backend proxy (/api/nightly-e2e/runs) which uses a
 * server-side GitHub token and caches results for 5 minutes (2 min when
 * jobs are in progress).
 *
 * Fallback: if the backend is unavailable, tries direct GitHub API calls
 * using the user's localStorage token. Falls back to demo data when neither
 * source is available.
 */
import { useEffect, useState } from 'react'
import { useCache } from '../lib/cache'
import {
  generateDemoNightlyData,
  type NightlyGuideStatus,
} from '../lib/llmd/nightlyE2EDemoData'
import { STORAGE_KEY_TOKEN } from '../lib/constants'

const REFRESH_IDLE_MS = 5 * 60 * 1000    // 5 minutes when idle
const REFRESH_ACTIVE_MS = 2 * 60 * 1000  // 2 minutes when jobs are running

const DEMO_DATA = generateDemoNightlyData()

export interface NightlyE2EData {
  guides: NightlyGuideStatus[]
  isDemo: boolean
}

function getAuthHeaders(): Record<string, string> {
  const jwt = localStorage.getItem(STORAGE_KEY_TOKEN)
  if (!jwt) return {}
  return { Authorization: `Bearer ${jwt}` }
}

export function useNightlyE2EData() {
  const [hasRunningJobs, setHasRunningJobs] = useState(false)
  const refreshInterval = hasRunningJobs ? REFRESH_ACTIVE_MS : REFRESH_IDLE_MS

  const cacheResult = useCache<NightlyE2EData>({
    key: 'nightly-e2e-status',
    category: 'default',
    initialData: { guides: DEMO_DATA, isDemo: true },
    demoData: { guides: DEMO_DATA, isDemo: true },
    persist: true,
    refreshInterval,
    fetcher: async () => {
      // Try authenticated endpoint first, then public fallback
      const endpoints = ['/api/nightly-e2e/runs', '/api/public/nightly-e2e/runs']
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            headers: {
              ...(endpoint.includes('/public/') ? {} : getAuthHeaders()),
              Accept: 'application/json',
            },
          })
          if (res.ok) {
            const data = await res.json()
            if (data.guides && data.guides.length > 0) {
              const hasAnyRuns = data.guides.some(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (g: any) => g.runs && g.runs.length > 0
              )
              if (hasAnyRuns) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const guides: NightlyGuideStatus[] = data.guides.map((g: any) => ({
                  guide: g.guide,
                  acronym: g.acronym,
                  platform: g.platform,
                  repo: g.repo,
                  workflowFile: g.workflowFile,
                  runs: (g.runs ?? []).map(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (r: any) => ({
                      id: r.id,
                      status: r.status,
                      conclusion: r.conclusion,
                      createdAt: r.createdAt,
                      updatedAt: r.updatedAt,
                      htmlUrl: r.htmlUrl,
                      runNumber: r.runNumber,
                    })
                  ),
                  passRate: g.passRate,
                  trend: g.trend,
                  latestConclusion: g.latestConclusion,
                }))
                return { guides, isDemo: false }
              }
            }
          }
        } catch {
          // Endpoint unavailable — try next
        }
      }

      return { guides: DEMO_DATA, isDemo: true }
    },
  })

  // Track whether any jobs are in progress to speed up polling
  const { guides, isDemo } = cacheResult.data
  useEffect(() => {
    const running = guides.some(g => g.runs.some(r => r.status === 'in_progress'))
    if (running !== hasRunningJobs) setHasRunningJobs(running)
  }, [guides, hasRunningJobs])

  return {
    guides,
    isDemoFallback: isDemo,
    isLoading: cacheResult.isLoading,
    isRefreshing: cacheResult.isRefreshing,
    isFailed: cacheResult.isFailed,
    consecutiveFailures: cacheResult.consecutiveFailures,
    refetch: cacheResult.refetch,
  }
}

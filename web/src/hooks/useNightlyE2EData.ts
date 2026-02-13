/**
 * Hook for fetching nightly E2E workflow run status.
 *
 * Primary: fetches from backend proxy (/api/nightly-e2e/runs) which uses a
 * server-side GitHub token and caches results for 5 minutes.
 *
 * Fallback: if the backend is unavailable, tries direct GitHub API calls
 * using the user's localStorage token. Falls back to demo data when neither
 * source is available.
 */
import { useCache } from '../lib/cache'
import {
  generateDemoNightlyData,
  type NightlyGuideStatus,
} from '../lib/llmd/nightlyE2EDemoData'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

const DEMO_DATA = generateDemoNightlyData()

export interface NightlyE2EData {
  guides: NightlyGuideStatus[]
  isDemo: boolean
}

function getAuthHeaders(): Record<string, string> {
  const jwt = localStorage.getItem('token')
  if (!jwt) return {}
  return { Authorization: `Bearer ${jwt}` }
}

export function useNightlyE2EData() {
  const cacheResult = useCache<NightlyE2EData>({
    key: 'nightly-e2e-status',
    category: 'default',
    initialData: { guides: DEMO_DATA, isDemo: true },
    demoData: { guides: DEMO_DATA, isDemo: true },
    persist: true,
    refreshInterval: REFRESH_INTERVAL_MS,
    fetcher: async () => {
      // Try backend proxy first (uses server-side GitHub token)
      try {
        const res = await fetch('/api/nightly-e2e/runs', {
          headers: {
            ...getAuthHeaders(),
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
              // Map backend response to frontend types
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
        // Backend unavailable — fall through to demo
      }

      return { guides: DEMO_DATA, isDemo: true }
    },
  })

  const { guides, isDemo } = cacheResult.data
  return {
    guides,
    isDemoFallback: isDemo,
    isLoading: cacheResult.isLoading,
    isFailed: cacheResult.isFailed,
    consecutiveFailures: cacheResult.consecutiveFailures,
    refetch: cacheResult.refetch,
  }
}

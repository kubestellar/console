/**
 * Hook for fetching nightly E2E workflow run status from GitHub Actions API.
 *
 * Fetches the last 7 runs for each of the 10 nightly E2E workflows across
 * llm-d/llm-d and llm-d/llm-d-workload-variant-autoscaler. Uses the GitHub
 * token from localStorage (base64-encoded, same as GitHubCIMonitor).
 *
 * Falls back to demo data when no token is available or the API is unreachable.
 */
import { useCache } from '../lib/cache'
import {
  NIGHTLY_WORKFLOWS,
  generateDemoNightlyData,
  type NightlyGuideStatus,
  type NightlyRun,
} from '../lib/llmd/nightlyE2EDemoData'

const RUNS_PER_WORKFLOW = 7
const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

const DEMO_DATA = generateDemoNightlyData()

function decodeToken(encoded: string): string {
  try {
    return atob(encoded)
  } catch {
    return encoded
  }
}

function computeTrend(runs: NightlyRun[]): 'up' | 'down' | 'steady' {
  if (runs.length < 4) return 'steady'
  const recent = runs.slice(0, 3)
  const older = runs.slice(3)
  const recentPass = recent.filter(r => r.conclusion === 'success').length / recent.length
  const olderPass = older.filter(r => r.conclusion === 'success').length / older.length
  if (recentPass > olderPass + 0.1) return 'up'
  if (recentPass < olderPass - 0.1) return 'down'
  return 'steady'
}

function computePassRate(runs: NightlyRun[]): number {
  const completed = runs.filter(r => r.status === 'completed')
  if (completed.length === 0) return 0
  return Math.round((completed.filter(r => r.conclusion === 'success').length / completed.length) * 100)
}

export interface NightlyE2EData {
  guides: NightlyGuideStatus[]
  isDemo: boolean
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
      const storedToken = localStorage.getItem('github_token')
      const token = storedToken ? decodeToken(storedToken) : null
      if (!token) {
        return { guides: DEMO_DATA, isDemo: true }
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      }

      const results = await Promise.allSettled(
        NIGHTLY_WORKFLOWS.map(async (wf) => {
          const url = `https://api.github.com/repos/${wf.repo}/actions/workflows/${wf.workflowFile}/runs?per_page=${RUNS_PER_WORKFLOW}`
          const res = await fetch(url, { headers })
          if (res.status === 401 || res.status === 403) {
            throw new Error('AUTH_FAILED')
          }
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const runs: NightlyRun[] = (data.workflow_runs ?? []).map((r: any) => ({
            id: r.id,
            status: r.status,
            conclusion: r.conclusion,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            htmlUrl: r.html_url,
            runNumber: r.run_number,
          }))
          return { wf, runs }
        })
      )

      // If any request got auth failure, fall back to demo
      const authFailed = results.some(
        r => r.status === 'rejected' && r.reason?.message === 'AUTH_FAILED'
      )
      if (authFailed) {
        return { guides: DEMO_DATA, isDemo: true }
      }

      const guides: NightlyGuideStatus[] = NIGHTLY_WORKFLOWS.map((wf, i) => {
        const result = results[i]
        const runs = result.status === 'fulfilled' ? result.value.runs : []
        return {
          guide: wf.guide,
          platform: wf.platform,
          repo: wf.repo,
          workflowFile: wf.workflowFile,
          runs,
          passRate: computePassRate(runs),
          trend: computeTrend(runs),
          latestConclusion: runs[0]?.conclusion ?? runs[0]?.status ?? null,
        }
      })

      const hasAnyData = guides.some(g => g.runs.length > 0)
      if (!hasAnyData) {
        return { guides: DEMO_DATA, isDemo: true }
      }

      return { guides, isDemo: false }
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

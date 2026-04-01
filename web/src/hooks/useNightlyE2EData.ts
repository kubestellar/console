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
  type NightlyRun,
} from '../lib/llmd/nightlyE2EDemoData'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { isNetlifyDeployment } from '../lib/demoMode'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

const REFRESH_IDLE_MS = 5 * 60 * 1000    // 5 minutes when idle
const REFRESH_ACTIVE_MS = 2 * 60 * 1000  // 2 minutes when jobs are running

const DEMO_DATA = generateDemoNightlyData()

const LS_CACHE_KEY = 'nightly-e2e-cache'

export interface NightlyE2EData {
  guides: NightlyGuideStatus[]
  isDemo: boolean
}

/** Read last-known live data from localStorage (synchronous, survives refresh). */
function loadCachedData(): NightlyE2EData {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as NightlyE2EData
      if (parsed.guides?.length > 0 && !parsed.isDemo) return parsed
    }
  } catch { /* ignore */ }
  return { guides: [], isDemo: false }
}

/** Persist live data to localStorage so it survives page refresh. */
function saveCachedData(data: NightlyE2EData): void {
  try {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(data))
  } catch { /* quota exceeded — ignore */ }
}

function getAuthHeaders(): Record<string, string> {
  const jwt = localStorage.getItem(STORAGE_KEY_TOKEN)
  if (!jwt) return {}
  return { Authorization: `Bearer ${jwt}` }
}

// Load synchronously at module level so initialData is ready before first render
const CACHED_INITIAL = loadCachedData()

export function useNightlyE2EData() {
  const [hasRunningJobs, setHasRunningJobs] = useState(false)
  const refreshInterval = hasRunningJobs ? REFRESH_ACTIVE_MS : REFRESH_IDLE_MS

  const cacheResult = useCache<NightlyE2EData>({
    key: 'nightly-e2e-status',
    category: 'default',
    initialData: CACHED_INITIAL,
    demoData: { guides: DEMO_DATA, isDemo: true },
    persist: true,
    refreshInterval,
    demoWhenEmpty: true, // Show demo data immediately during cold start instead of skeleton loading
    liveInDemoMode: isNetlifyDeployment, // Only fetch live in demo mode on console.kubestellar.io
    fetcher: async () => {
      // Try authenticated endpoint first, then public fallback
      const endpoints = ['/api/nightly-e2e/runs', '/api/public/nightly-e2e/runs']
      for (const endpoint of (endpoints || [])) {
        try {
          const res = await fetch(endpoint, {
            headers: {
              ...(endpoint.includes('/public/') ? {} : getAuthHeaders()),
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
          })
          if (res.ok) {
            const data = await res.json()
            if (data.guides && Array.isArray(data.guides)) {
              const guides: NightlyGuideStatus[] = data.guides.map((g: NightlyGuideStatus) => ({
                guide: g.guide,
                acronym: g.acronym,
                platform: g.platform,
                repo: g.repo,
                workflowFile: g.workflowFile,
                runs: (g.runs ?? []).map(
                  (r: NightlyRun) => ({
                    id: r.id,
                    status: r.status,
                    conclusion: r.conclusion,
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt,
                    htmlUrl: r.htmlUrl,
                    runNumber: r.runNumber,
                    failureReason: r.failureReason || '',
                    model: r.model ?? g.model ?? 'Unknown',
                    gpuType: r.gpuType ?? g.gpuType ?? 'Unknown',
                    gpuCount: r.gpuCount ?? g.gpuCount ?? 0,
                    event: r.event ?? 'schedule',
                    llmdImages: r.llmdImages,
                    otherImages: r.otherImages,
                  })
                ),
                passRate: g.passRate,
                trend: g.trend,
                latestConclusion: g.latestConclusion,
                model: g.model ?? 'Unknown',
                gpuType: g.gpuType ?? 'Unknown',
                gpuCount: g.gpuCount ?? 0,
                llmdImages: g.llmdImages,
                otherImages: g.otherImages,
              }))
              const result = { guides, isDemo: false }
              // Only cache to localStorage when at least one guide has runs,
              // so the cached snapshot always has meaningful run history.
              const hasAnyRuns = guides.some(g => g.runs.length > 0)
              if (hasAnyRuns) {
                saveCachedData(result)
              }
              return result
            }
          }
        } catch {
          // Endpoint unavailable — try next
        }
      }

      // All endpoints failed or returned no guides — throw so the cache treats
      // this as a failure (increments consecutiveFailures, retries with backoff)
      // instead of caching demo data as a "successful" result that sticks forever.
      // Note: valid 200 responses with guides (even with empty runs) are returned
      // above and never reach this point.
      throw new Error('No nightly E2E data available')
    },
  })

  // Track whether any jobs are in progress to speed up polling
  const { guides, isDemo } = cacheResult.data
  useEffect(() => {
    const running = guides.some(g => g.runs.some(r => r.status === 'in_progress'))
    if (running !== hasRunningJobs) setHasRunningJobs(running)
  }, [guides, hasRunningJobs])

  // When localStorage had cached data, the initial render has data but useCache
  // still reports isLoading=true until the async cache layer confirms.  In that
  // case we already have good data — suppress the loading state.
  const hasCachedInitial = CACHED_INITIAL.guides.length > 0

  return {
    guides,
    // Use the cache's own isDemoFallback which correctly handles:
    // 1. Optimistic demo during cold-start loading (showOptimisticDemo)
    // 2. Normal demo mode when disabled
    // 3. demoWhenEmpty fallback after fetch returns empty
    // Don't suppress during loading — demoWhenEmpty already handles this properly.
    isDemoFallback: cacheResult.isDemoFallback || (!cacheResult.isLoading && isDemo),
    isLoading: hasCachedInitial ? false : cacheResult.isLoading,
    isRefreshing: cacheResult.isRefreshing || (hasCachedInitial && cacheResult.isLoading),
    isFailed: cacheResult.isFailed,
    consecutiveFailures: cacheResult.consecutiveFailures,
    refetch: cacheResult.refetch,
  }
}

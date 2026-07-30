/**
 * Volcano Status Hook — Data fetching for the volcano_status card.
 *
 * Mirrors the spiffe / linkerd / envoy pattern:
 * - useCache with fetcher + demo fallback
 * - isDemoFallback gated on !isLoading (prevents demo flash while loading)
 * - fetchJson helper with treat404AsEmpty (no real endpoint yet — this is
 *   scaffolding; the fetch will 404 until a real Volcano bridge lands, at
 *   which point useCache will transparently switch to live data)
 * - showSkeleton / showEmptyState from useCardLoadingState
 */

import { createCardCachedHook, type CardCachedHookResult } from '../lib/cache/createCardCachedHook'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  VOLCANO_DEMO_DATA,
  type VolcanoJob,
  type VolcanoPodGroup,
  type VolcanoQueue,
  type VolcanoStats,
  type VolcanoStatusData,
  type VolcanoSummary,
} from '../components/cards/volcano_status/demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'volcano-status'
const VOLCANO_STATUS_ENDPOINT = '/api/volcano/status'
const DEFAULT_SCHEDULER_VERSION = 'unknown'

const EMPTY_STATS: VolcanoStats = {
  totalQueues: 0,
  openQueues: 0,
  totalJobs: 0,
  pendingJobs: 0,
  runningJobs: 0,
  completedJobs: 0,
  failedJobs: 0,
  totalPodGroups: 0,
  allocatedGpu: 0,
  schedulerVersion: DEFAULT_SCHEDULER_VERSION,
}

const EMPTY_SUMMARY: VolcanoSummary = {
  totalQueues: 0,
  totalJobs: 0,
  totalPodGroups: 0,
  allocatedGpu: 0,
}

const INITIAL_DATA: VolcanoStatusData = {
  health: 'not-installed',
  queues: [],
  jobs: [],
  podGroups: [],
  stats: EMPTY_STATS,
  summary: EMPTY_SUMMARY,
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/volcano/status response)
// ---------------------------------------------------------------------------

interface FetchResult<T> {
  data: T
  failed: boolean
}

interface VolcanoStatusResponse {
  queues?: VolcanoQueue[]
  jobs?: VolcanoJob[]
  podGroups?: VolcanoPodGroup[]
  stats?: Partial<VolcanoStats>
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function summarize(
  queues: VolcanoQueue[],
  jobs: VolcanoJob[],
  podGroups: VolcanoPodGroup[],
  stats: VolcanoStats,
): VolcanoSummary {
  return {
    totalQueues: queues.length,
    totalJobs: jobs.length,
    totalPodGroups: podGroups.length,
    allocatedGpu: stats.allocatedGpu,
  }
}

function deriveHealth(
  queues: VolcanoQueue[],
  jobs: VolcanoJob[],
): VolcanoStatusData['health'] {
  if (queues.length === 0 && jobs.length === 0) {
    return 'not-installed'
  }
  const hasFailedJobs = jobs.some(j => j.phase === 'Failed')
  return hasFailedJobs ? 'degraded' : 'healthy'
}

function deriveStatsFromLists(
  queues: VolcanoQueue[],
  jobs: VolcanoJob[],
  podGroups: VolcanoPodGroup[],
  partial: Partial<VolcanoStats> | undefined,
): VolcanoStats {
  const openQueues = queues.filter(q => q.state === 'Open').length
  const pendingJobs = jobs.filter(j => j.phase === 'Pending').length
  const runningJobs = jobs.filter(j => j.phase === 'Running').length
  const completedJobs = jobs.filter(j => j.phase === 'Completed').length
  const failedJobs = jobs.filter(j => j.phase === 'Failed').length
  const allocatedGpu = queues.reduce((sum, q) => sum + q.allocatedGpu, 0)

  return {
    totalQueues: partial?.totalQueues ?? queues.length,
    openQueues: partial?.openQueues ?? openQueues,
    totalJobs: partial?.totalJobs ?? jobs.length,
    pendingJobs: partial?.pendingJobs ?? pendingJobs,
    runningJobs: partial?.runningJobs ?? runningJobs,
    completedJobs: partial?.completedJobs ?? completedJobs,
    failedJobs: partial?.failedJobs ?? failedJobs,
    totalPodGroups: partial?.totalPodGroups ?? podGroups.length,
    allocatedGpu: partial?.allocatedGpu ?? allocatedGpu,
    schedulerVersion: partial?.schedulerVersion ?? DEFAULT_SCHEDULER_VERSION,
  }
}

function buildVolcanoStatus(
  queues: VolcanoQueue[],
  jobs: VolcanoJob[],
  podGroups: VolcanoPodGroup[],
  stats: VolcanoStats,
): VolcanoStatusData {
  return {
    health: deriveHealth(queues, jobs),
    queues,
    jobs,
    podGroups,
    stats,
    summary: summarize(queues, jobs, podGroups, stats),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Private fetchJson helper (mirrors spiffe/envoy/contour/linkerd pattern)
// ---------------------------------------------------------------------------

async function fetchJson<T>(
  url: string,
  options?: { treat404AsEmpty?: boolean },
): Promise<FetchResult<T | null>> {
  try {
    const resp = await authFetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (!resp.ok) {
      if (options?.treat404AsEmpty && resp.status === 404) {
        return { data: null, failed: false }
      }
      return { data: null, failed: true }
    }

    const body = (await resp.json()) as T
    return { data: body, failed: false }
  } catch {
    return { data: null, failed: true }
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchVolcanoStatus(): Promise<VolcanoStatusData> {
  const result = await fetchJson<VolcanoStatusResponse>(
    VOLCANO_STATUS_ENDPOINT,
    { treat404AsEmpty: true },
  )

  // If the endpoint isn't wired up yet (404) or the request failed, the
  // cache layer will surface demo data via its demoData fallback path.
  if (result.failed) {
    throw new Error('Unable to fetch Volcano status')
  }

  const body = result.data
  const queues = Array.isArray(body?.queues) ? body.queues : []
  const jobs = Array.isArray(body?.jobs) ? body.jobs : []
  const podGroups = Array.isArray(body?.podGroups) ? body.podGroups : []
  const stats = deriveStatsFromLists(queues, jobs, podGroups, body?.stats)

  return buildVolcanoStatus(queues, jobs, podGroups, stats)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type UseCachedVolcanoResult = CardCachedHookResult<VolcanoStatusData>

export const useCachedVolcano = createCardCachedHook<VolcanoStatusData>({
  key: CACHE_KEY,
  category: 'default',
  initialData: INITIAL_DATA,
  demoData: VOLCANO_DEMO_DATA,
  persist: true,
  fetcher: fetchVolcanoStatus,
  hasAnyData: data => (
    data.health === 'not-installed'
      ? true
      : (data.queues ?? []).length > 0 || (data.jobs ?? []).length > 0
  ),
})

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  summarize,
  deriveHealth,
  deriveStatsFromLists,
  buildVolcanoStatus,
}

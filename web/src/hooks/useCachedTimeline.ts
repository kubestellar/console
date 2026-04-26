import { useCache, type RefreshCategory } from '../lib/cache'
import { useMemo } from 'react'
import { useDemoMode } from './useDemoMode'
import { authFetch } from '../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import {
  getDemoTimelineEvents,
  type TimelineEvent,
} from '../components/cards/change_timeline/demoData'
import { MS_PER_DAY } from '../lib/constants/time'

const CACHE_KEY_TIMELINE = 'change_timeline_events'
const TIMELINE_CATEGORY: RefreshCategory = 'realtime'

const DEFAULT_RANGE_MS = MS_PER_DAY

const INITIAL_DATA: TimelineEvent[] = []

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------
async function fetchTimelineEvents(rangeMs: number): Promise<TimelineEvent[]> {
  const since = new Date(Date.now() - rangeMs).toISOString()
  const url = `/api/timeline/events?since=${encodeURIComponent(since)}`
  const resp = await authFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) {
    throw new Error(`Timeline API returned HTTP ${resp.status}`)
  }
  const json: unknown = await resp.json()
  if (!Array.isArray(json)) {
    throw new Error('Timeline API returned non-array payload')
  }
  return json as TimelineEvent[]
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export interface CachedTimelineResult {
  data: TimelineEvent[]
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useCachedTimeline(
  rangeMs: number = DEFAULT_RANGE_MS,
): CachedTimelineResult {
  const { isDemoMode } = useDemoMode()

  const stableDemoData = useMemo(() => getDemoTimelineEvents(), [])

  const cacheResult = useCache<TimelineEvent[]>({
    key: `${CACHE_KEY_TIMELINE}_${rangeMs}`,
    category: TIMELINE_CATEGORY,
    initialData: INITIAL_DATA,
    demoData: stableDemoData,
    fetcher: () => fetchTimelineEvents(rangeMs),
  })

  // Rule 2: Never use demo data during loading.
  const isDemoData = (isDemoMode || cacheResult.isDemoFallback) && !cacheResult.isLoading

  return {
    data: isDemoMode ? stableDemoData : cacheResult.data,
    isLoading: cacheResult.isLoading,
    isRefreshing: cacheResult.isRefreshing,
    isDemoData,
    isFailed: cacheResult.isFailed,
    consecutiveFailures: cacheResult.consecutiveFailures,
    lastRefresh: cacheResult.lastRefresh,
    refetch: cacheResult.refetch,
  }
}

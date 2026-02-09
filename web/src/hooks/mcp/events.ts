import { useState, useEffect, useCallback, useRef } from 'react'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerRefetch } from '../../lib/modeTransition'
import { registerCacheReset } from '../../lib/modeTransition'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, LOCAL_AGENT_URL } from './shared'
import type { ClusterEvent } from './types'

// ---------------------------------------------------------------------------
// Shared Events State - enables cache reset notifications to all consumers
// ---------------------------------------------------------------------------

interface EventsSharedState {
  cacheVersion: number
  isResetting: boolean
}

let eventsSharedState: EventsSharedState = {
  cacheVersion: 0,
  isResetting: false,
}

type EventsSubscriber = (state: EventsSharedState) => void
const eventsSubscribers = new Set<EventsSubscriber>()

function notifyEventsSubscribers() {
  eventsSubscribers.forEach(subscriber => subscriber(eventsSharedState))
}

export function subscribeEventsCache(callback: EventsSubscriber): () => void {
  eventsSubscribers.add(callback)
  return () => eventsSubscribers.delete(callback)
}

// Module-level cache for events data (persists across navigation)
interface EventsCache {
  data: ClusterEvent[]
  timestamp: Date
  key: string
}
let eventsCache: EventsCache | null = null

export function useEvents(cluster?: string, namespace?: string, limit = 20) {
  const cacheKey = `events:${cluster || 'all'}:${namespace || 'all'}:${limit}`
  // Track AbortController for cleanup on unmount
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  // Initialize from cache if available
  const getCachedData = () => {
    if (eventsCache && eventsCache.key === cacheKey) {
      return { data: eventsCache.data, timestamp: eventsCache.timestamp }
    }
    return null
  }

  const cached = getCachedData()
  const [events, setEvents] = useState<ClusterEvent[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)

  const refetch = useCallback(async (silent = false) => {
    // In demo mode, use demo data
    if (isDemoMode()) {
      const demoEvents = getDemoEvents().filter(e =>
        (!cluster || e.cluster === cluster) && (!namespace || e.namespace === namespace)
      ).slice(0, limit)
      setEvents(demoEvents)
      const now = new Date()
      setLastUpdated(now)
      setLastRefresh(now)
      setIsLoading(false)
      setError(null)
      if (!silent) {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
      return
    }

    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      // Always set isRefreshing first so indicator shows
      setIsRefreshing(true)
      const hasCachedData = eventsCache && eventsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }

    // Abort any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    // Try local agent HTTP endpoint first (works without backend)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        params.append('limit', limit.toString())
        console.log(`[useEvents] Fetching from local agent for ${cluster}`)

        const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/events?${params}`, {
          signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          const eventData = data.events || []
          console.log(`[useEvents] Got ${eventData.length} events for ${cluster} from local agent`)
          const now = new Date()
          eventsCache = { data: eventData, timestamp: now, key: cacheKey }
          setEvents(eventData)
          setError(null)
          setLastUpdated(now)
          setConsecutiveFailures(0)
          setLastRefresh(now)
          setIsLoading(false)
          if (!silent) {
            setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
          } else {
            setIsRefreshing(false)
          }
          reportAgentDataSuccess()
          return
        }
        console.log(`[useEvents] Local agent returned ${response.status}, trying REST API`)
      } catch (err) {
        console.error(`[useEvents] Local agent failed for ${cluster}:`, err)
      }
    }

    // Fall back to REST API
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      params.append('limit', limit.toString())
      const url = `/api/mcp/events?${params}`

      // Use direct fetch with shared AbortController signal
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), 10000) // 10 second timeout

      const response = await fetch(url, { method: 'GET', headers, signal })
      clearTimeout(timeoutId)
      // console.log('[useEvents] Fetch completed with status:', response.status)

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { events: ClusterEvent[] }
      const newData = data.events || []
      const now = new Date()

      // Update module-level cache
      eventsCache = { data: newData, timestamp: now, key: cacheKey }

      setEvents(newData)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
      // console.log('[useEvents] Data updated successfully')
    } catch (err) {
      // Ignore abort errors (expected on unmount or when a new request supersedes)
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      console.error('[useEvents] Failed to fetch events:', err)
      // Only update state if still mounted
      if (!isMountedRef.current) return
      // Keep stale data, only use demo if no cached data
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !eventsCache) {
        setError('Failed to fetch events')
        setEvents(getDemoEvents())
      }
    } finally {
      // Only update state if still mounted
      if (!isMountedRef.current) return
      // console.log('[useEvents] Finally block started')
      setIsLoading(false)
      // Keep isRefreshing true for minimum time so user can see it, then reset
      if (!silent) {
        // console.log('[useEvents] Scheduling isRefreshing=false after 500ms')
        setTimeout(() => {
          // console.log('[useEvents] Setting isRefreshing=false')
          setIsRefreshing(false)
        }, MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [cluster, namespace, limit, cacheKey])

  // Track mounted state for cleanup
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      // Abort any in-flight request on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  useEffect(() => {
    const hasCachedData = eventsCache && eventsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll every 30 seconds for events
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`events:${cacheKey}`, () => refetch(false))

    return () => {
      clearInterval(interval)
      unregisterRefetch()
    }
  }, [refetch, cacheKey])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: EventsSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setEvents([])
        setLastUpdated(null)
      }
    }
    return subscribeEventsCache(handleCacheReset)
  }, [])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch(false)
  }, [demoMode, refetch])

  return {
    events,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// Module-level cache for warning events data (persists across navigation)
interface WarningEventsCache {
  data: ClusterEvent[]
  timestamp: Date
  key: string
}
let warningEventsCache: WarningEventsCache | null = null

export function useWarningEvents(cluster?: string, namespace?: string, limit = 20) {
  const cacheKey = `warningEvents:${cluster || 'all'}:${namespace || 'all'}:${limit}`
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  // Initialize from cache if available
  const getCachedData = () => {
    if (warningEventsCache && warningEventsCache.key === cacheKey) {
      return { data: warningEventsCache.data, timestamp: warningEventsCache.timestamp }
    }
    return null
  }

  const cached = getCachedData()
  const [events, setEvents] = useState<ClusterEvent[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      // Always set isRefreshing first so indicator shows
      setIsRefreshing(true)
      const hasCachedData = warningEventsCache && warningEventsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      params.append('limit', limit.toString())
      const url = `/api/mcp/events/warnings?${params}`

      // In demo mode, use demo data
      if (isDemoMode()) {
        const demoWarnings = getDemoEvents().filter(e =>
          e.type === 'Warning' &&
          (!cluster || e.cluster === cluster) &&
          (!namespace || e.namespace === namespace)
        ).slice(0, limit)
        setEvents(demoWarnings)
        const now = new Date()
        setLastUpdated(now)
        setError(null)
        setIsLoading(false)
        if (!silent) {
          setIsRefreshing(true)
          setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        } else {
          setIsRefreshing(false)
        }
        return
      }

      // Use direct fetch to bypass the global circuit breaker
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(url, { method: 'GET', headers })
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { events: ClusterEvent[] }
      const newData = data.events || []
      const now = new Date()

      // Update module-level cache
      warningEventsCache = { data: newData, timestamp: now, key: cacheKey }

      setEvents(newData)
      setError(null)
      setLastUpdated(now)
    } catch (err) {
      // Keep stale data, only use demo if no cached data
      if (!silent && !warningEventsCache) {
        setError('Failed to fetch warning events')
        setEvents(getDemoEvents().filter(e => e.type === 'Warning'))
      }
    } finally {
      setIsLoading(false)
      // Keep isRefreshing true for minimum time so user can see it, then reset
      if (!silent) {
        setTimeout(() => {
          setIsRefreshing(false)
        }, MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [cluster, namespace, limit, cacheKey])

  useEffect(() => {
    const hasCachedData = warningEventsCache && warningEventsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll every 30 seconds for events
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`warning-events:${cacheKey}`, () => refetch(false))

    return () => {
      clearInterval(interval)
      unregisterRefetch()
    }
  }, [refetch, cacheKey])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: EventsSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setEvents([])
        setLastUpdated(null)
      }
    }
    return subscribeEventsCache(handleCacheReset)
  }, [])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch(false)
  }, [demoMode, refetch])

  return { events, isLoading, isRefreshing, lastUpdated, error, refetch: () => refetch(false) }
}

function getDemoEvents(): ClusterEvent[] {
  return [
    {
      type: 'Warning',
      reason: 'FailedScheduling',
      message: 'No nodes available to schedule pod',
      object: 'Pod/worker-5c6d7e8f9-n3p2q',
      namespace: 'batch',
      cluster: 'vllm-d',
      count: 3,
    },
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned pod to node-2',
      object: 'Pod/api-server-7d8f9c6b5-abc12',
      namespace: 'production',
      cluster: 'prod-east',
      count: 1,
    },
    {
      type: 'Warning',
      reason: 'BackOff',
      message: 'Back-off restarting failed container',
      object: 'Pod/api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'prod-east',
      count: 15,
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image pulled successfully',
      object: 'Pod/frontend-8e9f0a1b2-def34',
      namespace: 'web',
      cluster: 'staging',
      count: 1,
    },
    {
      type: 'Warning',
      reason: 'Unhealthy',
      message: 'Readiness probe failed: connection refused',
      object: 'Pod/cache-redis-0',
      namespace: 'data',
      cluster: 'staging',
      count: 8,
    },
  ]
}

// Register with mode transition coordinator for unified cache clearing
if (typeof window !== 'undefined') {
  registerCacheReset('events', () => {
    // Set resetting flag to trigger skeleton display
    eventsSharedState = {
      cacheVersion: eventsSharedState.cacheVersion + 1,
      isResetting: true,
    }
    notifyEventsSubscribers()

    eventsCache = null
    warningEventsCache = null

    // Reset the resetting flag after a tick
    setTimeout(() => {
      eventsSharedState = { ...eventsSharedState, isResetting: false }
      notifyEventsSubscribers()
    }, 0)

    console.log('[Events] Caches cleared for mode transition')
  })
}

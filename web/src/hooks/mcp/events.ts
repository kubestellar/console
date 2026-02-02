import { useState, useEffect, useCallback } from 'react'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, LOCAL_AGENT_URL } from './shared'
import type { ClusterEvent } from './types'

// Module-level cache for events data (persists across navigation)
interface EventsCache {
  data: ClusterEvent[]
  timestamp: Date
  key: string
}
let eventsCache: EventsCache | null = null

export function useEvents(cluster?: string, namespace?: string, limit = 20) {
  const cacheKey = `events:${cluster || 'all'}:${namespace || 'all'}:${limit}`

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
    // Skip backend fetch in demo mode - use cached or demo data
    const token = localStorage.getItem('token')
    if (!token || token === 'demo-token') {
      if (!eventsCache) {
        setEvents(getDemoEvents())
      }
      const now = new Date()
      setLastUpdated(now)
      setLastRefresh(now)
      setIsLoading(false)
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

    // Try local agent HTTP endpoint first (works without backend)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        params.append('limit', limit.toString())
        // console.log(`[useEvents] Fetching from local agent for ${cluster}`)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/events?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          const eventData = data.events || []
          // console.log(`[useEvents] Got ${eventData.length} events for ${cluster} from local agent`)
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
        // console.log(`[useEvents] Local agent returned ${response.status}, trying REST API`)
      } catch (err) {
        // Don't log abort errors - these are expected when component unmounts
        const isAbortError = (err instanceof Error || err instanceof DOMException) && err.name === 'AbortError'
        if (!isAbortError) {
          console.error(`[useEvents] Local agent failed for ${cluster}:`, err)
        }
      }
    }

    // Fall back to REST API
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      params.append('limit', limit.toString())
      const url = `/api/mcp/events?${params}`

      // Use direct fetch with timeout to prevent hanging
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      const response = await fetch(url, { method: 'GET', headers, signal: controller.signal })
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
      // Don't log abort errors - these are expected when component unmounts
      const isAbortError = (err instanceof Error || err instanceof DOMException) && err.name === 'AbortError'
      if (isAbortError) {
        return
      }
      console.error('[useEvents] Failed to fetch events:', err)
      // Keep stale data, only use demo if no cached data
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !eventsCache) {
        setError('Failed to fetch events')
        setEvents(getDemoEvents())
      }
    } finally {
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

  useEffect(() => {
    const hasCachedData = eventsCache && eventsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll every 30 seconds for events
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

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

      // Skip API calls when using demo token
      const token = localStorage.getItem('token')
      if (!token || token === 'demo-token') {
        if (!warningEventsCache) {
          setEvents(getDemoEvents().filter(e => e.type === 'Warning'))
        }
        const now = new Date()
        setLastUpdated(now)
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
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
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return { events, isLoading, isRefreshing, lastUpdated, error, refetch: () => refetch(false) }
}

function getDemoEvents(): ClusterEvent[] {
  const now = Date.now()
  return [
    {
      type: 'Warning',
      reason: 'FailedScheduling',
      message: 'No nodes available to schedule pod',
      object: 'Pod/worker-5c6d7e8f9-n3p2q',
      namespace: 'batch',
      cluster: 'vllm-d',
      count: 3,
      firstSeen: new Date(now - 5 * 60000).toISOString(),
      lastSeen: new Date(now - 2 * 60000).toISOString(),
    },
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned pod to node-2',
      object: 'Pod/api-server-7d8f9c6b5-abc12',
      namespace: 'production',
      cluster: 'prod-east',
      count: 1,
      firstSeen: new Date(now - 8 * 60000).toISOString(),
      lastSeen: new Date(now - 8 * 60000).toISOString(),
    },
    {
      type: 'Warning',
      reason: 'BackOff',
      message: 'Back-off restarting failed container',
      object: 'Pod/api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'prod-east',
      count: 15,
      firstSeen: new Date(now - 30 * 60000).toISOString(),
      lastSeen: new Date(now - 1 * 60000).toISOString(),
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image pulled successfully',
      object: 'Pod/frontend-8e9f0a1b2-def34',
      namespace: 'web',
      cluster: 'staging',
      count: 1,
      firstSeen: new Date(now - 12 * 60000).toISOString(),
      lastSeen: new Date(now - 12 * 60000).toISOString(),
    },
    {
      type: 'Warning',
      reason: 'Unhealthy',
      message: 'Readiness probe failed: connection refused',
      object: 'Pod/cache-redis-0',
      namespace: 'data',
      cluster: 'staging',
      count: 8,
      firstSeen: new Date(now - 20 * 60000).toISOString(),
      lastSeen: new Date(now - 3 * 60000).toISOString(),
    },
    {
      type: 'Normal',
      reason: 'Created',
      message: 'Created container nginx',
      object: 'Pod/nginx-deployment-abc123',
      namespace: 'default',
      cluster: 'dev-local',
      count: 2,
      firstSeen: new Date(now - 6 * 60000).toISOString(),
      lastSeen: new Date(now - 4 * 60000).toISOString(),
    },
    {
      type: 'Normal',
      reason: 'Started',
      message: 'Started container nginx',
      object: 'Pod/nginx-deployment-abc123',
      namespace: 'default',
      cluster: 'dev-local',
      count: 2,
      firstSeen: new Date(now - 6 * 60000).toISOString(),
      lastSeen: new Date(now - 4 * 60000).toISOString(),
    },
    {
      type: 'Warning',
      reason: 'ImagePullBackOff',
      message: 'Back-off pulling image "invalid-image:latest"',
      object: 'Pod/broken-pod-xyz789',
      namespace: 'staging',
      cluster: 'staging-us',
      count: 5,
      firstSeen: new Date(now - 15 * 60000).toISOString(),
      lastSeen: new Date(now - 1 * 60000).toISOString(),
    },
    {
      type: 'Normal',
      reason: 'ScalingReplicaSet',
      message: 'Scaled up replica set to 3',
      object: 'Deployment/api-gateway',
      namespace: 'production',
      cluster: 'prod-us-east',
      count: 1,
      firstSeen: new Date(now - 10 * 60000).toISOString(),
      lastSeen: new Date(now - 10 * 60000).toISOString(),
    },
    {
      type: 'Warning',
      reason: 'NodeNotReady',
      message: 'Node condition Ready is now: Unknown',
      object: 'Node/worker-node-3',
      namespace: '',
      cluster: 'prod-eu-west',
      count: 2,
      firstSeen: new Date(now - 25 * 60000).toISOString(),
      lastSeen: new Date(now - 7 * 60000).toISOString(),
    },
  ]
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { fetchSSE } from '../../../lib/sseClient'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, getLocalAgentURL, agentFetch } from '../shared'
import { subscribePolling } from '../pollingManager'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { CONSECUTIVE_FAILURE_THRESHOLD } from '../../../lib/cache'
import { isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import type { ClusterEvent } from '../types'
import { eventsCache, getDemoEvents, subscribeEventsCache, type EventsSharedState } from './shared'

export function useEvents(cluster?: string, namespace?: string, limit = 20) {
  const cacheKey = `events:${cluster || 'all'}:${namespace || 'all'}:${limit}`
  const abortControllerRef = useRef<AbortController | null>(null)
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const clearRefreshTimeout = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = null
    }
  }, [])

  const finishRefreshing = useCallback((silent: boolean) => {
    clearRefreshTimeout()
    if (silent) {
      setIsRefreshing(false)
      return
    }
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null
      if (isMountedRef.current) {
        setIsRefreshing(false)
      }
    }, MIN_REFRESH_INDICATOR_MS)
  }, [clearRefreshTimeout])

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
      }
      finishRefreshing(silent)
      return
    }

    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      setIsRefreshing(true)
      const hasCachedData = eventsCache && eventsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal
    const clusterModeBackend = isClusterModeBackend()

    if (cluster && (clusterModeBackend || !isAgentUnavailable())) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        params.append('limit', limit.toString())

        const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), MCP_HOOK_TIMEOUT_MS)
        const response = clusterModeBackend
          ? await fetch(`/api/mcp/events?${params}`, {
              signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
              headers: { 'Accept': 'application/json' },
            })
          : await agentFetch(`${getLocalAgentURL()}/events?${params}`, {
              signal,
              headers: { 'Accept': 'application/json' },
            })
        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          const eventData = data.events || []
          const now = new Date()
          // eventsCache is module-level and shared across all useEvents instances
          Object.assign(eventsCache || {}, { data: eventData, timestamp: now, key: cacheKey })
          setEvents(eventData)
          setError(null)
          setLastUpdated(now)
          setConsecutiveFailures(0)
          setLastRefresh(now)
          setIsLoading(false)
          finishRefreshing(silent)
          if (!clusterModeBackend) {
            reportAgentDataSuccess()
          }
          return
        }
      } catch (err: unknown) {
        console.error(`[useEvents] ${clusterModeBackend ? 'Backend' : 'Local agent'} failed for ${cluster}:`, err)
      }
    }

    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace
      sseParams.limit = limit.toString()

      const allEvents = await fetchSSE<ClusterEvent>({
        url: `${clusterModeBackend ? '/api/mcp' : LOCAL_AGENT_HTTP_URL}/events/stream`,
        params: sseParams,
        itemsKey: 'events',
        signal,
        onClusterData: (_clusterName, items) => {
          if (signal.aborted || !isMountedRef.current) return
          setEvents(prev => [...prev, ...items].slice(0, limit))
          setIsLoading(false)
        },
      })

      if (!isMountedRef.current) return
      const now = new Date()
      Object.assign(eventsCache || {}, { data: allEvents.slice(0, limit), timestamp: now, key: cacheKey })
      setEvents(allEvents.slice(0, limit))
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return
      if (!isMountedRef.current) return
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !eventsCache) {
        setError('Failed to fetch events')
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
        finishRefreshing(silent)
      }
    }
  }, [cacheKey, cluster, finishRefreshing, limit, namespace])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      clearRefreshTimeout()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [clearRefreshTimeout])

  useEffect(() => {
    const hasCachedData = eventsCache && eventsCache.key === cacheKey
    refetch(!!hasCachedData)
    return registerRefetch(`events:${cacheKey}`, () => refetch(false))
  }, [cacheKey, refetch])

  useEffect(() => {
    return subscribePolling(
      `events:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
      () => refetch(true),
    )
  }, [cacheKey, consecutiveFailures, refetch])

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
    isFailed: consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD,
    lastRefresh,
  }
}

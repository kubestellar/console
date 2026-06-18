import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchSSE } from '../../../lib/sseClient'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval } from '../shared'
import { subscribePolling } from '../pollingManager'
import type { ClusterEvent } from '../types'
import { warningEventsCache, getDemoEvents, subscribeEventsCache, type EventsSharedState } from './shared'

export function useWarningEvents(cluster?: string, namespace?: string, limit = 20) {
  const cacheKey = `warningEvents:${cluster || 'all'}:${namespace || 'all'}:${limit}`
  const abortControllerRef = useRef<AbortController | null>(null)
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

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
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

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
    if (!silent) {
      setIsRefreshing(true)
      const hasCachedData = warningEventsCache && warningEventsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }

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
      finishRefreshing(silent)
      return
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace
      sseParams.limit = limit.toString()

      const allEvents = await fetchSSE<ClusterEvent>({
        url: `/api/mcp/events/warnings/stream`,
        params: sseParams,
        itemsKey: 'events',
        signal,
        onClusterData: (_clusterName, items) => {
          if (signal.aborted || !isMountedRef.current) return
          setEvents(prev => [...prev, ...items].slice(0, limit))
          setIsLoading(false)
        },
      })

      if (signal.aborted || !isMountedRef.current) return
      const now = new Date()
      Object.assign(warningEventsCache || {}, { data: allEvents.slice(0, limit), timestamp: now, key: cacheKey })
      setEvents(allEvents.slice(0, limit))
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return
      if (!isMountedRef.current) return
      setConsecutiveFailures(prev => prev + 1)
      if (!silent && !warningEventsCache) {
        setError('Failed to fetch warning events')
      }
    } finally {
      if (isMountedRef.current && !signal.aborted) {
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
    const hasCachedData = warningEventsCache && warningEventsCache.key === cacheKey
    refetch(!!hasCachedData)
    return registerRefetch(`warning-events:${cacheKey}`, () => refetch(false))
  }, [cacheKey, refetch])

  useEffect(() => {
    return subscribePolling(
      `warningEvents:${cacheKey}`,
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

  return { events, isLoading, isRefreshing, lastUpdated, error, refetch: () => refetch(false) }
}

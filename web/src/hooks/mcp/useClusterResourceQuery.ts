import { useState, useEffect, useCallback, useRef } from 'react'
import { isDemoMode } from '../../lib/demoMode'
import { registerRefetch } from '../../lib/modeTransition'
import { REFRESH_INTERVAL_MS, getEffectiveInterval, agentFetch } from './shared'
import { subscribePolling } from './pollingManager'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../lib/constants/network'
import { isClusterModeBackend } from '../../lib/cache/fetcherUtils'

/**
 * Configuration for useClusterResourceQuery — a generic hook that handles
 * the repeated pattern of: demo check → backend/agent fetch → poll + mode transition.
 *
 * Covers the "simple" resource hooks (useResourceQuotas, useLimitRanges) and can
 * be extended to other single-endpoint resources that follow the same pattern.
 */
export interface ClusterResourceQueryConfig<T> {
  /** Unique key for polling/refetch registration (e.g., 'resourceQuotas') */
  resourceKey: string
  /** API endpoint path segment (e.g., 'resourcequotas', 'limitranges') */
  endpoint: string
  /** Field name in the JSON response (e.g., 'resourceQuotas', 'limitRanges') */
  dataField: string
  /** Function returning demo data (unfiltered) */
  getDemoData: () => T[]
  /** Filter function applied to demo data */
  filterFn?: (item: T, cluster?: string, namespace?: string) => boolean
  /** Cluster filter */
  cluster?: string
  /** Namespace filter */
  namespace?: string
  /** When true, skip demo mode and always fetch live data */
  forceLive?: boolean
  /** When true, suppress errors (set error to null on failure). Default: true */
  silentErrors?: boolean
}

export interface ClusterResourceQueryResult<T> {
  data: T[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  /** True when serving demo data instead of live */
  isDemoFallback: boolean
  consecutiveFailures: number
}

export function useClusterResourceQuery<T>(
  config: ClusterResourceQueryConfig<T>
): ClusterResourceQueryResult<T> {
  const {
    resourceKey,
    endpoint,
    dataField,
    getDemoData,
    filterFn,
    cluster,
    namespace,
    forceLive = false,
    silentErrors = true,
  } = config

  const [data, setData] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDemoFallback, setIsDemoFallback] = useState(false)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    // Demo mode check (unless forceLive overrides)
    if (!forceLive && isDemoMode()) {
      const demoData = getDemoData()
      const filtered = filterFn
        ? demoData.filter(item => filterFn(item, cluster, namespace))
        : demoData
      if (!isMountedRef.current) return
      setData(filtered)
      setIsDemoFallback(true)
      setIsLoading(false)
      setError(null)
      return
    }

    if (!isMountedRef.current) return
    setIsLoading(true)

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)

      // Try backend API first (cluster-mode)
      if (isClusterModeBackend()) {
        try {
          const response = await fetch(`/api/mcp/${endpoint}?${params}`, {
            signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
          })
          if (response.ok) {
            const json = await response.json()
            if (!isMountedRef.current) return
            setData(json[dataField] || [])
            setIsDemoFallback(false)
            setError(null)
            setConsecutiveFailures(0)
            setIsLoading(false)
            return
          }
        } catch (err) {
          console.warn(`[${resourceKey}] Backend fetch failed:`, err)
        }
        if (!isMountedRef.current) return
        setIsLoading(false)
        return
      }

      // Fallback: local agent HTTP
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/${endpoint}?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json()
      if (!isMountedRef.current) return
      setData(json[dataField] || [])
      setIsDemoFallback(false)
      setError(null)
      setConsecutiveFailures(0)
    } catch {
      if (!isMountedRef.current) return
      if (silentErrors) {
        setError(null)
        setData([])
      } else {
        setError(`Failed to fetch ${resourceKey}`)
      }
      setIsDemoFallback(false)
      setConsecutiveFailures(prev => prev + 1)
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [cluster, namespace, forceLive, resourceKey, endpoint, dataField, getDemoData, filterFn, silentErrors])

  useEffect(() => {
    refetch()

    const pollKey = `${resourceKey}:${cluster || 'all'}:${namespace || 'all'}`
    const unsubscribePolling = subscribePolling(
      pollKey,
      getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
      () => refetch(),
    )

    const unregisterRefetch = registerRefetch(
      `${resourceKey}:${cluster || 'all'}:${namespace || 'all'}`,
      () => refetch(),
    )

    return () => {
      unsubscribePolling()
      unregisterRefetch()
    }
  }, [refetch, cluster, namespace, consecutiveFailures, resourceKey])

  return {
    data,
    isLoading,
    error,
    refetch: () => refetch(),
    isDemoFallback,
    consecutiveFailures,
  }
}

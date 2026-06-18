import { useState, useEffect, useCallback, useRef } from 'react'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { MIN_REFRESH_INDICATOR_MS } from '../shared'
import { MCP_HOOK_TIMEOUT_MS, FOCUS_DELAY_MS } from '../../../lib/constants/network'

// Cache TTL - matches the value in useHelmReleases.ts
const HELM_CACHE_TTL_MS = 30000 // 30 seconds before stale

// Demo Helm values for a release
function getDemoHelmValues(): Record<string, unknown> {
  return {
    replicaCount: 2,
    image: { repository: 'prom/prometheus', tag: 'v2.48.1', pullPolicy: 'IfNotPresent' },
    service: { type: 'ClusterIP', port: 9090 },
    resources: { limits: { cpu: '500m', memory: '512Mi' }, requests: { cpu: '200m', memory: '256Mi' } },
    persistence: { enabled: true, size: '50Gi', storageClass: 'gp3' },
    alertmanager: { enabled: true },
    nodeExporter: { enabled: true },
    serverFiles: { 'alerting_rules.yml': {}, 'recording_rules.yml': {} } }
}

// Module-level cache for Helm values - keyed by cluster:release:namespace
const helmValuesCache = new Map<string, {
  values: Record<string, unknown> | string | null
  format: 'json' | 'yaml'
  timestamp: number
  consecutiveFailures: number
}>()

// Hook to fetch Helm release values
export function useHelmValues(cluster?: string, release?: string, namespace?: string) {
  // Build cache key - requires all three params to be valid
  // We must have namespace to make a meaningful API call
  const cacheKey = cluster && release && namespace ? `${cluster}:${release}:${namespace}` : ''
  const cachedEntry = cacheKey ? helmValuesCache.get(cacheKey) : undefined
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const [values, setValues] = useState<Record<string, unknown> | string | null>(cachedEntry?.values || null)
  const [format, setFormat] = useState<'json' | 'yaml'>(cachedEntry?.format || 'json')
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(cachedEntry?.consecutiveFailures || 0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cachedEntry?.timestamp || null)

  // Track the key we last initiated a fetch for (to avoid duplicate fetches)
  const fetchingKeyRef = useRef<string | null>(null)

  const refetch = useCallback(async () => {
    // Always set isRefreshing to show animation on manual refresh (even if returning early)
    setIsRefreshing(true)

    if (!release) {
      setValues(null)
      // Brief delay before clearing isRefreshing so animation shows
      setTimeout(() => setIsRefreshing(false), FOCUS_DELAY_MS)
      return
    }

    // Check cache directly to determine if we should show loading state
    const currentCacheKey = cluster && release && namespace ? `${cluster}:${release}:${namespace}` : ''
    const currentCached = currentCacheKey ? helmValuesCache.get(currentCacheKey) : undefined
    if (!currentCached || currentCached.values === null) {
      setIsLoading(true)
    }

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      params.append('release', release)
      if (namespace) params.append('namespace', namespace)
      const url = `/api/gitops/helm-values?${params}`

      // Skip API calls when using demo token — provide demo values
      const token = await getStoredAuthToken()
      if (isDemoMode()) {
        const demoValues = getDemoHelmValues()
        setValues(demoValues)
        setFormat('json')
        setLastRefresh(Date.now())
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

      // Use direct fetch to bypass the global circuit breaker
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { values: Record<string, unknown> | string, format: 'json' | 'yaml', error?: string }

      setValues(data.values)
      setFormat(data.format || 'json')
      setError(data.error || null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())

      // Update cache
      if (cluster && release && namespace) {
        helmValuesCache.set(`${cluster}:${release}:${namespace}`, {
          values: data.values,
          format: data.format || 'json',
          timestamp: Date.now(),
          consecutiveFailures: 0
        })
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm values'
      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)

      // Update cache failure count - read from cache directly
      if (cluster && release && namespace) {
        const cacheKeyForError = `${cluster}:${release}:${namespace}`
        const existingCache = helmValuesCache.get(cacheKeyForError)
        if (existingCache) {
          helmValuesCache.set(cacheKeyForError, {
            ...existingCache,
            consecutiveFailures: (existingCache.consecutiveFailures || 0) + 1
          })
        }
      }
      // Keep cached data on error
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, release, namespace])

  // Effect to trigger fetch when cluster/release/namespace change
  useEffect(() => {
    // Clear values when release is deselected
    if (!release) {
      setValues(null)
      fetchingKeyRef.current = null
      return
    }

    // CRITICAL: Don't fetch until namespace is available
    // Fetching without namespace will return empty results
    if (!namespace) {
      return
    }

    // Build the unique cache key for this request
    const key = `${cluster}:${release}:${namespace}`

    // Skip if we're already fetching/fetched this exact key
    if (fetchingKeyRef.current === key) {
      return
    }

    // Mark that we're handling this key
    fetchingKeyRef.current = key

    // Check cache first
    const cached = helmValuesCache.get(key)

    if (cached && cached.values !== null) {
      // Use cached data
      setValues(cached.values)
      setFormat(cached.format)
      setLastRefresh(cached.timestamp)
      setConsecutiveFailures(cached.consecutiveFailures || 0)
      // Refresh in background if stale
      if (Date.now() - cached.timestamp > HELM_CACHE_TTL_MS) {
        refetch()
      }
    } else {
      // No cache - fetch fresh data using direct fetch (bypasses circuit breaker)
      const doFetch = async () => {
        // Skip API calls when using demo token — provide demo values
        const token = await getStoredAuthToken()
        if (isDemoMode()) {
          const demoValues = getDemoHelmValues()
          setValues(demoValues)
          setFormat('json')
          setLastRefresh(Date.now())
          setIsLoading(false)
          setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
          return
        }

        setIsLoading(true)
        setIsRefreshing(true)
        try {
          const params = new URLSearchParams()
          if (cluster) params.append('cluster', cluster)
          params.append('release', release)
          if (namespace) params.append('namespace', namespace)
          const url = `/api/gitops/helm-values?${params}`

          // Use direct fetch to bypass the global circuit breaker
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          headers['Authorization'] = `Bearer ${token}`
          const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`)
          }
          const data = await response.json() as { values: Record<string, unknown> | string, format: 'json' | 'yaml', error?: string }

          setValues(data.values)
          setFormat(data.format || 'json')
          setError(data.error || null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())

          // Update cache
          helmValuesCache.set(key, {
            values: data.values,
            format: data.format || 'json',
            timestamp: Date.now(),
            consecutiveFailures: 0
          })
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm values'
          setError(errorMessage)
          setConsecutiveFailures(prev => prev + 1)
        } finally {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
      doFetch()
    }

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`helm-values:${key}`, refetch)
    return () => unregisterRefetch()
  }, [cluster, release, namespace, refetch])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    if (release && namespace) refetch()
  }, [demoMode, refetch, release, namespace])

  const isFailed = consecutiveFailures >= 3

  return { values, format, isLoading, isRefreshing, error, refetch, isFailed, consecutiveFailures, lastRefresh }
}

// Export internal symbol for assembly in barrel
export { getDemoHelmValues }

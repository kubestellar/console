import { useCallback, useEffect, useRef, useState } from 'react'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { FOCUS_DELAY_MS, MCP_HOOK_TIMEOUT_MS } from '../../../lib/constants/network'
import { MIN_REFRESH_INDICATOR_MS } from '../shared'
import { getDemoHelmValues, HELM_CACHE_TTL_MS, helmValuesCache } from './shared'

export function useHelmValues(cluster?: string, release?: string, namespace?: string) {
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
  const fetchingKeyRef = useRef<string | null>(null)

  const refetch = useCallback(async () => {
    setIsRefreshing(true)

    if (!release) {
      setValues(null)
      setTimeout(() => setIsRefreshing(false), FOCUS_DELAY_MS)
      return
    }

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
      const token = await getStoredAuthToken()

      if (isDemoMode()) {
        setValues(getDemoHelmValues())
        setFormat('json')
        setLastRefresh(Date.now())
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
      if (!response.ok) throw new Error(`API error: ${response.status}`)

      const data = await response.json() as { values: Record<string, unknown> | string, format: 'json' | 'yaml', error?: string }
      setValues(data.values)
      setFormat(data.format || 'json')
      setError(data.error || null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())

      if (cluster && release && namespace) {
        helmValuesCache.set(`${cluster}:${release}:${namespace}`, {
          values: data.values,
          format: data.format || 'json',
          timestamp: Date.now(),
          consecutiveFailures: 0,
        })
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm values'
      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)

      if (cluster && release && namespace) {
        const cacheKeyForError = `${cluster}:${release}:${namespace}`
        const existingCache = helmValuesCache.get(cacheKeyForError)
        if (existingCache) {
          helmValuesCache.set(cacheKeyForError, {
            ...existingCache,
            consecutiveFailures: (existingCache.consecutiveFailures || 0) + 1,
          })
        }
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, namespace, release])

  useEffect(() => {
    if (!release) {
      setValues(null)
      fetchingKeyRef.current = null
      return
    }
    if (!namespace) {
      return
    }

    const key = `${cluster}:${release}:${namespace}`
    if (fetchingKeyRef.current === key) {
      return
    }
    fetchingKeyRef.current = key

    const cached = helmValuesCache.get(key)
    if (cached && cached.values !== null) {
      setValues(cached.values)
      setFormat(cached.format)
      setLastRefresh(cached.timestamp)
      setConsecutiveFailures(cached.consecutiveFailures || 0)
      if (Date.now() - cached.timestamp > HELM_CACHE_TTL_MS) {
        refetch()
      }
    } else {
      const doFetch = async () => {
        const token = await getStoredAuthToken()
        if (isDemoMode()) {
          setValues(getDemoHelmValues())
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
          const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
          const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
          if (!response.ok) throw new Error(`API error: ${response.status}`)

          const data = await response.json() as { values: Record<string, unknown> | string, format: 'json' | 'yaml', error?: string }
          setValues(data.values)
          setFormat(data.format || 'json')
          setError(data.error || null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())
          helmValuesCache.set(key, {
            values: data.values,
            format: data.format || 'json',
            timestamp: Date.now(),
            consecutiveFailures: 0,
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
      void doFetch()
    }

    const unregisterRefetch = registerRefetch(`helm-values:${key}`, refetch)
    return () => unregisterRefetch()
  }, [cluster, namespace, refetch, release])

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

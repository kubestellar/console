import { useCallback, useEffect, useRef, useState } from 'react'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { MCP_HOOK_TIMEOUT_MS, MIN_REFRESH_INDICATOR_MS, SHORT_DELAY_MS } from '../../../lib/constants/network'
import type { HelmHistoryEntry } from '../types'
import {
  getDemoHelmHistory,
  HELM_CACHE_TTL_MS,
  helmHistoryCache,
  saveHelmHistoryToStorage,
} from './shared'

export function useHelmHistory(cluster?: string, release?: string, namespace?: string) {
  const cacheKey = cluster && release ? `${cluster}:${release}` : ''
  const cachedEntry = cacheKey ? helmHistoryCache.get(cacheKey) : undefined
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)
  const [history, setHistory] = useState<HelmHistoryEntry[]>(cachedEntry?.data || [])
  const [isLoading, setIsLoading] = useState(cachedEntry?.data.length === 0 || !cachedEntry)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(cachedEntry?.consecutiveFailures || 0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cachedEntry?.timestamp || null)

  const refetch = useCallback(async () => {
    setIsRefreshing(true)

    if (!release) {
      setHistory([])
      setTimeout(() => setIsRefreshing(false), SHORT_DELAY_MS)
      return
    }

    setHistory(prev => {
      if (prev.length === 0) setIsLoading(true)
      return prev
    })

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      params.append('release', release)
      if (namespace) params.append('namespace', namespace)
      const url = `/api/gitops/helm-history?${params}`
      const token = await getStoredAuthToken()

      if (isDemoMode()) {
        setHistory(getDemoHelmHistory())
        setLastRefresh(Date.now())
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
      if (!response.ok) throw new Error(`API error: ${response.status}`)

      const data = await response.json() as { history: HelmHistoryEntry[], error?: string }
      const newHistory = data.history || []
      setHistory(newHistory)
      setError(data.error || null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())

      if (cluster && release) {
        helmHistoryCache.set(`${cluster}:${release}`, {
          data: newHistory,
          timestamp: Date.now(),
          consecutiveFailures: 0,
        })
        saveHelmHistoryToStorage(helmHistoryCache)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm history'
      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)

      if (cluster && release) {
        const currentCached = helmHistoryCache.get(`${cluster}:${release}`)
        if (currentCached) {
          helmHistoryCache.set(`${cluster}:${release}`, {
            ...currentCached,
            consecutiveFailures: (currentCached.consecutiveFailures || 0) + 1,
          })
          saveHelmHistoryToStorage(helmHistoryCache)
        }
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, namespace, release])

  useEffect(() => {
    const key = cluster && release ? `${cluster}:${release}` : ''
    const cached = key ? helmHistoryCache.get(key) : undefined

    if (cached && cached.data.length > 0) {
      setHistory(cached.data)
      setLastRefresh(cached.timestamp)
      setConsecutiveFailures(cached.consecutiveFailures || 0)
      if (Date.now() - cached.timestamp > HELM_CACHE_TTL_MS) {
        refetch()
      }
    } else if (release) {
      refetch()
    } else {
      setIsLoading(false)
    }

    const unregisterRefetch = registerRefetch(`helm-history:${key}`, refetch)
    return () => unregisterRefetch()
  }, [cluster, release, refetch])

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    if (release) refetch()
  }, [demoMode, refetch, release])

  const isFailed = consecutiveFailures >= 3
  return { history, isLoading, isRefreshing, error, refetch, isFailed, consecutiveFailures, lastRefresh }
}

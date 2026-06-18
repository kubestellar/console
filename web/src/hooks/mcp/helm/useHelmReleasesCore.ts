import { useCallback, useEffect, useRef, useState } from 'react'
import { isNetlifyDeployment, isDemoMode } from '../../../lib/demoMode'
import { fetchSSE } from '../../../lib/sseClient'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { getEffectiveInterval } from '../shared'
import { subscribePolling } from '../pollingManager'
import { MCP_HOOK_TIMEOUT_MS } from '../../../lib/constants/network'
import type { HelmRelease } from '../types'
import {
  getDemoHelmReleases,
  HELM_CACHE_TTL_MS,
  HELM_REFRESH_INTERVAL_MS,
  helmReleasesCache,
  saveHelmReleasesToStorage,
  type HelmReleasesCacheState,
} from './shared'

export function useHelmReleases(cluster?: string) {
  const [releases, setReleases] = useState<HelmRelease[]>(helmReleasesCache.data)
  const [isLoading, setIsLoading] = useState(helmReleasesCache.data.length === 0)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(helmReleasesCache.lastError)
  const [consecutiveFailures, setConsecutiveFailures] = useState(helmReleasesCache.consecutiveFailures)
  const consecutiveFailuresRef = useRef(consecutiveFailures)
  consecutiveFailuresRef.current = consecutiveFailures
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    helmReleasesCache.timestamp > 0 ? helmReleasesCache.timestamp : null,
  )

  useEffect(() => {
    const updateHandler = (state: HelmReleasesCacheState) => {
      setReleases(state.releases)
      setIsLoading(state.isLoading)
      setIsRefreshing(state.isRefreshing)
      setConsecutiveFailures(state.consecutiveFailures)
      setError(state.lastError)
      setLastRefresh(state.lastRefresh)
    }

    helmReleasesCache.listeners.add(updateHandler)
    return () => {
      helmReleasesCache.listeners.delete(updateHandler)
    }
  }, [])

  const notifyListenersRef = useRef((refreshing: boolean, loading = false) => {
    const state: HelmReleasesCacheState = {
      releases: helmReleasesCache.data,
      isLoading: loading,
      isRefreshing: refreshing,
      consecutiveFailures: helmReleasesCache.consecutiveFailures,
      lastError: helmReleasesCache.lastError,
      lastRefresh: helmReleasesCache.timestamp > 0 ? helmReleasesCache.timestamp : null,
    }
    helmReleasesCache.listeners.forEach(listener => listener(state))
  })
  const notifyListeners = notifyListenersRef.current

  const refetch = useCallback(async (silent = false) => {
    if (isNetlifyDeployment) {
      setIsLoading(false)
      setIsRefreshing(false)
      notifyListeners(false)
      return
    }

    if (!silent) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
      notifyListeners(true)
    }

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      const url = `/api/gitops/helm-releases?${params}`
      const token = await getStoredAuthToken()

      if (isDemoMode()) {
        const demoReleases = getDemoHelmReleases()
        if (!cluster) {
          helmReleasesCache.data = demoReleases
          helmReleasesCache.timestamp = Date.now()
          helmReleasesCache.consecutiveFailures = 0
          helmReleasesCache.lastError = null
          notifyListeners(false)
        }
        setReleases(demoReleases)
        setLastRefresh(Date.now())
        setIsLoading(false)
        setIsRefreshing(false)
        notifyListeners(false)
        return
      }

      const sseAvailable = token && token !== 'demo-token'
      let sseSucceeded = false

      if (sseAvailable) {
        try {
          const sseParams: Record<string, string> = {}
          if (cluster) sseParams.cluster = cluster
          const accumulated: HelmRelease[] = []
          const result = await fetchSSE<HelmRelease>({
            url: '/api/gitops/helm-releases/stream',
            params: sseParams,
            itemsKey: 'releases',
            onClusterData: (_clusterName, items) => {
              accumulated.push(...items)
              setReleases([...accumulated])
              setIsLoading(false)
            },
          })

          sseSucceeded = true
          if (!cluster) {
            helmReleasesCache.data = result
            helmReleasesCache.timestamp = Date.now()
            helmReleasesCache.consecutiveFailures = 0
            helmReleasesCache.lastError = null
            saveHelmReleasesToStorage(result, helmReleasesCache.timestamp)
            notifyListeners(false)
          }

          setReleases(result)
          setError(null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())
        } catch {}
      }

      if (!sseSucceeded) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
        if (!response.ok) throw new Error(`API error: ${response.status}`)

        const data = await response.json() as { releases: HelmRelease[] }
        const newReleases = data.releases || []

        if (!cluster) {
          helmReleasesCache.data = newReleases
          helmReleasesCache.timestamp = Date.now()
          helmReleasesCache.consecutiveFailures = 0
          helmReleasesCache.lastError = null
          saveHelmReleasesToStorage(newReleases, helmReleasesCache.timestamp)
          notifyListeners(false)
        }

        setReleases(newReleases)
        setError(null)
        setConsecutiveFailures(0)
        setLastRefresh(Date.now())
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm releases'
      if (!cluster) {
        helmReleasesCache.consecutiveFailures++
        helmReleasesCache.lastError = errorMessage
        notifyListeners(false)
      }
      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      if (!cluster) notifyListeners(false)
    }
  }, [cluster, notifyListeners])

  useEffect(() => {
    const now = Date.now()
    const cacheAge = now - helmReleasesCache.timestamp
    const cacheValid = !cluster && helmReleasesCache.data.length > 0 && cacheAge < HELM_CACHE_TTL_MS

    if (cacheValid) {
      setReleases(helmReleasesCache.data)
      setIsLoading(false)
      if (cacheAge > HELM_CACHE_TTL_MS / 2) {
        refetch(true)
      }
    } else {
      refetch()
    }

    const unsubscribePolling = subscribePolling(
      `helmReleases:${cluster || 'all'}`,
      getEffectiveInterval(HELM_REFRESH_INTERVAL_MS, consecutiveFailuresRef.current),
      () => refetch(true),
    )
    const unregisterRefetch = registerRefetch(`helm-releases:${cluster || 'all'}`, () => refetch(false))

    return () => {
      unsubscribePolling()
      unregisterRefetch()
    }
  }, [refetch, cluster])

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch(false)
  }, [demoMode, refetch])

  const isFailed = consecutiveFailures >= 3
  return { releases, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed, lastRefresh }
}

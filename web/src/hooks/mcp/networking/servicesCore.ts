import { useCallback, useEffect, useRef, useState } from 'react'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { getStoredAuthToken } from '../../../lib/authToken'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, getLocalAgentURL, agentFetch, clusterCacheRef } from '../shared'
import { subscribePolling } from '../pollingManager'
import { MCP_HOOK_TIMEOUT_MS, DEPLOY_ABORT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { CONSECUTIVE_FAILURE_THRESHOLD } from '../../../lib/cache'
import { isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import type { Service } from '../types'
import {
  getDemoServices,
  getServicesCache,
  loadServicesCacheFromStorage,
  saveServicesCacheToStorage,
  setServicesCache,
  subscribeNetworkingCache,
  type NetworkingSharedState,
} from './shared'

export function useServices(cluster?: string, namespace?: string) {
  const cacheKey = `services:${cluster || 'all'}:${namespace || 'all'}`
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const getCachedData = () => {
    const cached = getServicesCache()
    if (cached && cached.key === cacheKey) {
      return { data: cached.data, timestamp: cached.timestamp }
    }
    return loadServicesCacheFromStorage(cacheKey)
  }

  const cached = getCachedData()
  const [services, setServices] = useState<Service[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)
  const prevClusterRef = useRef<string | undefined>(cluster)
  const prevNamespaceRef = useRef<string | undefined>(namespace)

  useEffect(() => {
    const clusterChanged = prevClusterRef.current !== cluster
    const namespaceChanged = prevNamespaceRef.current !== namespace
    if (clusterChanged || namespaceChanged) {
      setServices([])
      setIsLoading(true)
      setError(null)
      prevClusterRef.current = cluster
      prevNamespaceRef.current = namespace
    }
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
    if (isDemoMode()) {
      const demoServices = getDemoServices().filter(s => (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace))
      setServices(demoServices)
      setError(null)
      setLastUpdated(new Date())
      setConsecutiveFailures(0)
      setLastRefresh(new Date())
      setIsLoading(false)
      if (!silent) {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
      return
    }

    if (!silent) {
      setIsRefreshing(true)
      const hasCachedData = getServicesCache()?.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }

    if (cluster && !isAgentUnavailable()) {
      try {
        const agentParams = new URLSearchParams()
        agentParams.append('cluster', cluster)
        if (namespace) agentParams.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
        const response = await agentFetch(`${getLocalAgentURL()}/services?${agentParams}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const agentData = await response.json()
          const now = new Date()
          const mappedServices: Service[] = (agentData.services || []).map((s: Service) => ({ ...s, cluster }))
          setServicesCache({ data: mappedServices, timestamp: now, key: cacheKey })
          setServices(mappedServices)
          setError(null)
          setLastUpdated(now)
          setConsecutiveFailures(0)
          setLastRefresh(now)
          setIsLoading(false)
          setIsRefreshing(false)
          reportAgentDataSuccess()
          return
        }
      } catch {}
    }

    if (cluster && !isAgentUnavailable()) {
      try {
        const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
        const kubectlContext = clusterInfo?.context || cluster
        const svcPromise = kubectlProxy.getServices(kubectlContext, namespace)
        const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), MCP_HOOK_TIMEOUT_MS))
        const svcData = await Promise.race([svcPromise, timeoutPromise])

        if (svcData && svcData.length >= 0) {
          const now = new Date()
          const mappedServices: Service[] = svcData.map(s => ({
            name: s.name,
            namespace: s.namespace,
            cluster,
            type: s.type,
            clusterIP: s.clusterIP,
            externalIP: s.externalIP || undefined,
            ports: s.ports ? s.ports.split(', ') : [],
            lbStatus: s.lbStatus || undefined,
            selector: s.selector,
          }))
          setServicesCache({ data: mappedServices, timestamp: now, key: cacheKey })
          setServices(mappedServices)
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
          return
        }
      } catch (err: unknown) {
        console.error(`[useServices] kubectl proxy failed for ${cluster}:`, err)
      }
    }

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      if (isClusterModeBackend()) {
        try {
          const response = await fetch(`/api/mcp/services?${params}`, { signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
          if (response.ok) {
            const data = await response.json() as { services: Service[] }
            const newData = data.services || []
            const now = new Date()
            setServicesCache({ data: newData, timestamp: now, key: cacheKey })
            saveServicesCacheToStorage()
            setServices(newData)
            setError(null)
            setLastUpdated(now)
            setConsecutiveFailures(0)
            setLastRefresh(now)
            return
          }
        } catch (err) {
          console.error('[services] Backend fetch failed:', err)
        }
        return
      }

      const url = `${LOCAL_AGENT_HTTP_URL}/services?${params}`
      const token = await getStoredAuthToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), DEPLOY_ABORT_TIMEOUT_MS)
      const response = await fetch(url, { method: 'GET', headers, signal: controller.signal })
      clearTimeout(timeoutId)
      if (!response.ok) throw new Error(`API error: ${response.status}`)

      const data = await response.json() as { services: Service[] }
      const newData = data.services || []
      const now = new Date()
      setServicesCache({ data: newData, timestamp: now, key: cacheKey })
      saveServicesCacheToStorage()
      setServices(newData)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err: unknown) {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      setError(err instanceof Error ? err.message : 'Network request failed')
    } finally {
      setIsLoading(false)
      if (!silent) {
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [cacheKey, cluster, namespace])

  const consecutiveFailuresRef = useRef(consecutiveFailures)
  consecutiveFailuresRef.current = consecutiveFailures

  useEffect(() => {
    const hasCachedData = getServicesCache()?.key === cacheKey
    refetch(!!hasCachedData)

    const unsubscribePolling = subscribePolling(
      `services:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailuresRef.current),
      () => refetch(true),
    )
    const unregisterRefetch = registerRefetch(`services:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      unsubscribePolling()
      unregisterRefetch()
    }
  }, [refetch, cacheKey])

  useEffect(() => {
    const handleCacheReset = (state: NetworkingSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setServices([])
        setLastUpdated(null)
      }
    }
    return subscribeNetworkingCache(handleCacheReset)
  }, [])

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch(false)
  }, [demoMode, refetch])

  return {
    services,
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

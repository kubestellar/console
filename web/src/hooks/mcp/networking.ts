import { useState, useEffect, useCallback, useRef } from 'react'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerCacheReset, registerRefetch } from '../../lib/modeTransition'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { STORAGE_KEY_TOKEN } from '../../lib/constants'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, LOCAL_AGENT_URL, agentFetch, clusterCacheRef } from './shared'
import { subscribePolling } from './pollingManager'
import { MCP_HOOK_TIMEOUT_MS, DEPLOY_ABORT_TIMEOUT_MS, SERVICES_CACHE_TTL_MS, LOCAL_AGENT_HTTP_URL } from '../../lib/constants/network'
import type { Service, Ingress, NetworkPolicy } from './types'
import { getDemoIngresses } from '../useCachedData/demoData'

// ---------------------------------------------------------------------------
// Shared Networking State - enables cache reset notifications to all consumers
// ---------------------------------------------------------------------------

interface NetworkingSharedState {
  cacheVersion: number
  isResetting: boolean
}

let networkingSharedState: NetworkingSharedState = {
  cacheVersion: 0,
  isResetting: false,
}

type NetworkingSubscriber = (state: NetworkingSharedState) => void
const networkingSubscribers = new Set<NetworkingSubscriber>()

function notifyNetworkingSubscribers() {
  Array.from(networkingSubscribers).forEach(subscriber => subscriber(networkingSharedState))
}

export function subscribeNetworkingCache(callback: NetworkingSubscriber): () => void {
  networkingSubscribers.add(callback)
  return () => networkingSubscribers.delete(callback)
}

// Module-level cache for services data (persists across navigation)
const SERVICES_CACHE_KEY = 'kubestellar-services-cache'

interface ServicesCache {
  data: Service[]
  timestamp: Date
  key: string
}
let servicesCache: ServicesCache | null = null

// Load services cache from localStorage
function loadServicesCacheFromStorage(cacheKey: string): { data: Service[], timestamp: Date } | null {
  try {
    const stored = localStorage.getItem(SERVICES_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && parsed.data && parsed.data.length > 0) {
        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date()
        // Enforce cache TTL — discard stale entries so stale data is never
        // served after a fetch failure (#7125)
        const cacheAgeMs = Date.now() - timestamp.getTime()
        if (cacheAgeMs > SERVICES_CACHE_TTL_MS) {
          try { localStorage.removeItem(SERVICES_CACHE_KEY) } catch { /* ignore */ }
          return null
        }
        servicesCache = { data: parsed.data, timestamp, key: cacheKey }
        return { data: parsed.data, timestamp }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function saveServicesCacheToStorage() {
  if (servicesCache) {
    try {
      localStorage.setItem(SERVICES_CACHE_KEY, JSON.stringify({
        data: servicesCache.data,
        timestamp: servicesCache.timestamp.toISOString(),
        key: servicesCache.key
      }))
    } catch {
      // Ignore storage errors
    }
  }
}

// Hook to get services with localStorage-backed caching
export function useServices(cluster?: string, namespace?: string) {
  const cacheKey = `services:${cluster || 'all'}:${namespace || 'all'}`
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  // Initialize from cache if available and matches current key
  const getCachedData = () => {
    if (servicesCache && servicesCache.key === cacheKey) {
      return { data: servicesCache.data, timestamp: servicesCache.timestamp }
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

  // Track previous cluster/namespace to detect actual changes (not just initial mount)
  const prevClusterRef = useRef<string | undefined>(cluster)
  const prevNamespaceRef = useRef<string | undefined>(namespace)

  // Reset state only when cluster/namespace actually CHANGES (not on initial mount)
  useEffect(() => {
    const clusterChanged = prevClusterRef.current !== cluster
    const namespaceChanged = prevNamespaceRef.current !== namespace

    if (clusterChanged || namespaceChanged) {
      // Only reset if values actually changed
      setServices([])
      setIsLoading(true)
      setError(null)

      // Update refs to new values
      prevClusterRef.current = cluster
      prevNamespaceRef.current = namespace
    }
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
    // In demo mode, use demo data
    if (isDemoMode()) {
      const demoServices = getDemoServices().filter(s =>
        (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace)
      )
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

    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      setIsRefreshing(true)
    }

    // Check if we need loading state (no cached data)
    if (!silent) {
      const hasCachedData = servicesCache && servicesCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }

    // Try local agent HTTP endpoint first
    if (cluster && !isAgentUnavailable()) {
      try {
        const agentParams = new URLSearchParams()
        agentParams.append('cluster', cluster)
        if (namespace) agentParams.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
        const response = await agentFetch(`${LOCAL_AGENT_URL}/services?${agentParams}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const agentData = await response.json()
          const now = new Date()
          const mappedServices: Service[] = (agentData.services || []).map((s: Service) => ({ ...s, cluster }))
          servicesCache = { data: mappedServices, timestamp: now, key: cacheKey }
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
      } catch {
        // Fall through to kubectl proxy
      }
    }

    // Try kubectl proxy when cluster is specified
    if (cluster && !isAgentUnavailable()) {
      try {
        const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
        const kubectlContext = clusterInfo?.context || cluster

        // Add timeout to prevent hanging
        const svcPromise = kubectlProxy.getServices(kubectlContext, namespace)
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), MCP_HOOK_TIMEOUT_MS)
        )
        const svcData = await Promise.race([svcPromise, timeoutPromise])

        if (svcData && svcData.length >= 0) {
          const now = new Date()
          // Map to Service format — include LB fields for schema parity (#7123, #7124, #7127)
          const mappedServices: Service[] = svcData.map(s => ({
            name: s.name,
            namespace: s.namespace,
            cluster: cluster,
            type: s.type,
            clusterIP: s.clusterIP,
            externalIP: s.externalIP || undefined,
            ports: s.ports ? s.ports.split(', ') : [],
            lbStatus: s.lbStatus || undefined,
            selector: s.selector,
          }))
          servicesCache = { data: mappedServices, timestamp: now, key: cacheKey }
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
      const url = `${LOCAL_AGENT_HTTP_URL}/services?${params}`

      // Use direct fetch with timeout to prevent hanging
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), DEPLOY_ABORT_TIMEOUT_MS)

      const response = await fetch(url, { method: 'GET', headers, signal: controller.signal })
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { services: Service[] }
      const newData = data.services || []
      const now = new Date()

      // Update module-level cache and persist to localStorage
      servicesCache = { data: newData, timestamp: now, key: cacheKey }
      saveServicesCacheToStorage()

      setServices(newData)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent) {
        // Don't show error at dashboard level - services are optional
        setError(null)
      }
      // Don't clear services on error - keep stale data
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
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    // If we have cached data, still refresh in background but don't show loading
    const hasCachedData = servicesCache && servicesCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data

    // Poll for service updates (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `services:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`services:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      unsubscribePolling()
      unregisterRefetch()
    }
  }, [refetch, cacheKey, consecutiveFailures])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
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

  // Re-fetch when demo mode changes (not on initial mount)
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
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// Hook to get Ingresses.
// Returns `isDemoFallback: true` when the hook is serving demo data so callers
// can render the Demo badge only for true demo output. See Issue 9357.
export function useIngresses(cluster?: string, namespace?: string) {
  const [ingresses, setIngresses] = useState<Ingress[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isDemoFallback, setIsDemoFallback] = useState(false)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data so the Demo badge correctly
    // reflects the data source. Previously this hook relied on an empty live
    // response plus a hardcoded `isDemoData: true` in the card config,
    // producing false positive Demo badges on live data. See Issue 9357.
    if (isDemoMode()) {
      const demoIngresses = getDemoIngresses().filter(i =>
        (!cluster || i.cluster === cluster) && (!namespace || i.namespace === namespace)
      )
      setIngresses(demoIngresses)
      setIsDemoFallback(true)
      setError(null)
      setConsecutiveFailures(0)
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    setIsLoading(true)
    setIsRefreshing(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
        const response = await agentFetch(`${LOCAL_AGENT_URL}/ingresses?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setIngresses(data.ingresses || [])
          setIsDemoFallback(false)
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          setIsRefreshing(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    // Skip REST fallback when no token to prevent GA4 auth errors (#9957)
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (!token) {
      setIngresses([])
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/ingresses?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setIngresses(data.ingresses || [])
      setIsDemoFallback(false)
      setError(null)
      setConsecutiveFailures(0)
    } catch {
      // Don't show error - Ingresses are optional
      setError(null)
      setConsecutiveFailures(prev => prev + 1)
      setIngresses([])
      setIsDemoFallback(false)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`ingresses:${cluster || 'all'}:${namespace || 'all'}`, () => {
      refetch()
    })

    return () => unregisterRefetch()
  }, [refetch, cluster, namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch()
  }, [demoMode, refetch])

  return { ingresses, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3, isDemoFallback }
}

// Hook to get NetworkPolicies
export function useNetworkPolicies(cluster?: string, namespace?: string) {
  const [networkpolicies, setNetworkPolicies] = useState<NetworkPolicy[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setIsRefreshing(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
        const response = await agentFetch(`${LOCAL_AGENT_URL}/networkpolicies?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setNetworkPolicies(data.networkpolicies || [])
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          setIsRefreshing(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/networkpolicies?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setNetworkPolicies(data.networkpolicies || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch {
      // Don't show error - NetworkPolicies are optional
      setError(null)
      setConsecutiveFailures(prev => prev + 1)
      setNetworkPolicies([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`network-policies:${cluster || 'all'}:${namespace || 'all'}`, () => {
      refetch()
    })

    return () => unregisterRefetch()
  }, [refetch, cluster, namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch()
  }, [demoMode, refetch])

  return { networkpolicies, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

function getDemoServices(): Service[] {
  // Demo services populate `endpoints` (ready backend address count) and
  // `lbStatus` so the Endpoints stat and LoadBalancer provisioning UI
  // have realistic demo data for issues #6150 and #6153.
  return [
    { name: 'kubernetes', namespace: 'default', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.0.1', ports: ['443/TCP'], endpoints: 3, age: '45d' },
    { name: 'api-gateway', namespace: 'production', cluster: 'prod-east', type: 'LoadBalancer', clusterIP: '10.96.10.50', externalIP: '52.14.123.45', ports: ['80/TCP', '443/TCP'], endpoints: 4, lbStatus: 'Ready', age: '30d' },
    { name: 'frontend', namespace: 'web', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.20.100', ports: ['3000/TCP'], endpoints: 6, age: '25d' },
    { name: 'postgres', namespace: 'data', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.30.10', ports: ['5432/TCP'], endpoints: 1, age: '40d' },
    { name: 'redis', namespace: 'data', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.30.20', ports: ['6379/TCP'], endpoints: 3, age: '40d' },
    { name: 'prometheus', namespace: 'monitoring', cluster: 'staging', type: 'ClusterIP', clusterIP: '10.96.40.10', ports: ['9090/TCP'], endpoints: 2, age: '20d' },
    { name: 'grafana', namespace: 'monitoring', cluster: 'staging', type: 'NodePort', clusterIP: '10.96.40.20', ports: ['3000:30300/TCP'], endpoints: 1, age: '20d' },
    { name: 'ml-inference', namespace: 'ml', cluster: 'vllm-d', type: 'LoadBalancer', clusterIP: '10.96.50.10', externalIP: '34.56.78.90, 34.56.78.91', ports: ['8080/TCP'], endpoints: 8, lbStatus: 'Ready', age: '15d' },
    // A LoadBalancer service that is still provisioning — shows the
    // "Provisioning" label in the Services drawer instead of a blank
    // external IP (issue #6153).
    { name: 'new-edge-gw', namespace: 'production', cluster: 'prod-east', type: 'LoadBalancer', clusterIP: '10.96.10.60', ports: ['80/TCP', '443/TCP'], endpoints: 0, lbStatus: 'Provisioning', age: '2m' },
    // A service whose pods are not yet ready — 0 endpoints even though
    // the service itself exists (issue #6150).
    { name: 'orphaned-svc', namespace: 'data', cluster: 'staging', type: 'ClusterIP', clusterIP: '10.96.30.99', ports: ['8080/TCP'], endpoints: 0, age: '5m' },
  ]
}

// Register with mode transition coordinator for unified cache clearing
if (typeof window !== 'undefined') {
  registerCacheReset('services', () => {
    // Set resetting flag to trigger skeleton display
    networkingSharedState = {
      cacheVersion: networkingSharedState.cacheVersion + 1,
      isResetting: true,
    }
    notifyNetworkingSubscribers()

    try {
      localStorage.removeItem(SERVICES_CACHE_KEY)
    } catch {
      // Ignore storage errors
    }
    servicesCache = null

    // Reset the resetting flag after a tick
    setTimeout(() => {
      networkingSharedState = { ...networkingSharedState, isResetting: false }
      notifyNetworkingSubscribers()
    }, 0)
  })
}

export const __networkingTestables = {
  loadServicesCacheFromStorage,
  getDemoServices,
}

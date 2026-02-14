import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../lib/api'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerCacheReset, registerRefetch } from '../../lib/modeTransition'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, LOCAL_AGENT_URL, clusterCacheRef } from './shared'
import type { Service, Ingress, NetworkPolicy } from './types'

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
  networkingSubscribers.forEach(subscriber => subscriber(networkingSharedState))
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
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/services?${agentParams}`, {
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
          setTimeout(() => resolve(null), 15000)
        )
        const svcData = await Promise.race([svcPromise, timeoutPromise])

        if (svcData && svcData.length >= 0) {
          const now = new Date()
          // Map to Service format
          const mappedServices: Service[] = svcData.map(s => ({
            name: s.name,
            namespace: s.namespace,
            cluster: cluster,
            type: s.type,
            clusterIP: s.clusterIP,
            ports: s.ports ? s.ports.split(', ') : [],
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
      } catch (err) {
        console.error(`[useServices] kubectl proxy failed for ${cluster}:`, err)
      }
    }

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const url = `/api/mcp/services?${params}`

      // Use direct fetch with timeout to prevent hanging
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

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
    } catch (err) {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent) {
        // Don't show error at dashboard level - services are optional
        setError(null)
        // Fall back to demo data on error if no cached data
        if (services.length === 0) {
          setServices(getDemoServices().filter(s =>
            (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace)
          ))
        }
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
  }, [cluster, namespace, cacheKey, services.length])

  useEffect(() => {
    // If we have cached data, still refresh in background but don't show loading
    const hasCachedData = servicesCache && servicesCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data

    // Poll every 30 seconds for service updates
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`services:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      clearInterval(interval)
      unregisterRefetch()
    }
  }, [refetch, cacheKey])

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

export function useIngresses(cluster?: string, namespace?: string) {
  const [ingresses, setIngresses] = useState<Ingress[]>([])
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
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/ingresses?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setIngresses(data.ingresses || [])
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
      const { data } = await api.get<{ ingresses: Ingress[] }>(`/api/mcp/ingresses?${params}`)
      setIngresses(data.ingresses || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch {
      // Don't show error - Ingresses are optional
      setError(null)
      setConsecutiveFailures(prev => prev + 1)
      setIngresses([])
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

  return { ingresses, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
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
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/networkpolicies?${params}`, {
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
      const { data } = await api.get<{ networkpolicies: NetworkPolicy[] }>(`/api/mcp/networkpolicies?${params}`)
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
  return [
    { name: 'kubernetes', namespace: 'default', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.0.1', ports: ['443/TCP'], age: '45d' },
    { name: 'api-gateway', namespace: 'production', cluster: 'prod-east', type: 'LoadBalancer', clusterIP: '10.96.10.50', externalIP: '52.14.123.45', ports: ['80/TCP', '443/TCP'], age: '30d' },
    { name: 'frontend', namespace: 'web', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.20.100', ports: ['3000/TCP'], age: '25d' },
    { name: 'postgres', namespace: 'data', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.30.10', ports: ['5432/TCP'], age: '40d' },
    { name: 'redis', namespace: 'data', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.30.20', ports: ['6379/TCP'], age: '40d' },
    { name: 'prometheus', namespace: 'monitoring', cluster: 'staging', type: 'ClusterIP', clusterIP: '10.96.40.10', ports: ['9090/TCP'], age: '20d' },
    { name: 'grafana', namespace: 'monitoring', cluster: 'staging', type: 'NodePort', clusterIP: '10.96.40.20', ports: ['3000:30300/TCP'], age: '20d' },
    { name: 'ml-inference', namespace: 'ml', cluster: 'vllm-d', type: 'LoadBalancer', clusterIP: '10.96.50.10', externalIP: '34.56.78.90', ports: ['8080/TCP'], age: '15d' },
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

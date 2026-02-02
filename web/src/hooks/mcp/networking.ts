import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { getDemoMode } from '../useDemoMode'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, LOCAL_AGENT_URL, clusterCacheRef } from './shared'
import type { Service, Ingress, NetworkPolicy } from './types'

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

  // Reset state when cluster changes
  useEffect(() => {
    setServices([])
    setIsLoading(true)
    setError(null)
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
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
        console.log(`[useServices] Fetching for ${cluster} using context: ${kubectlContext}`)

        // Add timeout to prevent hanging
        const svcPromise = kubectlProxy.getServices(kubectlContext, namespace)
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 15000)
        )
        const svcData = await Promise.race([svcPromise, timeoutPromise])

        if (svcData && svcData.length >= 0) {
          console.log(`[useServices] Got ${svcData.length} services for ${cluster}`)
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
        console.log(`[useServices] No data returned for ${cluster}, trying API`)
      } catch (err) {
        console.error(`[useServices] kubectl proxy failed for ${cluster}:`, err)
      }
    }

    try {
      // If demo mode is enabled, use demo data
      if (getDemoMode()) {
        const demoServices = getDemoServices().filter(s =>
          (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace)
        )
        setServices(demoServices)
        setError(null)
        setLastUpdated(new Date())
        setConsecutiveFailures(0)
        setLastRefresh(new Date())
        return
      }
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const url = `/api/mcp/services?${params}`

      // Skip API calls when using demo token
      const token = localStorage.getItem('token')
      if (!token || token === 'demo-token') {
        const demoServices = getDemoServices().filter(s =>
          (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace)
        )
        setServices(demoServices)
        const now = new Date()
        setLastUpdated(now)
        setLastRefresh(now)
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

      // Use direct fetch with timeout to prevent hanging
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
        setError('Failed to fetch services')
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
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

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
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoIngresses = getDemoIngresses().filter(i =>
        (!cluster || i.cluster === cluster) && (!namespace || i.namespace === namespace)
      )
      setIngresses(demoIngresses)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
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
          setIsLoading(false)
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
    } catch {
      setError('Failed to fetch Ingresses')
      // Fall back to demo data on error
      setIngresses(getDemoIngresses().filter(i =>
        (!cluster || i.cluster === cluster) && (!namespace || i.namespace === namespace)
      ))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => { refetch() }, [refetch])
  return { ingresses, isLoading, error, refetch }
}

// Hook to get NetworkPolicies
export function useNetworkPolicies(cluster?: string, namespace?: string) {
  const [networkpolicies, setNetworkPolicies] = useState<NetworkPolicy[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoNPs = getDemoNetworkPolicies().filter(np =>
        (!cluster || np.cluster === cluster) && (!namespace || np.namespace === namespace)
      )
      setNetworkPolicies(demoNPs)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
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
          setIsLoading(false)
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
    } catch {
      setError('Failed to fetch NetworkPolicies')
      // Fall back to demo data on error
      setNetworkPolicies(getDemoNetworkPolicies().filter(np =>
        (!cluster || np.cluster === cluster) && (!namespace || np.namespace === namespace)
      ))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => { refetch() }, [refetch])
  return { networkpolicies, isLoading, error, refetch }
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

function getDemoIngresses(): Ingress[] {
  return [
    { name: 'api-ingress', namespace: 'production', cluster: 'prod-east', hosts: ['api.kubestellar.io'], address: '52.14.123.45', class: 'nginx', age: '30d' },
    { name: 'frontend-ingress', namespace: 'web', cluster: 'prod-east', hosts: ['console.kubestellar.io'], address: '52.14.123.45', class: 'nginx', age: '25d' },
    { name: 'grafana-ingress', namespace: 'monitoring', cluster: 'staging', hosts: ['grafana.staging.local'], class: 'nginx', age: '20d' },
    { name: 'ml-api-ingress', namespace: 'ml', cluster: 'vllm-d', hosts: ['ml-api.kubestellar.io'], address: '34.56.78.90', class: 'nginx', age: '15d' },
    { name: 'prometheus-ingress', namespace: 'monitoring', cluster: 'staging', hosts: ['prometheus.staging.local'], class: 'nginx', age: '20d' },
  ]
}

function getDemoNetworkPolicies(): NetworkPolicy[] {
  return [
    { name: 'deny-all-ingress', namespace: 'production', cluster: 'prod-east', podSelector: '*', policyTypes: ['Ingress'], age: '30d' },
    { name: 'allow-api-gateway', namespace: 'production', cluster: 'prod-east', podSelector: 'app=api-gateway', policyTypes: ['Ingress'], age: '30d' },
    { name: 'allow-db-access', namespace: 'data', cluster: 'prod-east', podSelector: 'app=postgres', policyTypes: ['Ingress'], age: '40d' },
    { name: 'default-deny', namespace: 'ml', cluster: 'vllm-d', podSelector: '*', policyTypes: ['Ingress', 'Egress'], age: '15d' },
    { name: 'allow-inference', namespace: 'ml', cluster: 'vllm-d', podSelector: 'app=ml-inference', policyTypes: ['Ingress', 'Egress'], age: '15d' },
    { name: 'monitoring-access', namespace: 'monitoring', cluster: 'staging', podSelector: 'app=prometheus', policyTypes: ['Ingress'], age: '20d' },
  ]
}

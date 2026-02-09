import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../lib/api'
import { isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerRefetch } from '../../lib/modeTransition'
import { clusterCacheRef, subscribeClusterCache } from './shared'
import type { Operator, OperatorSubscription } from './types'

// localStorage cache keys
const OPERATORS_CACHE_KEY = 'kubestellar-operators-cache'
const SUBSCRIPTIONS_CACHE_KEY = 'kubestellar-subscriptions-cache'

// Load operators from localStorage
function loadOperatorsCacheFromStorage(cacheKey: string): { data: Operator[], timestamp: number } | null {
  try {
    const stored = localStorage.getItem(OPERATORS_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && parsed.data && parsed.data.length > 0) {
        return { data: parsed.data, timestamp: parsed.timestamp || Date.now() }
      }
    }
  } catch { /* ignore */ }
  return null
}

function saveOperatorsCacheToStorage(data: Operator[], key: string) {
  try {
    if (data.length > 0 && !isDemoMode()) {
      localStorage.setItem(OPERATORS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now(), key }))
    }
  } catch { /* ignore */ }
}

// Load subscriptions from localStorage
function loadSubscriptionsCacheFromStorage(cacheKey: string): { data: OperatorSubscription[], timestamp: number } | null {
  try {
    const stored = localStorage.getItem(SUBSCRIPTIONS_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && parsed.data && parsed.data.length > 0) {
        return { data: parsed.data, timestamp: parsed.timestamp || Date.now() }
      }
    }
  } catch { /* ignore */ }
  return null
}

function saveSubscriptionsCacheToStorage(data: OperatorSubscription[], key: string) {
  try {
    if (data.length > 0 && !isDemoMode()) {
      localStorage.setItem(SUBSCRIPTIONS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now(), key }))
    }
  } catch { /* ignore */ }
}

// Hook to get operators for a cluster (or all clusters if undefined)
export function useOperators(cluster?: string) {
  const cacheKey = `operators:${cluster || 'all'}`
  const cached = loadOperatorsCacheFromStorage(cacheKey)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const [operators, setOperators] = useState<Operator[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cached?.timestamp || null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  // Track cluster count to re-fetch when clusters become available
  const [clusterCount, setClusterCount] = useState(clusterCacheRef.clusters.length)
  // Version counter to force refetch
  const [fetchVersion, setFetchVersion] = useState(0)

  // Subscribe to cluster cache updates for "all clusters" mode
  useEffect(() => {
    return subscribeClusterCache((cache) => {
      setClusterCount(cache.clusters.length)
    })
  }, [])

  // Refetch when cluster, clusterCount, or fetchVersion changes
  useEffect(() => {
    let cancelled = false

    const doFetch = async () => {
      // If demo mode is enabled, use demo data directly
      if (isDemoMode()) {
        if (!cancelled) {
          const clusters = cluster ? [cluster] : clusterCacheRef.clusters.map(c => c.name)
          const allOperators = clusters.flatMap(c => getDemoOperators(c))
          setOperators(allOperators)
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          setIsRefreshing(false)
        }
        return
      }

      setIsRefreshing(true)

      // If no cluster specified, fetch from all clusters
      if (!cluster) {
        const allClusters = clusterCacheRef.clusters
        if (allClusters.length === 0) {
          if (!cancelled) {
            setOperators([])
            setIsLoading(false)
            setIsRefreshing(false)
          }
          return
        }

        const allOperators: Operator[] = []
        for (const c of allClusters) {
          try {
            const { data } = await api.get<{ operators: Operator[] }>(`/api/mcp/operators?cluster=${encodeURIComponent(c.name)}`)
            allOperators.push(...(data.operators || []).map(op => ({ ...op, cluster: c.name })))
          } catch {
            // Skip clusters where operator API is unavailable
          }
        }
        if (!cancelled) {
          setOperators(allOperators)
          saveOperatorsCacheToStorage(allOperators, cacheKey)
          setError(null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())
          setIsLoading(false)
          setIsRefreshing(false)
        }
        return
      }

      try {
        const { data } = await api.get<{ operators: Operator[] }>(`/api/mcp/operators?cluster=${encodeURIComponent(cluster)}`)
        if (!cancelled) {
          const newOperators = (data.operators || []).map(op => ({ ...op, cluster }))
          setOperators(newOperators)
          saveOperatorsCacheToStorage(newOperators, cacheKey)
          setError(null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())
        }
      } catch (err) {
        if (!cancelled) {
          // Don't show error - operators are optional
          setError(null)
          setConsecutiveFailures(prev => prev + 1)
          // Keep cached data on error instead of clearing
          if (operators.length === 0) {
            setOperators([])
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    doFetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`operators:${cacheKey}`, () => {
      setFetchVersion(v => v + 1)
    })

    return () => {
      cancelled = true
      unregisterRefetch()
    }
  }, [cluster, clusterCount, fetchVersion, cacheKey])

  const refetch = useCallback(() => {
    setFetchVersion(v => v + 1)
  }, [])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    setFetchVersion(v => v + 1)
  }, [demoMode])

  return { operators, isLoading, isRefreshing, error, refetch, lastRefresh, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// Hook to get operator subscriptions for a cluster (or all clusters if undefined)
export function useOperatorSubscriptions(cluster?: string) {
  const cacheKey = `subscriptions:${cluster || 'all'}`
  const cached = loadSubscriptionsCacheFromStorage(cacheKey)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const [subscriptions, setSubscriptions] = useState<OperatorSubscription[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cached?.timestamp || null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  // Track cluster count to re-fetch when clusters become available
  const [clusterCount, setClusterCount] = useState(clusterCacheRef.clusters.length)
  // Version counter to force refetch
  const [fetchVersion, setFetchVersion] = useState(0)

  // Subscribe to cluster cache updates for "all clusters" mode
  useEffect(() => {
    return subscribeClusterCache((cache) => {
      setClusterCount(cache.clusters.length)
    })
  }, [])

  // Refetch when cluster, clusterCount, or fetchVersion changes
  useEffect(() => {
    let cancelled = false

    const doFetch = async () => {
      // If demo mode is enabled, use demo data directly
      if (isDemoMode()) {
        if (!cancelled) {
          const clusters = cluster ? [cluster] : clusterCacheRef.clusters.map(c => c.name)
          const allSubscriptions = clusters.flatMap(c => getDemoOperatorSubscriptions(c))
          setSubscriptions(allSubscriptions)
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          setIsRefreshing(false)
        }
        return
      }

      setIsRefreshing(true)

      // If no cluster specified, fetch from all clusters
      if (!cluster) {
        const allClusters = clusterCacheRef.clusters
        if (allClusters.length === 0) {
          if (!cancelled) {
            setSubscriptions([])
            setIsLoading(false)
            setIsRefreshing(false)
          }
          return
        }

        const allSubscriptions: OperatorSubscription[] = []
        for (const c of allClusters) {
          try {
            const { data } = await api.get<{ subscriptions: OperatorSubscription[] }>(`/api/mcp/operator-subscriptions?cluster=${encodeURIComponent(c.name)}`)
            allSubscriptions.push(...(data.subscriptions || []).map(sub => ({ ...sub, cluster: c.name })))
          } catch {
            // Skip clusters where operator subscription API is unavailable
          }
        }
        if (!cancelled) {
          setSubscriptions(allSubscriptions)
          saveSubscriptionsCacheToStorage(allSubscriptions, cacheKey)
          setError(null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())
          setIsLoading(false)
          setIsRefreshing(false)
        }
        return
      }

      try {
        const { data } = await api.get<{ subscriptions: OperatorSubscription[] }>(`/api/mcp/operator-subscriptions?cluster=${encodeURIComponent(cluster)}`)
        if (!cancelled) {
          const newSubscriptions = (data.subscriptions || []).map(sub => ({ ...sub, cluster }))
          setSubscriptions(newSubscriptions)
          saveSubscriptionsCacheToStorage(newSubscriptions, cacheKey)
          setError(null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())
        }
      } catch (err) {
        if (!cancelled) {
          // Don't show error - subscriptions are optional
          setError(null)
          setConsecutiveFailures(prev => prev + 1)
          // Keep cached data on error instead of clearing
          if (subscriptions.length === 0) {
            setSubscriptions([])
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    doFetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`operator-subscriptions:${cacheKey}`, () => {
      setFetchVersion(v => v + 1)
    })

    return () => {
      cancelled = true
      unregisterRefetch()
    }
  }, [cluster, clusterCount, fetchVersion, cacheKey])

  const refetch = useCallback(() => {
    setFetchVersion(v => v + 1)
  }, [])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    setFetchVersion(v => v + 1)
  }, [demoMode])

  return { subscriptions, isLoading, isRefreshing, error, refetch, lastRefresh, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

function getDemoOperators(cluster: string): Operator[] {
  // Generate cluster-specific demo data using hash of cluster name
  const hash = cluster.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const operatorCount = 3 + (hash % 5) // 3-7 operators per cluster

  const baseOperators: Operator[] = [
    { name: 'prometheus-operator', namespace: 'monitoring', version: 'v0.65.1', status: 'Succeeded', cluster },
    { name: 'cert-manager', namespace: 'cert-manager', version: 'v1.12.0', status: 'Succeeded', upgradeAvailable: 'v1.13.0', cluster },
    { name: 'elasticsearch-operator', namespace: 'elastic-system', version: 'v2.8.0', status: hash % 3 === 0 ? 'Failed' : 'Succeeded', cluster },
    { name: 'strimzi-kafka-operator', namespace: 'kafka', version: 'v0.35.0', status: hash % 4 === 0 ? 'Installing' : 'Succeeded', cluster },
    { name: 'argocd-operator', namespace: 'argocd', version: 'v0.6.0', status: hash % 5 === 0 ? 'Failed' : 'Succeeded', cluster },
    { name: 'jaeger-operator', namespace: 'observability', version: 'v1.47.0', status: 'Succeeded', cluster },
    { name: 'kiali-operator', namespace: 'istio-system', version: 'v1.72.0', status: hash % 2 === 0 ? 'Upgrading' : 'Succeeded', upgradeAvailable: hash % 2 === 0 ? 'v1.73.0' : undefined, cluster },
  ]

  return baseOperators.slice(0, operatorCount)
}

function getDemoOperatorSubscriptions(cluster: string): OperatorSubscription[] {
  // Generate cluster-specific demo data using hash of cluster name
  const hash = cluster.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const subCount = 2 + (hash % 4) // 2-5 subscriptions per cluster

  const baseSubscriptions: OperatorSubscription[] = [
    {
      name: 'prometheus-operator',
      namespace: 'monitoring',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Automatic',
      currentCSV: 'prometheusoperator.v0.65.1',
      cluster,
    },
    {
      name: 'cert-manager',
      namespace: 'cert-manager',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Manual',
      currentCSV: 'cert-manager.v1.12.0',
      pendingUpgrade: hash % 2 === 0 ? 'cert-manager.v1.13.0' : undefined,
      cluster,
    },
    {
      name: 'strimzi-kafka-operator',
      namespace: 'kafka',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: hash % 3 === 0 ? 'Manual' : 'Automatic',
      currentCSV: 'strimzi-cluster-operator.v0.35.0',
      pendingUpgrade: hash % 4 === 0 ? 'strimzi-cluster-operator.v0.36.0' : undefined,
      cluster,
    },
    {
      name: 'argocd-operator',
      namespace: 'argocd',
      channel: 'alpha',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Manual',
      currentCSV: 'argocd-operator.v0.6.0',
      pendingUpgrade: hash % 5 === 0 ? 'argocd-operator.v0.7.0' : undefined,
      cluster,
    },
    {
      name: 'jaeger-operator',
      namespace: 'observability',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Automatic',
      currentCSV: 'jaeger-operator.v1.47.0',
      cluster,
    },
  ]

  return baseSubscriptions.slice(0, subCount)
}

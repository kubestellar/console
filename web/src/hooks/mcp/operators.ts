import { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import { isDemoMode } from '../../lib/demoMode'
import { fetchSSE } from '../../lib/sseClient'
import { useDemoMode } from '../useDemoMode'
import { registerRefetch, registerCacheReset } from '../../lib/modeTransition'
import { STORAGE_KEY_TOKEN } from '../../lib/constants'
import { clusterCacheRef, subscribeClusterCache } from './shared'
import { deduplicateClustersByServer } from './dedup'
import type { Operator, OperatorSubscription } from './types'

// localStorage cache keys
const OPERATORS_CACHE_KEY = 'kubestellar-operators-cache'
const SUBSCRIPTIONS_CACHE_KEY = 'kubestellar-subscriptions-cache'

// ── Mode transition: clear localStorage caches when demo mode is toggled ────
if (typeof window !== 'undefined') {
  registerCacheReset('operators', () => {
    try {
      localStorage.removeItem(OPERATORS_CACHE_KEY)
      localStorage.removeItem(SUBSCRIPTIONS_CACHE_KEY)
    } catch {
      // Ignore storage errors
    }
  })
}

// REST fallback timeout (SSE is preferred but REST needs generous timeout for large clusters)
const OPERATOR_REST_TIMEOUT = 120000

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
  const hasCompletedFetchRef = useRef(!!cached)
  const abortRef = useRef<AbortController | null>(null)
  const fetchInProgressRef = useRef(false)

  const [operators, setOperators] = useState<Operator[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cached?.timestamp || null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [fetchVersion, setFetchVersion] = useState(0)
  const clusterCountRef = useRef(clusterCacheRef.clusters.length)

  // When clusters change, bump fetchVersion to re-trigger the fetch effect
  // instead of putting clusterCount directly in the dependency array.
  useEffect(() => {
    return subscribeClusterCache((cache) => {
      const newCount = cache.clusters.length
      if (newCount !== clusterCountRef.current) {
        clusterCountRef.current = newCount
        fetchInProgressRef.current = false
        setFetchVersion(v => v + 1)
      }
    })
  }, [])

  useEffect(() => {
    if (fetchInProgressRef.current) return

    // Set guard immediately — including demo mode — to prevent re-entrant
    // state-update cascades (React error #185: max update depth exceeded).
    fetchInProgressRef.current = true

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const doFetch = async () => {
      if (isDemoMode()) {
        const dedupClusters = deduplicateClustersByServer(clusterCacheRef.clusters)
        const clusters = cluster ? [cluster] : dedupClusters.map(c => c.name)
        const allOperators = clusters.flatMap(c => getDemoOperators(c))
        setOperators(allOperators)
        setError(null)
        setConsecutiveFailures(0)
        setIsLoading(false)
        setIsRefreshing(false)
        fetchInProgressRef.current = false
        return
      }

      setIsRefreshing(true)

      // Try SSE streaming first for progressive rendering
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      const sseAvailable = token && token !== 'demo-token'

      if (sseAvailable) {
        try {
          const accumulated: Operator[] = []
          const params: Record<string, string> = {}
          if (cluster) params.cluster = cluster

          const result = await fetchSSE<Operator>({
            url: '/api/gitops/operators/stream',
            params,
            itemsKey: 'operators',
            signal: controller.signal,
            onClusterData: (_clusterName, items) => {
              // Map phase → status for each operator
              const mapped = items.map(op => ({
                ...op,
                status: (op.status || (op as Operator & { phase?: string }).phase || 'Unknown') as Operator['status'] }))
              accumulated.push(...mapped)
              if (!controller.signal.aborted) {
                setOperators([...accumulated])
                setIsLoading(false)
              }
            } })

          if (!controller.signal.aborted) {
            hasCompletedFetchRef.current = true
            const finalOperators = result.map(op => ({
              ...op,
              status: (op.status || (op as Operator & { phase?: string }).phase || 'Unknown') as Operator['status'] }))
            setOperators(finalOperators)
            saveOperatorsCacheToStorage(finalOperators, cacheKey)
            setError(null)
            setConsecutiveFailures(0)
            setLastRefresh(Date.now())
          }
          setIsLoading(false)
          setIsRefreshing(false)
          fetchInProgressRef.current = false
          return
        } catch {
          // SSE failed — fall through to REST
          if (controller.signal.aborted) {
            fetchInProgressRef.current = false
            return
          }
        }
      }

      // REST fallback — skip entirely if no token to prevent GA4 auth errors (#9957)
      if (!token) {
        setIsLoading(false)
        setIsRefreshing(false)
        fetchInProgressRef.current = false
        return
      }

      const url = cluster
        ? `/api/gitops/operators?cluster=${encodeURIComponent(cluster)}`
        : '/api/gitops/operators'

      try {
        const { data } = await api.get<{ operators: Array<Operator & { phase?: string }> }>(url, { timeout: OPERATOR_REST_TIMEOUT })
        if (!controller.signal.aborted) {
          hasCompletedFetchRef.current = true
          const newOperators = (data.operators || []).map(op => ({
            ...op,
            status: (op.status || op.phase || 'Unknown') as Operator['status'],
            cluster: op.cluster || cluster || '' }))
          setOperators(newOperators)
          saveOperatorsCacheToStorage(newOperators, cacheKey)
          setError(null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          // #7547: Surface the error message so the UI can show it instead
          // of silently displaying an empty state.
          const msg = err instanceof Error ? err.message : 'Failed to fetch operators'
          setError(msg)
          setConsecutiveFailures(prev => prev + 1)
        }
      }
      setIsLoading(false)
      setIsRefreshing(false)
      fetchInProgressRef.current = false
    }

    doFetch()

    const unregisterRefetch = registerRefetch(`operators:${cacheKey}`, () => {
      setFetchVersion(v => v + 1)
    })

    return () => {
      controller.abort()
      fetchInProgressRef.current = false
      unregisterRefetch()
    }
  }, [cluster, fetchVersion, cacheKey])

  const refetch = () => {
    abortRef.current?.abort()
    fetchInProgressRef.current = false
    setFetchVersion(v => v + 1)
  }

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
  const hasCompletedFetchRef = useRef(!!cached)
  const abortRef = useRef<AbortController | null>(null)
  const fetchInProgressRef = useRef(false)

  const [subscriptions, setSubscriptions] = useState<OperatorSubscription[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cached?.timestamp || null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [fetchVersion, setFetchVersion] = useState(0)
  const clusterCountRef = useRef(clusterCacheRef.clusters.length)

  // When clusters change, bump fetchVersion to re-trigger the fetch effect
  // instead of putting clusterCount directly in the dependency array.
  useEffect(() => {
    return subscribeClusterCache((cache) => {
      const newCount = cache.clusters.length
      if (newCount !== clusterCountRef.current) {
        clusterCountRef.current = newCount
        fetchInProgressRef.current = false
        setFetchVersion(v => v + 1)
      }
    })
  }, [])

  useEffect(() => {
    if (fetchInProgressRef.current) return

    // Set guard immediately — including demo mode — to prevent re-entrant
    // state-update cascades (React error #185: max update depth exceeded).
    fetchInProgressRef.current = true

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const doFetch = async () => {
      if (isDemoMode()) {
        const dedupClusters = deduplicateClustersByServer(clusterCacheRef.clusters)
        const clusters = cluster ? [cluster] : dedupClusters.map(c => c.name)
        const allSubscriptions = clusters.flatMap(c => getDemoOperatorSubscriptions(c))
        setSubscriptions(allSubscriptions)
        setError(null)
        setConsecutiveFailures(0)
        setIsLoading(false)
        setIsRefreshing(false)
        fetchInProgressRef.current = false
        return
      }

      setIsRefreshing(true)

      // Try SSE streaming first — backend handles multi-cluster parallelism
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      const sseAvailable = token && token !== 'demo-token'

      if (sseAvailable) {
        try {
          const accumulated: OperatorSubscription[] = []
          const params: Record<string, string> = {}
          if (cluster) params.cluster = cluster

          const result = await fetchSSE<OperatorSubscription>({
            url: '/api/gitops/operator-subscriptions/stream',
            params,
            itemsKey: 'subscriptions',
            signal: controller.signal,
            onClusterData: (_clusterName, items) => {
              accumulated.push(...items)
              if (!controller.signal.aborted) {
                setSubscriptions([...accumulated])
                setIsLoading(false)
              }
            } })

          if (!controller.signal.aborted) {
            hasCompletedFetchRef.current = true
            setSubscriptions(result)
            saveSubscriptionsCacheToStorage(result, cacheKey)
            setError(null)
            setConsecutiveFailures(0)
            setLastRefresh(Date.now())
          }
          setIsLoading(false)
          setIsRefreshing(false)
          fetchInProgressRef.current = false
          return
        } catch {
          if (controller.signal.aborted) {
            fetchInProgressRef.current = false
            return
          }
        }
      }

      // REST fallback — skip entirely if no token to prevent GA4 auth errors (#9957)
      if (!token) {
        setIsLoading(false)
        setIsRefreshing(false)
        fetchInProgressRef.current = false
        return
      }

      const url = cluster
        ? `/api/gitops/operator-subscriptions?cluster=${encodeURIComponent(cluster)}`
        : '/api/gitops/operator-subscriptions'

      try {
        const { data } = await api.get<{ subscriptions: OperatorSubscription[] }>(url, { timeout: OPERATOR_REST_TIMEOUT })
        if (!controller.signal.aborted) {
          hasCompletedFetchRef.current = true
          const newSubs = (data.subscriptions || []).map(sub => ({ ...sub, cluster: sub.cluster || cluster || '' }))
          setSubscriptions(newSubs)
          saveSubscriptionsCacheToStorage(newSubs, cacheKey)
          setError(null)
          setConsecutiveFailures(0)
          setLastRefresh(Date.now())
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          // #7547: Surface the error message so the UI can show it instead
          // of silently displaying an empty state.
          const msg = err instanceof Error ? err.message : 'Failed to fetch subscriptions'
          setError(msg)
          setConsecutiveFailures(prev => prev + 1)
        }
      }
      setIsLoading(false)
      setIsRefreshing(false)
      fetchInProgressRef.current = false
    }

    doFetch()

    const unregisterRefetch = registerRefetch(`operator-subscriptions:${cacheKey}`, () => {
      setFetchVersion(v => v + 1)
    })

    return () => {
      controller.abort()
      fetchInProgressRef.current = false
      unregisterRefetch()
    }
  }, [cluster, fetchVersion, cacheKey])

  const refetch = () => {
    abortRef.current?.abort()
    fetchInProgressRef.current = false
    setFetchVersion(v => v + 1)
  }

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
  const hash = cluster.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const operatorCount = 3 + (hash % 5)

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
  const hash = cluster.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const subCount = 2 + (hash % 4)

  const baseSubscriptions: OperatorSubscription[] = [
    {
      name: 'prometheus-operator',
      namespace: 'monitoring',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Automatic',
      currentCSV: 'prometheusoperator.v0.65.1',
      cluster },
    {
      name: 'cert-manager',
      namespace: 'cert-manager',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Manual',
      currentCSV: 'cert-manager.v1.12.0',
      pendingUpgrade: hash % 2 === 0 ? 'cert-manager.v1.13.0' : undefined,
      cluster },
    {
      name: 'strimzi-kafka-operator',
      namespace: 'kafka',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: hash % 3 === 0 ? 'Manual' : 'Automatic',
      currentCSV: 'strimzi-cluster-operator.v0.35.0',
      pendingUpgrade: hash % 4 === 0 ? 'strimzi-cluster-operator.v0.36.0' : undefined,
      cluster },
    {
      name: 'argocd-operator',
      namespace: 'argocd',
      channel: 'alpha',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Manual',
      currentCSV: 'argocd-operator.v0.6.0',
      pendingUpgrade: hash % 5 === 0 ? 'argocd-operator.v0.7.0' : undefined,
      cluster },
    {
      name: 'jaeger-operator',
      namespace: 'observability',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Automatic',
      currentCSV: 'jaeger-operator.v1.47.0',
      cluster },
  ]

  return baseSubscriptions.slice(0, subCount)
}

export const __operatorsTestables = {
  loadOperatorsCacheFromStorage,
  saveOperatorsCacheToStorage,
  loadSubscriptionsCacheFromStorage,
  saveSubscriptionsCacheToStorage,
  getDemoOperators,
  getDemoOperatorSubscriptions,
  OPERATORS_CACHE_KEY,
  SUBSCRIPTIONS_CACHE_KEY,
}

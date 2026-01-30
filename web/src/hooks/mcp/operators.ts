import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { clusterCacheRef, subscribeClusterCache } from './shared'
import type { Operator, OperatorSubscription } from './types'

// Hook to get operators for a cluster (or all clusters if undefined)
export function useOperators(cluster?: string) {
  const [operators, setOperators] = useState<Operator[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      setIsRefreshing(true)

      // If no cluster specified, fetch from all clusters
      if (!cluster) {
        const allClusters = clusterCacheRef.clusters
        if (allClusters.length === 0) {
          // No clusters available yet, use empty array
          if (!cancelled) {
            setOperators([])
            setIsLoading(false)
            setIsRefreshing(false)
          }
          return
        }

        // Aggregate operators from all clusters
        const allOperators: Operator[] = []
        for (const c of allClusters) {
          try {
            const { data } = await api.get<{ operators: Operator[] }>(`/api/mcp/operators?cluster=${encodeURIComponent(c.name)}`)
            allOperators.push(...(data.operators || []).map(op => ({ ...op, cluster: c.name })))
          } catch {
            // Use demo data for this cluster
            allOperators.push(...getDemoOperators(c.name))
          }
        }
        if (!cancelled) {
          setOperators(allOperators)
          setError(null)
          setIsLoading(false)
          setIsRefreshing(false)
        }
        return
      }

      try {
        // Try to fetch from API - will fall back to demo data if not available
        const { data } = await api.get<{ operators: Operator[] }>(`/api/mcp/operators?cluster=${encodeURIComponent(cluster)}`)
        if (!cancelled) {
          // Ensure each operator has the cluster property set
          setOperators((data.operators || []).map(op => ({ ...op, cluster })))
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to fetch operators')
          // Use demo data with cluster-specific variation
          setOperators(getDemoOperators(cluster))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    doFetch()

    return () => {
      cancelled = true
    }
  }, [cluster, clusterCount, fetchVersion])

  const refetch = useCallback(() => {
    setFetchVersion(v => v + 1)
  }, [])

  return { operators, isLoading, isRefreshing, error, refetch }
}

// Hook to get operator subscriptions for a cluster (or all clusters if undefined)
export function useOperatorSubscriptions(cluster?: string) {
  const [subscriptions, setSubscriptions] = useState<OperatorSubscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      setIsRefreshing(true)

      // If no cluster specified, fetch from all clusters
      if (!cluster) {
        const allClusters = clusterCacheRef.clusters
        if (allClusters.length === 0) {
          // No clusters available yet, use empty array
          if (!cancelled) {
            setSubscriptions([])
            setIsLoading(false)
            setIsRefreshing(false)
          }
          return
        }

        // Aggregate subscriptions from all clusters
        const allSubscriptions: OperatorSubscription[] = []
        for (const c of allClusters) {
          try {
            const { data } = await api.get<{ subscriptions: OperatorSubscription[] }>(`/api/mcp/operator-subscriptions?cluster=${encodeURIComponent(c.name)}`)
            allSubscriptions.push(...(data.subscriptions || []).map(sub => ({ ...sub, cluster: c.name })))
          } catch {
            // Use demo data for this cluster
            allSubscriptions.push(...getDemoOperatorSubscriptions(c.name))
          }
        }
        if (!cancelled) {
          setSubscriptions(allSubscriptions)
          setError(null)
          setIsLoading(false)
          setIsRefreshing(false)
        }
        return
      }

      try {
        const { data } = await api.get<{ subscriptions: OperatorSubscription[] }>(`/api/mcp/operator-subscriptions?cluster=${encodeURIComponent(cluster)}`)
        if (!cancelled) {
          // Ensure each subscription has the cluster property set
          setSubscriptions((data.subscriptions || []).map(sub => ({ ...sub, cluster })))
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to fetch subscriptions')
          setSubscriptions(getDemoOperatorSubscriptions(cluster))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    doFetch()

    return () => {
      cancelled = true
    }
  }, [cluster, clusterCount, fetchVersion])

  const refetch = useCallback(() => {
    setFetchVersion(v => v + 1)
  }, [])

  return { subscriptions, isLoading, isRefreshing, error, refetch }
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

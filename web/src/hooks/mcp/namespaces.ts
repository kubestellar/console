import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../lib/api'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { isDemoMode } from '../../lib/demoMode'
import { LOCAL_AGENT_URL, agentFetch, clusterCacheRef } from './shared'
import type { PodInfo, NamespaceStats } from './types'

// Large clusters (100+ namespaces) can take 30s+ to list all namespaces.
// Use a generous timeout to avoid aborting valid but slow requests.
const NAMESPACE_FETCH_TIMEOUT_MS = 45000

// When forceLive is true, skip demo mode fallback and always query the real API.
// Used by GPU Reservations to show live namespaces when running in-cluster with OAuth.
export function useNamespaces(cluster?: string, forceLive = false) {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track previous cluster to detect actual changes (not just initial mount)
  const prevClusterRef = useRef<string | undefined>(cluster)

  // Reset state only when cluster actually CHANGES (not on initial mount)
  // Use cached namespaces immediately if available (avoids empty dropdown on slow clusters)
  useEffect(() => {
    if (prevClusterRef.current !== cluster) {
      // Check cluster cache for pre-fetched namespaces (populated by health checks)
      const cachedCluster = cluster ? clusterCacheRef.clusters.find(c => c.name === cluster) : undefined
      if (cachedCluster?.namespaces && cachedCluster.namespaces.length > 0) {
        setNamespaces(cachedCluster.namespaces)
        setIsLoading(true) // Still loading fresh data in background
      } else {
        setNamespaces([])
        setIsLoading(true)
      }
      setError(null)
      prevClusterRef.current = cluster
    }
  }, [cluster])

  const refetch = useCallback(async () => {
    if (!cluster) {
      setNamespaces([])
      setIsLoading(false)
      return
    }

    // Demo mode returns synthetic namespaces immediately (unless forceLive overrides)
    if (!forceLive && isDemoMode()) {
      setNamespaces(['default', 'kube-system', 'kube-public', 'monitoring', 'production', 'staging', 'batch', 'data', 'ingress', 'security'])
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)

    // Try local agent HTTP endpoint first (works without backend)
    if (cluster && !isAgentUnavailable()) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), NAMESPACE_FETCH_TIMEOUT_MS)
        const response = await agentFetch(`${LOCAL_AGENT_URL}/namespaces?cluster=${encodeURIComponent(cluster)}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          const nsData = data.namespaces || []
          if (nsData.length > 0) {
            // Extract just the namespace names
            const nsNames = nsData.map((ns: { name?: string; Name?: string }) => ns.name || ns.Name || '').filter(Boolean)
            setNamespaces(nsNames)
            setError(null)
            setIsLoading(false)
            reportAgentDataSuccess()
            return
          }
        }
      } catch (err) {
        console.error(`[useNamespaces] Local agent failed for ${cluster}:`, err)
      }
    }

    // Try kubectl proxy as fallback
    if (!isAgentUnavailable()) {
      try {
        const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
        const kubectlContext = clusterInfo?.context || cluster

        const nsPromise = kubectlProxy.getNamespaces(kubectlContext)
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), NAMESPACE_FETCH_TIMEOUT_MS)
        )
        const nsData = await Promise.race([nsPromise, timeoutPromise])

        if (nsData && nsData.length > 0) {
          setNamespaces(nsData)
          setError(null)
          setIsLoading(false)
          return
        }
      } catch (err) {
        console.error(`[useNamespaces] kubectl proxy failed for ${cluster}:`, err)
      }
    }

    // Fall back to REST API — merge pod-based namespaces with cluster cache
    // to include namespaces that have no running pods (#3945)
    try {
      const nsSet = new Set<string>()

      // Seed with cluster cache namespaces (discovered during health checks)
      // so namespaces without pods still appear in the dropdown
      const cachedCluster = clusterCacheRef.clusters.find(c => c.name === cluster)
      if (cachedCluster?.namespaces) {
        for (const ns of cachedCluster.namespaces) {
          nsSet.add(ns)
        }
      }

      // Also add namespaces from pods (may discover recently created namespaces
      // that the cache hasn't seen yet)
      try {
        const { data } = await api.get<{ pods: PodInfo[] }>(`/api/mcp/pods?cluster=${encodeURIComponent(cluster)}`)
        for (const pod of (data.pods || [])) {
          if (pod.namespace) nsSet.add(pod.namespace)
        }
      } catch {
        // Non-fatal: we may still have cache namespaces above
      }

      if (nsSet.size > 0) {
        setNamespaces(Array.from(nsSet).sort())
        setError(null)
      } else {
        setNamespaces(['default', 'kube-system'])
        setError(null)
      }
    } catch {
      setNamespaces(['default', 'kube-system'])
      setError(null)
    } finally {
      setIsLoading(false)
    }
  }, [cluster, forceLive])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { namespaces, isLoading, error, refetch }
}

// @ts-expect-error - kept for demo mode reference
function ___getDemoNamespaces(): string[] {
  return ['default', 'kube-system', 'kube-public', 'monitoring', 'production', 'staging', 'batch', 'data', 'web', 'ingress']
}

// Hook to get namespace statistics for a cluster
export function useNamespaceStats(cluster?: string) {
  const [stats, setStats] = useState<NamespaceStats[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!cluster) {
      setStats([])
      return
    }

    setIsLoading(true)
    try {
      // Fetch all pods for the cluster (no limit)
      const { data } = await api.get<{ pods: PodInfo[] }>(`/api/mcp/pods?cluster=${encodeURIComponent(cluster)}&limit=1000`)

      // Group pods by namespace and calculate stats
      const nsMap: Record<string, NamespaceStats> = {}
      data.pods?.forEach(pod => {
        const ns = pod.namespace || 'default'
        if (!nsMap[ns]) {
          nsMap[ns] = { name: ns, podCount: 0, runningPods: 0, pendingPods: 0, failedPods: 0 }
        }
        nsMap[ns].podCount++
        if (pod.status === 'Running') {
          nsMap[ns].runningPods++
        } else if (pod.status === 'Pending') {
          nsMap[ns].pendingPods++
        } else if (pod.status === 'Failed' || pod.status === 'CrashLoopBackOff' || pod.status === 'Error') {
          nsMap[ns].failedPods++
        }
      })

      // Sort by pod count (descending)
      const sortedStats = Object.values(nsMap).sort((a, b) => b.podCount - a.podCount)
      setStats(sortedStats)
      setError(null)
    } catch {
      // Don't show error at dashboard level
      setError(null)
      // Fallback to demo data
      setStats(getDemoNamespaceStats())
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { stats, isLoading, error, refetch }
}

function getDemoNamespaceStats(): NamespaceStats[] {
  return [
    { name: 'production', podCount: 45, runningPods: 42, pendingPods: 2, failedPods: 1 },
    { name: 'kube-system', podCount: 28, runningPods: 28, pendingPods: 0, failedPods: 0 },
    { name: 'monitoring', podCount: 15, runningPods: 14, pendingPods: 1, failedPods: 0 },
    { name: 'staging', podCount: 12, runningPods: 10, pendingPods: 1, failedPods: 1 },
    { name: 'batch', podCount: 8, runningPods: 5, pendingPods: 3, failedPods: 0 },
    { name: 'default', podCount: 5, runningPods: 5, pendingPods: 0, failedPods: 0 },
  ]
}

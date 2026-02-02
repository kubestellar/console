import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { LOCAL_AGENT_URL, clusterCacheRef } from './shared'
import { getDemoMode } from '../useDemoMode'
import type { PodInfo, NamespaceStats } from './types'

// Demo namespaces for when agent is unavailable
function getDemoNamespaces(): string[] {
  return ['default', 'kube-system', 'kube-public', 'monitoring', 'production', 'staging', 'batch', 'data', 'web', 'ingress', 'ml-workloads', 'llm-d']
}

export function useNamespaces(cluster?: string) {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when cluster changes
  useEffect(() => {
    setNamespaces([])
    setIsLoading(true)
    setError(null)
  }, [cluster])

  const refetch = useCallback(async () => {
    if (!cluster) {
      setNamespaces([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    // Return demo data if in demo mode or agent unavailable
    if (getDemoMode() || isAgentUnavailable()) {
      setNamespaces(getDemoNamespaces())
      setError(null)
      setIsLoading(false)
      return
    }

    // Try local agent HTTP endpoint first (works without backend)
    if (cluster && !isAgentUnavailable()) {
      try {
        console.log(`[useNamespaces] Fetching from local agent for ${cluster}`)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/namespaces?cluster=${encodeURIComponent(cluster)}`, {
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
            console.log(`[useNamespaces] Got ${nsNames.length} namespaces for ${cluster} from local agent`)
            setNamespaces(nsNames)
            setError(null)
            setIsLoading(false)
            reportAgentDataSuccess()
            return
          }
        }
        console.log(`[useNamespaces] Local agent returned ${response.status}, trying kubectl proxy`)
      } catch (err) {
        console.error(`[useNamespaces] Local agent failed for ${cluster}:`, err)
      }
    }

    // Try kubectl proxy as fallback
    if (!isAgentUnavailable()) {
      try {
        const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
        const kubectlContext = clusterInfo?.context || cluster
        console.log(`[useNamespaces] Fetching via kubectl proxy for ${cluster}`)

        // Add timeout to prevent hanging
        const nsPromise = kubectlProxy.getNamespaces(kubectlContext)
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 15000)
        )
        const nsData = await Promise.race([nsPromise, timeoutPromise])

        if (nsData && nsData.length > 0) {
          console.log(`[useNamespaces] Got ${nsData.length} namespaces for ${cluster} from kubectl proxy`)
          setNamespaces(nsData)
          setError(null)
          setIsLoading(false)
          return
        }
        console.log(`[useNamespaces] No namespaces returned for ${cluster}, trying API`)
      } catch (err) {
        console.error(`[useNamespaces] kubectl proxy failed for ${cluster}:`, err)
      }
    }

    // Fall back to REST API
    try {
      const { data } = await api.get<{ pods: PodInfo[] }>(`/api/mcp/pods?cluster=${encodeURIComponent(cluster)}`)
      const nsSet = new Set<string>()
      data.pods?.forEach(pod => {
        if (pod.namespace) nsSet.add(pod.namespace)
      })
      setNamespaces(Array.from(nsSet).sort())
      setError(null)
    } catch (err) {
      // Try cluster cache namespaces as last resort
      const cachedCluster = clusterCacheRef.clusters.find(c => c.name === cluster)
      if (cachedCluster?.namespaces && cachedCluster.namespaces.length > 0) {
        console.log(`[useNamespaces] Using cluster cache for ${cluster}: ${cachedCluster.namespaces.length} namespaces`)
        setNamespaces(cachedCluster.namespaces)
        setError(null)
      } else {
        // Provide default namespaces as fallback
        console.log(`[useNamespaces] Using default namespaces for ${cluster}`)
        setNamespaces(['default', 'kube-system'])
        setError(null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { namespaces, isLoading, error, refetch }
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
    } catch (err) {
      setError('Failed to fetch namespace stats')
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

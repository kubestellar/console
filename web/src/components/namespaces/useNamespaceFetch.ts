import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch } from '../../lib/api'
import { useToast } from '../ui/Toast'
import { clusterCacheRef } from '../../hooks/mcp/shared'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { NAMESPACE_ABORT_TIMEOUT_MS, isLocalAgentSuppressed } from '../../lib/constants/network'
import type { NamespaceDetails } from './types'

export type ClusterNamespaceStatus = 'unavailable' | 'accessDenied'

// Cache for namespace data per cluster - persists across filter changes
const namespaceCache = new Map<string, NamespaceDetails[]>()
const AUTO_REFRESH_INTERVAL_MS = 30000

function buildFallbackNamespaces(namespaces: string[], cluster: string): NamespaceDetails[] {
  return Array.from(new Set(namespaces.filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
    .map(namespace => ({
      name: namespace,
      cluster,
      status: 'Active',
      createdAt: new Date().toISOString(),
    }))
}

export function getCachedNamespacesForCluster(cluster: string): NamespaceDetails[] {
  const cachedNamespaces = namespaceCache.get(cluster)
  if ((cachedNamespaces || []).length > 0) {
    return cachedNamespaces || []
  }

  const cachedCluster = clusterCacheRef.clusters.find(currentCluster => currentCluster.name === cluster || currentCluster.context === cluster)
  return buildFallbackNamespaces(cachedCluster?.namespaces || [], cluster)
}

export function invalidateNamespaceCache(cluster: string) {
  namespaceCache.delete(cluster)
}

interface ClusterLike {
  name: string
  context?: string
  reachable?: boolean
}

interface UseNamespaceFetchOptions {
  clusters: ClusterLike[]
  deduplicatedClusters: ClusterLike[]
}

interface UseNamespaceFetchResult {
  allNamespaces: NamespaceDetails[]
  loading: boolean
  loadingClusters: Set<string>
  clusterStatuses: Record<string, ClusterNamespaceStatus>
  error: string | null
  setError: (error: string | null) => void
  lastUpdated: Date | null
  fetchNamespaces: (force?: boolean) => Promise<void>
}

export function useNamespaceFetch({ clusters, deduplicatedClusters }: UseNamespaceFetchOptions): UseNamespaceFetchResult {
  const { t } = useTranslation()
  const { showToast } = useToast()

  const [allNamespaces, setAllNamespaces] = useState<NamespaceDetails[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingClusters, setLoadingClusters] = useState<Set<string>>(new Set())
  const [clusterStatuses, setClusterStatuses] = useState<Record<string, ClusterNamespaceStatus>>({})
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasFetchedRef = useRef(false)
  const lastFetchKeyRef = useRef<string>('')
  const lastFetchErrorToastRef = useRef<string | null>(null)

  const allClusterNames = (deduplicatedClusters || []).map(c => c.name)

  const getClusterRequestName = useCallback((cluster: string): string => {
    const matchingCluster = (deduplicatedClusters || []).find(currentCluster => currentCluster.name === cluster || currentCluster.context === cluster)
      || (clusters || []).find(currentCluster => currentCluster.name === cluster || currentCluster.context === cluster)
    return matchingCluster?.context || cluster
  }, [clusters, deduplicatedClusters])

  // Fetch namespaces from all available clusters and cache them
  // Uses progressive loading - updates UI as each cluster completes
  const fetchNamespaces = useCallback(async (force = false) => {
    const offlineClusters = new Set(
      (clusters || [])
        .filter(cluster => cluster.reachable === false)
        .map(cluster => cluster.name)
    )

    // Determine which clusters to fetch
    const clustersToFetch = (force
      ? allClusterNames
      : allClusterNames.filter(c => !namespaceCache.has(c)))
      .filter(clusterName => !offlineClusters.has(clusterName))

    // If nothing to fetch and we have cache, use cached data
    if (clustersToFetch.length === 0 && !force) {
      // Build allNamespaces from cache
      const cachedNamespaces: NamespaceDetails[] = []
      for (const cluster of allClusterNames) {
        cachedNamespaces.push(...getCachedNamespacesForCluster(cluster))
      }
      setAllNamespaces(cachedNamespaces)
      setClusterStatuses({})
      return
    }

    // Prevent infinite loops
    const fetchKey = [...clustersToFetch].sort().join(',')
    if (!force && lastFetchKeyRef.current === fetchKey && hasFetchedRef.current) {
      return
    }

    if (allClusterNames.length === 0) {
      setAllNamespaces([])
      setClusterStatuses({})
      return
    }

    hasFetchedRef.current = true
    lastFetchKeyRef.current = fetchKey
    setLoading(true)
    setLoadingClusters(new Set(clustersToFetch))
    setClusterStatuses({})
    setError(null)

    const failedClusters: string[] = []
    const authFailedClusters: string[] = []
    const nextClusterStatuses: Record<string, ClusterNamespaceStatus> = {}

    // Helper to update state progressively
    const updateNamespacesFromCache = () => {
      const newAllNamespaces: NamespaceDetails[] = []
      for (const cluster of allClusterNames) {
        newAllNamespaces.push(...getCachedNamespacesForCluster(cluster))
      }
      setAllNamespaces(newAllNamespaces)
    }

    const buildNamespacesFromPods = async (cluster: string, requestCluster: string): Promise<NamespaceDetails[]> => {
      const podEndpoint = isLocalAgentSuppressed()
        ? `/api/mcp/pods?cluster=${encodeURIComponent(requestCluster)}&limit=1000`
        : `${LOCAL_AGENT_HTTP_URL}/pods?cluster=${encodeURIComponent(requestCluster)}&limit=1000`
      const response = await authFetch(
        podEndpoint,
        { headers: { Accept: 'application/json' } }
      )
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json() as { pods?: Array<{ namespace?: string }> }
      const namespaces = new Set<string>()
      for (const pod of (data.pods || [])) {
        if (pod.namespace) namespaces.add(pod.namespace)
      }
      return Array.from(namespaces).map(namespace => ({
        name: namespace,
        cluster,
        status: 'Active',
        createdAt: new Date().toISOString()
      }))
    }

    // Fetch namespaces from clusters progressively (not waiting for all)
    const fetchPromises = clustersToFetch.map(async (cluster) => {
      try {
        const requestCluster = getClusterRequestName(cluster)
        let clusterNamespaces: NamespaceDetails[] = []
        let agentFailed = false
        let agentAuthFailed = false
        let backendFailed = false
        let backendAuthFailed = false
        let podFallbackFailed = false

        if (!isLocalAgentSuppressed()) {
          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), NAMESPACE_ABORT_TIMEOUT_MS)
            const response = await authFetch(
              `${LOCAL_AGENT_HTTP_URL}/namespaces?cluster=${encodeURIComponent(requestCluster)}`,
              { signal: controller.signal, headers: { Accept: 'application/json' } }
            )
            clearTimeout(timeoutId)

            if (response.ok) {
              const data = await response.json() as {
                namespaces?: Array<{
                  name: string
                  status?: string
                  labels?: Record<string, string>
                  createdAt?: string
                }>
              }
              if (Array.isArray(data.namespaces)) {
                clusterNamespaces = data.namespaces.map(ns => ({
                  name: ns.name,
                  cluster,
                  status: ns.status || 'Active',
                  labels: ns.labels,
                  createdAt: ns.createdAt || new Date().toISOString()
                }))
              }
            } else if (response.status === 401 || response.status === 403) {
              agentAuthFailed = true
            } else {
              agentFailed = true
            }
          } catch (err: unknown) {
            agentFailed = true
            if (err instanceof DOMException && err.name === 'AbortError') {
              console.warn(`[NamespaceManager] ${t('namespaces.errors.requestTimedOut')}`, cluster)
              showToast(t('namespaces.errors.requestTimedOut'), 'error')
            } else if (err instanceof TypeError) {
              console.warn(`[NamespaceManager] ${t('namespaces.errors.agentNotReachable')}`, cluster)
              showToast(t('namespaces.errors.agentNotReachable'), 'error')
            }
          }
        }

        // Try backend API fallback if the agent did not return namespace data.
        if (clusterNamespaces.length === 0) {
          try {
            const response = await authFetch(`/api/namespaces?cluster=${encodeURIComponent(requestCluster)}`, {
              headers: { Accept: 'application/json' }
            })

            if (response.ok) {
              const data = await response.json() as NamespaceDetails[]
              clusterNamespaces = (Array.isArray(data) ? data : []).map(namespace => ({
                ...namespace,
                cluster: namespace.cluster || cluster,
              }))
            } else if (response.status === 401 || response.status === 403) {
              backendAuthFailed = true
            } else {
              backendFailed = true
            }
          } catch {
            backendFailed = true
          }
        }

        // Try building namespaces from pods if we have non-auth failures.
        if (clusterNamespaces.length === 0 && !backendAuthFailed && (agentFailed || agentAuthFailed || backendFailed)) {
          try {
            clusterNamespaces = await buildNamespacesFromPods(cluster, requestCluster)
          } catch {
            podFallbackFailed = true
          }
        }

        if (clusterNamespaces.length === 0) {
          const hasCachedFallback = getCachedNamespacesForCluster(cluster).length > 0
          if (backendAuthFailed) {
            authFailedClusters.push(cluster)
            if (!hasCachedFallback) {
              nextClusterStatuses[cluster] = 'accessDenied'
            }
          } else if (agentFailed || agentAuthFailed || backendFailed || podFallbackFailed) {
            failedClusters.push(cluster)
            if (!hasCachedFallback) {
              nextClusterStatuses[cluster] = 'unavailable'
            }
          }
        }

        // Only cache if we got data
        if (clusterNamespaces.length > 0) {
          namespaceCache.set(cluster, clusterNamespaces)
        }

        // Update UI progressively as each cluster completes
        setLoadingClusters(prev => {
          const next = new Set(prev)
          next.delete(cluster)
          return next
        })
        updateNamespacesFromCache()
      } catch {
        // Don't fail completely, just note which clusters failed
        failedClusters.push(cluster)
        if (getCachedNamespacesForCluster(cluster).length === 0) {
          nextClusterStatuses[cluster] = 'unavailable'
        }
        // DON'T cache empty arrays on failure - allow retry next time
        // Update loading state even on failure
        setLoadingClusters(prev => {
          const next = new Set(prev)
          next.delete(cluster)
          return next
        })
      }
    })

    updateNamespacesFromCache()

    // Wait for all to complete before marking fully done
    await Promise.all(fetchPromises)

    // Final update from cache
    updateNamespacesFromCache()
    setClusterStatuses(nextClusterStatuses)

    // Check actual cache size, not stale state
    let totalCachedNamespaces = 0
    for (const clusterName of allClusterNames) {
      totalCachedNamespaces += getCachedNamespacesForCluster(clusterName).length
    }

    // Only show error if ALL clusters failed (no namespaces at all)
    const totalFailed = failedClusters.length + authFailedClusters.length
    let fetchError: string | null = null
    if (totalFailed > 0 && totalCachedNamespaces === 0) {
      if (authFailedClusters.length > 0 && failedClusters.length === 0) {
        // All failures were auth-related - agent is running but access is denied
        fetchError = t('namespaces.errors.authorizationFailed', 'Authorization failed for namespace access. Your credentials may lack permission to list namespaces on the connected clusters.')
      } else {
        fetchError = t('namespaces.errors.unableToConnect', 'Unable to connect to clusters. Check that the KC agent is running.')
      }
      // Allow retry on next trigger since all clusters failed
      hasFetchedRef.current = false
    } else if (totalFailed > 0) {
      // Some clusters failed but we have partial data - show partial error
      if (authFailedClusters.length > 0 && failedClusters.length === 0) {
        fetchError = t('namespaces.errors.someClusterAuthFailed', {
          count: authFailedClusters.length,
          defaultValue: '{{count}} cluster(s) denied access. You may lack permissions to list namespaces on those clusters.'
        })
      } else {
        fetchError = t('namespaces.errors.someClustersUnavailable', {
          count: totalFailed,
          defaultValue: '{{count}} cluster(s) could not be reached. Showing cached data for available clusters.'
        })
      }
    }
    setError(fetchError)
    if (fetchError && lastFetchErrorToastRef.current !== fetchError) {
      showToast(fetchError, 'error')
      lastFetchErrorToastRef.current = fetchError
    } else if (!fetchError) {
      lastFetchErrorToastRef.current = null
    }

    setLoading(false)
    setLoadingClusters(new Set())
    setLastUpdated(new Date())
  }, [allClusterNames, clusters, getClusterRequestName, showToast, t])

  // Initial fetch when clusters are loaded - fetches ALL clusters to populate cache
  // Subsequent filter changes will just filter cached data, no refetch needed
  useEffect(() => {
    // Only fetch if we have clusters loaded
    if (clusters.length > 0) {
      fetchNamespaces()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters.length])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchNamespaces(true)
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchNamespaces])

  return {
    allNamespaces,
    loading,
    loadingClusters,
    clusterStatuses,
    error,
    setError,
    lastUpdated,
    fetchNamespaces,
  }
}

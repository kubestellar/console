/**
 * Cached hooks for pods, all-pods (GPU allocation) and cluster events.
 *
 * Extracted from useCachedCoreWorkloads.ts for maintainability.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../../lib/cache'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { clusterCacheRef, deduplicateClustersByServer } from '../mcp/shared'
import { isAgentUnavailable } from '../useLocalAgent'
import { settledWithConcurrency } from '../../lib/utils/concurrency'
import {
  fetchFromAllClusters,
  fetchViaSSE,
  getClusterFetcher,
} from '../../lib/cache/fetcherUtils'
import { getAgentClusters } from './agentFetchers'
import { getDemoPods, getDemoEvents } from './demoData'
import { PodInfoSchema, PodsResponseSchema, ClusterEventSchema, EventsResponseSchema } from '../../lib/schemas'
import { validateArrayResponse } from '../../lib/schemas/validate'
import type { PodInfo, ClusterEvent } from '../useMCP'

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for fetching pods with caching.
 * When no cluster is specified, fetches from all available clusters.
 */
export function useCachedPods(
  cluster?: string,
  namespace?: string,
  options?: { limit?: number; category?: RefreshCategory }
): CachedHookResult<PodInfo[]> & { pods: PodInfo[] } {
  const { limit = 100, category = 'pods' } = options || {}
  const key = `pods:${cluster || 'all'}:${namespace || 'all'}:${limit}`

  // Note: useCache handles demo mode detection internally via useSyncExternalStore
  const result = useCache({
    key,
    category,
    initialData: [] as PodInfo[],
    demoData: getDemoPods(),
    fetcher: async () => {
      let pods: PodInfo[]
      if (cluster) {
        const raw = await getClusterFetcher()<unknown>('pods', { cluster, namespace })
        const data = validateArrayResponse<{ pods: PodInfo[] }>(PodsResponseSchema, raw, '/api/mcp/pods', 'pods', PodInfoSchema)
        pods = (data.pods || []).map(p => ({ ...p, cluster }))
      } else {
        pods = await fetchFromAllClusters<PodInfo>('pods', 'pods', { namespace })
      }
      return pods
        .sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
        .slice(0, limit)
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      const pods = await fetchViaSSE<PodInfo>('pods', 'pods', { namespace }, (partial) => {
        onProgress(partial.sort((a, b) => (b.restarts || 0) - (a.restarts || 0)).slice(0, limit))
      })
      return pods
        .sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
        .slice(0, limit)
    } })

  return {
    pods: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch }
}

/**
 * Hook for fetching all pods (no namespace filter) with caching.
 * Used by GPU cards that need all pods across clusters for allocation tracking.
 */
export function useCachedAllPods(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<PodInfo[]> & { pods: PodInfo[] } {
  const { category = 'pods' } = options || {}
  const key = `allPods:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as PodInfo[],
    demoData: getDemoPods(),
    fetcher: async () => {
      if (cluster) {
        const raw = await getClusterFetcher()<unknown>('pods', { cluster })
        const data = validateArrayResponse<{ pods: PodInfo[] }>(PodsResponseSchema, raw, '/api/mcp/pods (allPods)', 'pods', PodInfoSchema)
        return (data.pods || []).map(p => ({ ...p, cluster }))
      }
      return await fetchFromAllClusters<PodInfo>('pods', 'pods')
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<PodInfo>('pods', 'pods', {}, onProgress)
    } })

  return {
    pods: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch }
}

/**
 * Hook for fetching events with caching
 */
export function useCachedEvents(
  cluster?: string,
  namespace?: string,
  options?: { limit?: number; category?: RefreshCategory }
): CachedHookResult<ClusterEvent[]> & { events: ClusterEvent[] } {
  const { limit = 20, category = 'realtime' } = options || {}
  const key = `events:${cluster || 'all'}:${namespace || 'all'}:${limit}`

  const result = useCache({
    key,
    category,
    initialData: [] as ClusterEvent[],
    demoData: getDemoEvents(),
    fetcher: async () => {
      // Try agent first (direct kubectl proxy — works before backend auth)
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        if (cluster) {
          const ci = clusterCacheRef.clusters.find(c => c.name === cluster)
          const ctx = ci?.context || cluster
          const events = await kubectlProxy.getEvents(ctx, namespace, limit)
          return events.map(e => ({ ...e, cluster }))
        }
        // Fetch from all clusters via agent with bounded concurrency
        const clusters = getAgentClusters()
        const allEvents: ClusterEvent[] = []
        const results = await settledWithConcurrency(
          deduplicateClustersByServer((clusters || []).map(c => ({ ...c, context: c.context || c.name }))).map((ci) => async () => {
            const ctx = ci.context || ci.name
            const events = await kubectlProxy.getEvents(ctx, namespace, limit)
            return events.map(e => ({ ...e, cluster: ci.name }))
          })
        )
        for (const r of (results || [])) {
          if (r.status === 'fulfilled') allEvents.push(...r.value)
        }
        return allEvents
          .sort((a, b) => {
            const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
            const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
            return timeB - timeA
          })
          .slice(0, limit)
      }

      // Fall back to REST API (requires backend auth)
      if (cluster) {
        const raw = await getClusterFetcher()<unknown>('events', { cluster, namespace, limit })
        const data = validateArrayResponse<{ events: ClusterEvent[] }>(EventsResponseSchema, raw, '/api/mcp/events', 'events', ClusterEventSchema)
        return data.events || []
      }
      return await fetchFromAllClusters<ClusterEvent>('events', 'events', { namespace, limit })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      // Try agent-based progressive fetch first
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const clusters = getAgentClusters()
        const accumulated: ClusterEvent[] = []
        const tasks = (clusters || []).map((ci) => async () => {
          const ctx = ci.context || ci.name
          const events = await kubectlProxy.getEvents(ctx, namespace, limit)
          return events.map(e => ({ ...e, cluster: ci.name }))
        })
        function handleSettled(result: PromiseSettledResult<ClusterEvent[]>) {
          if (result.status === 'fulfilled') {
            accumulated.push(...result.value)
            accumulated.sort((a, b) => {
              const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
              const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
              return timeB - timeA
            })
            onProgress([...accumulated].slice(0, limit))
          }
        }
        await settledWithConcurrency(tasks, undefined, handleSettled)
        return accumulated.slice(0, limit)
      }
      // Fall back to SSE via backend
      return await fetchViaSSE<ClusterEvent>('events', 'events', { namespace, limit }, onProgress)
    } })

  const events = result.data || []

  return {
    events,
    data: events,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch }
}

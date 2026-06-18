import { useCache, type CachedHookResult, type RefreshCategory } from '../../lib/cache'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { fetchFromAllClusters, fetchViaSSE, getClusterFetcher } from '../../lib/cache/fetcherUtils'
import { settledWithConcurrency } from '../../lib/utils/concurrency'
import { EventsResponseSchema } from '../../lib/schemas'
import { validateArrayResponse } from '../../lib/schemas/validate'
import { clusterCacheRef, deduplicateClustersByServer } from '../mcp/shared'
import { getAgentClusters } from '../useCachedData/agentFetchers'
import { getDemoEvents } from '../useCachedData/demoData'
import { isAgentUnavailable } from '../useLocalAgent'
import type { ClusterEvent } from '../useMCP'
import { withAlias } from './shared'

function sortEvents(events: ClusterEvent[], limit: number): ClusterEvent[] {
  return [...events].sort((a, b) => {
    const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
    const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
    return timeB - timeA
  }).slice(0, limit)
}

export function useCachedEvents(cluster?: string, namespace?: string, options?: { limit?: number; category?: RefreshCategory }): CachedHookResult<ClusterEvent[]> & { events: ClusterEvent[] } {
  const { limit = 20, category = 'realtime' } = options || {}
  const result = useCache({
    key: `events:${cluster || 'all'}:${namespace || 'all'}:${limit}`,
    category,
    initialData: [] as ClusterEvent[],
    demoData: getDemoEvents(),
    fetcher: async () => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        if (cluster) {
          const ctx = clusterCacheRef.clusters.find(item => item.name === cluster)?.context || cluster
          return (await kubectlProxy.getEvents(ctx, namespace, limit)).map(event => ({ ...event, cluster }))
        }
        const allEvents: ClusterEvent[] = []
        const results = await settledWithConcurrency(deduplicateClustersByServer(getAgentClusters().map(item => ({ ...item, context: item.context || item.name }))).map(item => async () => {
          const events = await kubectlProxy.getEvents(item.context || item.name, namespace, limit)
          return events.map(event => ({ ...event, cluster: item.name }))
        }))
        for (const result of (results || [])) {
          if (result.status === 'fulfilled') allEvents.push(...result.value)
        }
        return sortEvents(allEvents, limit)
      }
      if (cluster) {
        const data = validateArrayResponse<{ events: ClusterEvent[] }>(EventsResponseSchema, await getClusterFetcher()<unknown>('events', { cluster, namespace, limit }), '/api/mcp/events', 'events')
        return data.events || []
      }
      return fetchFromAllClusters<ClusterEvent>('events', 'events', { namespace, limit })
    },
    progressiveFetcher: cluster ? undefined : async onProgress => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const accumulated: ClusterEvent[] = []
        const tasks = getAgentClusters().map(item => async () => (await kubectlProxy.getEvents(item.context || item.name, namespace, limit)).map(event => ({ ...event, cluster: item.name })))
        await settledWithConcurrency(tasks, undefined, result => {
          if (result.status !== 'fulfilled') return
          accumulated.push(...result.value)
          onProgress(sortEvents(accumulated, limit))
        })
        return sortEvents(accumulated, limit)
      }
      return fetchViaSSE<ClusterEvent>('events', 'events', { namespace, limit }, onProgress)
    },
  })
  return withAlias(result, 'events')
}

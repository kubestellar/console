import { useCache, type CachedHookResult, type RefreshCategory } from '../../lib/cache'
import { fetchFromAllClusters, fetchViaSSE, getClusterFetcher } from '../../lib/cache/fetcherUtils'
import { PodsResponseSchema } from '../../lib/schemas'
import { validateArrayResponse } from '../../lib/schemas/validate'
import { getDemoPods } from '../useCachedData/demoData'
import type { PodInfo } from '../useMCP'
import { withAlias } from './shared'

export function useCachedPods(cluster?: string, namespace?: string, options?: { limit?: number; category?: RefreshCategory }): CachedHookResult<PodInfo[]> & { pods: PodInfo[] } {
  const { limit = 100, category = 'pods' } = options || {}
  const result = useCache({
    key: `pods:${cluster || 'all'}:${namespace || 'all'}:${limit}`,
    category,
    initialData: [] as PodInfo[],
    demoData: getDemoPods(),
    fetcher: async () => {
      const pods = cluster
        ? validateArrayResponse<{ pods: PodInfo[] }>(PodsResponseSchema, await getClusterFetcher()<unknown>('pods', { cluster, namespace }), '/api/mcp/pods', 'pods').pods.map(pod => ({ ...pod, cluster }))
        : await fetchFromAllClusters<PodInfo>('pods', 'pods', { namespace })
      return pods.sort((a, b) => (b.restarts || 0) - (a.restarts || 0)).slice(0, limit)
    },
    progressiveFetcher: cluster ? undefined : async onProgress => {
      const pods = await fetchViaSSE<PodInfo>('pods', 'pods', { namespace }, partial => {
        onProgress(partial.sort((a, b) => (b.restarts || 0) - (a.restarts || 0)).slice(0, limit))
      })
      return pods.sort((a, b) => (b.restarts || 0) - (a.restarts || 0)).slice(0, limit)
    },
  })
  return withAlias(result, 'pods')
}

export function useCachedAllPods(cluster?: string, options?: { category?: RefreshCategory }): CachedHookResult<PodInfo[]> & { pods: PodInfo[] } {
  const { category = 'pods' } = options || {}
  const result = useCache({
    key: `allPods:${cluster || 'all'}`,
    category,
    initialData: [] as PodInfo[],
    demoData: getDemoPods(),
    fetcher: async () => {
      if (cluster) {
        const data = validateArrayResponse<{ pods: PodInfo[] }>(PodsResponseSchema, await getClusterFetcher()<unknown>('pods', { cluster }), '/api/mcp/pods (allPods)', 'pods')
        return (data.pods || []).map(pod => ({ ...pod, cluster }))
      }
      return fetchFromAllClusters<PodInfo>('pods', 'pods')
    },
    progressiveFetcher: cluster ? undefined : async onProgress => fetchViaSSE<PodInfo>('pods', 'pods', {}, onProgress),
  })
  return withAlias(result, 'pods')
}

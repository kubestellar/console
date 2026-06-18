import { createCachedHook, type CachedHookResult, type RefreshCategory } from '../../lib/cache'
import { isBackendUnavailable } from '../../lib/api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import { fetchViaSSE, getToken } from '../../lib/cache/fetcherUtils'
import { fetchWorkloadsFromAgent } from '../useCachedData/agentFetchers'
import { getDemoWorkloads } from '../useCachedData/demoData'
import type { Workload } from '../useWorkloads'
import { withAlias } from './shared'

export function useCachedWorkloads(options?: { category?: RefreshCategory }): CachedHookResult<Workload[]> & { workloads: Workload[] } {
  const useWorkloadsBase = createCachedHook<Workload[]>({
    key: 'workloads:all:all',
    category: options?.category || 'deployments',
    initialData: [] as Workload[],
    demoData: getDemoWorkloads(),
    fetcher: async () => {
      const agentData = await fetchWorkloadsFromAgent()
      if (agentData) return agentData
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        const res = await fetch('/api/workloads', { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
        if (res.ok) {
          const data = await res.json().catch(() => null)
          if (!data) return []
          const items = (data.items || data) as Array<Record<string, unknown>>
          return items.map(item => ({
            name: String(item.name || ''),
            namespace: String(item.namespace || 'default'),
            type: String(item.type || 'Deployment') as Workload['type'],
            cluster: String(item.cluster || ''),
            targetClusters: (item.targetClusters as string[]) || (item.cluster ? [String(item.cluster)] : []),
            replicas: Number(item.replicas || 1),
            readyReplicas: Number(item.readyReplicas || 0),
            status: String(item.status || 'Running') as Workload['status'],
            image: String(item.image || ''),
            labels: (item.labels as Record<string, string>) || {},
            createdAt: String(item.createdAt || new Date().toISOString()),
          }))
        }
      }
      return []
    },
    progressiveFetcher: async onProgress => {
      const agentData = await fetchWorkloadsFromAgent(onProgress)
      if (agentData) return agentData
      return fetchViaSSE<Workload>('workloads', 'workloads', {}, onProgress)
    },
  })
  return withAlias(useWorkloadsBase(), 'workloads')
}

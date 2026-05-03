/**
 * Cached hooks for Kubernetes resource types.
 *
 * Uses a factory function to eliminate boilerplate — each standard K8s resource
 * hook differs only by resource name, cache key prefix, and demo data source.
 * useCachedNamespaces has a unique fetcher shape and is defined separately.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { fetchFromAllClusters, fetchViaSSE, getToken, getClusterFetcher } from '../lib/cache/fetcherUtils'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import {
  getDemoPVCs,
  getDemoNamespaces,
  getDemoJobs,
  getDemoHPAs,
  getDemoConfigMaps,
  getDemoSecrets,
  getDemoServiceAccounts,
  getDemoReplicaSets,
  getDemoStatefulSets,
  getDemoDaemonSets,
  getDemoCronJobs,
  getDemoIngresses,
  getDemoNetworkPolicies,
} from './useCachedData/demoData'
import type {
  PVC,
  Job,
  HPA,
  ConfigMap,
  Secret,
  ServiceAccount,
  ReplicaSet,
  StatefulSet,
  DaemonSet,
  CronJob,
  Ingress,
  NetworkPolicy,
} from './useMCP'

// ============================================================================
// Factory
// ============================================================================

interface K8sResourceConfig<T> {
  cacheKeyPrefix: string
  apiEndpoint: string
  responseKey: string
  aliasKey: string
  getDemoData: () => T[]
  defaultCategory?: RefreshCategory
}

function createCachedK8sResourceHook<T extends object>(
  config: K8sResourceConfig<T>
) {
  const {
    cacheKeyPrefix,
    apiEndpoint,
    responseKey,
    aliasKey,
    getDemoData,
    defaultCategory = 'default',
  } = config

  return function useCachedResource(
    cluster?: string,
    namespace?: string,
    options?: { category?: RefreshCategory }
  ): CachedHookResult<T[]> & Record<string, T[]> {
    const { category = defaultCategory } = options || {}
    const key = `${cacheKeyPrefix}:${cluster || 'all'}:${namespace || 'all'}`

    const result = useCache({
      key,
      category,
      initialData: [] as T[],
      demoData: getDemoData(),
      fetcher: async () => {
        if (cluster) {
          const data = await getClusterFetcher()<Record<string, T[]>>(apiEndpoint, { cluster, namespace })
          return ((data[responseKey] as T[]) || []).map(item => ({ ...item, cluster }))
        }
        return await fetchFromAllClusters<T>(apiEndpoint, responseKey, { namespace })
      },
      progressiveFetcher: cluster ? undefined : async (onProgress) => {
        return await fetchViaSSE<T>(apiEndpoint, responseKey, { namespace }, onProgress)
      },
    })

    return {
      [aliasKey]: result.data,
      data: result.data,
      isLoading: result.isLoading,
      isRefreshing: result.isRefreshing,
      isDemoFallback: result.isDemoFallback && !result.isLoading,
      error: result.error,
      isFailed: result.isFailed,
      consecutiveFailures: result.consecutiveFailures,
      lastRefresh: result.lastRefresh,
      refetch: result.refetch, retryFetch: result.retryFetch,
    } as CachedHookResult<T[]> & Record<string, T[]>
  }
}

// ============================================================================
// Standard resource hooks (factory-generated)
// ============================================================================

export const useCachedPVCs = createCachedK8sResourceHook<PVC>({
  cacheKeyPrefix: 'pvcs',
  apiEndpoint: 'pvcs',
  responseKey: 'pvcs',
  aliasKey: 'pvcs',
  getDemoData: getDemoPVCs,
})

export const useCachedJobs = createCachedK8sResourceHook<Job>({
  cacheKeyPrefix: 'jobs',
  apiEndpoint: 'jobs',
  responseKey: 'jobs',
  aliasKey: 'jobs',
  getDemoData: getDemoJobs,
})

export const useCachedHPAs = createCachedK8sResourceHook<HPA>({
  cacheKeyPrefix: 'hpas',
  apiEndpoint: 'hpas',
  responseKey: 'hpas',
  aliasKey: 'hpas',
  getDemoData: getDemoHPAs,
})

export const useCachedConfigMaps = createCachedK8sResourceHook<ConfigMap>({
  cacheKeyPrefix: 'configMaps',
  apiEndpoint: 'configmaps',
  responseKey: 'configmaps',
  aliasKey: 'configmaps',
  getDemoData: getDemoConfigMaps,
})

export const useCachedSecrets = createCachedK8sResourceHook<Secret>({
  cacheKeyPrefix: 'secrets',
  apiEndpoint: 'secrets',
  responseKey: 'secrets',
  aliasKey: 'secrets',
  getDemoData: getDemoSecrets,
})

export const useCachedServiceAccounts = createCachedK8sResourceHook<ServiceAccount>({
  cacheKeyPrefix: 'serviceAccounts',
  apiEndpoint: 'serviceaccounts',
  responseKey: 'serviceaccounts',
  aliasKey: 'serviceAccounts',
  getDemoData: getDemoServiceAccounts,
})

export const useCachedReplicaSets = createCachedK8sResourceHook<ReplicaSet>({
  cacheKeyPrefix: 'replicaSets',
  apiEndpoint: 'replicasets',
  responseKey: 'replicasets',
  aliasKey: 'replicasets',
  getDemoData: getDemoReplicaSets,
})

export const useCachedStatefulSets = createCachedK8sResourceHook<StatefulSet>({
  cacheKeyPrefix: 'statefulSets',
  apiEndpoint: 'statefulsets',
  responseKey: 'statefulsets',
  aliasKey: 'statefulsets',
  getDemoData: getDemoStatefulSets,
})

export const useCachedDaemonSets = createCachedK8sResourceHook<DaemonSet>({
  cacheKeyPrefix: 'daemonSets',
  apiEndpoint: 'daemonsets',
  responseKey: 'daemonsets',
  aliasKey: 'daemonsets',
  getDemoData: getDemoDaemonSets,
})

export const useCachedCronJobs = createCachedK8sResourceHook<CronJob>({
  cacheKeyPrefix: 'cronJobs',
  apiEndpoint: 'cronjobs',
  responseKey: 'cronjobs',
  aliasKey: 'cronjobs',
  getDemoData: getDemoCronJobs,
})

export const useCachedIngresses = createCachedK8sResourceHook<Ingress>({
  cacheKeyPrefix: 'ingresses',
  apiEndpoint: 'ingresses',
  responseKey: 'ingresses',
  aliasKey: 'ingresses',
  getDemoData: getDemoIngresses,
})

export const useCachedNetworkPolicies = createCachedK8sResourceHook<NetworkPolicy>({
  cacheKeyPrefix: 'networkPolicies',
  apiEndpoint: 'networkpolicies',
  responseKey: 'networkpolicies',
  aliasKey: 'networkpolicies',
  getDemoData: getDemoNetworkPolicies,
})

// ============================================================================
// useCachedNamespaces — unique fetcher, kept separate from factory
// ============================================================================

export function useCachedNamespaces(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<string[]> & { namespaces: string[] } {
  const { category = 'namespaces' } = options || {}
  const key = `namespaces:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as string[],
    demoData: getDemoNamespaces(),
    fetcher: async () => {
      if (!cluster) return getDemoNamespaces()
      const token = getToken()
      if (!token) throw new Error('No authentication token')
      const response = await fetch(`/api/mcp/namespaces?cluster=${encodeURIComponent(cluster)}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json().catch(() => null) as Array<{ name?: string; Name?: string }> | null
      return (data || []).map((ns: { name?: string; Name?: string }) => ns.name || ns.Name || '').filter(Boolean)
    },
  })

  return {
    namespaces: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch,
  }
}

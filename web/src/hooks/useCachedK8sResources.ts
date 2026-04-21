/**
 * Cached hooks for Kubernetes resource types:
 * PVCs, Namespaces, Jobs, HPAs, ConfigMaps, Secrets,
 * ServiceAccounts, ReplicaSets, StatefulSets, DaemonSets,
 * CronJobs, Ingresses, and NetworkPolicies.
 *
 * Extracted from useCachedData.ts for maintainability.
 */

import { useCache, type RefreshCategory } from '../lib/cache'
import { fetchAPI, fetchFromAllClusters, fetchViaSSE, getToken } from '../lib/cache/fetcherUtils'
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
// Shared types
// ============================================================================

/** Shared result shape for all useCached* hooks */
interface CachedHookResult<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  isDemoFallback: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for fetching PVCs with caching
 */
export function useCachedPVCs(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<PVC[]> & { pvcs: PVC[] } {
  const { category = 'default' } = options || {}
  const key = `pvcs:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as PVC[],
    demoData: getDemoPVCs(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ pvcs: PVC[] }>('pvcs', { cluster, namespace })
        return (data.pvcs || []).map(p => ({ ...p, cluster }))
      }
      return await fetchFromAllClusters<PVC>('pvcs', 'pvcs', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<PVC>('pvcs', 'pvcs', { namespace }, onProgress)
    } })

  return {
    pvcs: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching namespaces with caching.
 * Returns a list of namespace names for a given cluster.
 */
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
      // Use the dedicated /api/namespaces endpoint which returns namespace details
      const token = getToken()
      if (!token) throw new Error('No authentication token')
      const response = await fetch(`/api/namespaces?cluster=${encodeURIComponent(cluster)}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json().catch(() => null) as Array<{ name?: string; Name?: string }> | null
      return (data || []).map((ns: { name?: string; Name?: string }) => ns.name || ns.Name || '').filter(Boolean)
    } })

  return {
    namespaces: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching jobs with caching
 */
export function useCachedJobs(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Job[]> & { jobs: Job[] } {
  const { category = 'default' } = options || {}
  const key = `jobs:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as Job[],
    demoData: getDemoJobs(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ jobs: Job[] }>('jobs', { cluster, namespace })
        return (data.jobs || []).map(j => ({ ...j, cluster }))
      }
      return await fetchFromAllClusters<Job>('jobs', 'jobs', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<Job>('jobs', 'jobs', { namespace }, onProgress)
    } })

  return {
    jobs: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching HPAs with caching
 */
export function useCachedHPAs(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<HPA[]> & { hpas: HPA[] } {
  const { category = 'default' } = options || {}
  const key = `hpas:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as HPA[],
    demoData: getDemoHPAs(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ hpas: HPA[] }>('hpas', { cluster, namespace })
        return (data.hpas || []).map(h => ({ ...h, cluster }))
      }
      return await fetchFromAllClusters<HPA>('hpas', 'hpas', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<HPA>('hpas', 'hpas', { namespace }, onProgress)
    } })

  return {
    hpas: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching ConfigMaps with caching
 */
export function useCachedConfigMaps(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<ConfigMap[]> & { configmaps: ConfigMap[] } {
  const { category = 'default' } = options || {}
  const key = `configMaps:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as ConfigMap[],
    demoData: getDemoConfigMaps(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ configmaps: ConfigMap[] }>('configmaps', { cluster, namespace })
        return (data.configmaps || []).map(c => ({ ...c, cluster }))
      }
      return await fetchFromAllClusters<ConfigMap>('configmaps', 'configmaps', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<ConfigMap>('configmaps', 'configmaps', { namespace }, onProgress)
    } })

  return {
    configmaps: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching Secrets with caching
 */
export function useCachedSecrets(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Secret[]> & { secrets: Secret[] } {
  const { category = 'default' } = options || {}
  const key = `secrets:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as Secret[],
    demoData: getDemoSecrets(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ secrets: Secret[] }>('secrets', { cluster, namespace })
        return (data.secrets || []).map(s => ({ ...s, cluster }))
      }
      return await fetchFromAllClusters<Secret>('secrets', 'secrets', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<Secret>('secrets', 'secrets', { namespace }, onProgress)
    } })

  return {
    secrets: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching ServiceAccounts with caching
 */
export function useCachedServiceAccounts(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<ServiceAccount[]> & { serviceAccounts: ServiceAccount[] } {
  const { category = 'default' } = options || {}
  const key = `serviceAccounts:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as ServiceAccount[],
    demoData: getDemoServiceAccounts(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ serviceaccounts: ServiceAccount[] }>('serviceaccounts', { cluster, namespace })
        return (data.serviceaccounts || []).map(sa => ({ ...sa, cluster }))
      }
      return await fetchFromAllClusters<ServiceAccount>('serviceaccounts', 'serviceaccounts', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<ServiceAccount>('serviceaccounts', 'serviceaccounts', { namespace }, onProgress)
    } })

  return {
    serviceAccounts: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching ReplicaSets with caching
 */
export function useCachedReplicaSets(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<ReplicaSet[]> & { replicasets: ReplicaSet[] } {
  const { category = 'default' } = options || {}
  const key = `replicaSets:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as ReplicaSet[],
    demoData: getDemoReplicaSets(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ replicasets: ReplicaSet[] }>('replicasets', { cluster, namespace })
        return (data.replicasets || []).map(rs => ({ ...rs, cluster }))
      }
      return await fetchFromAllClusters<ReplicaSet>('replicasets', 'replicasets', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<ReplicaSet>('replicasets', 'replicasets', { namespace }, onProgress)
    } })

  return {
    replicasets: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching StatefulSets with caching
 */
export function useCachedStatefulSets(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<StatefulSet[]> & { statefulsets: StatefulSet[] } {
  const { category = 'default' } = options || {}
  const key = `statefulSets:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as StatefulSet[],
    demoData: getDemoStatefulSets(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ statefulsets: StatefulSet[] }>('statefulsets', { cluster, namespace })
        return (data.statefulsets || []).map(ss => ({ ...ss, cluster }))
      }
      return await fetchFromAllClusters<StatefulSet>('statefulsets', 'statefulsets', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<StatefulSet>('statefulsets', 'statefulsets', { namespace }, onProgress)
    } })

  return {
    statefulsets: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching DaemonSets with caching
 */
export function useCachedDaemonSets(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<DaemonSet[]> & { daemonsets: DaemonSet[] } {
  const { category = 'default' } = options || {}
  const key = `daemonSets:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as DaemonSet[],
    demoData: getDemoDaemonSets(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ daemonsets: DaemonSet[] }>('daemonsets', { cluster, namespace })
        return (data.daemonsets || []).map(ds => ({ ...ds, cluster }))
      }
      return await fetchFromAllClusters<DaemonSet>('daemonsets', 'daemonsets', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<DaemonSet>('daemonsets', 'daemonsets', { namespace }, onProgress)
    } })

  return {
    daemonsets: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching CronJobs with caching
 */
export function useCachedCronJobs(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<CronJob[]> & { cronjobs: CronJob[] } {
  const { category = 'default' } = options || {}
  const key = `cronJobs:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as CronJob[],
    demoData: getDemoCronJobs(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ cronjobs: CronJob[] }>('cronjobs', { cluster, namespace })
        return (data.cronjobs || []).map(cj => ({ ...cj, cluster }))
      }
      return await fetchFromAllClusters<CronJob>('cronjobs', 'cronjobs', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<CronJob>('cronjobs', 'cronjobs', { namespace }, onProgress)
    } })

  return {
    cronjobs: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching Ingresses with caching
 */
export function useCachedIngresses(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Ingress[]> & { ingresses: Ingress[] } {
  const { category = 'default' } = options || {}
  const key = `ingresses:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as Ingress[],
    demoData: getDemoIngresses(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ ingresses: Ingress[] }>('ingresses', { cluster, namespace })
        return (data.ingresses || []).map(i => ({ ...i, cluster }))
      }
      return await fetchFromAllClusters<Ingress>('ingresses', 'ingresses', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<Ingress>('ingresses', 'ingresses', { namespace }, onProgress)
    } })

  return {
    ingresses: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching NetworkPolicies with caching
 */
export function useCachedNetworkPolicies(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<NetworkPolicy[]> & { networkpolicies: NetworkPolicy[] } {
  const { category = 'default' } = options || {}
  const key = `networkPolicies:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as NetworkPolicy[],
    demoData: getDemoNetworkPolicies(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ networkpolicies: NetworkPolicy[] }>('networkpolicies', { cluster, namespace })
        return (data.networkpolicies || []).map(np => ({ ...np, cluster }))
      }
      return await fetchFromAllClusters<NetworkPolicy>('networkpolicies', 'networkpolicies', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<NetworkPolicy>('networkpolicies', 'networkpolicies', { namespace }, onProgress)
    } })

  return {
    networkpolicies: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

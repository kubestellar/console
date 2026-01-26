/**
 * Unified Data Hooks using the new caching layer
 *
 * These hooks provide a cleaner interface to fetch Kubernetes data with:
 * - Automatic caching with configurable refresh rates
 * - Stale-while-revalidate pattern
 * - Failure tracking
 * - localStorage persistence
 *
 * Migration guide:
 * - Replace `usePods()` with `useCachedPods()`
 * - Replace `useEvents()` with `useCachedEvents()`
 * - etc.
 *
 * The hooks maintain the same return interface for easy migration.
 */

import { useCache, type RefreshCategory } from '../lib/cache'
import { isBackendUnavailable } from '../lib/api'
import type {
  PodInfo,
  PodIssue,
  ClusterEvent,
  DeploymentIssue,
  Deployment,
  Service,
} from './useMCP'

// ============================================================================
// API Fetchers
// ============================================================================

const getToken = () => localStorage.getItem('token')

const isDemoMode = () => {
  const token = getToken()
  return !token || token === 'demo-token' || isBackendUnavailable()
}

async function fetchAPI<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const token = getToken()
  if (!token || isDemoMode()) {
    throw new Error('Demo mode or no token')
  }

  const searchParams = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value))
      }
    })
  }

  const url = `/api/mcp/${endpoint}?${searchParams}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

// Fetch list of available clusters
async function fetchClusters(): Promise<string[]> {
  const data = await fetchAPI<{ clusters: Array<{ name: string; reachable?: boolean }> }>('clusters')
  return (data.clusters || [])
    .filter(c => c.reachable !== false)
    .map(c => c.name)
}

// Fetch data from all clusters in parallel and merge results
async function fetchFromAllClusters<T>(
  endpoint: string,
  resultKey: string,
  params?: Record<string, string | number | undefined>,
  addClusterField = true
): Promise<T[]> {
  const clusters = await fetchClusters()

  // Fetch from each cluster in parallel
  const results = await Promise.allSettled(
    clusters.map(async (cluster) => {
      const data = await fetchAPI<Record<string, T[]>>(endpoint, { ...params, cluster })
      const items = data[resultKey] || []
      // Add cluster field to each item if requested
      if (addClusterField) {
        return items.map(item => ({ ...item, cluster }))
      }
      return items
    })
  )

  // Merge successful results
  const allItems: T[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value)
    }
  }

  return allItems
}

// ============================================================================
// Demo Data (fallbacks)
// ============================================================================

const getDemoPods = (): PodInfo[] => [
  { name: 'frontend-7d8f9c4b5-x2km4', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '2d', cpuRequestMillis: 500, memoryRequestBytes: 536870912, cpuUsageMillis: 320, memoryUsageBytes: 412516352, metricsAvailable: true },
  { name: 'backend-api-6c8d7f5e4-j3ln9', namespace: 'production', status: 'Running', ready: '2/2', restarts: 1, age: '5d', cpuRequestMillis: 1000, memoryRequestBytes: 1073741824, cpuUsageMillis: 850, memoryUsageBytes: 892871680, metricsAvailable: true },
  { name: 'ml-worker-8f9a6b7c3-k4lm2', namespace: 'ml-workloads', status: 'Running', ready: '1/1', restarts: 0, age: '1d', cpuRequestMillis: 4000, memoryRequestBytes: 8589934592, gpuRequest: 2, cpuUsageMillis: 3200, memoryUsageBytes: 7516192768, metricsAvailable: true },
  { name: 'inference-server-5d4c3b2a1-n7op9', namespace: 'ml-workloads', status: 'Running', ready: '1/1', restarts: 2, age: '3d', cpuRequestMillis: 2000, memoryRequestBytes: 4294967296, gpuRequest: 1, cpuUsageMillis: 1850, memoryUsageBytes: 3865470566, metricsAvailable: true },
  { name: 'cache-redis-6e5d4c3b2-q8rs1', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '7d', cpuRequestMillis: 250, memoryRequestBytes: 268435456, cpuUsageMillis: 45, memoryUsageBytes: 134217728, metricsAvailable: true },
]

const getDemoEvents = (): ClusterEvent[] => [
  { type: 'Warning', reason: 'FailedScheduling', message: 'No nodes available', object: 'pod/test', namespace: 'default', count: 3 },
  { type: 'Normal', reason: 'Started', message: 'Container started', object: 'pod/web', namespace: 'production', count: 1 },
]

const getDemoPodIssues = (): PodIssue[] => [
  { name: 'failing-pod', namespace: 'default', status: 'CrashLoopBackOff', issues: ['Container crashing'], restarts: 5 },
]

const getDemoDeploymentIssues = (): DeploymentIssue[] => [
  { name: 'web-frontend', namespace: 'production', replicas: 3, readyReplicas: 2, reason: 'ReplicaFailure' },
]

const getDemoDeployments = (): Deployment[] => [
  { name: 'web-frontend', namespace: 'production', status: 'running', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3, progress: 100 },
]

const getDemoServices = (): Service[] => [
  { name: 'web-service', namespace: 'production', type: 'LoadBalancer', clusterIP: '10.0.0.1', ports: ['80/TCP'] },
]

// ============================================================================
// Cached Data Hooks
// ============================================================================

interface CachedHookResult<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

/**
 * Hook for fetching pods with caching
 * When no cluster is specified, fetches from all available clusters
 */
export function useCachedPods(
  cluster?: string,
  namespace?: string,
  options?: { limit?: number; category?: RefreshCategory }
): CachedHookResult<PodInfo[]> & { pods: PodInfo[] } {
  const { limit = 100, category = 'pods' } = options || {}
  const key = `pods:${cluster || 'all'}:${namespace || 'all'}:${limit}`

  const result = useCache({
    key,
    category,
    initialData: getDemoPods(),
    enabled: !isDemoMode(),
    fetcher: async () => {
      let pods: PodInfo[]
      if (cluster) {
        // Fetch from specific cluster
        const data = await fetchAPI<{ pods: PodInfo[] }>('pods', { cluster, namespace })
        pods = (data.pods || []).map(p => ({ ...p, cluster }))
      } else {
        // Fetch from all clusters
        pods = await fetchFromAllClusters<PodInfo>('pods', 'pods', { namespace })
      }
      // Sort by restarts (descending) and limit
      return pods
        .sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
        .slice(0, limit)
    },
  })

  return {
    pods: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
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
    initialData: getDemoEvents(),
    enabled: !isDemoMode(),
    fetcher: async () => {
      const data = await fetchAPI<{ events: ClusterEvent[] }>('events', { cluster, namespace, limit })
      return data.events || []
    },
  })

  return {
    events: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching pod issues with caching
 * When no cluster is specified, fetches from all available clusters
 */
export function useCachedPodIssues(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<PodIssue[]> & { issues: PodIssue[] } {
  const { category = 'pods' } = options || {}
  const key = `podIssues:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: getDemoPodIssues(),
    enabled: !isDemoMode(),
    fetcher: async () => {
      let issues: PodIssue[]
      if (cluster) {
        // Fetch from specific cluster
        const data = await fetchAPI<{ issues: PodIssue[] }>('pod-issues', { cluster, namespace })
        issues = (data.issues || []).map(i => ({ ...i, cluster }))
      } else {
        // Fetch from all clusters
        issues = await fetchFromAllClusters<PodIssue>('pod-issues', 'issues', { namespace })
      }
      // Sort by restarts (descending)
      return issues.sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
    },
  })

  return {
    issues: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching deployment issues with caching
 */
export function useCachedDeploymentIssues(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<DeploymentIssue[]> & { issues: DeploymentIssue[] } {
  const { category = 'deployments' } = options || {}
  const key = `deploymentIssues:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: getDemoDeploymentIssues(),
    enabled: !isDemoMode(),
    fetcher: async () => {
      const data = await fetchAPI<{ issues: DeploymentIssue[] }>('deployment-issues', { cluster, namespace })
      return data.issues || []
    },
  })

  return {
    issues: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching deployments with caching
 */
export function useCachedDeployments(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Deployment[]> & { deployments: Deployment[] } {
  const { category = 'deployments' } = options || {}
  const key = `deployments:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: getDemoDeployments(),
    enabled: !isDemoMode(),
    fetcher: async () => {
      const data = await fetchAPI<{ deployments: Deployment[] }>('deployments', { cluster, namespace })
      return data.deployments || []
    },
  })

  return {
    deployments: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching services with caching
 */
export function useCachedServices(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Service[]> & { services: Service[] } {
  const { category = 'services' } = options || {}
  const key = `services:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: getDemoServices(),
    enabled: !isDemoMode(),
    fetcher: async () => {
      const data = await fetchAPI<{ services: Service[] }>('services', { cluster, namespace })
      return data.services || []
    },
  })

  return {
    services: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

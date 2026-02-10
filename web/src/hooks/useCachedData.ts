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
import { kubectlProxy } from '../lib/kubectlProxy'
import { clusterCacheRef } from './mcp/shared'
import { isAgentUnavailable } from './useLocalAgent'
import type {
  PodInfo,
  PodIssue,
  ClusterEvent,
  DeploymentIssue,
  Deployment,
  Service,
  SecurityIssue,
} from './useMCP'
import type { ProwJob, ProwStatus } from './useProw'
import type { LLMdServer, LLMdStatus, LLMdModel } from './useLLMd'
import type { Workload } from './useWorkloads'

// ============================================================================
// API Fetchers
// ============================================================================

const getToken = () => localStorage.getItem('token')

const LOCAL_AGENT_URL = 'http://127.0.0.1:8585'

async function fetchAPI<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const token = getToken()
  if (!token) {
    throw new Error('No authentication token')
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

// Get list of reachable clusters (prefer local agent data for accurate reachability)
function getReachableClusters(): string[] {
  // Use local agent's cluster cache - it has up-to-date reachability info
  if (clusterCacheRef.clusters.length > 0) {
    return clusterCacheRef.clusters
      .filter(c => c.reachable !== false && !c.name.includes('/'))
      .map(c => c.name)
  }
  return []
}

// Fetch list of available clusters from backend (fallback)
async function fetchClusters(): Promise<string[]> {
  // First check local agent data - faster and more accurate reachability
  const localClusters = getReachableClusters()
  if (localClusters.length > 0) {
    return localClusters
  }

  // Fall back to backend API
  const data = await fetchAPI<{ clusters: Array<{ name: string; reachable?: boolean }> }>('clusters')
  return (data.clusters || [])
    .filter(c => c.reachable !== false && !c.name.includes('/'))
    .map(c => c.name)
}

// Fetch data from all clusters in parallel and merge results
// Throws if ALL cluster fetches fail (so callers can fall back to agent)
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

  // If every cluster fetch failed, throw so callers can try agent fallback
  if (allItems.length === 0 && results.length > 0 && results.every(r => r.status === 'rejected')) {
    throw new Error('All cluster fetches failed')
  }

  return allItems
}

// ============================================================================
// Agent-based fetchers (used when backend is unavailable but agent is connected)
// ============================================================================

/** Get reachable cluster names from the shared cluster cache (deduplicated) */
function getAgentClusters(): Array<{ name: string; context?: string }> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  // Skip long context-path names (contain '/') — these are duplicates of short-named aliases
  // e.g. "default/api-fmaas-vllm-d-...:6443/..." duplicates "vllm-d"
  return clusterCacheRef.clusters
    .filter(c => c.reachable !== false && !c.name.includes('/'))
    .map(c => ({ name: c.name, context: c.context }))
}

/** Fetch pod issues from all clusters via agent kubectl proxy */
async function fetchPodIssuesViaAgent(namespace?: string): Promise<PodIssue[]> {
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  const results = await Promise.allSettled(
    clusters.map(async ({ name, context }) => {
      const ctx = context || name
      const issues = await kubectlProxy.getPodIssues(ctx, namespace)
      // Always use the short name — kubectlProxy returns context path as cluster
      return issues.map(i => ({ ...i, cluster: name }))
    })
  )

  const items: PodIssue[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items
}

/** Fetch deployments from all clusters via agent HTTP endpoint */
async function fetchDeploymentsViaAgent(namespace?: string): Promise<Deployment[]> {
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  const results = await Promise.allSettled(
    clusters.map(async ({ name, context }) => {
      const params = new URLSearchParams()
      params.append('cluster', context || name)
      if (namespace) params.append('namespace', namespace)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      const response = await fetch(`${LOCAL_AGENT_URL}/deployments?${params}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      clearTimeout(timeoutId)

      if (!response.ok) throw new Error(`Agent returned ${response.status}`)
      const data = await response.json()
      // Always use the short name — agent echoes back context path as cluster
      return ((data.deployments || []) as Deployment[]).map(d => ({
        ...d,
        cluster: name,
      }))
    })
  )

  const items: Deployment[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items
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
  { name: 'api-server-7d8f9c6b5-x2k4m', namespace: 'production', cluster: 'prod-east', status: 'CrashLoopBackOff', issues: ['Container restarting', 'OOMKilled'], restarts: 15 },
  { name: 'worker-5c6d7e8f9-n3p2q', namespace: 'batch', cluster: 'vllm-d', status: 'ImagePullBackOff', issues: ['Failed to pull image'], restarts: 0 },
  { name: 'cache-redis-0', namespace: 'data', cluster: 'staging', status: 'Pending', issues: ['Insufficient memory'], restarts: 0 },
  { name: 'metrics-collector-2b4c6-j8k9l', namespace: 'monitoring', cluster: 'prod-west', status: 'CrashLoopBackOff', issues: ['Exit code 137'], restarts: 8 },
  { name: 'gpu-scheduler-0', namespace: 'ml-ops', cluster: 'vllm-d', status: 'Pending', issues: ['Insufficient nvidia.com/gpu'], restarts: 0 },
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

const getDemoProwJobs = (): ProwJob[] => [
  { id: '1', name: 'pull-kubernetes-e2e', type: 'presubmit', state: 'success', cluster: 'prow', startTime: new Date(Date.now() - 10 * 60000).toISOString(), duration: '45m', pr: 12345 },
  { id: '2', name: 'pull-kubernetes-unit', type: 'presubmit', state: 'success', cluster: 'prow', startTime: new Date(Date.now() - 15 * 60000).toISOString(), duration: '12m', pr: 12346 },
  { id: '3', name: 'ci-kubernetes-e2e-gce', type: 'periodic', state: 'failure', cluster: 'prow', startTime: new Date(Date.now() - 30 * 60000).toISOString(), duration: '1h 23m' },
]

const getDemoLLMdServers = (): LLMdServer[] => [
  { id: '1', name: 'vllm-llama-3', namespace: 'llm-d', cluster: 'vllm-d', model: 'llama-3-70b', type: 'vllm', componentType: 'model', status: 'running', replicas: 2, readyReplicas: 2, gpu: 'NVIDIA', gpuCount: 4 },
  { id: '2', name: 'tgi-granite', namespace: 'llm-d', cluster: 'vllm-d', model: 'granite-13b', type: 'tgi', componentType: 'model', status: 'running', replicas: 1, readyReplicas: 1, gpu: 'NVIDIA', gpuCount: 2 },
]

const getDemoLLMdModels = (): LLMdModel[] => [
  { id: '1', name: 'llama-3-70b', namespace: 'llm-d', cluster: 'vllm-d', instances: 2, status: 'loaded' },
  { id: '2', name: 'granite-13b', namespace: 'llm-d', cluster: 'vllm-d', instances: 1, status: 'loaded' },
]

const getDemoSecurityIssues = (): SecurityIssue[] => [
  { name: 'api-server-7d8f9c6b5-x2k4m', namespace: 'production', cluster: 'eks-prod-us-east-1', issue: 'Privileged container', severity: 'high', details: 'Container running in privileged mode' },
  { name: 'worker-deployment', namespace: 'batch', cluster: 'vllm-gpu-cluster', issue: 'Running as root', severity: 'high', details: 'Container running as root user' },
  { name: 'nginx-ingress', namespace: 'ingress', cluster: 'eks-prod-us-east-1', issue: 'Host network enabled', severity: 'medium', details: 'Pod using host network namespace' },
  { name: 'monitoring-agent', namespace: 'monitoring', cluster: 'gke-staging', issue: 'Missing security context', severity: 'low', details: 'No security context defined' },
  { name: 'redis-cache', namespace: 'data', cluster: 'openshift-prod', issue: 'Capabilities not dropped', severity: 'medium', details: 'Container not dropping all capabilities' },
  { name: 'legacy-app', namespace: 'legacy', cluster: 'vllm-gpu-cluster', issue: 'Running as root', severity: 'high', details: 'Container running as root user' },
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

  // Note: useCache handles demo mode detection internally via useSyncExternalStore
  const result = useCache({
    key,
    category,
    initialData: [] as PodInfo[],
    demoData: getDemoPods(),
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
    initialData: [] as ClusterEvent[],
    demoData: getDemoEvents(),
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
    initialData: [] as PodIssue[],
    demoData: getDemoPodIssues(),
    fetcher: async () => {
      let issues: PodIssue[]

      // Try agent first (fast, no backend needed)
      if (clusterCacheRef.clusters.length > 0) {
        if (cluster) {
          const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
          const ctx = clusterInfo?.context || cluster
          issues = await kubectlProxy.getPodIssues(ctx, namespace)
          // Always use the short name passed in, not the context path from kubectlProxy
          issues = issues.map(i => ({ ...i, cluster: cluster }))
        } else {
          issues = await fetchPodIssuesViaAgent(namespace)
        }
        return issues.sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
      }

      // Fall back to REST API
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        if (cluster) {
          const data = await fetchAPI<{ issues: PodIssue[] }>('pod-issues', { cluster, namespace })
          issues = (data.issues || []).map(i => ({ ...i, cluster }))
        } else {
          issues = await fetchFromAllClusters<PodIssue>('pod-issues', 'issues', { namespace })
        }
        return issues.sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
      }

      return []
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
    initialData: [] as DeploymentIssue[],
    demoData: getDemoDeploymentIssues(),
    fetcher: async () => {
      // Try agent first — derive deployment issues from deployment data
      if (clusterCacheRef.clusters.length > 0) {
        const deployments = cluster
          ? await (async () => {
              const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
              const params = new URLSearchParams()
              params.append('cluster', clusterInfo?.context || cluster)
              if (namespace) params.append('namespace', namespace)
              const ctrl = new AbortController()
              const tid = setTimeout(() => ctrl.abort(), 15000)
              const res = await fetch(`${LOCAL_AGENT_URL}/deployments?${params}`, {
                signal: ctrl.signal, headers: { Accept: 'application/json' },
              })
              clearTimeout(tid)
              if (!res.ok) return []
              const data = await res.json()
              return ((data.deployments || []) as Deployment[]).map(d => ({ ...d, cluster: cluster }))
            })()
          : await fetchDeploymentsViaAgent(namespace)

        // Derive issues: deployments where readyReplicas < replicas
        return deployments
          .filter(d => (d.readyReplicas ?? 0) < (d.replicas ?? 1))
          .map(d => ({
            name: d.name,
            namespace: d.namespace || 'default',
            cluster: d.cluster,
            replicas: d.replicas ?? 1,
            readyReplicas: d.readyReplicas ?? 0,
            reason: d.status === 'failed' ? 'DeploymentFailed' : 'ReplicaFailure',
          }))
      }

      // Fall back to REST API
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        const data = await fetchAPI<{ issues: DeploymentIssue[] }>('deployment-issues', { cluster, namespace })
        return data.issues || []
      }

      return []
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
    initialData: [] as Deployment[],
    demoData: getDemoDeployments(),
    fetcher: async () => {
      // Try agent first (fast, no backend needed)
      if (clusterCacheRef.clusters.length > 0) {
        if (cluster) {
          const params = new URLSearchParams()
          const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
          params.append('cluster', clusterInfo?.context || cluster)
          if (namespace) params.append('namespace', namespace)

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 15000)
          const response = await fetch(`${LOCAL_AGENT_URL}/deployments?${params}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          })
          clearTimeout(timeoutId)

          if (response.ok) {
            const data = await response.json()
            return ((data.deployments || []) as Deployment[]).map(d => ({
              ...d,
              cluster: cluster,
            }))
          }
        }
        return fetchDeploymentsViaAgent(namespace)
      }

      // Fall back to REST API
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        if (cluster) {
          const data = await fetchAPI<{ deployments: Deployment[] }>('deployments', { cluster, namespace })
          const deployments = data.deployments || []
          return deployments.map(d => ({ ...d, cluster: d.cluster || cluster }))
        }
        return await fetchFromAllClusters<Deployment>('deployments', 'deployments', { namespace })
      }

      return []
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
    initialData: [] as Service[],
    demoData: getDemoServices(),
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

// ============================================================================
// Prow Cached Hooks (uses kubectlProxy)
// ============================================================================

interface ProwJobResource {
  metadata: {
    name: string
    creationTimestamp: string
    labels?: {
      'prow.k8s.io/job'?: string
      'prow.k8s.io/type'?: string
      'prow.k8s.io/build-id'?: string
    }
  }
  spec: {
    job?: string
    type?: string
    cluster?: string
    refs?: {
      pulls?: Array<{ number: number }>
    }
  }
  status: {
    state?: string
    startTime?: string
    completionTime?: string
    pendingTime?: string
    url?: string
    build_id?: string
  }
}

function formatDuration(startTime: string, endTime?: string): string {
  const start = new Date(startTime)
  const end = endTime ? new Date(endTime) : new Date()
  const diffMs = end.getTime() - start.getTime()

  if (diffMs < 0) return '-'

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return `${seconds}s ago`
}

async function fetchProwJobs(prowCluster: string, namespace: string): Promise<ProwJob[]> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  const response = await kubectlProxy.exec(
    ['get', 'prowjobs', '-n', namespace, '-o', 'json', '--sort-by=.metadata.creationTimestamp'],
    { context: prowCluster, timeout: 30000 }
  )

  if (response.exitCode !== 0) {
    throw new Error(response.error || 'Failed to get ProwJobs')
  }

  const data = JSON.parse(response.output)
  return (data.items || [])
    .reverse()
    .slice(0, 100)
    .map((pj: ProwJobResource) => {
      const jobName = pj.metadata.labels?.['prow.k8s.io/job'] || pj.spec.job || pj.metadata.name
      const jobType = (pj.metadata.labels?.['prow.k8s.io/type'] || pj.spec.type || 'unknown') as ProwJob['type']
      const state = (pj.status.state || 'unknown') as ProwJob['state']
      const startTime = pj.status.startTime || pj.status.pendingTime || pj.metadata.creationTimestamp
      const completionTime = pj.status.completionTime

      return {
        id: pj.metadata.name,
        name: jobName,
        type: jobType,
        state,
        cluster: prowCluster,
        startTime,
        completionTime,
        duration: state === 'pending' || state === 'triggered' ? '-' : formatDuration(startTime, completionTime),
        pr: pj.spec.refs?.pulls?.[0]?.number,
        url: pj.status.url,
        buildId: pj.status.build_id || pj.metadata.labels?.['prow.k8s.io/build-id'],
      }
    })
}

function computeProwStatus(jobs: ProwJob[], consecutiveFailures: number): ProwStatus {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recentJobs = jobs.filter(j => new Date(j.startTime) > oneHourAgo)

  const pendingJobs = jobs.filter(j => j.state === 'pending' || j.state === 'triggered').length
  const runningJobs = jobs.filter(j => j.state === 'running').length
  const successJobs = recentJobs.filter(j => j.state === 'success').length
  const failedJobs = recentJobs.filter(j => j.state === 'failure' || j.state === 'error').length
  const completedJobs = successJobs + failedJobs
  const successRate = completedJobs > 0 ? (successJobs / completedJobs) * 100 : 100

  return {
    healthy: consecutiveFailures < 3,
    pendingJobs,
    runningJobs,
    successJobs,
    failedJobs,
    prowJobsLastHour: recentJobs.length,
    successRate: Math.round(successRate * 10) / 10,
  }
}

/**
 * Hook for fetching ProwJobs with caching
 */
export function useCachedProwJobs(
  prowCluster = 'prow',
  namespace = 'prow'
): CachedHookResult<ProwJob[]> & { jobs: ProwJob[]; status: ProwStatus; formatTimeAgo: typeof formatTimeAgo } {
  const key = `prowjobs:${prowCluster}:${namespace}`

  const result = useCache({
    key,
    category: 'gitops',
    initialData: [] as ProwJob[],
    demoData: getDemoProwJobs(),
    fetcher: () => fetchProwJobs(prowCluster, namespace),
  })

  const status = computeProwStatus(result.data, result.consecutiveFailures)

  return {
    jobs: result.data,
    data: result.data,
    status,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
    formatTimeAgo,
  }
}

// ============================================================================
// LLM-d Cached Hooks (uses kubectlProxy)
// ============================================================================

interface DeploymentResource {
  metadata: {
    name: string
    namespace: string
    labels?: Record<string, string>
  }
  spec: {
    replicas?: number
    template?: {
      metadata?: {
        labels?: Record<string, string>
      }
      spec?: {
        containers?: Array<{
          resources?: {
            limits?: Record<string, string>
          }
        }>
      }
    }
  }
  status: {
    replicas?: number
    readyReplicas?: number
  }
}

interface HPAResource {
  metadata: { name: string; namespace: string }
  spec: { scaleTargetRef: { kind: string; name: string } }
}

interface VariantAutoscalingResource {
  metadata: { name: string; namespace: string }
  spec: { targetRef?: { kind?: string; name?: string } }
}

interface InferencePoolResource {
  metadata: { name: string; namespace: string }
  spec: { selector?: { matchLabels?: Record<string, string> } }
  status?: { parents?: Array<{ conditions?: Array<{ type: string; status: string }> }> }
}

function detectServerType(name: string, labels?: Record<string, string>): LLMdServer['type'] {
  const nameLower = name.toLowerCase()
  if (labels?.['app.kubernetes.io/name'] === 'tgi' || nameLower.includes('tgi')) return 'tgi'
  if (labels?.['app.kubernetes.io/name'] === 'triton' || nameLower.includes('triton')) return 'triton'
  if (labels?.['llmd.org/inferenceServing'] === 'true' || nameLower.includes('llm-d')) return 'llm-d'
  if (nameLower.includes('vllm')) return 'vllm'
  return 'unknown'
}

function detectComponentType(name: string, labels?: Record<string, string>): LLMdServer['componentType'] {
  const nameLower = name.toLowerCase()
  if (nameLower.includes('-epp') || nameLower.endsWith('epp')) return 'epp'
  if (nameLower.includes('gateway') || nameLower.includes('ingress')) return 'gateway'
  if (nameLower === 'prometheus' || nameLower.includes('prometheus-')) return 'prometheus'
  if (labels?.['llmd.org/inferenceServing'] === 'true' ||
      labels?.['llmd.org/model'] ||
      nameLower.includes('vllm') || nameLower.includes('tgi') || nameLower.includes('triton') ||
      nameLower.includes('llama') || nameLower.includes('granite') || nameLower.includes('qwen') ||
      nameLower.includes('mistral') || nameLower.includes('mixtral')) {
    return 'model'
  }
  return 'other'
}

function detectGatewayType(name: string): LLMdServer['gatewayType'] {
  const nameLower = name.toLowerCase()
  if (nameLower.includes('istio')) return 'istio'
  if (nameLower.includes('kgateway') || nameLower.includes('envoy')) return 'kgateway'
  return 'envoy'
}

function getLLMdServerStatus(replicas: number, readyReplicas: number): LLMdServer['status'] {
  if (replicas === 0) return 'stopped'
  if (readyReplicas === replicas) return 'running'
  if (readyReplicas > 0) return 'scaling'
  return 'error'
}

function extractGPUInfo(deployment: DeploymentResource): { gpu?: string; gpuCount?: number } {
  const limits = deployment.spec.template?.spec?.containers?.[0]?.resources?.limits || {}
  const gpuKeys = Object.keys(limits).filter(k => k.includes('nvidia.com/gpu') || k.includes('amd.com/gpu') || k.includes('gpu'))
  if (gpuKeys.length > 0) {
    const gpuKey = gpuKeys[0]
    const gpuCount = parseInt(limits[gpuKey] || '0', 10)
    const gpuType = gpuKey.includes('nvidia') ? 'NVIDIA' : gpuKey.includes('amd') ? 'AMD' : 'GPU'
    return { gpu: gpuType, gpuCount }
  }
  return {}
}

async function fetchLLMdServers(clusters: string[]): Promise<LLMdServer[]> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  const allServers: LLMdServer[] = []

  for (const cluster of clusters) {
    try {
      // Query all namespaces to discover llm-d workloads regardless of namespace naming
      const allDeployments: DeploymentResource[] = []
      try {
        const resp = await kubectlProxy.exec(['get', 'deployments', '-A', '-o', 'json'], { context: cluster, timeout: 15000 })
        if (resp.exitCode === 0 && resp.output) {
          allDeployments.push(...(JSON.parse(resp.output).items || []))
        }
      } catch { /* cluster not reachable */ }
      if (allDeployments.length === 0) continue

      const autoscalerMap = new Map<string, 'hpa' | 'va' | 'both'>()
      const autoscalerItems: LLMdServer[] = []
      try {
        const hpaResp = await kubectlProxy.exec(['get', 'hpa', '-A', '-o', 'json'], { context: cluster, timeout: 10000 })
        if (hpaResp.exitCode === 0) {
          for (const hpa of (JSON.parse(hpaResp.output).items || []) as HPAResource[]) {
            if (hpa.spec.scaleTargetRef.kind === 'Deployment') {
              autoscalerMap.set(`${hpa.metadata.namespace}/${hpa.spec.scaleTargetRef.name}`, 'hpa')
              // Add HPA as a separate item for the Autoscaler section
              autoscalerItems.push({
                id: `${cluster}-${hpa.metadata.namespace}-${hpa.metadata.name}-hpa`,
                name: hpa.metadata.name,
                namespace: hpa.metadata.namespace,
                cluster,
                model: `→ ${hpa.spec.scaleTargetRef.name}`,
                type: 'unknown',
                componentType: 'autoscaler',
                autoscalerType: 'hpa',
                status: 'running',
                replicas: 1,
                readyReplicas: 1,
              })
            }
          }
        }
      } catch { /* ignore */ }

      try {
        const vaResp = await kubectlProxy.exec(['get', 'variantautoscalings', '-A', '-o', 'json'], { context: cluster, timeout: 10000 })
        if (vaResp.exitCode === 0) {
          for (const va of (JSON.parse(vaResp.output).items || []) as VariantAutoscalingResource[]) {
            if (va.spec.targetRef?.name) {
              const key = `${va.metadata.namespace}/${va.spec.targetRef.name}`
              autoscalerMap.set(key, autoscalerMap.has(key) ? 'both' : 'va')
              // Add WVA/VariantAutoscaling as a separate item
              autoscalerItems.push({
                id: `${cluster}-${va.metadata.namespace}-${va.metadata.name}-wva`,
                name: va.metadata.name,
                namespace: va.metadata.namespace,
                cluster,
                model: `→ ${va.spec.targetRef.name}`,
                type: 'unknown',
                componentType: 'autoscaler',
                autoscalerType: 'va',
                status: 'running',
                replicas: 1,
                readyReplicas: 1,
              })
            }
          }
        }
      } catch { /* ignore */ }

      // Also fetch VPA
      try {
        const vpaResp = await kubectlProxy.exec(['get', 'vpa', '-A', '-o', 'json'], { context: cluster, timeout: 10000 })
        if (vpaResp.exitCode === 0) {
          const vpaData = JSON.parse(vpaResp.output)
          for (const vpa of (vpaData.items || []) as Array<{ metadata: { name: string; namespace: string }; spec?: { targetRef?: { name?: string } } }>) {
            const targetName = vpa.spec?.targetRef?.name || 'unknown'
            autoscalerItems.push({
              id: `${cluster}-${vpa.metadata.namespace}-${vpa.metadata.name}-vpa`,
              name: vpa.metadata.name,
              namespace: vpa.metadata.namespace,
              cluster,
              model: `→ ${targetName}`,
              type: 'unknown',
              componentType: 'autoscaler',
              autoscalerType: 'vpa',
              status: 'running',
              replicas: 1,
              readyReplicas: 1,
            })
          }
        }
      } catch { /* ignore */ }

      const llmdDeployments = allDeployments.filter(d => {
        const name = d.metadata.name.toLowerCase()
        const labels = d.spec.template?.metadata?.labels || {}
        const ns = d.metadata.namespace.toLowerCase()
        // Expanded namespace patterns to catch more llm-d related namespaces
        const isLlmdNs = ns.includes('llm-d') || ns.includes('llmd') || ns.includes('e2e') || ns.includes('vllm') ||
          ns.includes('inference') || ns.includes('ai-') || ns.includes('-ai') || ns.includes('ml-') ||
          ns === 'b2' || ns.includes('effi') || ns.includes('guygir') || ns.includes('aibrix') ||
          ns.includes('hc4ai') || ns.includes('serving') || ns.includes('model')
        return name.includes('vllm') || name.includes('llm-d') || name.includes('llmd') || name.includes('tgi') || name.includes('triton') ||
          name.includes('llama') || name.includes('granite') || name.includes('qwen') || name.includes('mistral') || name.includes('mixtral') ||
          labels['llmd.org/inferenceServing'] === 'true' || labels['llmd.org/model'] ||
          labels['app.kubernetes.io/name'] === 'vllm' || labels['app.kubernetes.io/name'] === 'tgi' ||
          labels['llm-d.ai/role'] || labels['app'] === 'llm-inference' ||
          name.includes('-epp') || name.endsWith('epp') || name.includes('inference-pool') ||
          (isLlmdNs && (name.includes('gateway') || name.includes('ingress') || name === 'prometheus'))
      })

      const nsGateway = new Map<string, { status: 'running' | 'stopped'; type: LLMdServer['gatewayType'] }>()
      const nsPrometheus = new Map<string, 'running' | 'stopped'>()

      for (const dep of llmdDeployments) {
        const name = dep.metadata.name.toLowerCase()
        const status = getLLMdServerStatus(dep.spec.replicas || 0, dep.status.readyReplicas || 0)
        if (name.includes('gateway') || name.includes('ingress')) {
          nsGateway.set(dep.metadata.namespace, { status: status === 'running' ? 'running' : 'stopped', type: detectGatewayType(dep.metadata.name) })
        }
        if (name === 'prometheus') {
          nsPrometheus.set(dep.metadata.namespace, status === 'running' ? 'running' : 'stopped')
        }
      }

      for (const dep of llmdDeployments) {
        const labels = dep.spec.template?.metadata?.labels || {}
        const model = labels['llmd.org/model'] || labels['app.kubernetes.io/model'] || dep.metadata.name
        const gpuInfo = extractGPUInfo(dep)
        const autoscalerType = autoscalerMap.get(`${dep.metadata.namespace}/${dep.metadata.name}`)
        const gw = nsGateway.get(dep.metadata.namespace)
        const prom = nsPrometheus.get(dep.metadata.namespace)

        allServers.push({
          id: `${cluster}-${dep.metadata.namespace}-${dep.metadata.name}`,
          name: dep.metadata.name,
          namespace: dep.metadata.namespace,
          cluster,
          model,
          type: detectServerType(dep.metadata.name, labels),
          componentType: detectComponentType(dep.metadata.name, labels),
          status: getLLMdServerStatus(dep.spec.replicas || 0, dep.status.readyReplicas || 0),
          replicas: dep.spec.replicas || 0,
          readyReplicas: dep.status.readyReplicas || 0,
          hasAutoscaler: !!autoscalerType,
          autoscalerType,
          gatewayStatus: gw?.status,
          gatewayType: gw?.type,
          prometheusStatus: prom,
          ...gpuInfo,
        })
      }

      // Add autoscaler items as separate section entries
      allServers.push(...autoscalerItems)
    } catch (err) {
      // Suppress demo mode errors - they're expected when agent is unavailable
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('demo mode')) {
        console.error(`Error fetching from cluster ${cluster}:`, err)
      }
    }
  }
  return allServers
}

function computeLLMdStatus(servers: LLMdServer[], consecutiveFailures: number): LLMdStatus {
  return {
    healthy: consecutiveFailures < 3,
    totalServers: servers.length,
    runningServers: servers.filter(s => s.status === 'running').length,
    stoppedServers: servers.filter(s => s.status === 'stopped').length,
    totalModels: new Set(servers.map(s => s.model)).size,
    loadedModels: new Set(servers.filter(s => s.status === 'running').map(s => s.model)).size,
  }
}

/**
 * Hook for fetching LLM-d servers with caching
 */
export function useCachedLLMdServers(
  clusters: string[] = ['vllm-d', 'platform-eval']
): CachedHookResult<LLMdServer[]> & { servers: LLMdServer[]; status: LLMdStatus } {
  const key = `llmd-servers:${clusters.join(',')}`

  const result = useCache({
    key,
    category: 'gitops',
    initialData: [] as LLMdServer[],
    demoData: getDemoLLMdServers(),
    fetcher: () => fetchLLMdServers(clusters),
  })

  const status = computeLLMdStatus(result.data, result.consecutiveFailures)

  return {
    servers: result.data,
    data: result.data,
    status,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

async function fetchLLMdModels(clusters: string[]): Promise<LLMdModel[]> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  const allModels: LLMdModel[] = []
  for (const cluster of clusters) {
    try {
      const response = await kubectlProxy.exec(['get', 'inferencepools', '-A', '-o', 'json'], { context: cluster, timeout: 30000 })
      if (response.exitCode !== 0) continue
      for (const pool of (JSON.parse(response.output).items || []) as InferencePoolResource[]) {
        const modelName = pool.spec.selector?.matchLabels?.['llmd.org/model'] || pool.metadata.name
        const hasAccepted = pool.status?.parents?.some(p => p.conditions?.some(c => c.type === 'Accepted' && c.status === 'True'))
        allModels.push({
          id: `${cluster}-${pool.metadata.namespace}-${pool.metadata.name}`,
          name: modelName,
          namespace: pool.metadata.namespace,
          cluster,
          instances: 1,
          status: hasAccepted ? 'loaded' : 'stopped',
        })
      }
    } catch (err) {
      // Suppress demo mode errors - they're expected when agent is unavailable
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('demo mode')) {
        console.error(`Error fetching InferencePools from cluster ${cluster}:`, err)
      }
    }
  }
  return allModels
}

/**
 * Hook for fetching LLM-d models with caching
 */
export function useCachedLLMdModels(
  clusters: string[] = ['vllm-d', 'platform-eval']
): CachedHookResult<LLMdModel[]> & { models: LLMdModel[] } {
  const key = `llmd-models:${clusters.join(',')}`

  const result = useCache({
    key,
    category: 'gitops',
    initialData: [] as LLMdModel[],
    demoData: getDemoLLMdModels(),
    fetcher: () => fetchLLMdModels(clusters),
  })

  return {
    models: result.data,
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

// ============================================================================
// Workloads Cached Hooks
// ============================================================================

const getDemoWorkloads = (): Workload[] => [
  { name: 'nginx-ingress', namespace: 'ingress-system', type: 'Deployment', status: 'Running', replicas: 3, readyReplicas: 3, image: 'nginx/nginx-ingress:3.4.0', labels: { app: 'nginx-ingress', tier: 'frontend' }, targetClusters: ['us-east-1', 'us-west-2', 'eu-central-1'], createdAt: new Date(Date.now() - 30 * 86400000).toISOString() },
  { name: 'api-gateway', namespace: 'production', type: 'Deployment', status: 'Degraded', replicas: 5, readyReplicas: 3, image: 'company/api-gateway:v2.5.1', labels: { app: 'api-gateway', tier: 'api' }, targetClusters: ['us-east-1', 'us-west-2'], createdAt: new Date(Date.now() - 14 * 86400000).toISOString() },
  { name: 'postgres-primary', namespace: 'databases', type: 'StatefulSet', status: 'Running', replicas: 1, readyReplicas: 1, image: 'postgres:15.4', labels: { app: 'postgres', role: 'primary' }, targetClusters: ['us-east-1'], createdAt: new Date(Date.now() - 60 * 86400000).toISOString() },
  { name: 'fluentd', namespace: 'logging', type: 'DaemonSet', status: 'Running', replicas: 12, readyReplicas: 12, image: 'fluent/fluentd:v1.16', labels: { app: 'fluentd', tier: 'logging' }, targetClusters: ['us-east-1', 'us-west-2', 'eu-central-1'], createdAt: new Date(Date.now() - 45 * 86400000).toISOString() },
  { name: 'ml-training', namespace: 'ml-workloads', type: 'Deployment', status: 'Pending', replicas: 1, readyReplicas: 0, image: 'company/ml-trainer:latest', labels: { app: 'ml-training', team: 'data-science' }, targetClusters: ['gpu-cluster-1'], createdAt: new Date(Date.now() - 3600000).toISOString() },
  { name: 'payment-service', namespace: 'payments', type: 'Deployment', status: 'Failed', replicas: 2, readyReplicas: 0, image: 'company/payment-service:v1.8.0', labels: { app: 'payment-service', tier: 'backend' }, targetClusters: ['us-east-1'], createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
]

/** Fetch workloads from the local agent across all clusters */
async function fetchWorkloadsFromAgent(): Promise<Workload[] | null> {
  if (isAgentUnavailable()) return null

  const clusters = clusterCacheRef.clusters
    .filter(c => c.reachable !== false && !c.name.includes('/'))
  if (clusters.length === 0) return null

  const results = await Promise.allSettled(
    clusters.map(async ({ name, context }) => {
      const params = new URLSearchParams()
      params.append('cluster', context || name)

      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 15000)
      const res = await fetch(`${LOCAL_AGENT_URL}/deployments?${params}`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      })
      clearTimeout(tid)

      if (!res.ok) throw new Error(`Agent ${res.status}`)
      const data = await res.json()
      return ((data.deployments || []) as Array<Record<string, unknown>>).map(d => {
        const st = String(d.status || 'running')
        let ws: Workload['status'] = 'Running'
        if (st === 'failed') ws = 'Failed'
        else if (st === 'deploying') ws = 'Pending'
        else if (Number(d.readyReplicas || 0) < Number(d.replicas || 1)) ws = 'Degraded'
        return {
          name: String(d.name || ''),
          namespace: String(d.namespace || 'default'),
          type: 'Deployment' as const,
          cluster: name,
          targetClusters: [name],
          replicas: Number(d.replicas || 1),
          readyReplicas: Number(d.readyReplicas || 0),
          status: ws,
          image: String(d.image || ''),
          createdAt: new Date().toISOString(),
        }
      })
    })
  )

  const items: Workload[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items.length > 0 ? items : null
}

/**
 * Hook for fetching workloads with caching.
 * Fetches all workloads across all clusters via agent, then REST fallback.
 */
export function useCachedWorkloads(
  options?: { category?: RefreshCategory }
): CachedHookResult<Workload[]> & { workloads: Workload[] } {
  const { category = 'deployments' } = options || {}
  const key = 'workloads:all:all'

  const result = useCache({
    key,
    category,
    initialData: [] as Workload[],
    demoData: getDemoWorkloads(),
    fetcher: async () => {
      // Try agent first (fast, no backend needed)
      const agentData = await fetchWorkloadsFromAgent()
      if (agentData) return agentData

      // Fall back to REST API
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        const res = await fetch('/api/workloads', {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
        if (res.ok) {
          const data = await res.json()
          const items = (data.items || data) as Array<Record<string, unknown>>
          return items.map(d => ({
            name: String(d.name || ''),
            namespace: String(d.namespace || 'default'),
            type: (String(d.type || 'Deployment')) as Workload['type'],
            cluster: String(d.cluster || ''),
            targetClusters: (d.targetClusters as string[]) || (d.cluster ? [String(d.cluster)] : []),
            replicas: Number(d.replicas || 1),
            readyReplicas: Number(d.readyReplicas || 0),
            status: (String(d.status || 'Running')) as Workload['status'],
            image: String(d.image || ''),
            labels: (d.labels as Record<string, string>) || {},
            createdAt: String(d.createdAt || new Date().toISOString()),
          }))
        }
      }

      return []
    },
  })

  return {
    workloads: result.data,
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

// ============================================================================
// Security Cached Hooks
// ============================================================================

/**
 * Fetch security issues via kubectlProxy - scans pods for security misconfigurations
 */
async function fetchSecurityIssuesViaKubectl(cluster?: string, namespace?: string): Promise<SecurityIssue[]> {
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  const results = await Promise.allSettled(
    clusters
      .filter(c => !cluster || c.name === cluster)
      .map(async ({ name, context }) => {
        const ctx = context || name
        // Get all pods and check for security issues
        const nsFlag = namespace ? ['-n', namespace] : ['-A']
        const response = await kubectlProxy.exec(
          ['get', 'pods', ...nsFlag, '-o', 'json'],
          { context: ctx, timeout: 30000 }
        )

        if (response.exitCode !== 0) return []

        const data = JSON.parse(response.output)
        const issues: SecurityIssue[] = []

        for (const pod of data.items || []) {
          const podName = pod.metadata?.name || 'unknown'
          const podNs = pod.metadata?.namespace || 'default'
          const spec = pod.spec || {}

          // Check for security misconfigurations
          for (const container of spec.containers || []) {
            const sc = container.securityContext || {}
            const podSc = spec.securityContext || {}

            // Privileged container
            if (sc.privileged === true) {
              issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Privileged container', severity: 'high', details: 'Container running in privileged mode' })
            }

            // Running as root
            if (sc.runAsUser === 0 || (sc.runAsNonRoot !== true && podSc.runAsNonRoot !== true && !sc.runAsUser)) {
              const isRoot = sc.runAsUser === 0 || podSc.runAsUser === 0
              if (isRoot) {
                issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Running as root', severity: 'high', details: 'Container running as root user' })
              }
            }

            // Missing security context
            if (!sc.runAsNonRoot && !sc.readOnlyRootFilesystem && !sc.allowPrivilegeEscalation && !sc.capabilities) {
              issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Missing security context', severity: 'low', details: 'No security context defined' })
            }

            // Capabilities not dropped
            if (sc.capabilities?.drop?.length === 0 || !sc.capabilities?.drop) {
              if (sc.capabilities?.add?.length > 0) {
                issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Capabilities not dropped', severity: 'medium', details: 'Container not dropping all capabilities' })
              }
            }
          }

          // Host network
          if (spec.hostNetwork === true) {
            issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Host network enabled', severity: 'medium', details: 'Pod using host network namespace' })
          }

          // Host PID
          if (spec.hostPID === true) {
            issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Host PID enabled', severity: 'high', details: 'Pod using host PID namespace' })
          }

          // Host IPC
          if (spec.hostIPC === true) {
            issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Host IPC enabled', severity: 'medium', details: 'Pod using host IPC namespace' })
          }
        }

        return issues
      })
  )

  const items: SecurityIssue[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  // Sort by severity
  return items.sort((a, b) => (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5))
}

/**
 * Hook for fetching security issues with caching
 * Provides stale-while-revalidate: shows cached data immediately while refreshing
 */
export function useCachedSecurityIssues(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<SecurityIssue[]> & { issues: SecurityIssue[] } {
  const { category = 'pods' } = options || {}
  const key = `securityIssues:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as SecurityIssue[],
    demoData: getDemoSecurityIssues(),
    fetcher: async () => {
      // Try kubectl proxy first (uses agent to run kubectl commands)
      if (clusterCacheRef.clusters.length > 0) {
        try {
          const issues = await fetchSecurityIssuesViaKubectl(cluster, namespace)
          if (issues.length > 0) return issues
        } catch (err) {
          console.error('[useCachedSecurityIssues] kubectl fetch failed:', err)
        }
      }

      // Fall back to REST API
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        try {
          const params = new URLSearchParams()
          if (cluster) params.append('cluster', cluster)
          if (namespace) params.append('namespace', namespace)
          const response = await fetch(`/api/mcp/security-issues?${params}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
          if (response.ok) {
            const data = await response.json() as { issues: SecurityIssue[] }
            if (data.issues && data.issues.length > 0) return data.issues
          }
        } catch (err) {
          console.error('[useCachedSecurityIssues] API fetch failed:', err)
        }
      }

      return []
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

// ============================================================================
// Standalone fetchers for prefetch (no React hooks, plain async)
// ============================================================================

/** Core data fetchers — used by prefetchCardData to warm caches at startup */
export const coreFetchers = {
  pods: async (): Promise<PodInfo[]> => {
    const pods = await fetchFromAllClusters<PodInfo>('pods', 'pods', {})
    return pods.sort((a, b) => (b.restarts || 0) - (a.restarts || 0)).slice(0, 100)
  },
  podIssues: async (): Promise<PodIssue[]> => {
    if (clusterCacheRef.clusters.length > 0) {
      const issues = await fetchPodIssuesViaAgent()
      return issues.sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
    }
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      const issues = await fetchFromAllClusters<PodIssue>('pod-issues', 'issues', {})
      return issues.sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
    }
    return []
  },
  events: async (): Promise<ClusterEvent[]> => {
    const data = await fetchAPI<{ events: ClusterEvent[] }>('events', { limit: 20 })
    return data.events || []
  },
  deploymentIssues: async (): Promise<DeploymentIssue[]> => {
    if (clusterCacheRef.clusters.length > 0) {
      const deployments = await fetchDeploymentsViaAgent()
      return deployments
        .filter(d => (d.readyReplicas ?? 0) < (d.replicas ?? 1))
        .map(d => ({
          name: d.name,
          namespace: d.namespace || 'default',
          cluster: d.cluster,
          replicas: d.replicas ?? 1,
          readyReplicas: d.readyReplicas ?? 0,
          reason: d.status === 'failed' ? 'DeploymentFailed' : 'ReplicaFailure',
        }))
    }
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      const data = await fetchAPI<{ issues: DeploymentIssue[] }>('deployment-issues', {})
      return data.issues || []
    }
    return []
  },
  deployments: async (): Promise<Deployment[]> => {
    if (clusterCacheRef.clusters.length > 0) {
      return fetchDeploymentsViaAgent()
    }
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      return await fetchFromAllClusters<Deployment>('deployments', 'deployments', {})
    }
    return []
  },
  services: async (): Promise<Service[]> => {
    const data = await fetchAPI<{ services: Service[] }>('services', {})
    return data.services || []
  },
  securityIssues: async (): Promise<SecurityIssue[]> => {
    if (clusterCacheRef.clusters.length > 0) {
      try {
        const issues = await fetchSecurityIssuesViaKubectl()
        if (issues.length > 0) return issues
      } catch { /* fall through */ }
    }
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      const response = await fetch('/api/mcp/security-issues', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json() as { issues: SecurityIssue[] }
        if (data.issues?.length > 0) return data.issues
      }
    }
    return []
  },
  workloads: async (): Promise<Workload[]> => {
    const agentData = await fetchWorkloadsFromAgent()
    if (agentData) return agentData
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      const res = await fetch('/api/workloads', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        const items = (data.items || data) as Array<Record<string, unknown>>
        return items.map(d => ({
          name: String(d.name || ''),
          namespace: String(d.namespace || 'default'),
          type: (String(d.type || 'Deployment')) as Workload['type'],
          cluster: String(d.cluster || ''),
          targetClusters: (d.targetClusters as string[]) || (d.cluster ? [String(d.cluster)] : []),
          replicas: Number(d.replicas || 1),
          readyReplicas: Number(d.readyReplicas || 0),
          status: (String(d.status || 'Running')) as Workload['status'],
          image: String(d.image || ''),
          labels: (d.labels as Record<string, string>) || {},
          createdAt: String(d.createdAt || new Date().toISOString()),
        }))
      }
    }
    return []
  },
}

/** Specialty data fetchers — lower priority, prefetched after core data */
export const specialtyFetchers = {
  prowJobs: () => fetchProwJobs('prow', 'prow'),
  llmdServers: () => fetchLLMdServers(['vllm-d', 'platform-eval']),
  llmdModels: () => fetchLLMdModels(['vllm-d', 'platform-eval']),
}

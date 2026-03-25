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

import { useState, useCallback } from 'react'
import { useCache, type RefreshCategory } from '../lib/cache'
import { isBackendUnavailable, authFetch } from '../lib/api'
import { kubectlProxy } from '../lib/kubectlProxy'
import { fetchSSE } from '../lib/sseClient'
import { clusterCacheRef } from './mcp/shared'
import { isAgentUnavailable } from './useLocalAgent'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, AI_PREDICTION_TIMEOUT_MS, KUBECTL_EXTENDED_TIMEOUT_MS } from '../lib/constants/network'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import type {
  PodInfo,
  PodIssue,
  ClusterEvent,
  DeploymentIssue,
  Deployment,
  Service,
  SecurityIssue,
  NodeInfo,
  GPUNode,
  GPUNodeHealthStatus,
  PVC,
  Job,
  HPA,
  HelmRelease,
  HelmHistoryEntry,
  Operator,
  OperatorSubscription,
  GitOpsDrift,
  BuildpackImage,
  ConfigMap,
  Secret,
  ServiceAccount,
  ReplicaSet,
  StatefulSet,
  DaemonSet,
  CronJob,
  Ingress,
  NetworkPolicy,
  K8sRole,
  K8sRoleBinding,
  K8sServiceAccountInfo,
  GPUHealthCronJobStatus,
} from './useMCP'
import type { ProwJob, ProwStatus } from './useProw'
import type { LLMdServer, LLMdStatus, LLMdModel } from './useLLMd'
import type { Workload } from './useWorkloads'

// ============================================================================
// ISO 27001 Audit Types
// ============================================================================

export interface ISO27001Finding {
  checkId: string
  category: string
  label: string
  status: 'pass' | 'fail' | 'warning' | 'manual'
  cluster: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  details: string
}

// ============================================================================
// API Fetchers
// ============================================================================

const getToken = () => localStorage.getItem(STORAGE_KEY_TOKEN)

const AGENT_HTTP_TIMEOUT_MS = 5_000

/** Maximum number of ProwJobs to return from a fetch */
const MAX_PROW_JOBS = 100
/** Maximum number of pods to return from a prefetch query */
const MAX_PREFETCH_PODS = 100

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
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

// Get list of reachable (or not-yet-checked) clusters (prefer local agent data for accurate reachability)
function getReachableClusters(): string[] {
  // Use local agent's cluster cache - it has up-to-date reachability info
  // Include reachable === undefined (health check pending) — same logic as getAgentClusters
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
  addClusterField = true,
  onProgress?: (partial: T[]) => void
): Promise<T[]> {
  const clusters = await fetchClusters()
  if (clusters.length === 0) {
    throw new Error('No clusters available (agent connecting or backend not authenticated)')
  }
  const accumulated: T[] = []
  let failedCount = 0

  // Fetch from each cluster with bounded concurrency, progressively reporting results
  const tasks = clusters.map((cluster) => async () => {
    try {
      const data = await fetchAPI<Record<string, T[]>>(endpoint, { ...params, cluster })
      const items = data[resultKey] || []
      const tagged = addClusterField ? items.map(item => ({ ...item, cluster })) : items
      accumulated.push(...tagged)
      onProgress?.([...accumulated])
      return tagged
    } catch {
      failedCount++
      throw new Error(`Cluster ${cluster} fetch failed`)
    }
  })

  await settledWithConcurrency(tasks)

  // If every cluster fetch failed, throw so callers can try agent fallback
  if (accumulated.length === 0 && clusters.length > 0 && failedCount === clusters.length) {
    throw new Error('All cluster fetches failed')
  }

  return accumulated
}

/**
 * Fetch data from all clusters using SSE streaming.
 * Each cluster's data arrives as a separate event, allowing progressive rendering.
 * Falls back to fetchFromAllClusters if SSE fails or is unavailable.
 */
async function fetchViaSSE<T>(
  endpoint: string,
  resultKey: string,
  params?: Record<string, string | number | undefined>,
  onProgress?: (partial: T[]) => void
): Promise<T[]> {
  const token = getToken()
  // SSE only available with real backend token
  if (!token || token === 'demo-token' || isBackendUnavailable()) {
    return fetchFromAllClusters<T>(endpoint, resultKey, params, true, onProgress)
  }

  try {
    const accumulated: T[] = []
    return await fetchSSE<T>({
      url: `/api/mcp/${endpoint}/stream`,
      params,
      itemsKey: resultKey,
      onClusterData: (_cluster, items) => {
        accumulated.push(...items)
        onProgress?.([...accumulated])
      },
    })
  } catch {
    // SSE failed — fall back to per-cluster REST
    return fetchFromAllClusters<T>(endpoint, resultKey, params, true, onProgress)
  }
}

/**
 * Fetch GitOps data via SSE streaming (uses /api/gitops/ prefix).
 */
async function fetchViaGitOpsSSE<T>(
  endpoint: string,
  resultKey: string,
  params?: Record<string, string | number | undefined>,
  onProgress?: (partial: T[]) => void
): Promise<T[]> {
  const token = getToken()
  if (!token || token === 'demo-token' || isBackendUnavailable()) {
    throw new Error('No data source available (backend not authenticated)')
  }

  const accumulated: T[] = []
  return await fetchSSE<T>({
    url: `/api/gitops/${endpoint}/stream`,
    params,
    itemsKey: resultKey,
    onClusterData: (_cluster, items) => {
      accumulated.push(...items)
      onProgress?.([...accumulated])
    },
  })
}

/**
 * Fetch data from a GitOps REST endpoint.
 */
async function fetchGitOpsAPI<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const token = getToken()
  if (!token) throw new Error('No authentication token')

  const searchParams = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value))
    })
  }

  const url = `/api/gitops/${endpoint}?${searchParams}`
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

/** RBAC timeout — roles/bindings can be slow on large clusters */
const RBAC_FETCH_TIMEOUT_MS = 60_000

/**
 * Fetch data from an RBAC REST endpoint (/api/rbac/).
 */
async function fetchRbacAPI<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const token = getToken()
  if (!token) throw new Error('No authentication token')

  const searchParams = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value))
    })
  }

  const url = `/api/rbac/${endpoint}?${searchParams}`
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(RBAC_FETCH_TIMEOUT_MS),
  })

  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

// ============================================================================
// Agent-based fetchers (used when backend is unavailable but agent is connected)
// ============================================================================

/** Get reachable (or not-yet-checked) cluster names from the shared cluster cache (deduplicated) */
function getAgentClusters(): Array<{ name: string; context?: string }> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  // Skip long context-path names (contain '/') — these are duplicates of short-named aliases
  // e.g. "default/api-fmaas-vllm-d-...:6443/..." duplicates "vllm-d"
  // Include clusters with reachable === undefined (health check pending) to avoid
  // race condition where cards fetch before health checks complete and cache empty results.
  // This matches the backend's HealthyClusters() which treats unknown as healthy.
  return clusterCacheRef.clusters
    .filter(c => c.reachable !== false && !c.name.includes('/'))
    .map(c => ({ name: c.name, context: c.context }))
}

/** Fetch pod issues from all clusters via agent kubectl proxy */
async function fetchPodIssuesViaAgent(namespace?: string, onProgress?: (partial: PodIssue[]) => void): Promise<PodIssue[]> {
  if (isAgentUnavailable()) return []
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []
  const accumulated: PodIssue[] = []

  const tasks = clusters.map(({ name, context }) => async () => {
    const ctx = context || name
    const issues = await kubectlProxy.getPodIssues(ctx, namespace)
    // Always use the short name — kubectlProxy returns context path as cluster
    const tagged = issues.map(i => ({ ...i, cluster: name }))
    accumulated.push(...tagged)
    onProgress?.([...accumulated])
    return tagged
  })

  await settledWithConcurrency(tasks)
  return accumulated
}

/** Fetch deployments from all clusters via agent HTTP endpoint */
async function fetchDeploymentsViaAgent(namespace?: string, onProgress?: (partial: Deployment[]) => void): Promise<Deployment[]> {
  if (isAgentUnavailable()) return []
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []
  const accumulated: Deployment[] = []

  const tasks = clusters.map(({ name, context }) => async () => {
    const params = new URLSearchParams()
    params.append('cluster', context || name)
    if (namespace) params.append('namespace', namespace)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AGENT_HTTP_TIMEOUT_MS)
    const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeoutId)

    if (!response.ok) throw new Error(`Agent returned ${response.status}`)
    const data = await response.json()
    // Always use the short name — agent echoes back context path as cluster
    const tagged = ((data.deployments || []) as Deployment[]).map(d => ({
      ...d,
      cluster: name,
    }))
    accumulated.push(...tagged)
    onProgress?.([...accumulated])
    return tagged
  })

  await settledWithConcurrency(tasks)
  return accumulated
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

const getDemoEvents = (): ClusterEvent[] => {
  const now = Date.now()
  const minutesAgo = (m: number) => new Date(now - m * 60000).toISOString()
  return [
    { type: 'Warning', reason: 'FailedScheduling', message: 'No nodes available to schedule pod', object: 'Pod/worker-5c6d7e8f9-n3p2q', namespace: 'default', cluster: 'eks-prod-us-east-1', count: 3, firstSeen: minutesAgo(25), lastSeen: minutesAgo(5) },
    { type: 'Normal', reason: 'Started', message: 'Container started successfully', object: 'Pod/web-frontend-8e9f0a1b2-def34', namespace: 'production', cluster: 'gke-staging', count: 1, firstSeen: minutesAgo(12), lastSeen: minutesAgo(12) },
    { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', object: 'Pod/api-server-7d8f9c6b5-x2k4m', namespace: 'production', cluster: 'eks-prod-us-east-1', count: 15, firstSeen: minutesAgo(45), lastSeen: minutesAgo(2) },
    { type: 'Normal', reason: 'Pulled', message: 'Container image pulled successfully', object: 'Pod/frontend-8e9f0a1b2-def34', namespace: 'production', cluster: 'gke-staging', count: 1, firstSeen: minutesAgo(8), lastSeen: minutesAgo(8) },
    { type: 'Warning', reason: 'Unhealthy', message: 'Readiness probe failed: connection refused', object: 'Pod/cache-redis-0', namespace: 'data', cluster: 'gke-staging', count: 8, firstSeen: minutesAgo(30), lastSeen: minutesAgo(1) },
    { type: 'Normal', reason: 'ScalingReplicaSet', message: 'Scaled up replica set api-gateway-7d8c to 3', object: 'Deployment/api-gateway', namespace: 'production', cluster: 'eks-prod-us-east-1', count: 1, firstSeen: minutesAgo(18), lastSeen: minutesAgo(18) },
    { type: 'Normal', reason: 'SuccessfulCreate', message: 'Created pod: worker-5c6d7e8f9-abc12', object: 'ReplicaSet/worker-5c6d7e8f9', namespace: 'batch', cluster: 'vllm-gpu-cluster', count: 1, firstSeen: minutesAgo(22), lastSeen: minutesAgo(22) },
    { type: 'Warning', reason: 'FailedMount', message: 'MountVolume.SetUp failed for volume "config": configmap "app-config" not found', object: 'Pod/ml-inference-7f8g9h-xyz99', namespace: 'ml', cluster: 'vllm-gpu-cluster', count: 4, firstSeen: minutesAgo(35), lastSeen: minutesAgo(3) },
  ]
}

const getDemoPodIssues = (): PodIssue[] => [
  { name: 'api-server-7d8f9c6b5-x2k4m', namespace: 'production', cluster: 'eks-prod-us-east-1', status: 'CrashLoopBackOff', issues: ['Container restarting', 'OOMKilled'], restarts: 15 },
  { name: 'worker-5c6d7e8f9-n3p2q', namespace: 'batch', cluster: 'vllm-gpu-cluster', status: 'ImagePullBackOff', issues: ['Failed to pull image'], restarts: 0 },
  { name: 'cache-redis-0', namespace: 'data', cluster: 'gke-staging', status: 'Pending', issues: ['Insufficient memory'], restarts: 0 },
  { name: 'metrics-collector-2b4c6-j8k9l', namespace: 'monitoring', cluster: 'aks-dev-westeu', status: 'CrashLoopBackOff', issues: ['Exit code 137'], restarts: 8 },
  { name: 'gpu-scheduler-0', namespace: 'ml-ops', cluster: 'vllm-gpu-cluster', status: 'Pending', issues: ['Insufficient nvidia.com/gpu'], restarts: 0 },
]

const getDemoDeploymentIssues = (): DeploymentIssue[] => [
  { name: 'web-frontend', namespace: 'production', replicas: 3, readyReplicas: 2, reason: 'ReplicaFailure' },
]

const getDemoDeployments = (): Deployment[] => [
  { name: 'web-frontend', namespace: 'production', cluster: 'eks-prod-us-east-1', status: 'running', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3, progress: 100 },
  { name: 'api-gateway', namespace: 'production', cluster: 'eks-prod-us-east-1', status: 'deploying', replicas: 3, readyReplicas: 1, updatedReplicas: 2, availableReplicas: 1, progress: 33 },
  { name: 'worker-service', namespace: 'batch', cluster: 'gke-staging', status: 'deploying', replicas: 4, readyReplicas: 2, updatedReplicas: 3, availableReplicas: 2, progress: 50 },
  { name: 'ml-inference', namespace: 'ml', cluster: 'vllm-gpu-cluster', status: 'deploying', replicas: 2, readyReplicas: 0, updatedReplicas: 1, availableReplicas: 0, progress: 0 },
  { name: 'cache-redis', namespace: 'data', cluster: 'gke-staging', status: 'running', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3, progress: 100 },
  { name: 'monitoring-stack', namespace: 'monitoring', cluster: 'aks-dev-westeu', status: 'running', replicas: 2, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2, progress: 100 },
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
  isDemoFallback: boolean
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
        const data = await fetchAPI<{ pods: PodInfo[] }>('pods', { cluster, namespace })
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
    },
  })

  return {
    pods: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
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
          clusters.map((ci) => async () => {
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
        const data = await fetchAPI<{ events: ClusterEvent[] }>('events', { cluster, namespace, limit })
        return data.events || []
      }
      return await fetchFromAllClusters<ClusterEvent>('events', 'events', { namespace, limit })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      // Try agent-based progressive fetch first
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const clusters = getAgentClusters()
        const accumulated: ClusterEvent[] = []
        for (const ci of (clusters || [])) {
          try {
            const ctx = ci.context || ci.name
            const events = await kubectlProxy.getEvents(ctx, namespace, limit)
            accumulated.push(...events.map(e => ({ ...e, cluster: ci.name })))
            accumulated.sort((a, b) => {
              const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
              const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
              return timeB - timeA
            })
            onProgress([...accumulated].slice(0, limit))
          } catch {
            // Skip failed clusters, continue with others
          }
        }
        return accumulated.slice(0, limit)
      }
      // Fall back to SSE via backend
      return await fetchViaSSE<ClusterEvent>('events', 'events', { namespace, limit }, onProgress)
    },
  })

  return {
    events: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
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

  const sortIssues = (items: PodIssue[]) => items.sort((a, b) => (b.restarts || 0) - (a.restarts || 0))

  const result = useCache({
    key,
    category,
    initialData: [] as PodIssue[],
    demoData: getDemoPodIssues(),
    fetcher: async () => {
      let issues: PodIssue[]

      // Try agent first (fast, no backend needed)
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        if (cluster) {
          const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
          const ctx = clusterInfo?.context || cluster
          issues = await kubectlProxy.getPodIssues(ctx, namespace)
          issues = issues.map(i => ({ ...i, cluster: cluster }))
        } else {
          issues = await fetchPodIssuesViaAgent(namespace)
        }
        return sortIssues(issues)
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
        return sortIssues(issues)
      }

      // No data source available yet — throw so cache preserves existing data and retries
      throw new Error('No data source available (agent connecting or backend not authenticated)')
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      // Try agent first
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const issues = await fetchPodIssuesViaAgent(namespace, (partial) => {
          onProgress(sortIssues([...partial]))
        })
        return sortIssues(issues)
      }

      // Fall back to SSE streaming -> REST per-cluster
      const issues = await fetchViaSSE<PodIssue>('pod-issues', 'issues', { namespace }, (partial) => {
        onProgress(sortIssues([...partial]))
      })
      return sortIssues(issues)
    },
  })

  return {
    issues: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
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

  const deriveIssues = (deployments: Deployment[]): DeploymentIssue[] =>
    deployments
      .filter(d => (d.readyReplicas ?? 0) < (d.replicas ?? 1))
      .map(d => ({
        name: d.name,
        namespace: d.namespace || 'default',
        cluster: d.cluster,
        replicas: d.replicas ?? 1,
        readyReplicas: d.readyReplicas ?? 0,
        reason: d.status === 'failed' ? 'DeploymentFailed' : 'ReplicaFailure',
      }))

  const result = useCache({
    key,
    category,
    initialData: [] as DeploymentIssue[],
    demoData: getDemoDeploymentIssues(),
    fetcher: async () => {
      // Try agent first — derive deployment issues from deployment data
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const deployments = cluster
          ? await (async () => {
              const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
              const params = new URLSearchParams()
              params.append('cluster', clusterInfo?.context || cluster)
              if (namespace) params.append('namespace', namespace)
              const ctrl = new AbortController()
              const tid = setTimeout(() => ctrl.abort(), AGENT_HTTP_TIMEOUT_MS)
              const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
                signal: ctrl.signal, headers: { Accept: 'application/json' },
              })
              clearTimeout(tid)
              if (!res.ok) return []
              const data = await res.json()
              return ((data.deployments || []) as Deployment[]).map(d => ({ ...d, cluster: cluster }))
          })()
          : await fetchDeploymentsViaAgent(namespace)

        return deriveIssues(deployments)
      }

      // Fall back to REST API
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        const data = await fetchAPI<{ issues: DeploymentIssue[] }>('deployment-issues', { cluster, namespace })
        return data.issues || []
      }

      throw new Error("No data source available")
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const deployments = await fetchDeploymentsViaAgent(namespace, (partialDeps) => {
          onProgress(deriveIssues(partialDeps))
        })
        return deriveIssues(deployments)
      }

      // Fall back to SSE streaming -> REST per-cluster
      const issues = await fetchViaSSE<DeploymentIssue>('deployment-issues', 'issues', { namespace }, onProgress)
      return issues
    },
  })

  return {
    issues: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
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
      // Try agent first (fast, no backend needed) — skip if agent is unavailable
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        if (cluster) {
          const params = new URLSearchParams()
          const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
          params.append('cluster', clusterInfo?.context || cluster)
          if (namespace) params.append('namespace', namespace)

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), AGENT_HTTP_TIMEOUT_MS)
          const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
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

      throw new Error("No data source available")
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        return fetchDeploymentsViaAgent(namespace, onProgress)
      }

      // Fall back to SSE streaming -> REST per-cluster
      return await fetchViaSSE<Deployment>('deployments', 'deployments', { namespace }, onProgress)
    },
  })

  return {
    deployments: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
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
      if (cluster) {
        const data = await fetchAPI<{ services: Service[] }>('services', { cluster, namespace })
        return (data.services || []).map(s => ({ ...s, cluster }))
      }
      return await fetchFromAllClusters<Service>('services', 'services', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<Service>('services', 'services', { namespace }, onProgress)
    },
  })

  return {
    services: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
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
    { context: prowCluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }
  )

  if (response.exitCode !== 0) {
    throw new Error(response.error || 'Failed to get ProwJobs')
  }

  const data = JSON.parse(response.output)
  return (data.items || [])
    .reverse()
    .slice(0, MAX_PROW_JOBS)
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
    isDemoFallback: result.isDemoFallback,
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

/** Fetch LLMd servers from a single cluster (deployments + autoscalers in parallel) */
async function fetchLLMdServersForCluster(cluster: string): Promise<LLMdServer[]> {
  const servers: LLMdServer[] = []

  // Query all namespaces to discover llm-d workloads regardless of namespace naming
  const allDeployments: DeploymentResource[] = []
  try {
    const resp = await kubectlProxy.exec(['get', 'deployments', '-A', '-o', 'json'], { context: cluster, timeout: 15000 })
    if (resp.exitCode === 0 && resp.output) {
      allDeployments.push(...(JSON.parse(resp.output).items || []))
    }
  } catch { /* cluster not reachable */ }
  if (allDeployments.length === 0) return servers

  // Fetch all 3 autoscaler types in parallel (instead of sequentially)
  const autoscalerMap = new Map<string, 'hpa' | 'va' | 'both'>()
  const autoscalerItems: LLMdServer[] = []

  const [hpaResult, vaResult, vpaResult] = await Promise.allSettled([
    kubectlProxy.exec(['get', 'hpa', '-A', '-o', 'json'], { context: cluster, timeout: 10000 }),
    kubectlProxy.exec(['get', 'variantautoscalings', '-A', '-o', 'json'], { context: cluster, timeout: 10000 }),
    kubectlProxy.exec(['get', 'vpa', '-A', '-o', 'json'], { context: cluster, timeout: 10000 }),
  ])

  // Process HPA results
  if (hpaResult.status === 'fulfilled' && hpaResult.value.exitCode === 0) {
    for (const hpa of (JSON.parse(hpaResult.value.output).items || []) as HPAResource[]) {
      if (hpa.spec.scaleTargetRef.kind === 'Deployment') {
        autoscalerMap.set(`${hpa.metadata.namespace}/${hpa.spec.scaleTargetRef.name}`, 'hpa')
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

  // Process VA results
  if (vaResult.status === 'fulfilled' && vaResult.value.exitCode === 0) {
    for (const va of (JSON.parse(vaResult.value.output).items || []) as VariantAutoscalingResource[]) {
      if (va.spec.targetRef?.name) {
        const key = `${va.metadata.namespace}/${va.spec.targetRef.name}`
        autoscalerMap.set(key, autoscalerMap.has(key) ? 'both' : 'va')
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

  // Process VPA results
  if (vpaResult.status === 'fulfilled' && vpaResult.value.exitCode === 0) {
    const vpaData = JSON.parse(vpaResult.value.output)
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

  for (const dep of (llmdDeployments || [])) {
    const name = dep.metadata.name.toLowerCase()
    const status = getLLMdServerStatus(dep.spec.replicas || 0, dep.status.readyReplicas || 0)
    if (name.includes('gateway') || name.includes('ingress')) {
      nsGateway.set(dep.metadata.namespace, { status: status === 'running' ? 'running' : 'stopped', type: detectGatewayType(dep.metadata.name) })
    }
    if (name === 'prometheus') {
      nsPrometheus.set(dep.metadata.namespace, status === 'running' ? 'running' : 'stopped')
    }
  }

  for (const dep of (llmdDeployments || [])) {
    const labels = dep.spec.template?.metadata?.labels || {}
    const model = labels['llmd.org/model'] || labels['app.kubernetes.io/model'] || dep.metadata.name
    const gpuInfo = extractGPUInfo(dep)
    const autoscalerType = autoscalerMap.get(`${dep.metadata.namespace}/${dep.metadata.name}`)
    const gw = nsGateway.get(dep.metadata.namespace)
    const prom = nsPrometheus.get(dep.metadata.namespace)

    servers.push({
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
  servers.push(...autoscalerItems)
  return servers
}

/**
 * Fetch LLMd servers from all clusters in parallel with progressive updates.
 * Each cluster's results are reported as they arrive via onProgress.
 */
async function fetchLLMdServers(
  clusters: string[],
  onProgress?: (partial: LLMdServer[]) => void
): Promise<LLMdServer[]> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  const accumulated: LLMdServer[] = []

  const tasks = clusters.map((cluster) => async () => {
    try {
      const clusterServers = await fetchLLMdServersForCluster(cluster)
      accumulated.push(...clusterServers)
      onProgress?.([...accumulated])
      return clusterServers
    } catch (err) {
      // Suppress demo mode errors - they're expected when agent is unavailable
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('demo mode')) {
        console.error(`Error fetching from cluster ${cluster}:`, err)
      }
      return []
    }
  })

  await settledWithConcurrency(tasks)
  return accumulated
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
    progressiveFetcher: async (onProgress) => fetchLLMdServers(clusters, onProgress),
  })

  const status = computeLLMdStatus(result.data, result.consecutiveFailures)

  return {
    servers: result.data,
    data: result.data,
    status,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Fetch LLMd models from all clusters in parallel with progressive updates.
 */
async function fetchLLMdModels(
  clusters: string[],
  onProgress?: (partial: LLMdModel[]) => void
): Promise<LLMdModel[]> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  const accumulated: LLMdModel[] = []

  const tasks = clusters.map((cluster) => async () => {
    try {
      const response = await kubectlProxy.exec(['get', 'inferencepools', '-A', '-o', 'json'], { context: cluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS })
      if (response.exitCode !== 0) return []
      const clusterModels: LLMdModel[] = []
      for (const pool of (JSON.parse(response.output).items || []) as InferencePoolResource[]) {
        const modelName = pool.spec.selector?.matchLabels?.['llmd.org/model'] || pool.metadata.name
        const hasAccepted = pool.status?.parents?.some(p => p.conditions?.some(c => c.type === 'Accepted' && c.status === 'True'))
        clusterModels.push({
          id: `${cluster}-${pool.metadata.namespace}-${pool.metadata.name}`,
          name: modelName,
          namespace: pool.metadata.namespace,
          cluster,
          instances: 1,
          status: hasAccepted ? 'loaded' : 'stopped',
        })
      }
      accumulated.push(...clusterModels)
      onProgress?.([...accumulated])
      return clusterModels
    } catch (err) {
      // Suppress demo mode errors - they're expected when agent is unavailable
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('demo mode')) {
        console.error(`Error fetching InferencePools from cluster ${cluster}:`, err)
      }
      return []
    }
  })

  await settledWithConcurrency(tasks)
  return accumulated
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
    progressiveFetcher: async (onProgress) => fetchLLMdModels(clusters, onProgress),
  })

  return {
    models: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
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
async function fetchWorkloadsFromAgent(onProgress?: (partial: Workload[]) => void): Promise<Workload[] | null> {
  if (isAgentUnavailable()) return null

  const clusters = clusterCacheRef.clusters
    .filter(c => c.reachable !== false && !c.name.includes('/'))
  if (clusters.length === 0) return null
  const accumulated: Workload[] = []

  const tasks = clusters.map(({ name, context }) => async () => {
    const params = new URLSearchParams()
    params.append('cluster', context || name)

    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), AGENT_HTTP_TIMEOUT_MS)
    const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(tid)

    if (!res.ok) throw new Error(`Agent ${res.status}`)
    const data = await res.json()
    const tagged = ((data.deployments || []) as Array<Record<string, unknown>>).map(d => {
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
    accumulated.push(...tagged)
    onProgress?.([...accumulated])
    return tagged
  })

  await settledWithConcurrency(tasks)
  return accumulated.length > 0 ? accumulated : null
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
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
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
    progressiveFetcher: async (onProgress) => {
      // Try agent first (progressive via kc-agent)
      const agentData = await fetchWorkloadsFromAgent(onProgress)
      if (agentData) return agentData

      // Fall back to SSE streaming -> progressive per-cluster
      return await fetchViaSSE<Workload>('workloads', 'workloads', {}, onProgress)
    },
  })

  return {
    workloads: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
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
async function fetchSecurityIssuesViaKubectl(cluster?: string, namespace?: string, onProgress?: (partial: SecurityIssue[]) => void): Promise<SecurityIssue[]> {
  if (isAgentUnavailable()) return []
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  const accumulated: SecurityIssue[] = []

  const tasks = clusters
    .filter(c => !cluster || c.name === cluster)
    .map(({ name, context }) => async () => {
      const ctx = context || name
      // Get all pods and check for security issues
      const nsFlag = namespace ? ['-n', namespace] : ['-A']
      const response = await kubectlProxy.exec(
        ['get', 'pods', ...nsFlag, '-o', 'json'],
        { context: ctx, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }
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

      accumulated.push(...issues)
      // Sort accumulated and report progress
      accumulated.sort((a, b) => (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5))
      onProgress?.([...accumulated])
      return issues
    })

  await settledWithConcurrency(tasks)
  // Final sort
  return accumulated.sort((a, b) => (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5))
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
      // Try kubectl proxy first (uses agent to run kubectl commands) — skip if agent is unavailable
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
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
          const response = await authFetch(`/api/mcp/security-issues?${params}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
          })
          if (response.ok) {
            const data = await response.json() as { issues: SecurityIssue[] }
            if (data.issues && data.issues.length > 0) return data.issues
          }
        } catch (err) {
          console.error('[useCachedSecurityIssues] API fetch failed:', err)
        }
      }

      throw new Error("No data source available")
    },
    // Progressive loading: show results as each cluster completes
    progressiveFetcher: !cluster ? async (onProgress) => {
      // Try kubectl proxy first (progressive) — skip if agent is unavailable
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        try {
          const issues = await fetchSecurityIssuesViaKubectl(cluster, namespace, onProgress)
          if (issues.length > 0) return issues
        } catch (err) {
          console.error('[useCachedSecurityIssues] progressive kubectl fetch failed:', err)
        }
      }

      // Fall back to SSE streaming -> REST per-cluster
      return await fetchViaSSE<SecurityIssue>('security-issues', 'issues', { namespace }, onProgress)
    } : undefined,
  })

  return {
    issues: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

// ============================================================================
// Nodes Cached Hooks (SSE-enabled)
// ============================================================================

const getDemoCachedNodes = (): NodeInfo[] => [
  { name: 'node-1', cluster: 'prod-east', status: 'Ready', roles: ['control-plane', 'master'], kubeletVersion: 'v1.28.4', cpuCapacity: '8', memoryCapacity: '32Gi', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True' }], unschedulable: false },
  { name: 'node-2', cluster: 'prod-east', status: 'Ready', roles: ['worker'], kubeletVersion: 'v1.28.4', cpuCapacity: '16', memoryCapacity: '64Gi', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True' }], unschedulable: false },
  { name: 'gpu-node-1', cluster: 'vllm-d', status: 'Ready', roles: ['worker'], kubeletVersion: 'v1.28.4', cpuCapacity: '32', memoryCapacity: '128Gi', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True' }], unschedulable: false },
  { name: 'kind-control-plane', cluster: 'kind-local', status: 'Ready', roles: ['control-plane'], kubeletVersion: 'v1.27.3', cpuCapacity: '4', memoryCapacity: '8Gi', podCapacity: '110', conditions: [{ type: 'Ready', status: 'True' }], unschedulable: false },
]

/**
 * Hook for fetching nodes with caching and SSE streaming.
 * When no cluster is specified, fetches from all available clusters via SSE.
 */
export function useCachedNodes(
  cluster?: string,
): CachedHookResult<NodeInfo[]> & { nodes: NodeInfo[] } {
  const key = `nodes:${cluster || 'all'}`

  const result = useCache({
    key,
    category: 'pods' as RefreshCategory,
    initialData: [] as NodeInfo[],
    demoData: getDemoCachedNodes(),
    persist: true,
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ nodes: NodeInfo[] }>('nodes', { cluster })
        return (data.nodes || []).map(n => ({ ...n, cluster }))
      }
      return fetchFromAllClusters<NodeInfo>('nodes', 'nodes', {})
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return fetchViaSSE<NodeInfo>('nodes', 'nodes', {}, onProgress)
    },
  })

  return {
    nodes: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

// ============================================================================
// GPU Node Health Cached Hooks (SSE-enabled, proactive monitoring)
// ============================================================================

const getDemoCachedGPUNodeHealth = (): GPUNodeHealthStatus[] => [
  {
    nodeName: 'gpu-node-1', cluster: 'vllm-gpu-cluster', status: 'healthy',
    gpuCount: 8, gpuType: 'NVIDIA A100-SXM4-80GB',
    checks: [
      { name: 'node_ready', passed: true },
      { name: 'scheduling', passed: true },
      { name: 'gpu-feature-discovery', passed: true },
      { name: 'nvidia-device-plugin', passed: true },
      { name: 'dcgm-exporter', passed: true },
      { name: 'stuck_pods', passed: true },
      { name: 'gpu_events', passed: true },
    ],
    issues: [], stuckPods: 0, checkedAt: new Date().toISOString(),
  },
  {
    nodeName: 'gpu-node-2', cluster: 'vllm-gpu-cluster', status: 'degraded',
    gpuCount: 8, gpuType: 'NVIDIA A100-SXM4-80GB',
    checks: [
      { name: 'node_ready', passed: true },
      { name: 'scheduling', passed: true },
      { name: 'gpu-feature-discovery', passed: false, message: 'CrashLoopBackOff (12 restarts)' },
      { name: 'nvidia-device-plugin', passed: true },
      { name: 'dcgm-exporter', passed: true },
      { name: 'stuck_pods', passed: true },
      { name: 'gpu_events', passed: true },
    ],
    issues: ['gpu-feature-discovery: CrashLoopBackOff (12 restarts)'], stuckPods: 0, checkedAt: new Date().toISOString(),
  },
  {
    nodeName: 'gpu-node-3', cluster: 'eks-prod-us-east-1', status: 'unhealthy',
    gpuCount: 4, gpuType: 'NVIDIA V100',
    checks: [
      { name: 'node_ready', passed: false, message: 'Node is NotReady' },
      { name: 'scheduling', passed: false, message: 'Node is cordoned (SchedulingDisabled)' },
      { name: 'gpu-feature-discovery', passed: false, message: 'CrashLoopBackOff (128 restarts)' },
      { name: 'nvidia-device-plugin', passed: false, message: 'CrashLoopBackOff (64 restarts)' },
      { name: 'dcgm-exporter', passed: true },
      { name: 'stuck_pods', passed: false, message: '54 pods stuck (ContainerStatusUnknown/Terminating)' },
      { name: 'gpu_events', passed: false, message: '3 GPU warning events in last hour' },
    ],
    issues: ['Node is NotReady', 'Node is cordoned', 'gpu-feature-discovery: CrashLoopBackOff (128 restarts)', '54 pods stuck'],
    stuckPods: 54, checkedAt: new Date().toISOString(),
  },
]

/**
 * Hook for fetching GPU node health data with caching and SSE streaming.
 */
export function useCachedGPUNodeHealth(
  cluster?: string,
): CachedHookResult<GPUNodeHealthStatus[]> & { nodes: GPUNodeHealthStatus[] } {
  const key = `gpu-node-health:${cluster || 'all'}`

  const result = useCache({
    key,
    category: 'pods' as RefreshCategory,
    initialData: [] as GPUNodeHealthStatus[],
    demoData: getDemoCachedGPUNodeHealth(),
    persist: true,
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ nodes: GPUNodeHealthStatus[] }>('gpu-nodes/health', { cluster })
        return (data.nodes || []).map(n => ({ ...n, cluster }))
      }
      return fetchFromAllClusters<GPUNodeHealthStatus>('gpu-nodes/health', 'nodes', {})
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return fetchViaSSE<GPUNodeHealthStatus>('gpu-nodes/health', 'nodes', {}, onProgress)
    },
  })

  return {
    nodes: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

// ============================================================================
// GPU Health CronJob Management Hook
// ============================================================================

/**
 * Hook for managing GPU health CronJob installation per cluster.
 * Uses useCache for persistent status caching; install/uninstall are imperative actions.
 */
export function useGPUHealthCronJob(cluster?: string) {
  const key = `gpu-cronjob-status:${cluster || 'none'}`
  const [actionInProgress, setActionInProgress] = useState<'install' | 'uninstall' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const result = useCache<GPUHealthCronJobStatus | null>({
    key,
    category: 'pods' as RefreshCategory,
    initialData: null,
    demoData: null,
    persist: true,
    enabled: !!cluster,
    fetcher: async () => {
      if (!cluster) return null
      return fetchAPI<GPUHealthCronJobStatus>('gpu-nodes/health/cronjob', { cluster })
    },
  })

  const install = useCallback(async (opts?: { namespace?: string; schedule?: string; tier?: number }) => {
    if (!cluster) return
    setActionInProgress('install')
    setActionError(null)
    try {
      const token = getToken()
      if (!token) throw new Error('No authentication token')
      const response = await authFetch('/api/mcp/gpu-nodes/health/cronjob', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cluster,
          namespace: opts?.namespace,
          schedule: opts?.schedule,
          tier: opts?.tier ?? 2,
        }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Install failed: ${response.status}`)
      }
      await result.refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to install CronJob')
    } finally {
      setActionInProgress(null)
    }
  }, [cluster, result.refetch])

  const uninstall = useCallback(async (opts?: { namespace?: string }) => {
    if (!cluster) return
    setActionInProgress('uninstall')
    setActionError(null)
    try {
      const token = getToken()
      if (!token) throw new Error('No authentication token')
      const response = await authFetch('/api/mcp/gpu-nodes/health/cronjob', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cluster,
          namespace: opts?.namespace,
        }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Uninstall failed: ${response.status}`)
      }
      await result.refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to uninstall CronJob')
    } finally {
      setActionInProgress(null)
    }
  }, [cluster, result.refetch])

  return {
    status: result.data,
    isLoading: result.isLoading,
    error: actionError || result.error,
    actionInProgress,
    install,
    uninstall,
    refetch: result.refetch,
  }
}

// ============================================================================
// Warning Events Cached Hooks (SSE-enabled)
// ============================================================================

const getDemoCachedWarningEvents = (): ClusterEvent[] => [
  { type: 'Warning', reason: 'FailedScheduling', message: 'Insufficient cpu', namespace: 'production', object: 'Pod/api-gateway-7d9c8b7f5-abcde', count: 3, firstSeen: new Date(Date.now() - 300000).toISOString(), lastSeen: new Date().toISOString(), cluster: 'prod-east' },
  { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', namespace: 'monitoring', object: 'Pod/prometheus-agent-0', count: 5, firstSeen: new Date(Date.now() - 600000).toISOString(), lastSeen: new Date().toISOString(), cluster: 'prod-east' },
  { type: 'Warning', reason: 'FailedCreate', message: 'Error creating: pods "worker-xyz" is forbidden', namespace: 'ml-workloads', object: 'Job/training-job-123', count: 1, firstSeen: new Date(Date.now() - 120000).toISOString(), lastSeen: new Date().toISOString(), cluster: 'vllm-d' },
]

/**
 * Hook for fetching warning events with caching and SSE streaming.
 * When no cluster is specified, fetches from all clusters via SSE.
 */
export function useCachedWarningEvents(
  cluster?: string,
  namespace?: string,
  options?: { limit?: number; category?: RefreshCategory }
): CachedHookResult<ClusterEvent[]> & { events: ClusterEvent[] } {
  const { limit = 50, category = 'realtime' } = options || {}
  const key = `warningEvents:${cluster || 'all'}:${namespace || 'all'}:${limit}`

  const result = useCache({
    key,
    category,
    initialData: [] as ClusterEvent[],
    demoData: getDemoCachedWarningEvents(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ events: ClusterEvent[] }>('events/warnings', { cluster, namespace, limit })
        return (data.events || []).map(e => ({ ...e, cluster }))
      }
      const events = await fetchFromAllClusters<ClusterEvent>('events/warnings', 'events', { namespace, limit })
      return events.slice(0, limit)
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      const events = await fetchViaSSE<ClusterEvent>('events/warnings', 'events', { namespace, limit }, (partial) => {
        onProgress(partial.slice(0, limit))
      })
      return events.slice(0, limit)
    },
  })

  return {
    events: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
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
    return pods.sort((a, b) => (b.restarts || 0) - (a.restarts || 0)).slice(0, MAX_PREFETCH_PODS)
  },
  podIssues: async (): Promise<PodIssue[]> => {
    if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
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
    if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
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
    if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
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
    if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
      try {
        const issues = await fetchSecurityIssuesViaKubectl()
        if (issues.length > 0) return issues
      } catch { /* fall through */ }
    }
    const token = getToken()
    if (token && token !== 'demo-token' && !isBackendUnavailable()) {
      const response = await authFetch('/api/mcp/security-issues', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (response.ok) {
        const data = await response.json() as { issues: SecurityIssue[] }
        if (data.issues?.length > 0) return data.issues
      }
    }
    return []
  },
  nodes: async (): Promise<NodeInfo[]> => {
    return fetchFromAllClusters<NodeInfo>('nodes', 'nodes', {})
  },
  warningEvents: async (): Promise<ClusterEvent[]> => {
    return fetchFromAllClusters<ClusterEvent>('events/warnings', 'events', { limit: 50 })
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
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
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

// ============================================================================
// Hardware Health (device alerts + inventory)
// ============================================================================

// Device alert from agent
export interface DeviceAlert {
  id: string
  nodeName: string
  cluster: string
  deviceType: string
  previousCount: number
  currentCount: number
  droppedCount: number
  firstSeen: string
  lastSeen: string
  severity: string
}

interface DeviceAlertsResponse {
  alerts: DeviceAlert[]
  nodeCount: number
  timestamp: string
}

export interface DeviceCounts {
  gpuCount: number
  nicCount: number
  nvmeCount: number
  infinibandCount: number
  sriovCapable: boolean
  rdmaAvailable: boolean
  mellanoxPresent: boolean
  nvidiaNicPresent: boolean
  spectrumScale: boolean
  mofedReady: boolean
  gpuDriverReady: boolean
}

export interface NodeDeviceInventory {
  nodeName: string
  cluster: string
  devices: DeviceCounts
  lastSeen: string
}

interface DeviceInventoryResponse {
  nodes: NodeDeviceInventory[]
  timestamp: string
}

export interface HardwareHealthData {
  alerts: DeviceAlert[]
  inventory: NodeDeviceInventory[]
  nodeCount: number
  lastUpdate: string | null
}

const DEMO_HW_ALERTS: DeviceAlert[] = [
  {
    id: 'demo-1',
    nodeName: 'gpu-node-1',
    cluster: 'production',
    deviceType: 'gpu',
    previousCount: 8,
    currentCount: 6,
    droppedCount: 2,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    severity: 'critical',
  },
  {
    id: 'demo-2',
    nodeName: 'gpu-node-2',
    cluster: 'production',
    deviceType: 'infiniband',
    previousCount: 2,
    currentCount: 1,
    droppedCount: 1,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    severity: 'warning',
  },
]

const DEMO_HW_INVENTORY: NodeDeviceInventory[] = [
  {
    nodeName: 'gpu-node-1',
    cluster: 'production',
    devices: { gpuCount: 8, nicCount: 2, nvmeCount: 4, infinibandCount: 2, sriovCapable: true, rdmaAvailable: true, mellanoxPresent: true, nvidiaNicPresent: false, spectrumScale: false, mofedReady: true, gpuDriverReady: true },
    lastSeen: new Date().toISOString(),
  },
  {
    nodeName: 'gpu-node-2',
    cluster: 'production',
    devices: { gpuCount: 8, nicCount: 2, nvmeCount: 4, infinibandCount: 2, sriovCapable: true, rdmaAvailable: true, mellanoxPresent: true, nvidiaNicPresent: false, spectrumScale: false, mofedReady: true, gpuDriverReady: true },
    lastSeen: new Date().toISOString(),
  },
  {
    nodeName: 'compute-node-1',
    cluster: 'staging',
    devices: { gpuCount: 0, nicCount: 1, nvmeCount: 2, infinibandCount: 0, sriovCapable: false, rdmaAvailable: false, mellanoxPresent: false, nvidiaNicPresent: false, spectrumScale: false, mofedReady: false, gpuDriverReady: false },
    lastSeen: new Date().toISOString(),
  },
]

const HW_INITIAL_DATA: HardwareHealthData = {
  alerts: [],
  inventory: [],
  nodeCount: 0,
  lastUpdate: null,
}

const HW_DEMO_DATA: HardwareHealthData = {
  alerts: DEMO_HW_ALERTS,
  inventory: DEMO_HW_INVENTORY,
  nodeCount: DEMO_HW_INVENTORY.length,
  lastUpdate: new Date().toISOString(),
}

async function fetchHardwareHealth(): Promise<HardwareHealthData> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_PREDICTION_TIMEOUT_MS)

  try {
    const [alertsRes, inventoryRes] = await Promise.all([
      fetch(`${LOCAL_AGENT_HTTP_URL}/devices/alerts`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      }).catch(() => null),
      fetch(`${LOCAL_AGENT_HTTP_URL}/devices/inventory`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      }).catch(() => null),
    ])
    clearTimeout(timeoutId)

    const result: HardwareHealthData = {
      alerts: [],
      inventory: [],
      nodeCount: 0,
      lastUpdate: new Date().toISOString(),
    }

    if (alertsRes?.ok) {
      const data: DeviceAlertsResponse = await alertsRes.json()
      result.alerts = data.alerts || []
      result.nodeCount = data.nodeCount
    }

    if (inventoryRes?.ok) {
      const data: DeviceInventoryResponse = await inventoryRes.json()
      result.inventory = data.nodes || []
      if (data.nodes && data.nodes.length > 0) {
        result.nodeCount = data.nodes.length
      }
    }

    // If neither endpoint returned data, throw so useCache tracks the failure
    if (!alertsRes?.ok && !inventoryRes?.ok) {
      throw new Error('Device endpoints unavailable')
    }

    return result
  } catch (e) {
    clearTimeout(timeoutId)
    throw e
  }
}

/**
 * Hook for fetching hardware health data (device alerts + inventory) with caching.
 * Uses IndexedDB persistence so data survives navigation.
 */
export function useCachedHardwareHealth(): CachedHookResult<HardwareHealthData> {
  const result = useCache({
    key: 'hardware-health',
    category: 'pods', // 30-second refresh
    initialData: HW_INITIAL_DATA,
    demoData: HW_DEMO_DATA,
    persist: true,
    // Don't gate on isAgentUnavailable() — the agent may connect after the hook
    // mounts and `enabled` is only read once. The fetcher handles unavailability
    // internally by throwing, which useCache tracks as consecutive failures.
    fetcher: fetchHardwareHealth,
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/** Specialty data fetchers — lower priority, prefetched after core data */
export const specialtyFetchers = {
  prowJobs: () => fetchProwJobs('prow', 'prow'),
  llmdServers: () => fetchLLMdServers(['vllm-d', 'platform-eval']),
  llmdModels: () => fetchLLMdModels(['vllm-d', 'platform-eval']),
}

// -- CoreDNS status --

export interface CoreDNSPodInfo {
  name: string
  status: string
  ready: string
  restarts: number
  version: string
}

export interface CoreDNSClusterStatus {
  cluster: string
  pods: CoreDNSPodInfo[]
  healthy: boolean
  totalRestarts: number
}

const getDemoCoreDNSStatus = (): CoreDNSClusterStatus[] => [
  {
    cluster: 'eks-prod-us-east-1',
    pods: [
      { name: 'coredns-7db6d8ff4d-xk2p8', status: 'Running', ready: '1/1', restarts: 0, version: '1.11.1' },
      { name: 'coredns-7db6d8ff4d-n9wq3', status: 'Running', ready: '1/1', restarts: 0, version: '1.11.1' },
    ],
    healthy: true,
    totalRestarts: 0,
  },
  {
    cluster: 'gke-staging',
    pods: [
      { name: 'coredns-6d4b75cb6d-abcde', status: 'Running', ready: '1/1', restarts: 2, version: '1.10.1' },
      { name: 'coredns-6d4b75cb6d-fghij', status: 'Running', ready: '1/1', restarts: 0, version: '1.10.1' },
    ],
    healthy: true,
    totalRestarts: 2,
  },
  {
    cluster: 'aks-dev-westeu',
    pods: [
      { name: 'coredns-abc123-xyz99', status: 'CrashLoopBackOff', ready: '0/1', restarts: 7, version: '1.9.3' },
    ],
    healthy: false,
    totalRestarts: 7,
  },
]

// fetches coredns pods from kube-system and builds per-cluster health info
export function useCachedCoreDNSStatus(
  cluster?: string
): CachedHookResult<CoreDNSClusterStatus[]> & { clusters: CoreDNSClusterStatus[] } {
  const key = `coredns:${cluster || 'all'}`

  const result = useCache({
    key,
    category: 'pods' as RefreshCategory,
    initialData: [] as CoreDNSClusterStatus[],
    demoData: getDemoCoreDNSStatus(),
    fetcher: async () => {
      let pods: PodInfo[]
      if (cluster) {
        const data = await fetchAPI<{ pods: PodInfo[] }>('pods', { cluster, namespace: 'kube-system' })
        pods = (data.pods || []).map(p => ({ ...p, cluster }))
      } else {
        pods = await fetchFromAllClusters<PodInfo>('pods', 'pods', { namespace: 'kube-system' })
      }

      const corednsPods = pods.filter(p =>
        p.name?.includes('coredns') || p.name?.includes('kube-dns')
      )

      const byCluster = new Map<string, PodInfo[]>()
      for (const pod of (corednsPods || [])) {
        const c = pod.cluster || 'unknown'
        if (!byCluster.has(c)) byCluster.set(c, [])
        byCluster.get(c)!.push(pod)
      }

      const clusters = Array.from(byCluster.entries()).map(([clusterName, clusterPods]) => {
        const running = clusterPods.filter(p => p.status === 'Running')
        const healthy = running.length === clusterPods.length && clusterPods.length > 0
        const totalRestarts = clusterPods.reduce((s, p) => s + (p.restarts || 0), 0)

        return {
          cluster: clusterName,
          pods: clusterPods.map(p => ({
            name: p.name,
            status: p.status,
            ready: p.ready,
            restarts: p.restarts || 0,
            version: p.containers?.[0]?.image?.split(':')[1]?.replace(/^v/, '') || '',
          })),
          healthy,
          totalRestarts,
        } satisfies CoreDNSClusterStatus
      })

      // Sort clusters alphabetically for stable UI ordering
      return clusters.sort((a, b) => a.cluster.localeCompare(b.cluster))
    },
  })

  return {
    clusters: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

// ============================================================================
// Additional Demo Data (for new cached hooks)
// ============================================================================

const getDemoGPUNodes = (): GPUNode[] => [
  { name: 'gpu-node-1', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 5, acceleratorType: 'GPU', gpuMemoryMB: 81920, manufacturer: 'NVIDIA' },
  { name: 'gpu-node-2', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA T4', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU', gpuMemoryMB: 16384, manufacturer: 'NVIDIA' },
  { name: 'gpu-node-3', cluster: 'gke-staging', gpuType: 'NVIDIA L4', gpuCount: 2, gpuAllocated: 0, acceleratorType: 'GPU', gpuMemoryMB: 24576, manufacturer: 'NVIDIA' },
]

const getDemoPVCs = (): PVC[] => [
  { name: 'data-postgres-0', namespace: 'production', cluster: 'eks-prod-us-east-1', status: 'Bound', storageClass: 'gp3', capacity: '100Gi', accessModes: ['ReadWriteOnce'], age: '30d' },
  { name: 'redis-data-0', namespace: 'data', cluster: 'gke-staging', status: 'Bound', storageClass: 'standard', capacity: '50Gi', accessModes: ['ReadWriteOnce'], age: '14d' },
  { name: 'ml-scratch', namespace: 'ml-workloads', cluster: 'vllm-gpu-cluster', status: 'Pending', storageClass: 'fast-nvme', capacity: '500Gi', accessModes: ['ReadWriteMany'], age: '1h' },
]

const getDemoNamespaces = (): string[] =>
  ['default', 'kube-system', 'kube-public', 'monitoring', 'production', 'staging', 'batch', 'data', 'ingress', 'security']

const getDemoJobs = (): Job[] => [
  { name: 'data-migration-v2', namespace: 'batch', cluster: 'eks-prod-us-east-1', status: 'Complete', completions: '1/1', duration: '5m', age: '2h' },
  { name: 'model-training-run-42', namespace: 'ml-workloads', cluster: 'vllm-gpu-cluster', status: 'Running', completions: '0/1', age: '30m' },
  { name: 'backup-db-daily', namespace: 'production', cluster: 'gke-staging', status: 'Failed', completions: '0/1', duration: '10m', age: '6h' },
]

const getDemoHPAs = (): HPA[] => [
  { name: 'web-frontend', namespace: 'production', cluster: 'eks-prod-us-east-1', reference: 'Deployment/web-frontend', minReplicas: 2, maxReplicas: 10, currentReplicas: 4, targetCPU: '70%', currentCPU: '55%', age: '30d' },
  { name: 'api-gateway', namespace: 'production', cluster: 'eks-prod-us-east-1', reference: 'Deployment/api-gateway', minReplicas: 3, maxReplicas: 20, currentReplicas: 8, targetCPU: '60%', currentCPU: '78%', age: '14d' },
]

const getDemoConfigMaps = (): ConfigMap[] => [
  { name: 'app-config', namespace: 'production', cluster: 'eks-prod-us-east-1', dataCount: 5, age: '7d' },
  { name: 'nginx-config', namespace: 'ingress', cluster: 'gke-staging', dataCount: 3, age: '14d' },
]

const getDemoSecrets = (): Secret[] => [
  { name: 'db-credentials', namespace: 'production', cluster: 'eks-prod-us-east-1', type: 'Opaque', dataCount: 3, age: '30d' },
  { name: 'tls-cert', namespace: 'ingress', cluster: 'eks-prod-us-east-1', type: 'kubernetes.io/tls', dataCount: 2, age: '90d' },
]

const getDemoServiceAccounts = (): ServiceAccount[] => [
  { name: 'default', namespace: 'production', cluster: 'eks-prod-us-east-1', age: '90d' },
  { name: 'prometheus', namespace: 'monitoring', cluster: 'gke-staging', age: '30d' },
]

const getDemoReplicaSets = (): ReplicaSet[] => [
  { name: 'web-frontend-7d8f9c4b5', namespace: 'production', cluster: 'eks-prod-us-east-1', replicas: 3, readyReplicas: 3, ownerName: 'web-frontend', ownerKind: 'Deployment', age: '2d' },
  { name: 'api-gateway-6c8d7f5e4', namespace: 'production', cluster: 'eks-prod-us-east-1', replicas: 3, readyReplicas: 1, ownerName: 'api-gateway', ownerKind: 'Deployment', age: '1d' },
]

const getDemoStatefulSets = (): StatefulSet[] => [
  { name: 'postgres', namespace: 'production', cluster: 'eks-prod-us-east-1', replicas: 3, readyReplicas: 3, status: 'running', image: 'postgres:15', age: '30d' },
  { name: 'redis', namespace: 'data', cluster: 'gke-staging', replicas: 3, readyReplicas: 3, status: 'running', image: 'redis:7', age: '14d' },
]

const getDemoDaemonSets = (): DaemonSet[] => [
  { name: 'node-exporter', namespace: 'monitoring', cluster: 'eks-prod-us-east-1', desiredScheduled: 5, currentScheduled: 5, ready: 5, status: 'running', age: '60d' },
  { name: 'fluentd', namespace: 'logging', cluster: 'gke-staging', desiredScheduled: 3, currentScheduled: 3, ready: 3, status: 'running', age: '30d' },
]

const getDemoCronJobs = (): CronJob[] => [
  { name: 'db-backup', namespace: 'production', cluster: 'eks-prod-us-east-1', schedule: '0 2 * * *', suspend: false, active: 0, lastSchedule: new Date(Date.now() - 8 * 3600000).toISOString(), age: '60d' },
  { name: 'log-cleanup', namespace: 'monitoring', cluster: 'gke-staging', schedule: '0 0 * * 0', suspend: false, active: 0, lastSchedule: new Date(Date.now() - 48 * 3600000).toISOString(), age: '30d' },
]

const getDemoIngresses = (): Ingress[] => [
  { name: 'main-ingress', namespace: 'production', cluster: 'eks-prod-us-east-1', class: 'nginx', hosts: ['app.example.com', 'api.example.com'], address: '10.0.0.100', age: '30d' },
  { name: 'staging-ingress', namespace: 'staging', cluster: 'gke-staging', class: 'nginx', hosts: ['staging.example.com'], address: '10.0.1.50', age: '14d' },
]

const getDemoNetworkPolicies = (): NetworkPolicy[] => [
  { name: 'deny-all', namespace: 'production', cluster: 'eks-prod-us-east-1', policyTypes: ['Ingress', 'Egress'], podSelector: '{}', age: '60d' },
  { name: 'allow-web', namespace: 'production', cluster: 'eks-prod-us-east-1', policyTypes: ['Ingress'], podSelector: 'app=web', age: '30d' },
]

const getDemoHelmReleases = (): HelmRelease[] => [
  { name: 'prometheus', namespace: 'monitoring', revision: '5', updated: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', cluster: 'eks-prod-us-east-1' },
  { name: 'grafana', namespace: 'monitoring', revision: '3', updated: new Date(Date.now() - 5 * 3600000).toISOString(), status: 'deployed', chart: 'grafana-7.0.11', app_version: '10.2.3', cluster: 'eks-prod-us-east-1' },
  { name: 'nginx-ingress', namespace: 'ingress', revision: '8', updated: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'deployed', chart: 'ingress-nginx-4.8.3', app_version: '1.9.4', cluster: 'gke-staging' },
  { name: 'api-gateway', namespace: 'production', revision: '6', updated: new Date(Date.now() - 1 * 3600000).toISOString(), status: 'failed', chart: 'api-gateway-2.1.0', app_version: '3.5.0', cluster: 'eks-prod-us-east-1' },
]

const getDemoHelmHistory = (): HelmHistoryEntry[] => [
  { revision: 6, updated: new Date(Date.now() - 1 * 3600000).toISOString(), status: 'failed', chart: 'api-gateway-2.1.0', app_version: '3.5.0', description: 'Upgrade failed: container crashed' },
  { revision: 5, updated: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', description: 'Upgrade complete' },
  { revision: 4, updated: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.7.0', app_version: '2.48.0', description: 'Upgrade complete' },
]

const getDemoHelmValues = (): Record<string, unknown> => ({
  replicaCount: 2,
  image: { repository: 'prom/prometheus', tag: 'v2.48.1', pullPolicy: 'IfNotPresent' },
  service: { type: 'ClusterIP', port: 9090 },
  resources: { limits: { cpu: '500m', memory: '512Mi' }, requests: { cpu: '200m', memory: '256Mi' } },
})

const getDemoOperators = (): Operator[] => [
  { name: 'prometheus-operator', namespace: 'monitoring', version: '0.72.0', status: 'Succeeded', cluster: 'eks-prod-us-east-1' },
  { name: 'cert-manager', namespace: 'cert-manager', version: '1.14.0', status: 'Succeeded', upgradeAvailable: '1.15.0', cluster: 'eks-prod-us-east-1' },
  { name: 'gpu-operator', namespace: 'nvidia-gpu-operator', version: '23.9.1', status: 'Succeeded', cluster: 'vllm-gpu-cluster' },
]

const getDemoOperatorSubscriptions = (): OperatorSubscription[] => [
  { name: 'prometheus-sub', namespace: 'monitoring', channel: 'stable', source: 'community-operators', installPlanApproval: 'Automatic', currentCSV: 'prometheusoperator.0.72.0', cluster: 'eks-prod-us-east-1' },
  { name: 'cert-manager-sub', namespace: 'cert-manager', channel: 'stable', source: 'community-operators', installPlanApproval: 'Manual', currentCSV: 'cert-manager.v1.14.0', pendingUpgrade: 'cert-manager.v1.15.0', cluster: 'eks-prod-us-east-1' },
]

const getDemoGitOpsDrifts = (): GitOpsDrift[] => [
  { resource: 'nginx-deployment', namespace: 'production', cluster: 'eks-prod-us-east-1', kind: 'Deployment', driftType: 'modified', gitVersion: 'abc1234', details: 'replicas changed from 3 to 5', severity: 'medium' },
  { resource: 'redis-config', namespace: 'data', cluster: 'gke-staging', kind: 'ConfigMap', driftType: 'modified', gitVersion: 'def5678', details: 'maxmemory-policy changed', severity: 'low' },
]

const getDemoBuildpackImages = (): BuildpackImage[] => [
  { name: 'api-service', namespace: 'production', builder: 'paketo-buildpacks/builder-jammy-base', image: 'registry.example.com/api-service:latest', status: 'succeeded', updated: new Date(Date.now() - 2 * 3600000).toISOString(), cluster: 'eks-prod-us-east-1' },
  { name: 'web-app', namespace: 'staging', builder: 'paketo-buildpacks/builder-jammy-full', image: 'registry.example.com/web-app:v2.1', status: 'building', updated: new Date(Date.now() - 300000).toISOString(), cluster: 'gke-staging' },
]

const getDemoK8sRoles = (): K8sRole[] => [
  { name: 'pod-reader', namespace: 'production', cluster: 'eks-prod-us-east-1', isCluster: false, ruleCount: 3 },
  { name: 'admin', cluster: 'eks-prod-us-east-1', isCluster: true, ruleCount: 15 },
]

const getDemoK8sRoleBindings = (): K8sRoleBinding[] => [
  { name: 'pod-reader-binding', namespace: 'production', cluster: 'eks-prod-us-east-1', isCluster: false, roleName: 'pod-reader', roleKind: 'Role', subjects: [{ kind: 'User', name: 'jane' }] },
  { name: 'admin-binding', cluster: 'eks-prod-us-east-1', isCluster: true, roleName: 'admin', roleKind: 'ClusterRole', subjects: [{ kind: 'Group', name: 'admins' }] },
]

const getDemoK8sServiceAccountsRbac = (): K8sServiceAccountInfo[] => [
  { name: 'default', namespace: 'production', cluster: 'eks-prod-us-east-1', createdAt: new Date(Date.now() - 90 * 86400000).toISOString() },
  { name: 'prometheus', namespace: 'monitoring', cluster: 'eks-prod-us-east-1', roles: ['prometheus-reader'], createdAt: new Date(Date.now() - 30 * 86400000).toISOString() },
]

// ============================================================================
// Additional Cached Data Hooks
// ============================================================================

/**
 * Hook for fetching GPU nodes with caching
 */
export function useCachedGPUNodes(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<GPUNode[]> & { nodes: GPUNode[] } {
  const { category = 'gpu' } = options || {}
  const key = `gpuNodes:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as GPUNode[],
    demoData: getDemoGPUNodes(),
    fetcher: async () => {
      if (cluster) {
        const data = await fetchAPI<{ nodes: GPUNode[] }>('gpu-nodes', { cluster })
        return (data.nodes || []).map(n => ({ ...n, cluster }))
      }
      return await fetchFromAllClusters<GPUNode>('gpu-nodes', 'nodes')
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<GPUNode>('gpu-nodes', 'nodes', {}, onProgress)
    },
  })

  return {
    nodes: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
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
        const data = await fetchAPI<{ pods: PodInfo[] }>('pods', { cluster })
        return (data.pods || []).map(p => ({ ...p, cluster }))
      }
      return await fetchFromAllClusters<PodInfo>('pods', 'pods')
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<PodInfo>('pods', 'pods', {}, onProgress)
    },
  })

  return {
    pods: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

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
    },
  })

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
    refetch: result.refetch,
  }
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
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const data = await response.json() as Array<{ name?: string; Name?: string }>
      return (data || []).map((ns: { name?: string; Name?: string }) => ns.name || ns.Name || '').filter(Boolean)
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
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
    },
  })

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
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching Helm releases with caching (GitOps SSE endpoint)
 */
export function useCachedHelmReleases(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<HelmRelease[]> & { releases: HelmRelease[] } {
  const { category = 'helm' } = options || {}
  const key = `helmReleases:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as HelmRelease[],
    demoData: getDemoHelmReleases(),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ releases: HelmRelease[] }>('helm-releases', cluster ? { cluster } : undefined)
      return data.releases || []
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaGitOpsSSE<HelmRelease>('helm-releases', 'releases', {}, onProgress)
    },
  })

  return {
    releases: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching Helm release history with caching
 */
export function useCachedHelmHistory(
  cluster?: string,
  release?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<HelmHistoryEntry[]> & { history: HelmHistoryEntry[] } {
  const { category = 'helm' } = options || {}
  const key = `helmHistory:${cluster || 'none'}:${release || 'none'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as HelmHistoryEntry[],
    demoData: getDemoHelmHistory(),
    enabled: !!(cluster && release),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ history: HelmHistoryEntry[] }>('helm-history', { cluster, release, namespace })
      return data.history || []
    },
  })

  return {
    history: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching Helm release values with caching
 */
export function useCachedHelmValues(
  cluster?: string,
  release?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Record<string, unknown>> & { values: Record<string, unknown> } {
  const { category = 'helm' } = options || {}
  const key = `helmValues:${cluster || 'none'}:${release || 'none'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: {} as Record<string, unknown>,
    demoData: getDemoHelmValues(),
    enabled: !!(cluster && release),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ values: Record<string, unknown> }>('helm-values', { cluster, release, namespace })
      return data.values || {}
    },
  })

  return {
    values: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching operators with caching (GitOps SSE endpoint)
 */
export function useCachedOperators(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Operator[]> & { operators: Operator[] } {
  const { category = 'operators' } = options || {}
  const key = `operators:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as Operator[],
    demoData: getDemoOperators(),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ operators: Operator[] }>('operators', cluster ? { cluster } : undefined)
      return data.operators || []
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaGitOpsSSE<Operator>('operators', 'operators', {}, onProgress)
    },
  })

  return {
    operators: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching operator subscriptions with caching (GitOps SSE endpoint)
 */
export function useCachedOperatorSubscriptions(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<OperatorSubscription[]> & { subscriptions: OperatorSubscription[] } {
  const { category = 'operators' } = options || {}
  const key = `operatorSubscriptions:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as OperatorSubscription[],
    demoData: getDemoOperatorSubscriptions(),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ subscriptions: OperatorSubscription[] }>('operator-subscriptions', cluster ? { cluster } : undefined)
      return data.subscriptions || []
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaGitOpsSSE<OperatorSubscription>('operator-subscriptions', 'subscriptions', {}, onProgress)
    },
  })

  return {
    subscriptions: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching GitOps drift data with caching
 */
export function useCachedGitOpsDrifts(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<GitOpsDrift[]> & { drifts: GitOpsDrift[] } {
  const { category = 'gitops' } = options || {}
  const key = `gitopsDrifts:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as GitOpsDrift[],
    demoData: getDemoGitOpsDrifts(),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ drifts: GitOpsDrift[] }>('drifts', { cluster, namespace })
      return data.drifts || []
    },
  })

  return {
    drifts: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching buildpack images with caching
 */
export function useCachedBuildpackImages(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<BuildpackImage[]> & { images: BuildpackImage[] } {
  const { category = 'default' } = options || {}
  const key = `buildpackImages:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as BuildpackImage[],
    demoData: getDemoBuildpackImages(),
    fetcher: async () => {
      const data = await fetchGitOpsAPI<{ images: BuildpackImage[] }>('buildpack-images', cluster ? { cluster } : undefined)
      return data.images || []
    },
  })

  return {
    images: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching K8s Roles with caching (RBAC endpoint)
 */
export function useCachedK8sRoles(
  cluster?: string,
  namespace?: string,
  options?: { includeSystem?: boolean; category?: RefreshCategory }
): CachedHookResult<K8sRole[]> & { roles: K8sRole[] } {
  const { includeSystem = false, category = 'rbac' } = options || {}
  const key = `k8sRoles:${cluster || 'all'}:${namespace || 'all'}:${includeSystem}`

  const result = useCache({
    key,
    category,
    initialData: [] as K8sRole[],
    demoData: getDemoK8sRoles(),
    fetcher: async () => {
      const data = await fetchRbacAPI<{ roles: K8sRole[] }>('roles', { cluster, namespace, includeSystem })
      return data.roles || []
    },
  })

  return {
    roles: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching K8s RoleBindings with caching (RBAC endpoint)
 */
export function useCachedK8sRoleBindings(
  cluster?: string,
  namespace?: string,
  options?: { includeSystem?: boolean; category?: RefreshCategory }
): CachedHookResult<K8sRoleBinding[]> & { bindings: K8sRoleBinding[] } {
  const { includeSystem = false, category = 'rbac' } = options || {}
  const key = `k8sRoleBindings:${cluster || 'all'}:${namespace || 'all'}:${includeSystem}`

  const result = useCache({
    key,
    category,
    initialData: [] as K8sRoleBinding[],
    demoData: getDemoK8sRoleBindings(),
    fetcher: async () => {
      const data = await fetchRbacAPI<{ bindings: K8sRoleBinding[] }>('bindings', { cluster, namespace, includeSystem })
      return data.bindings || []
    },
  })

  return {
    bindings: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

/**
 * Hook for fetching K8s ServiceAccounts with caching (RBAC endpoint)
 */
export function useCachedK8sServiceAccounts(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<K8sServiceAccountInfo[]> & { serviceAccounts: K8sServiceAccountInfo[] } {
  const { category = 'rbac' } = options || {}
  const key = `k8sServiceAccounts:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as K8sServiceAccountInfo[],
    demoData: getDemoK8sServiceAccountsRbac(),
    fetcher: async () => {
      const data = await fetchRbacAPI<{ serviceAccounts: K8sServiceAccountInfo[] }>('service-accounts', { cluster, namespace })
      return data.serviceAccounts || []
    },
  })

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
    refetch: result.refetch,
  }
}

// ============================================================================
// ISO 27001 Security Audit — kubectl-based compliance checks
// ============================================================================

/** Run ISO 27001 compliance checks against a single cluster */
async function runISO27001ChecksForCluster(
  clusterName: string,
  context: string,
): Promise<ISO27001Finding[]> {
  const findings: ISO27001Finding[] = []
  const ctx = context || clusterName

  // Helper to run kubectl and parse JSON
  const execJson = async (args: string[]) => {
    const res = await kubectlProxy.exec(args, { context: ctx, timeout: KUBECTL_EXTENDED_TIMEOUT_MS })
    if (res.exitCode !== 0) return null
    try { return JSON.parse(res.output) } catch { return null }
  }

  // ── RBAC checks ──
  const crbs = await execJson(['get', 'clusterrolebindings', '-o', 'json'])
  if (crbs) {
    const adminBindings = (crbs.items || []).filter(
      (b: { roleRef?: { name?: string }; metadata?: { namespace?: string } }) =>
        b.roleRef?.name === 'cluster-admin' && b.metadata?.namespace !== 'kube-system'
    )
    findings.push({
      checkId: 'rbac-1', category: 'RBAC & Access Control',
      label: 'No cluster-admin bindings outside kube-system',
      status: adminBindings.length === 0 ? 'pass' : 'fail',
      cluster: clusterName, severity: 'critical',
      details: adminBindings.length === 0 ? 'No unauthorized cluster-admin bindings' : `${adminBindings.length} cluster-admin binding(s) outside kube-system`,
    })

    const roles = await execJson(['get', 'clusterroles', '-o', 'json'])
    if (roles) {
      const wildcardRoles = (roles.items || []).filter(
        (r: { rules?: Array<{ verbs?: string[]; resources?: string[] }> }) =>
          (r.rules || []).some((rule: { verbs?: string[]; resources?: string[] }) =>
            rule.verbs?.includes('*') || rule.resources?.includes('*')
          )
      )
      findings.push({
        checkId: 'rbac-3', category: 'RBAC & Access Control',
        label: 'No wildcard permissions (*) in production',
        status: wildcardRoles.length <= 2 ? 'pass' : 'fail',
        cluster: clusterName, severity: 'critical',
        details: `${wildcardRoles.length} ClusterRole(s) with wildcard permissions`,
      })
    }
  }

  // ── Network Policies ──
  const netpols = await execJson(['get', 'networkpolicies', '-A', '-o', 'json'])
  const namespaces = await execJson(['get', 'namespaces', '-o', 'json'])
  if (netpols && namespaces) {
    const nsNames: string[] = (namespaces.items || [])
      .map((ns: { metadata?: { name?: string } }) => ns.metadata?.name || '')
      .filter((n: string) => !n.startsWith('kube-'))
    const nsWithPolicies = new Set(
      (netpols.items || []).map((p: { metadata?: { namespace?: string } }) => p.metadata?.namespace)
    )
    const nsMissing = nsNames.filter((n: string) => !nsWithPolicies.has(n))
    findings.push({
      checkId: 'net-1', category: 'Network Policies',
      label: 'Default-deny ingress in all namespaces',
      status: nsMissing.length === 0 ? 'pass' : 'fail',
      cluster: clusterName, severity: 'high',
      details: nsMissing.length === 0 ? 'All namespaces have NetworkPolicies' : `${nsMissing.length} namespace(s) missing NetworkPolicies: ${nsMissing.slice(0, 3).join(', ')}`,
    })
  }

  // ── Pod Security checks ──
  const pods = await execJson(['get', 'pods', '-A', '-o', 'json'])
  if (pods) {
    const items: Array<{
      metadata?: { name?: string; namespace?: string }
      spec?: {
        securityContext?: { runAsNonRoot?: boolean; runAsUser?: number }
        hostNetwork?: boolean
        volumes?: Array<{ hostPath?: unknown }>
        containers?: Array<{
          image?: string
          securityContext?: {
            privileged?: boolean
            runAsNonRoot?: boolean
            readOnlyRootFilesystem?: boolean
          }
        }>
      }
    }> = pods.items || []

    const userPods = items.filter(p => {
      const ns = p.metadata?.namespace || ''
      return !ns.startsWith('kube-') && ns !== 'local-path-storage'
    })

    const privileged = userPods.filter(p =>
      (p.spec?.containers || []).some(c => c.securityContext?.privileged === true)
    )
    findings.push({
      checkId: 'pod-2', category: 'Pod Security',
      label: 'No privileged containers',
      status: privileged.length === 0 ? 'pass' : 'fail',
      cluster: clusterName, severity: 'critical',
      details: privileged.length === 0 ? 'No privileged containers found' : `${privileged.length} pod(s) with privileged containers`,
    })

    const noRunAsNonRoot = userPods.filter(p => {
      const podSc = p.spec?.securityContext
      return !(podSc?.runAsNonRoot === true) && (p.spec?.containers || []).some(
        c => !(c.securityContext?.runAsNonRoot === true)
      )
    })
    findings.push({
      checkId: 'pod-3', category: 'Pod Security',
      label: 'runAsNonRoot enforced',
      status: noRunAsNonRoot.length === 0 ? 'pass' : noRunAsNonRoot.length <= 3 ? 'warning' : 'fail',
      cluster: clusterName, severity: 'high',
      details: noRunAsNonRoot.length === 0 ? 'All pods enforce runAsNonRoot' : `${noRunAsNonRoot.length} pod(s) missing runAsNonRoot`,
    })

    const noReadOnly = userPods.filter(p =>
      (p.spec?.containers || []).some(c => !(c.securityContext?.readOnlyRootFilesystem === true))
    )
    findings.push({
      checkId: 'pod-4', category: 'Pod Security',
      label: 'Read-only root filesystem',
      status: noReadOnly.length === 0 ? 'pass' : noReadOnly.length <= 5 ? 'warning' : 'fail',
      cluster: clusterName, severity: 'medium',
      details: noReadOnly.length === 0 ? 'All containers use readOnlyRootFilesystem' : `${noReadOnly.length} pod(s) without read-only root filesystem`,
    })

    const hostPath = userPods.filter(p =>
      (p.spec?.volumes || []).some(v => v.hostPath)
    )
    findings.push({
      checkId: 'pod-5', category: 'Pod Security',
      label: 'No hostPath volumes',
      status: hostPath.length === 0 ? 'pass' : 'fail',
      cluster: clusterName, severity: 'high',
      details: hostPath.length === 0 ? 'No hostPath volumes detected' : `${hostPath.length} pod(s) using hostPath volumes`,
    })

    const latestTag = userPods.filter(p =>
      (p.spec?.containers || []).some(c => {
        const img = c.image || ''
        return img.endsWith(':latest') || !img.includes(':')
      })
    )
    findings.push({
      checkId: 'img-4', category: 'Image Security',
      label: 'No latest tag in production',
      status: latestTag.length === 0 ? 'pass' : latestTag.length <= 2 ? 'warning' : 'fail',
      cluster: clusterName, severity: 'medium',
      details: latestTag.length === 0 ? 'All images use specific tags' : `${latestTag.length} pod(s) using :latest or untagged images`,
    })

    const hostNet = userPods.filter(p => p.spec?.hostNetwork === true)
    findings.push({
      checkId: 'node-2', category: 'Node Security',
      label: 'No hostNetwork pods outside system namespaces',
      status: hostNet.length === 0 ? 'pass' : 'warning',
      cluster: clusterName, severity: 'high',
      details: hostNet.length === 0 ? 'No hostNetwork pods in user namespaces' : `${hostNet.length} pod(s) using hostNetwork`,
    })
  }

  // ── Secrets in ConfigMaps ──
  const configmaps = await execJson(['get', 'configmaps', '-A', '-o', 'json'])
  if (configmaps) {
    const suspicious = (configmaps.items || []).filter(
      (cm: { data?: Record<string, string> }) => {
        const data = cm.data || {}
        return Object.values(data).some((v: string) =>
          /password|secret|token|key|credential/i.test(v) && v.length > 20
        )
      }
    )
    findings.push({
      checkId: 'sec-2', category: 'Secrets Management',
      label: 'No secrets in ConfigMaps or env vars',
      status: suspicious.length === 0 ? 'pass' : 'warning',
      cluster: clusterName, severity: 'high',
      details: suspicious.length === 0 ? 'No suspicious secrets found in ConfigMaps' : `${suspicious.length} ConfigMap(s) may contain sensitive data`,
    })
  }

  return findings
}

/** Fetch ISO 27001 audit findings from all connected clusters */
async function fetchISO27001AuditViaKubectl(
  cluster?: string,
  onProgress?: (partial: ISO27001Finding[]) => void,
): Promise<ISO27001Finding[]> {
  if (isAgentUnavailable()) return []
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  const accumulated: ISO27001Finding[] = []

  const tasks = clusters
    .filter(c => !cluster || c.name === cluster)
    .map(({ name, context }) => async () => {
      try {
        const clusterFindings = await runISO27001ChecksForCluster(name, context || name)
        accumulated.push(...clusterFindings)
        onProgress?.([...accumulated])
        return clusterFindings
      } catch (err) {
        console.error(`[ISO27001] Audit failed for cluster ${name}:`, err)
        return []
      }
    })

  await settledWithConcurrency(tasks)
  return accumulated
}

/**
 * Hook for fetching ISO 27001 audit findings with caching
 */
export function useCachedISO27001Audit(
  cluster?: string,
): CachedHookResult<ISO27001Finding[]> & { findings: ISO27001Finding[] } {
  const key = `iso27001Audit:${cluster || 'all'}`

  const result = useCache({
    key,
    category: 'pods' as RefreshCategory,
    initialData: [] as ISO27001Finding[],
    demoData: [] as ISO27001Finding[],
    fetcher: async () => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const findings = await fetchISO27001AuditViaKubectl(cluster)
        if (findings.length > 0) return findings
      }
      throw new Error('No data source available')
    },
    progressiveFetcher: !cluster ? async (onProgress) => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const findings = await fetchISO27001AuditViaKubectl(cluster, onProgress)
        if (findings.length > 0) return findings
      }
      throw new Error('No data source available')
    } : undefined,
  })

  return {
    findings: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

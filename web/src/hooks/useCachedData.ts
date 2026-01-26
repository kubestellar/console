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
import type {
  PodInfo,
  PodIssue,
  ClusterEvent,
  DeploymentIssue,
  Deployment,
  Service,
} from './useMCP'
import type { ProwJob, ProwStatus } from './useProw'
import type { LLMdServer, LLMdStatus, LLMdModel } from './useLLMd'

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
    initialData: getDemoProwJobs(),
    enabled: true,
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
  const allServers: LLMdServer[] = []
  const keyNamespaces = ['b2', 'e2e-helm', 'e2e-solution', 'e2e-pd', 'effi', 'effi2', 'guygir',
    'llm-d', 'aibrix-system', 'hc4ai-operator', 'hc4ai-operator-dev', 'e2e-solution-platform-eval', 'inference-router-test']

  for (const cluster of clusters) {
    try {
      const allDeployments: DeploymentResource[] = []
      for (const ns of keyNamespaces) {
        try {
          const resp = await kubectlProxy.exec(['get', 'deployments', '-n', ns, '-o', 'json'], { context: cluster, timeout: 10000 })
          if (resp.exitCode === 0 && resp.output) {
            allDeployments.push(...(JSON.parse(resp.output).items || []))
          }
        } catch { /* namespace not found */ }
      }
      if (allDeployments.length === 0) continue

      const autoscalerMap = new Map<string, 'hpa' | 'va' | 'both'>()
      try {
        const hpaResp = await kubectlProxy.exec(['get', 'hpa', '-A', '-o', 'json'], { context: cluster, timeout: 10000 })
        if (hpaResp.exitCode === 0) {
          for (const hpa of (JSON.parse(hpaResp.output).items || []) as HPAResource[]) {
            if (hpa.spec.scaleTargetRef.kind === 'Deployment') {
              autoscalerMap.set(`${hpa.metadata.namespace}/${hpa.spec.scaleTargetRef.name}`, 'hpa')
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
            }
          }
        }
      } catch { /* ignore */ }

      const llmdDeployments = allDeployments.filter(d => {
        const name = d.metadata.name.toLowerCase()
        const labels = d.spec.template?.metadata?.labels || {}
        const ns = d.metadata.namespace.toLowerCase()
        const isLlmdNs = ns.includes('llm-d') || ns.includes('e2e') || ns.includes('vllm') || ns === 'b2'
        return name.includes('vllm') || name.includes('llm-d') || name.includes('tgi') || name.includes('triton') ||
          name.includes('llama') || name.includes('granite') || name.includes('qwen') || name.includes('mistral') || name.includes('mixtral') ||
          labels['llmd.org/inferenceServing'] === 'true' || labels['llmd.org/model'] ||
          labels['app.kubernetes.io/name'] === 'vllm' || labels['app.kubernetes.io/name'] === 'tgi' ||
          name.includes('-epp') || name.endsWith('epp') ||
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
    } catch (err) {
      console.warn(`Error fetching from cluster ${cluster}:`, err)
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
    initialData: getDemoLLMdServers(),
    enabled: true,
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
      console.warn(`Error fetching InferencePools from cluster ${cluster}:`, err)
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
    initialData: getDemoLLMdModels(),
    enabled: true,
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

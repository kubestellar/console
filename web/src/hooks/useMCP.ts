import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { reportAgentDataError, reportAgentDataSuccess } from './useLocalAgent'
import { getDemoMode, useDemoMode } from './useDemoMode'

// Refresh interval for automatic polling (2 minutes) - manual refresh bypasses this
const REFRESH_INTERVAL_MS = 120000

// Types matching the backend MCP bridge
export interface ClusterInfo {
  name: string
  context: string
  server?: string
  user?: string
  healthy: boolean
  source?: string
  nodeCount?: number
  podCount?: number
  // Total allocatable resources (capacity)
  cpuCores?: number
  memoryBytes?: number
  memoryGB?: number
  storageBytes?: number
  storageGB?: number
  // Resource requests (allocated/used)
  cpuRequestsMillicores?: number
  cpuRequestsCores?: number
  memoryRequestsBytes?: number
  memoryRequestsGB?: number
  // PVC metrics
  pvcCount?: number
  pvcBoundCount?: number
  isCurrent?: boolean
  // Reachability fields (from health check)
  reachable?: boolean
  lastSeen?: string
  errorType?: 'timeout' | 'auth' | 'network' | 'certificate' | 'unknown'
  errorMessage?: string
  // Refresh state - true when a refresh is in progress for this cluster
  refreshing?: boolean
  // Detected cluster distribution (openshift, eks, gke, etc.)
  distribution?: string
  // Namespaces in the cluster (for cloud provider detection)
  namespaces?: string[]
}

export interface ClusterHealth {
  cluster: string
  healthy: boolean
  apiServer?: string
  nodeCount: number
  readyNodes: number
  podCount?: number
  // Total allocatable resources (capacity)
  cpuCores?: number
  memoryBytes?: number
  memoryGB?: number
  storageBytes?: number
  storageGB?: number
  // Resource requests (allocated/used)
  cpuRequestsMillicores?: number
  cpuRequestsCores?: number
  memoryRequestsBytes?: number
  memoryRequestsGB?: number
  // PVC metrics
  pvcCount?: number
  pvcBoundCount?: number
  issues?: string[]
  // Fields for reachability
  reachable?: boolean
  lastSeen?: string
  errorType?: 'timeout' | 'auth' | 'network' | 'certificate' | 'unknown'
  errorMessage?: string
}

export interface ContainerInfo {
  name: string
  image: string
  ready: boolean
  state: 'running' | 'waiting' | 'terminated'
  reason?: string
  message?: string
  gpuRequested?: number  // Number of GPUs requested by this container
}

export interface PodInfo {
  name: string
  namespace: string
  cluster?: string
  status: string
  ready: string
  restarts: number
  age: string
  node?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  containers?: ContainerInfo[]
}

export interface PodIssue {
  name: string
  namespace: string
  cluster?: string
  status: string
  reason?: string
  issues: string[]
  restarts: number
}

export interface ClusterEvent {
  type: string
  reason: string
  message: string
  object: string
  namespace: string
  cluster?: string
  count: number
  firstSeen?: string
  lastSeen?: string
}

export interface DeploymentIssue {
  name: string
  namespace: string
  cluster?: string
  replicas: number
  readyReplicas: number
  reason?: string
  message?: string
}

export interface Deployment {
  name: string
  namespace: string
  cluster?: string
  status: 'running' | 'deploying' | 'failed'
  replicas: number
  readyReplicas: number
  updatedReplicas: number
  availableReplicas: number
  progress: number
  image?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface GPUNode {
  name: string
  cluster: string
  gpuType: string
  gpuCount: number
  gpuAllocated: number
  // Enhanced GPU info from NVIDIA GPU Feature Discovery
  gpuMemoryMB?: number
  gpuFamily?: string
  cudaDriverVersion?: string
  cudaRuntimeVersion?: string
  migCapable?: boolean
  migStrategy?: string
  manufacturer?: string
}

// NVIDIA Operator Status types
export interface OperatorComponent {
  name: string
  status: string
  reason?: string
}

export interface GPUOperatorInfo {
  installed: boolean
  version?: string
  state?: string
  ready: boolean
  components?: OperatorComponent[]
  driverVersion?: string
  cudaVersion?: string
  namespace?: string
}

export interface NetworkOperatorInfo {
  installed: boolean
  version?: string
  state?: string
  ready: boolean
  components?: OperatorComponent[]
  namespace?: string
}

export interface NVIDIAOperatorStatus {
  cluster: string
  gpuOperator?: GPUOperatorInfo
  networkOperator?: NetworkOperatorInfo
}

export interface NodeCondition {
  type: string
  status: string
  reason?: string
  message?: string
}

export interface NodeInfo {
  name: string
  cluster?: string
  status: string // Ready, NotReady, Unknown
  roles: string[]
  internalIP?: string
  externalIP?: string
  kubeletVersion: string
  containerRuntime?: string
  os?: string
  architecture?: string
  cpuCapacity: string
  memoryCapacity: string
  storageCapacity?: string
  podCapacity: string
  conditions: NodeCondition[]
  labels?: Record<string, string>
  taints?: string[]
  age?: string
  unschedulable: boolean
}

export interface Service {
  name: string
  namespace: string
  cluster?: string
  type: string // ClusterIP, NodePort, LoadBalancer, ExternalName
  clusterIP?: string
  externalIP?: string
  ports?: string[]
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface Job {
  name: string
  namespace: string
  cluster?: string
  status: string // Running, Complete, Failed
  completions: string
  duration?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface HPA {
  name: string
  namespace: string
  cluster?: string
  reference: string
  minReplicas: number
  maxReplicas: number
  currentReplicas: number
  targetCPU?: string
  currentCPU?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface ConfigMap {
  name: string
  namespace: string
  cluster?: string
  dataCount: number
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface Secret {
  name: string
  namespace: string
  cluster?: string
  type: string
  dataCount: number
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface ServiceAccount {
  name: string
  namespace: string
  cluster?: string
  secrets?: string[]
  imagePullSecrets?: string[]
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface PVC {
  name: string
  namespace: string
  cluster?: string
  status: string
  storageClass?: string
  capacity?: string
  accessModes?: string[]
  volumeName?: string
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface PV {
  name: string
  cluster?: string
  status: string
  capacity?: string
  storageClass?: string
  reclaimPolicy?: string
  accessModes?: string[]
  claimRef?: string
  volumeMode?: string
  age?: string
  labels?: Record<string, string>
}

export interface ResourceQuota {
  name: string
  namespace: string
  cluster?: string
  hard: Record<string, string>  // Resource limits
  used: Record<string, string>  // Current usage
  age?: string
  labels?: Record<string, string>
}

export interface LimitRangeItem {
  type: string  // Pod, Container, PersistentVolumeClaim
  default?: Record<string, string>
  defaultRequest?: Record<string, string>
  max?: Record<string, string>
  min?: Record<string, string>
}

export interface LimitRange {
  name: string
  namespace: string
  cluster?: string
  limits: LimitRangeItem[]
  age?: string
  labels?: Record<string, string>
}

export interface MCPStatus {
  opsClient: {
    available: boolean
    toolCount: number
  }
  deployClient: {
    available: boolean
    toolCount: number
  }
}

// Hook to get MCP status
export function useMCPStatus() {
  const [status, setStatus] = useState<MCPStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await api.get<MCPStatus>('/api/mcp/status')
        setStatus(data)
        setError(null)
      } catch (err) {
        setError('MCP bridge not available')
        setStatus(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStatus()
    // Poll every 2 minutes
    const interval = setInterval(fetchStatus, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return { status, isLoading, error }
}

// Local agent URL for direct cluster access
const LOCAL_AGENT_URL = 'http://127.0.0.1:8585'

// ============================================================================
// Shared Cluster State - ensures all useClusters() consumers see the same data
// ============================================================================
interface ClusterCache {
  clusters: ClusterInfo[]
  lastUpdated: Date | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  consecutiveFailures: number
  isFailed: boolean
  lastRefresh: Date | null
}

// Cache cluster distribution in localStorage to prevent logo flickering on page load
const CLUSTER_DIST_CACHE_KEY = 'kubestellar-cluster-distributions'
type DistributionCache = Record<string, { distribution: string; namespaces?: string[] }>

function loadDistributionCache(): DistributionCache {
  try {
    const stored = localStorage.getItem(CLUSTER_DIST_CACHE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return {}
}

function saveDistributionCache(cache: DistributionCache) {
  try {
    localStorage.setItem(CLUSTER_DIST_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore storage errors
  }
}

// Apply cached distributions to cluster list
function applyDistributionCache(clusters: ClusterInfo[]): ClusterInfo[] {
  const distCache = loadDistributionCache()
  return clusters.map(cluster => {
    const cached = distCache[cluster.name]
    if (cached && !cluster.distribution) {
      return { ...cluster, distribution: cached.distribution, namespaces: cached.namespaces }
    }
    return cluster
  })
}

// Update distribution cache when clusters are updated
function updateDistributionCache(clusters: ClusterInfo[]) {
  const distCache = loadDistributionCache()
  let changed = false
  clusters.forEach(cluster => {
    if (cluster.distribution && (!distCache[cluster.name] || distCache[cluster.name].distribution !== cluster.distribution)) {
      distCache[cluster.name] = { distribution: cluster.distribution, namespaces: cluster.namespaces }
      changed = true
    }
  })
  if (changed) {
    saveDistributionCache(distCache)
  }
}

// Full cluster cache in localStorage - preserves all fields including cpuCores, distribution, etc.
const CLUSTER_CACHE_KEY = 'kubestellar-cluster-cache'

function loadClusterCacheFromStorage(): ClusterInfo[] {
  try {
    const stored = localStorage.getItem(CLUSTER_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

function saveClusterCacheToStorage(clusters: ClusterInfo[]) {
  try {
    // Only save clusters with meaningful data
    const toSave = clusters.filter(c => c.name).map(c => ({
      name: c.name,
      context: c.context,
      server: c.server,
      user: c.user,
      healthy: c.healthy,
      source: c.source,
      nodeCount: c.nodeCount,
      podCount: c.podCount,
      cpuCores: c.cpuCores,
      memoryBytes: c.memoryBytes,
      memoryGB: c.memoryGB,
      storageBytes: c.storageBytes,
      storageGB: c.storageGB,
      pvcCount: c.pvcCount,
      pvcBoundCount: c.pvcBoundCount,
      reachable: c.reachable,
      lastSeen: c.lastSeen,
      distribution: c.distribution,
      namespaces: c.namespaces,
    }))
    localStorage.setItem(CLUSTER_CACHE_KEY, JSON.stringify(toSave))
  } catch {
    // Ignore storage errors
  }
}

// Merge stored cluster data with fresh cluster list (preserves cached metrics)
// Uses cached value when new value is missing/zero (0 is treated as missing for metrics)
function mergeWithStoredClusters(newClusters: ClusterInfo[]): ClusterInfo[] {
  const stored = loadClusterCacheFromStorage()
  const storedMap = new Map(stored.map(c => [c.name, c]))

  return newClusters.map(cluster => {
    const cached = storedMap.get(cluster.name)
    if (cached) {
      // Helper: use new value only if it's a positive number, else use cached
      const pickMetric = (newVal: number | undefined, cachedVal: number | undefined) => {
        if (newVal !== undefined && newVal > 0) return newVal
        if (cachedVal !== undefined && cachedVal > 0) return cachedVal
        return newVal // fallback to new value (could be 0 or undefined)
      }

      // Merge: use new data but preserve cached metrics if new data is missing/zero
      return {
        ...cluster,
        cpuCores: pickMetric(cluster.cpuCores, cached.cpuCores),
        memoryBytes: pickMetric(cluster.memoryBytes, cached.memoryBytes),
        memoryGB: pickMetric(cluster.memoryGB, cached.memoryGB),
        storageBytes: pickMetric(cluster.storageBytes, cached.storageBytes),
        storageGB: pickMetric(cluster.storageGB, cached.storageGB),
        nodeCount: pickMetric(cluster.nodeCount, cached.nodeCount),
        podCount: pickMetric(cluster.podCount, cached.podCount),
        pvcCount: cluster.pvcCount ?? cached.pvcCount, // pvcCount can be 0
        pvcBoundCount: cluster.pvcBoundCount ?? cached.pvcBoundCount,
        distribution: cluster.distribution || cached.distribution,
        namespaces: cluster.namespaces?.length ? cluster.namespaces : cached.namespaces,
      }
    }
    return cluster
  })
}

// Module-level shared state - initialize from localStorage if available
const storedClusters = loadClusterCacheFromStorage()
let clusterCache: ClusterCache = {
  clusters: storedClusters,
  lastUpdated: storedClusters.length > 0 ? new Date() : null,
  isLoading: storedClusters.length === 0, // Don't show loading if we have cached data
  isRefreshing: false,
  error: null,
  consecutiveFailures: 0,
  isFailed: false,
  lastRefresh: storedClusters.length > 0 ? new Date() : null,
}

// Subscribers that get notified when cluster data changes
type ClusterSubscriber = (cache: ClusterCache) => void
const clusterSubscribers = new Set<ClusterSubscriber>()

// Notify all subscribers of state change
function notifyClusterSubscribers() {
  clusterSubscribers.forEach(subscriber => subscriber(clusterCache))
}

// Debounced notification for batching rapid updates (prevents flashing during health checks)
let notifyTimeout: ReturnType<typeof setTimeout> | null = null
function notifyClusterSubscribersDebounced() {
  if (notifyTimeout) {
    clearTimeout(notifyTimeout)
  }
  notifyTimeout = setTimeout(() => {
    notifyClusterSubscribers()
    notifyTimeout = null
  }, 50) // 50ms debounce batches rapid health check completions
}

// Update shared cluster cache
function updateClusterCache(updates: Partial<ClusterCache>) {
  // Apply cached distributions and merge with stored data to preserve metrics
  if (updates.clusters) {
    updates.clusters = mergeWithStoredClusters(updates.clusters)
    updates.clusters = applyDistributionCache(updates.clusters)
    // Save cluster data to localStorage
    saveClusterCacheToStorage(updates.clusters)
    updateDistributionCache(updates.clusters)
  }
  clusterCache = { ...clusterCache, ...updates }
  notifyClusterSubscribers()
}

// Update a single cluster in the shared cache (debounced to prevent flashing)
function updateSingleClusterInCache(clusterName: string, updates: Partial<ClusterInfo>) {
  const updatedClusters = clusterCache.clusters.map(c => {
    if (c.name !== clusterName) return c

    // Merge updates with existing data
    const merged = { ...c }

    // For each update field, only apply if value is meaningful
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined) {
        // Don't overwrite with undefined - keep existing value
        return
      }

      // For numeric metrics, preserve positive cached values when new value is 0
      const metricsKeys = ['cpuCores', 'memoryBytes', 'memoryGB', 'storageBytes', 'storageGB']
      if (metricsKeys.includes(key) && typeof value === 'number' && value === 0) {
        // Keep existing positive value if available
        const existingValue = c[key as keyof ClusterInfo]
        if (typeof existingValue === 'number' && existingValue > 0) {
          return // Skip, keep existing positive value
        }
      }

      // Apply the update
      (merged as Record<string, unknown>)[key] = value
    })

    return merged
  })

  clusterCache = {
    ...clusterCache,
    clusters: updatedClusters,
  }
  // Persist all cluster data to localStorage
  saveClusterCacheToStorage(updatedClusters)
  // Persist distribution changes
  if (updates.distribution) {
    updateDistributionCache(updatedClusters)
  }
  // Use debounced notification to batch multiple cluster updates
  notifyClusterSubscribersDebounced()
}

// Track if initial fetch has been triggered (to avoid duplicate fetches)
let initialFetchStarted = false

// Reset shared state on HMR (hot module reload) in development
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    initialFetchStarted = false
    clusterCache = {
      clusters: [],
      lastUpdated: null,
      isLoading: true,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: null,
    }
    clusterSubscribers.clear()
  })
}

// Fetch basic cluster list from local agent (fast, no health check)
async function fetchClusterListFromAgent(): Promise<ClusterInfo[] | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(`${LOCAL_AGENT_URL}/clusters`, {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (response.ok) {
      const data = await response.json()
      // Report successful data fetch - can recover from degraded state
      reportAgentDataSuccess()
      // Transform agent response to ClusterInfo format - mark as "checking" initially
      return (data.clusters || []).map((c: any) => ({
        name: c.name,
        context: c.context || c.name,
        server: c.server,
        user: c.user,
        healthy: true, // Will be updated by health check
        reachable: undefined, // Unknown until health check completes
        source: 'kubeconfig',
        nodeCount: undefined, // undefined = still checking, 0 = unreachable
        podCount: undefined,
        isCurrent: c.isCurrent,
      }))
    } else {
      // Non-OK response (e.g., 503 Service Unavailable)
      reportAgentDataError('/clusters', `HTTP ${response.status}`)
    }
  } catch (err) {
    // Local agent not available or timeout
    // Note: We don't report this as a data error because if the agent
    // is completely unavailable, the health check will catch it
  }
  return null
}

// Fetch health for a single cluster from backend (with short timeout for progressive loading)
async function fetchSingleClusterHealth(clusterName: string): Promise<ClusterHealth | null> {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(
      `/api/mcp/clusters/${encodeURIComponent(clusterName)}/health`,
      {
        signal: AbortSignal.timeout(10000), // 10 second timeout per cluster (increased for slow networks)
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      }
    )
    if (response.ok) {
      return await response.json()
    }
  } catch {
    // Timeout or error - cluster is likely unreachable
  }
  return null
}

// Helper to detect distribution from namespace list
function detectDistributionFromNamespaces(namespaces: string[]): string | undefined {
  if (namespaces.some(ns => ns.startsWith('openshift-') || ns === 'openshift')) {
    return 'openshift'
  } else if (namespaces.some(ns => ns.startsWith('gke-') || ns === 'config-management-system')) {
    return 'gke'
  } else if (namespaces.some(ns => ns.startsWith('aws-') || ns.startsWith('amazon-'))) {
    return 'eks'
  } else if (namespaces.some(ns => ns.startsWith('azure-') || ns === 'azure-arc')) {
    return 'aks'
  } else if (namespaces.some(ns => ns === 'cattle-system' || ns.startsWith('cattle-'))) {
    return 'rancher'
  }
  return undefined
}

// Detect cluster distribution by checking for system namespaces
// Tries multiple endpoints as fallbacks: pods -> events -> deployments
async function detectClusterDistribution(clusterName: string): Promise<{ distribution?: string; namespaces?: string[] }> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {}

  // Helper to extract namespaces from API response
  const extractNamespaces = (items: Array<{ namespace?: string }>): string[] => {
    return Array.from(new Set<string>(
      items.map(item => item.namespace).filter((ns): ns is string => Boolean(ns))
    ))
  }

  // Try pods endpoint first
  try {
    const response = await fetch(
      `/api/mcp/pods?cluster=${encodeURIComponent(clusterName)}&limit=500`,
      { signal: AbortSignal.timeout(5000), headers }
    )
    if (response.ok) {
      const data = await response.json()
      const namespaces = extractNamespaces(data.pods || [])
      const distribution = detectDistributionFromNamespaces(namespaces)
      if (distribution) return { distribution, namespaces }
    }
  } catch { /* continue to fallback */ }

  // Fallback: try events endpoint
  try {
    const response = await fetch(
      `/api/mcp/events?cluster=${encodeURIComponent(clusterName)}&limit=200`,
      { signal: AbortSignal.timeout(5000), headers }
    )
    if (response.ok) {
      const data = await response.json()
      const namespaces = extractNamespaces(data.events || [])
      const distribution = detectDistributionFromNamespaces(namespaces)
      if (distribution) return { distribution, namespaces }
    }
  } catch { /* continue to fallback */ }

  // Fallback: try deployments endpoint
  try {
    const response = await fetch(
      `/api/mcp/deployments?cluster=${encodeURIComponent(clusterName)}`,
      { signal: AbortSignal.timeout(5000), headers }
    )
    if (response.ok) {
      const data = await response.json()
      const namespaces = extractNamespaces(data.deployments || [])
      const distribution = detectDistributionFromNamespaces(namespaces)
      if (distribution) return { distribution, namespaces }
    }
  } catch { /* ignore */ }

  return {}
}

// Progressive health check - fetches health for each cluster individually
// Updates shared cache so all consumers see the same data
async function checkHealthProgressively(clusterList: ClusterInfo[]) {
  // Fire off all health checks in parallel - each updates shared cache when done
  clusterList.forEach(async (cluster) => {
    const health = await fetchSingleClusterHealth(cluster.name)

    if (health) {
      // Health data available - cluster is reachable if we got a response
      // Only mark unreachable if explicitly set to false by backend
      const isReachable = health.reachable !== false

      // Detect cluster distribution (async, non-blocking update)
      detectClusterDistribution(cluster.name).then(({ distribution, namespaces }) => {
        if (distribution || namespaces) {
          updateSingleClusterInCache(cluster.name, { distribution, namespaces })
        }
      })

      updateSingleClusterInCache(cluster.name, {
        healthy: health.healthy,
        reachable: isReachable,
        nodeCount: health.nodeCount,
        podCount: health.podCount,
        cpuCores: health.cpuCores,
        cpuRequestsCores: health.cpuRequestsCores,
        // Memory/storage metrics
        memoryBytes: health.memoryBytes,
        memoryGB: health.memoryGB,
        memoryRequestsGB: health.memoryRequestsGB,
        storageBytes: health.storageBytes,
        storageGB: health.storageGB,
        pvcCount: health.pvcCount,
        pvcBoundCount: health.pvcBoundCount,
        errorType: health.errorType,
        errorMessage: health.errorMessage,
        refreshing: false,
      })
    } else {
      // No health data or timeout - cluster is unreachable
      updateSingleClusterInCache(cluster.name, {
        healthy: false,
        reachable: false,
        nodeCount: 0,
        podCount: 0,
        errorType: 'timeout',
        refreshing: false,
      })
    }
  })
}

// Silent fetch - updates shared cache without showing loading state
async function silentFetchClusters() {
  try {
    // Try local agent first - get cluster list quickly
    const agentClusters = await fetchClusterListFromAgent()
    if (agentClusters) {
      // Preserve existing detected distribution and namespaces
      const existingClusters = clusterCache.clusters
      const mergedClusters = agentClusters.map(newCluster => {
        const existing = existingClusters.find(c => c.name === newCluster.name)
        if (existing) {
          return {
            ...newCluster,
            // Preserve detected distribution and namespaces
            distribution: existing.distribution,
            namespaces: existing.namespaces,
            // Preserve health data if available
            ...(existing.nodeCount !== undefined ? {
              nodeCount: existing.nodeCount,
              podCount: existing.podCount,
              cpuCores: existing.cpuCores,
              memoryGB: existing.memoryGB,
              storageGB: existing.storageGB,
              healthy: existing.healthy,
              reachable: existing.reachable,
            } : {}),
          }
        }
        return newCluster
      })
      updateClusterCache({
        clusters: mergedClusters,
        error: null,
        lastUpdated: new Date(),
      })
      // Check health progressively (non-blocking)
      checkHealthProgressively(agentClusters)
      return
    }
    // Fall back to backend API
    const { data } = await api.get<{ clusters: ClusterInfo[] }>('/api/mcp/clusters')
    // Preserve existing distribution data
    const existingClusters = clusterCache.clusters
    const mergedClusters = (data.clusters || []).map(newCluster => {
      const existing = existingClusters.find(c => c.name === newCluster.name)
      if (existing?.distribution) {
        return { ...newCluster, distribution: existing.distribution, namespaces: existing.namespaces }
      }
      return newCluster
    })
    updateClusterCache({
      clusters: mergedClusters,
      error: null,
      lastUpdated: new Date(),
    })
  } catch (err) {
    // On silent fetch, don't replace with demo data - keep existing
    console.error('Silent fetch failed:', err)
  }
}

// Track if a fetch is in progress to prevent duplicate requests
let fetchInProgress = false

// Full refetch - updates shared cache with loading state
// Deduplicates concurrent calls - only one fetch runs at a time
async function fullFetchClusters() {
  // If demo mode is enabled, use demo data instead of fetching
  if (getDemoMode()) {
    updateClusterCache({
      clusters: getDemoClusters(),
      isLoading: false,
      isRefreshing: false,
      error: null,
    })
    return
  }

  // If a fetch is already in progress, skip this call (deduplication)
  if (fetchInProgress) {
    return
  }
  fetchInProgress = true

  // If we have cached data, show refreshing; otherwise show loading
  const hasCachedData = clusterCache.clusters.length > 0
  const startTime = Date.now()

  if (hasCachedData) {
    updateClusterCache({ isRefreshing: true })
  } else {
    updateClusterCache({ isLoading: true })
  }

  // Helper to ensure minimum visible duration for refresh animation
  const finishWithMinDuration = async (updates: Partial<typeof clusterCache>) => {
    const elapsed = Date.now() - startTime
    const minDuration = hasCachedData ? 400 : 0 // Only delay when refreshing, not initial load
    if (elapsed < minDuration) {
      await new Promise(resolve => setTimeout(resolve, minDuration - elapsed))
    }
    updateClusterCache(updates)
  }

  try {
    // Try local agent first - get cluster list quickly
    const agentClusters = await fetchClusterListFromAgent()
    if (agentClusters) {
      // Merge new cluster list with existing cached health data (preserve stats during refresh)
      const existingClusters = clusterCache.clusters
      const mergedClusters = agentClusters.map(newCluster => {
        const existing = existingClusters.find(c => c.name === newCluster.name)
        if (existing) {
          // Preserve existing health data and detected distribution during refresh
          return {
            ...newCluster,
            // Always preserve detected distribution and namespaces
            distribution: existing.distribution,
            namespaces: existing.namespaces,
            // Preserve health data if available
            ...(existing.nodeCount !== undefined ? {
              nodeCount: existing.nodeCount,
              podCount: existing.podCount,
              cpuCores: existing.cpuCores,
              memoryGB: existing.memoryGB,
              storageGB: existing.storageGB,
              healthy: existing.healthy,
              reachable: existing.reachable,
            } : {}),
            refreshing: false, // Keep false during background polling - no visual indicator
          }
        }
        return newCluster
      })
      // Show clusters immediately with preserved health data
      await finishWithMinDuration({
        clusters: mergedClusters,
        error: null,
        lastUpdated: new Date(),
        isLoading: false,
        isRefreshing: false,
        consecutiveFailures: 0,
        isFailed: false,
        lastRefresh: new Date(),
      })
      // Reset flag before returning - allows subsequent refresh calls
      fetchInProgress = false
      // Check health progressively (non-blocking) - will update each cluster's data
      checkHealthProgressively(agentClusters)
      return
    }
    // Fall back to backend API
    const { data } = await api.get<{ clusters: ClusterInfo[] }>('/api/mcp/clusters')
    // Merge new cluster list with existing cached data (preserve distribution, health, etc.)
    const existingClusters = clusterCache.clusters
    const mergedClusters = (data.clusters || []).map(newCluster => {
      const existing = existingClusters.find(c => c.name === newCluster.name)
      if (existing) {
        return {
          ...newCluster,
          // Preserve detected distribution and namespaces
          distribution: existing.distribution,
          namespaces: existing.namespaces,
          // Preserve health data if available
          ...(existing.nodeCount !== undefined ? {
            nodeCount: existing.nodeCount,
            podCount: existing.podCount,
            cpuCores: existing.cpuCores,
            memoryGB: existing.memoryGB,
            storageGB: existing.storageGB,
            healthy: existing.healthy,
            reachable: existing.reachable,
          } : {}),
        }
      }
      return newCluster
    })
    await finishWithMinDuration({
      clusters: mergedClusters,
      error: null,
      lastUpdated: new Date(),
      isLoading: false,
      isRefreshing: false,
      consecutiveFailures: 0,
      isFailed: false,
      lastRefresh: new Date(),
    })
    fetchInProgress = false
  } catch (err) {
    const newFailures = clusterCache.consecutiveFailures + 1
    await finishWithMinDuration({
      error: 'Failed to fetch clusters',
      clusters: clusterCache.clusters.length > 0 ? clusterCache.clusters : getDemoClusters(),
      isLoading: false,
      isRefreshing: false,
      consecutiveFailures: newFailures,
      isFailed: newFailures >= 3,
      lastRefresh: new Date(),
    })
    fetchInProgress = false
  }
}

// Refresh health for a single cluster (exported for use in components)
// Keeps cached values visible while refreshing - only updates surgically when new data is available
export async function refreshSingleCluster(clusterName: string): Promise<void> {
  // Mark the cluster as refreshing immediately (no debounce - user needs to see the spinner)
  clusterCache = {
    ...clusterCache,
    clusters: clusterCache.clusters.map(c =>
      c.name === clusterName ? { ...c, refreshing: true } : c
    ),
  }
  notifyClusterSubscribers() // Immediate notification for user feedback

  const health = await fetchSingleClusterHealth(clusterName)

  if (health) {
    // Health data available - cluster is reachable if we got a response
    // Only mark unreachable if explicitly set to false by backend
    const isReachable = health.reachable !== false
    updateSingleClusterInCache(clusterName, {
      healthy: health.healthy,
      reachable: isReachable,
      nodeCount: health.nodeCount,
      podCount: health.podCount,
      cpuCores: health.cpuCores,
      cpuRequestsCores: health.cpuRequestsCores,
      // Memory/storage metrics
      memoryBytes: health.memoryBytes,
      memoryGB: health.memoryGB,
      memoryRequestsGB: health.memoryRequestsGB,
      storageBytes: health.storageBytes,
      storageGB: health.storageGB,
      pvcCount: health.pvcCount,
      pvcBoundCount: health.pvcBoundCount,
      errorType: health.errorType,
      errorMessage: health.errorMessage,
      refreshing: false,
    })
  } else {
    // No health data or timeout - cluster is unreachable
    // Keep existing cached values for nodes/pods/cpus, just update reachability status
    updateSingleClusterInCache(clusterName, {
      healthy: false,
      reachable: false,
      errorType: 'timeout',
      refreshing: false,
    })
  }
}

// Hook to list clusters with WebSocket support for real-time updates
// Uses shared state so all consumers see the same data
// Uses progressive loading - shows clusters immediately, then updates health individually
export function useClusters() {
  // Local state that syncs with shared cache
  const [localState, setLocalState] = useState<ClusterCache>(clusterCache)
  // Track demo mode to re-fetch when it changes
  const { isDemoMode } = useDemoMode()

  // Subscribe to shared cache updates
  useEffect(() => {
    // Set initial state from cache
    setLocalState(clusterCache)

    // Subscribe to updates
    const handleUpdate = (cache: ClusterCache) => {
      setLocalState(cache)
    }
    clusterSubscribers.add(handleUpdate)

    return () => {
      clusterSubscribers.delete(handleUpdate)
    }
  }, [])

  // Re-fetch when demo mode changes
  useEffect(() => {
    // Reset fetch flag to allow re-fetching
    initialFetchStarted = false
    fullFetchClusters()
    // Also refetch GPU nodes
    fetchGPUNodes()
  }, [isDemoMode])

  // Trigger initial fetch only once (shared across all hook instances)
  useEffect(() => {
    if (!initialFetchStarted) {
      initialFetchStarted = true
      fullFetchClusters()

      // Connect to WebSocket for real-time kubeconfig change notifications
      // Only attempt WebSocket on localhost (dev mode) - deployed versions don't have a backend
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      if (!isLocalhost) {
        return
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//localhost:8080/ws`
      let ws: WebSocket | null = null

      const connect = () => {
        ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          // Send authentication as first message (more secure than query param)
          const token = localStorage.getItem('token')
          if (token && ws) {
            ws.send(JSON.stringify({ type: 'auth', token }))
          }
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)

            // Handle authentication confirmation
            if (message.type === 'authenticated') {
              console.log('WebSocket authenticated for cluster updates')
              return
            }

            // Handle error messages
            if (message.type === 'error') {
              console.error('WebSocket error:', message.data?.message)
              ws?.close()
              return
            }

            // Handle kubeconfig change notifications
            if (message.type === 'kubeconfig_changed') {
              console.log('Kubeconfig changed, updating clusters...')
              silentFetchClusters()
            }
          } catch (e) {
            // Ignore non-JSON messages
          }
        }

        ws.onclose = () => {
          console.log('WebSocket disconnected, reconnecting in 5s...')
          setTimeout(connect, 5000)
        }

        ws.onerror = (err) => {
          console.error('WebSocket error:', err)
          ws?.close()
        }
      }

      connect()

      // Note: We intentionally don't clean up WebSocket here
      // because we want to keep the connection alive for the entire app session
    }
  }, [])

  // Refetch function that consumers can call
  const refetch = useCallback(() => {
    fullFetchClusters()
  }, [])

  return {
    clusters: localState.clusters,
    isLoading: localState.isLoading,
    isRefreshing: localState.isRefreshing,
    lastUpdated: localState.lastUpdated,
    error: localState.error,
    refetch,
    consecutiveFailures: localState.consecutiveFailures,
    isFailed: localState.isFailed,
    lastRefresh: localState.lastRefresh,
  }
}

// Hook to get cluster health
export function useClusterHealth(cluster?: string) {
  const [health, setHealth] = useState<ClusterHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      setHealth(getDemoHealth(cluster))
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    try {
      const url = cluster ? `/api/mcp/clusters/${cluster}/health` : '/api/mcp/clusters/health'
      const { data } = await api.get<ClusterHealth>(url)
      setHealth(data)
      setError(null)
    } catch (err) {
      setError('Failed to fetch cluster health')
      setHealth(getDemoHealth(cluster))
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { health, isLoading, error, refetch }
}

// Module-level cache for pods data (persists across navigation)
const PODS_CACHE_KEY = 'kubestellar-pods-cache'

interface PodsCache {
  data: PodInfo[]
  timestamp: Date
  key: string
}

let podsCache: PodsCache | null = null

// Load pods cache from localStorage on startup
function loadPodsCacheFromStorage(cacheKey: string): { data: PodInfo[], timestamp: Date } | null {
  try {
    const stored = localStorage.getItem(PODS_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && parsed.data && parsed.data.length > 0) {
        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date()
        podsCache = { data: parsed.data, timestamp, key: cacheKey }
        return { data: parsed.data, timestamp }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function savePodsCacheToStorage() {
  if (podsCache) {
    try {
      localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
        data: podsCache.data,
        timestamp: podsCache.timestamp.toISOString(),
        key: podsCache.key
      }))
    } catch {
      // Ignore storage errors
    }
  }
}

// Hook to get pods with localStorage-backed caching
export function usePods(cluster?: string, namespace?: string, sortBy: 'restarts' | 'name' = 'restarts', limit = 10) {
  const cacheKey = `pods:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (podsCache && podsCache.key === cacheKey) {
      return { data: podsCache.data, timestamp: podsCache.timestamp }
    }
    // Try loading from localStorage
    return loadPodsCacheFromStorage(cacheKey)
  }

  const cached = getCachedData()
  const [pods, setPods] = useState<PodInfo[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      setIsRefreshing(true)
      const hasCachedData = podsCache && podsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ pods: PodInfo[] }>(`/api/mcp/pods?${params}`)
      let sortedPods = data.pods || []

      // Sort by restarts (descending) or name
      if (sortBy === 'restarts') {
        sortedPods = sortedPods.sort((a, b) => b.restarts - a.restarts)
      } else {
        sortedPods = sortedPods.sort((a, b) => a.name.localeCompare(b.name))
      }

      // Store all pods in cache (before limiting) so GPU workloads can use the full list
      const now = new Date()
      podsCache = { data: sortedPods, timestamp: now, key: cacheKey }
      savePodsCacheToStorage()

      // Limit results for display
      setPods(sortedPods.slice(0, limit))
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      // Keep stale data on error - don't fall back to demo
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !podsCache) {
        setError('Failed to fetch pods')
        setPods(getDemoPods())
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, sortBy, limit, cacheKey])

  useEffect(() => {
    const hasCachedData = podsCache && podsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll for pod updates
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return {
    pods,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// Hook to get ALL pods (no limit) - for components that need to search all pods
// This uses the same cache as usePods but returns all pods without limiting
export function useAllPods(cluster?: string, namespace?: string) {
  const cacheKey = `pods:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (podsCache && podsCache.key === cacheKey) {
      return { data: podsCache.data, timestamp: podsCache.timestamp }
    }
    return loadPodsCacheFromStorage(cacheKey)
  }

  const cached = getCachedData()
  const [pods, setPods] = useState<PodInfo[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async (silent = false) => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoPods = getDemoAllPods().filter(p =>
        (!cluster || p.cluster === cluster) && (!namespace || p.namespace === namespace)
      )
      setPods(demoPods)
      setIsLoading(false)
      setError(null)
      setLastUpdated(new Date())
      return
    }
    if (!silent) {
      const hasCachedData = podsCache && podsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ pods: PodInfo[] }>(`/api/mcp/pods?${params}`)
      const allPods = data.pods || []
      const now = new Date()

      // Update module-level cache with all pods
      podsCache = { data: allPods, timestamp: now, key: cacheKey }
      savePodsCacheToStorage()

      setPods(allPods)
      setError(null)
      setLastUpdated(now)
    } catch (err) {
      // Keep stale data on error, fallback to demo data if no cache
      if (!silent && !podsCache) {
        setError('Failed to fetch pods')
        setPods(getDemoAllPods().filter(p =>
          (!cluster || p.cluster === cluster) && (!namespace || p.namespace === namespace)
        ))
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    const hasCachedData = podsCache && podsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll for pod updates
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return { pods, isLoading, isRefreshing, lastUpdated, error, refetch: () => refetch(false) }
}

// Module-level cache for pod issues data (persists across navigation)
interface PodIssuesCache {
  data: PodIssue[]
  timestamp: Date
  key: string
}
let podIssuesCache: PodIssuesCache | null = null

// Hook to get pod issues
export function usePodIssues(cluster?: string, namespace?: string) {
  const cacheKey = `podIssues:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (podIssuesCache && podIssuesCache.key === cacheKey) {
      return { data: podIssuesCache.data, timestamp: podIssuesCache.timestamp }
    }
    return null
  }

  const cached = getCachedData()
  const [issues, setIssues] = useState<PodIssue[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      const hasCachedData = podIssuesCache && podIssuesCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ issues: PodIssue[] }>(`/api/mcp/pod-issues?${params}`)
      const newData = data.issues || []
      const now = new Date()

      // Update module-level cache
      podIssuesCache = { data: newData, timestamp: now, key: cacheKey }

      setIssues(newData)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      // Keep stale data, only use demo if no cached data
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !podIssuesCache) {
        setError('Failed to fetch pod issues')
        setIssues(getDemoPodIssues())
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    const hasCachedData = podIssuesCache && podIssuesCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll every 30 seconds for pod issue updates
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return {
    issues,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// Hook to get events
// Module-level cache for events data (persists across navigation)
interface EventsCache {
  data: ClusterEvent[]
  timestamp: Date
  key: string
}
let eventsCache: EventsCache | null = null

export function useEvents(cluster?: string, namespace?: string, limit = 20) {
  const cacheKey = `events:${cluster || 'all'}:${namespace || 'all'}:${limit}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (eventsCache && eventsCache.key === cacheKey) {
      return { data: eventsCache.data, timestamp: eventsCache.timestamp }
    }
    return null
  }

  const cached = getCachedData()
  const [events, setEvents] = useState<ClusterEvent[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      const hasCachedData = eventsCache && eventsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      params.append('limit', limit.toString())
      const { data } = await api.get<{ events: ClusterEvent[] }>(`/api/mcp/events?${params}`)
      const newData = data.events || []
      const now = new Date()

      // Update module-level cache
      eventsCache = { data: newData, timestamp: now, key: cacheKey }

      setEvents(newData)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      // Keep stale data, only use demo if no cached data
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !eventsCache) {
        setError('Failed to fetch events')
        setEvents(getDemoEvents())
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, limit, cacheKey])

  useEffect(() => {
    const hasCachedData = eventsCache && eventsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll every 30 seconds for events
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return {
    events,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// Module-level cache for deployment issues data (persists across navigation)
interface DeploymentIssuesCache {
  data: DeploymentIssue[]
  timestamp: Date
  key: string
}
let deploymentIssuesCache: DeploymentIssuesCache | null = null

// Hook to get deployment issues
export function useDeploymentIssues(cluster?: string, namespace?: string) {
  const cacheKey = `deploymentIssues:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (deploymentIssuesCache && deploymentIssuesCache.key === cacheKey) {
      return { data: deploymentIssuesCache.data, timestamp: deploymentIssuesCache.timestamp }
    }
    return null
  }

  const cached = getCachedData()
  const [issues, setIssues] = useState<DeploymentIssue[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      const hasCachedData = deploymentIssuesCache && deploymentIssuesCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ issues: DeploymentIssue[] }>(`/api/mcp/deployment-issues?${params}`)
      const newData = data.issues || []
      const now = new Date()

      // Update module-level cache
      deploymentIssuesCache = { data: newData, timestamp: now, key: cacheKey }

      setIssues(newData)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      // Keep stale data, only use demo if no cached data
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !deploymentIssuesCache) {
        setError('Failed to fetch deployment issues')
        setIssues(getDemoDeploymentIssues())
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    const hasCachedData = deploymentIssuesCache && deploymentIssuesCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll every 30 seconds for deployment issues
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return {
    issues,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// Module-level cache for deployments data (persists across navigation)
interface DeploymentsCache {
  data: Deployment[]
  timestamp: Date
  key: string
}
let deploymentsCache: DeploymentsCache | null = null

// Hook to get deployments with rollout status
export function useDeployments(cluster?: string, namespace?: string) {
  const cacheKey = `deployments:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available and matches current key
  const getCachedData = () => {
    if (deploymentsCache && deploymentsCache.key === cacheKey) {
      return { data: deploymentsCache.data, timestamp: deploymentsCache.timestamp }
    }
    return null
  }

  const cached = getCachedData()
  const [deployments, setDeployments] = useState<Deployment[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent && (!deploymentsCache || deploymentsCache.key !== cacheKey)) {
      // Only show loading if no cache
      setIsLoading(true)
    } else if (!silent) {
      setIsRefreshing(true)
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ deployments: Deployment[] }>(`/api/mcp/deployments?${params}`)
      const newDeployments = data.deployments || []
      setDeployments(newDeployments)
      setError(null)
      const now = new Date()
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
      // Update cache
      deploymentsCache = { data: newDeployments, timestamp: now, key: cacheKey }
    } catch (err) {
      // Only set demo data if no cache exists
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !deploymentsCache) {
        setError('Failed to fetch deployments')
        setDeployments(getDemoDeployments())
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    // If we have cached data, do a silent refresh
    const hasCachedData = deploymentsCache && deploymentsCache.key === cacheKey
    refetch(hasCachedData ? true : false)
    // Poll every 30 seconds for deployment updates
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return {
    deployments,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// Module-level cache for services data (persists across navigation)
const SERVICES_CACHE_KEY = 'kubestellar-services-cache'

interface ServicesCache {
  data: Service[]
  timestamp: Date
  key: string
}
let servicesCache: ServicesCache | null = null

// Load services cache from localStorage
function loadServicesCacheFromStorage(cacheKey: string): { data: Service[], timestamp: Date } | null {
  try {
    const stored = localStorage.getItem(SERVICES_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && parsed.data && parsed.data.length > 0) {
        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date()
        servicesCache = { data: parsed.data, timestamp, key: cacheKey }
        return { data: parsed.data, timestamp }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function saveServicesCacheToStorage() {
  if (servicesCache) {
    try {
      localStorage.setItem(SERVICES_CACHE_KEY, JSON.stringify({
        data: servicesCache.data,
        timestamp: servicesCache.timestamp.toISOString(),
        key: servicesCache.key
      }))
    } catch {
      // Ignore storage errors
    }
  }
}

// Hook to get services with localStorage-backed caching
export function useServices(cluster?: string, namespace?: string) {
  const cacheKey = `services:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available and matches current key
  const getCachedData = () => {
    if (servicesCache && servicesCache.key === cacheKey) {
      return { data: servicesCache.data, timestamp: servicesCache.timestamp }
    }
    return loadServicesCacheFromStorage(cacheKey)
  }

  const cached = getCachedData()
  const [services, setServices] = useState<Service[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)

  const refetch = useCallback(async (silent = false) => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoServices = getDemoServices().filter(s =>
        (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace)
      )
      setServices(demoServices)
      setIsLoading(false)
      setError(null)
      setLastUpdated(new Date())
      setConsecutiveFailures(0)
      setLastRefresh(new Date())
      return
    }
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      // Only show loading if we have no data
      const hasCachedData = servicesCache && servicesCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ services: Service[] }>(`/api/mcp/services?${params}`)
      const newData = data.services || []
      const now = new Date()

      // Update module-level cache and persist to localStorage
      servicesCache = { data: newData, timestamp: now, key: cacheKey }
      saveServicesCacheToStorage()

      setServices(newData)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent) {
        setError('Failed to fetch services')
        // Fall back to demo data on error if no cached data
        if (services.length === 0) {
          setServices(getDemoServices().filter(s =>
            (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace)
          ))
        }
      }
      // Don't clear services on error - keep stale data
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey, services.length])

  useEffect(() => {
    // If we have cached data, still refresh in background but don't show loading
    const hasCachedData = servicesCache && servicesCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data

    // Poll every 30 seconds for service updates
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return {
    services,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// Hook to get jobs
export function useJobs(cluster?: string, namespace?: string) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ jobs: Job[] }>(`/api/mcp/jobs?${params}`)
      setJobs(data.jobs || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch jobs')
      setJobs([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { jobs, isLoading, error, refetch }
}

// Hook to get HPAs
export function useHPAs(cluster?: string, namespace?: string) {
  const [hpas, setHPAs] = useState<HPA[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ hpas: HPA[] }>(`/api/mcp/hpas?${params}`)
      setHPAs(data.hpas || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch HPAs')
      setHPAs([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { hpas, isLoading, error, refetch }
}

// Hook to get ConfigMaps
export function useConfigMaps(cluster?: string, namespace?: string) {
  const [configmaps, setConfigMaps] = useState<ConfigMap[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoConfigMaps = getDemoConfigMaps().filter(cm =>
        (!cluster || cm.cluster === cluster) && (!namespace || cm.namespace === namespace)
      )
      setConfigMaps(demoConfigMaps)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ configmaps: ConfigMap[] }>(`/api/mcp/configmaps?${params}`)
      setConfigMaps(data.configmaps || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch ConfigMaps')
      // Fallback to demo data on error
      setConfigMaps(getDemoConfigMaps().filter(cm =>
        (!cluster || cm.cluster === cluster) && (!namespace || cm.namespace === namespace)
      ))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { configmaps, isLoading, error, refetch }
}

// Hook to get Secrets
export function useSecrets(cluster?: string, namespace?: string) {
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoSecrets = getDemoSecrets().filter(s =>
        (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace)
      )
      setSecrets(demoSecrets)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ secrets: Secret[] }>(`/api/mcp/secrets?${params}`)
      setSecrets(data.secrets || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch Secrets')
      // Fallback to demo data on error
      setSecrets(getDemoSecrets().filter(s =>
        (!cluster || s.cluster === cluster) && (!namespace || s.namespace === namespace)
      ))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { secrets, isLoading, error, refetch }
}

// Hook to get service accounts
export function useServiceAccounts(cluster?: string, namespace?: string) {
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoSAs = getDemoServiceAccounts().filter(sa =>
        (!cluster || sa.cluster === cluster) && (!namespace || sa.namespace === namespace)
      )
      setServiceAccounts(demoSAs)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ serviceAccounts: ServiceAccount[] }>(`/api/mcp/serviceaccounts?${params}`)
      setServiceAccounts(data.serviceAccounts || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch ServiceAccounts')
      // Fallback to demo data on error
      setServiceAccounts(getDemoServiceAccounts().filter(sa =>
        (!cluster || sa.cluster === cluster) && (!namespace || sa.namespace === namespace)
      ))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { serviceAccounts, isLoading, error, refetch }
}

// Module-level cache for PVCs data (persists across navigation)
const PVCS_CACHE_KEY = 'kubestellar-pvcs-cache'

interface PVCsCache {
  data: PVC[]
  timestamp: Date
  key: string
}

let pvcsCache: PVCsCache | null = null

// Load PVCs cache from localStorage
function loadPVCsCacheFromStorage(cacheKey: string): { data: PVC[], timestamp: Date } | null {
  try {
    const stored = localStorage.getItem(PVCS_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && parsed.data && parsed.data.length > 0) {
        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date()
        pvcsCache = { data: parsed.data, timestamp, key: cacheKey }
        return { data: parsed.data, timestamp }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function savePVCsCacheToStorage() {
  if (pvcsCache) {
    try {
      localStorage.setItem(PVCS_CACHE_KEY, JSON.stringify({
        data: pvcsCache.data,
        timestamp: pvcsCache.timestamp.toISOString(),
        key: pvcsCache.key
      }))
    } catch {
      // Ignore storage errors
    }
  }
}

// Hook to get PVCs with localStorage-backed caching
export function usePVCs(cluster?: string, namespace?: string) {
  const cacheKey = `pvcs:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (pvcsCache && pvcsCache.key === cacheKey) {
      return { data: pvcsCache.data, timestamp: pvcsCache.timestamp }
    }
    return loadPVCsCacheFromStorage(cacheKey)
  }

  const cached = getCachedData()
  const [pvcs, setPVCs] = useState<PVC[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)

  const refetch = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true)
    }
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoPVCs = getDemoPVCs().filter(p =>
        (!cluster || p.cluster === cluster) && (!namespace || p.namespace === namespace)
      )
      setPVCs(demoPVCs)
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      setLastUpdated(new Date())
      return
    }
    if (!silent) {
      const hasCachedData = pvcsCache && pvcsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ pvcs: PVC[] }>(`/api/mcp/pvcs?${params}`)
      const newData = data.pvcs || []
      const now = new Date()

      // Update module-level cache
      pvcsCache = { data: newData, timestamp: now, key: cacheKey }
      savePVCsCacheToStorage()

      setPVCs(newData)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      // Keep stale data on error, fallback to demo data if no cache
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !pvcsCache) {
        setError('Failed to fetch PVCs')
        setPVCs(getDemoPVCs().filter(p =>
          (!cluster || p.cluster === cluster) && (!namespace || p.namespace === namespace)
        ))
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    const hasCachedData = pvcsCache && pvcsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll for PVC updates
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return {
    pvcs,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// Hook to get PVs (PersistentVolumes)
export function usePVs(cluster?: string) {
  const [pvs, setPVs] = useState<PV[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      const { data } = await api.get<{ pvs: PV[] }>(`/api/mcp/pvs?${params}`)
      setPVs(data.pvs || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch PVs')
      setPVs([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch])

  return { pvs, isLoading, error, refetch }
}

// Hook to get ResourceQuotas
export function useResourceQuotas(cluster?: string, namespace?: string) {
  const [resourceQuotas, setResourceQuotas] = useState<ResourceQuota[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoQuotas = getDemoResourceQuotas().filter(q =>
        (!cluster || q.cluster === cluster) && (!namespace || q.namespace === namespace)
      )
      setResourceQuotas(demoQuotas)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ resourceQuotas: ResourceQuota[] }>(`/api/mcp/resourcequotas?${params}`)
      setResourceQuotas(data.resourceQuotas || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch ResourceQuotas')
      // Don't fall back to demo data - show empty instead
      setResourceQuotas([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch])

  return { resourceQuotas, isLoading, error, refetch }
}

// Hook to get LimitRanges
export function useLimitRanges(cluster?: string, namespace?: string) {
  const [limitRanges, setLimitRanges] = useState<LimitRange[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoRanges = getDemoLimitRanges().filter(lr =>
        (!cluster || lr.cluster === cluster) && (!namespace || lr.namespace === namespace)
      )
      setLimitRanges(demoRanges)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ limitRanges: LimitRange[] }>(`/api/mcp/limitranges?${params}`)
      setLimitRanges(data.limitRanges || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch LimitRanges')
      // Don't fall back to demo data - show empty instead
      setLimitRanges([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch])

  return { limitRanges, isLoading, error, refetch }
}

// Interface for creating/updating ResourceQuotas
export interface ResourceQuotaSpec {
  cluster: string
  name: string
  namespace: string
  hard: Record<string, string>
  labels?: Record<string, string>
}

// Create or update a ResourceQuota
export async function createOrUpdateResourceQuota(spec: ResourceQuotaSpec): Promise<ResourceQuota> {
  const { data } = await api.post<{ resourceQuota: ResourceQuota }>('/api/mcp/resourcequotas', spec)
  return data.resourceQuota
}

// Delete a ResourceQuota
export async function deleteResourceQuota(cluster: string, namespace: string, name: string): Promise<void> {
  await api.delete(`/api/mcp/resourcequotas?cluster=${cluster}&namespace=${namespace}&name=${name}`)
}

// Common GPU resource types for quotas
export const GPU_RESOURCE_TYPES = [
  { key: 'requests.nvidia.com/gpu', label: 'NVIDIA GPU Requests', description: 'Maximum GPUs that can be requested' },
  { key: 'limits.nvidia.com/gpu', label: 'NVIDIA GPU Limits', description: 'Maximum GPU limits allowed' },
  { key: 'requests.amd.com/gpu', label: 'AMD GPU Requests', description: 'Maximum AMD GPUs that can be requested' },
  { key: 'limits.amd.com/gpu', label: 'AMD GPU Limits', description: 'Maximum AMD GPU limits allowed' },
] as const

// Common resource types for quotas
export const COMMON_RESOURCE_TYPES = [
  { key: 'requests.cpu', label: 'CPU Requests', description: 'Total CPU requests allowed' },
  { key: 'limits.cpu', label: 'CPU Limits', description: 'Total CPU limits allowed' },
  { key: 'requests.memory', label: 'Memory Requests', description: 'Total memory requests allowed' },
  { key: 'limits.memory', label: 'Memory Limits', description: 'Total memory limits allowed' },
  { key: 'pods', label: 'Pods', description: 'Maximum number of pods' },
  { key: 'services', label: 'Services', description: 'Maximum number of services' },
  { key: 'persistentvolumeclaims', label: 'PVCs', description: 'Maximum number of PVCs' },
  { key: 'requests.storage', label: 'Storage Requests', description: 'Total storage that can be requested' },
  ...GPU_RESOURCE_TYPES,
] as const

// Hook to get pod logs
export function usePodLogs(cluster: string, namespace: string, pod: string, container?: string, tail = 100) {
  const [logs, setLogs] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!cluster || !namespace || !pod) return
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.append('cluster', cluster)
      params.append('namespace', namespace)
      params.append('pod', pod)
      if (container) params.append('container', container)
      params.append('tail', tail.toString())
      const { data } = await api.get<{ logs: string }>(`/api/mcp/pods/logs?${params}`)
      setLogs(data.logs || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs')
      setLogs('')
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, pod, container, tail])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { logs, isLoading, error, refetch }
}

// Hook to get warning events
// Module-level cache for warning events data (persists across navigation)
interface WarningEventsCache {
  data: ClusterEvent[]
  timestamp: Date
  key: string
}
let warningEventsCache: WarningEventsCache | null = null

export function useWarningEvents(cluster?: string, namespace?: string, limit = 20) {
  const cacheKey = `warningEvents:${cluster || 'all'}:${namespace || 'all'}:${limit}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (warningEventsCache && warningEventsCache.key === cacheKey) {
      return { data: warningEventsCache.data, timestamp: warningEventsCache.timestamp }
    }
    return null
  }

  const cached = getCachedData()
  const [events, setEvents] = useState<ClusterEvent[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      const hasCachedData = warningEventsCache && warningEventsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      params.append('limit', limit.toString())
      const { data } = await api.get<{ events: ClusterEvent[] }>(`/api/mcp/events/warnings?${params}`)
      const newData = data.events || []
      const now = new Date()

      // Update module-level cache
      warningEventsCache = { data: newData, timestamp: now, key: cacheKey }

      setEvents(newData)
      setError(null)
      setLastUpdated(now)
    } catch (err) {
      // Keep stale data, only use demo if no cached data
      if (!silent && !warningEventsCache) {
        setError('Failed to fetch warning events')
        setEvents(getDemoEvents().filter(e => e.type === 'Warning'))
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, limit, cacheKey])

  useEffect(() => {
    const hasCachedData = warningEventsCache && warningEventsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll every 30 seconds for events
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  return { events, isLoading, isRefreshing, lastUpdated, error, refetch: () => refetch(false) }
}

// Module-level cache for GPU nodes (persists across navigation)
interface GPUNodeCache {
  nodes: GPUNode[]
  lastUpdated: Date | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  consecutiveFailures: number
  lastRefresh: Date | null
}

// Try to restore GPU cache from localStorage for instant display on page load
const GPU_CACHE_KEY = 'kubestellar-gpu-cache'
function loadGPUCacheFromStorage(): GPUNodeCache {
  try {
    const stored = localStorage.getItem(GPU_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.nodes && parsed.nodes.length > 0) {
        return {
          nodes: parsed.nodes,
          lastUpdated: parsed.lastUpdated ? new Date(parsed.lastUpdated) : null,
          isLoading: false,
          isRefreshing: false,
          error: null,
          consecutiveFailures: 0,
          lastRefresh: parsed.lastUpdated ? new Date(parsed.lastUpdated) : null,
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { nodes: [], lastUpdated: null, isLoading: false, isRefreshing: false, error: null, consecutiveFailures: 0, lastRefresh: null }
}

function saveGPUCacheToStorage(cache: GPUNodeCache) {
  try {
    if (cache.nodes.length > 0) {
      localStorage.setItem(GPU_CACHE_KEY, JSON.stringify({
        nodes: cache.nodes,
        lastUpdated: cache.lastUpdated?.toISOString(),
      }))
    }
  } catch {
    // Ignore storage errors
  }
}

let gpuNodeCache: GPUNodeCache = loadGPUCacheFromStorage()

const gpuNodeSubscribers = new Set<(cache: GPUNodeCache) => void>()

function notifyGPUNodeSubscribers() {
  gpuNodeSubscribers.forEach(subscriber => subscriber(gpuNodeCache))
}

function updateGPUNodeCache(updates: Partial<GPUNodeCache>) {
  gpuNodeCache = { ...gpuNodeCache, ...updates }
  // Persist to localStorage when nodes are updated
  if (updates.nodes !== undefined) {
    saveGPUCacheToStorage(gpuNodeCache)
  }
  notifyGPUNodeSubscribers()
}

// Fetch GPU nodes (shared across all consumers)
let gpuFetchInProgress = false
async function fetchGPUNodes(cluster?: string) {
  // If demo mode is enabled, use demo data instead of fetching
  if (getDemoMode()) {
    updateGPUNodeCache({
      nodes: getDemoGPUNodes(),
      lastUpdated: new Date(),
      isLoading: false,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: new Date(),
    })
    return
  }

  if (gpuFetchInProgress) return
  gpuFetchInProgress = true

  // Show loading only if no cached data, otherwise show refreshing
  if (gpuNodeCache.nodes.length === 0) {
    updateGPUNodeCache({ isLoading: true, isRefreshing: false })
  } else {
    updateGPUNodeCache({ isLoading: false, isRefreshing: true })
  }

  try {
    const params = new URLSearchParams()
    if (cluster) params.append('cluster', cluster)
    const { data } = await api.get<{ nodes: GPUNode[] }>(`/api/mcp/gpu-nodes?${params}`)
    const newNodes = data.nodes || []

    // If API returns empty but we have cached data, preserve the cache
    // This prevents GPU count from going to zero during network issues or slow refreshes
    if (newNodes.length === 0 && gpuNodeCache.nodes.length > 0) {
      updateGPUNodeCache({
        lastUpdated: new Date(),
        isLoading: false,
        isRefreshing: false,
        error: null,
        consecutiveFailures: 0,
        lastRefresh: new Date(),
      })
    } else {
      updateGPUNodeCache({
        nodes: newNodes,
        lastUpdated: new Date(),
        isLoading: false,
        isRefreshing: false,
        error: null,
        consecutiveFailures: 0,
        lastRefresh: new Date(),
      })
    }
  } catch (err) {
    const newFailures = gpuNodeCache.consecutiveFailures + 1
    // On error, preserve existing cached data or use demo data
    if (gpuNodeCache.nodes.length === 0) {
      updateGPUNodeCache({
        nodes: getDemoGPUNodes(),
        isLoading: false,
        isRefreshing: false,
        error: 'Failed to fetch GPU nodes',
        consecutiveFailures: newFailures,
        lastRefresh: new Date(),
      })
    } else {
      // Preserve existing cache on error
      updateGPUNodeCache({
        isLoading: false,
        isRefreshing: false,
        error: 'Failed to refresh GPU nodes',
        consecutiveFailures: newFailures,
        lastRefresh: new Date(),
      })
    }
  } finally {
    gpuFetchInProgress = false
  }
}

// Hook to get GPU nodes with shared caching
export function useGPUNodes(cluster?: string) {
  const [state, setState] = useState<GPUNodeCache>(gpuNodeCache)

  useEffect(() => {
    // Subscribe to cache updates
    const handleUpdate = (cache: GPUNodeCache) => setState(cache)
    gpuNodeSubscribers.add(handleUpdate)

    // Fetch if cache is empty or stale (older than 30 seconds)
    const isStale = !gpuNodeCache.lastUpdated ||
      (Date.now() - gpuNodeCache.lastUpdated.getTime()) > 30000
    if (gpuNodeCache.nodes.length === 0 || isStale) {
      fetchGPUNodes(cluster)
    }

    return () => {
      gpuNodeSubscribers.delete(handleUpdate)
    }
  }, [cluster])

  const refetch = useCallback(() => {
    fetchGPUNodes(cluster)
  }, [cluster])

  // Filter by cluster if specified
  const filteredNodes = cluster
    ? state.nodes.filter(n => n.cluster === cluster || n.cluster.startsWith(cluster))
    : state.nodes

  return {
    nodes: filteredNodes,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    error: state.error,
    refetch,
    consecutiveFailures: state.consecutiveFailures,
    isFailed: state.consecutiveFailures >= 3,
    lastRefresh: state.lastRefresh,
  }
}

// Hook to get detailed node information
export function useNodes(cluster?: string) {
  const [nodes, setNodes] = useState<NodeInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoNodes = getDemoNodes().filter(n => !cluster || n.cluster === cluster)
      setNodes(demoNodes)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      const { data } = await api.get<{ nodes: NodeInfo[] }>(`/api/mcp/nodes?${params}`)
      setNodes(data.nodes || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch nodes')
      // Fall back to demo data on error
      setNodes(getDemoNodes().filter(n => !cluster || n.cluster === cluster))
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { nodes, isLoading, error, refetch }
}

// Hook to get NVIDIA operator status
export function useNVIDIAOperators(cluster?: string) {
  const [operators, setOperators] = useState<NVIDIAOperatorStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      const { data } = await api.get<{ operators?: NVIDIAOperatorStatus[], operator?: NVIDIAOperatorStatus }>(`/api/mcp/nvidia-operators?${params}`)
      if (data.operators) {
        setOperators(data.operators)
      } else if (data.operator) {
        setOperators([data.operator])
      } else {
        setOperators([])
      }
      setError(null)
    } catch (err) {
      setError('Failed to fetch NVIDIA operator status')
      setOperators([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { operators, isLoading, error, refetch }
}

// Security issue types
export interface SecurityIssue {
  name: string
  namespace: string
  cluster?: string
  issue: string
  severity: 'high' | 'medium' | 'low'
  details?: string
}

// Hook to get security issues
export function useSecurityIssues(cluster?: string, namespace?: string) {
  const [issues, setIssues] = useState<SecurityIssue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      setIsRefreshing(true)
      // Only show loading spinner if no cached data
      setIssues(prev => {
        if (prev.length === 0) {
          setIsLoading(true)
        }
        return prev
      })
    }
    let hadNoData = false
    setIssues(prev => {
      hadNoData = prev.length === 0
      return prev
    })
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ issues: SecurityIssue[] }>(`/api/mcp/security-issues?${params}`)
      setIssues(data.issues || [])
      setError(null)
      const now = new Date()
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      // Only set demo data if we don't have existing data and not silent
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && hadNoData) {
        setError('Failed to fetch security issues')
        setIssues(getDemoSecurityIssues())
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
  }, [cluster, namespace]) // Only refetch on parameter changes, not on refetch function change

  return {
    issues,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch,
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
  }
}

// GitOps drift types
export interface GitOpsDrift {
  resource: string
  namespace: string
  cluster: string
  kind: string
  driftType: 'modified' | 'deleted' | 'added'
  gitVersion: string
  details?: string
  severity: 'high' | 'medium' | 'low'
}

// Hook to get GitOps drifts
export function useGitOpsDrifts(cluster?: string, namespace?: string) {
  const [drifts, setDrifts] = useState<GitOpsDrift[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      setIsRefreshing(true)
      // Only show loading spinner if no cached data
      setDrifts(prev => {
        if (prev.length === 0) {
          setIsLoading(true)
        }
        return prev
      })
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ drifts: GitOpsDrift[] }>(`/api/gitops/drifts?${params}`)
      setDrifts(data.drifts || [])
      setError(null)
      const now = new Date()
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent) {
        setError('Failed to fetch GitOps drifts')
        setDrifts(getDemoGitOpsDrifts())
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch(false)
    // Poll every 30 seconds
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch])

  return {
    drifts,
    isLoading,
    isRefreshing,
    error,
    refetch: () => refetch(false),
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    lastRefresh,
  }
}

function getDemoGitOpsDrifts(): GitOpsDrift[] {
  return [
    {
      resource: 'api-gateway',
      namespace: 'production',
      cluster: 'prod-east',
      kind: 'Deployment',
      driftType: 'modified',
      gitVersion: 'v2.4.0',
      details: 'Image tag changed from v2.4.0 to v2.4.1-hotfix',
      severity: 'medium',
    },
    {
      resource: 'config-secret',
      namespace: 'production',
      cluster: 'prod-east',
      kind: 'Secret',
      driftType: 'modified',
      gitVersion: 'abc123',
      details: 'Secret data modified manually',
      severity: 'high',
    },
    {
      resource: 'debug-pod',
      namespace: 'default',
      cluster: 'staging',
      kind: 'Pod',
      driftType: 'added',
      gitVersion: '-',
      details: 'Resource exists in cluster but not in Git',
      severity: 'low',
    },
  ]
}

function getDemoSecurityIssues(): SecurityIssue[] {
  return [
    {
      name: 'api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'prod-east',
      issue: 'Privileged container',
      severity: 'high',
      details: 'Container running in privileged mode',
    },
    {
      name: 'worker-deployment',
      namespace: 'batch',
      cluster: 'vllm-d',
      issue: 'Running as root',
      severity: 'high',
      details: 'Container running as root user',
    },
    {
      name: 'nginx-ingress',
      namespace: 'ingress',
      cluster: 'prod-east',
      issue: 'Host network enabled',
      severity: 'medium',
      details: 'Pod using host network namespace',
    },
    {
      name: 'monitoring-agent',
      namespace: 'monitoring',
      cluster: 'staging',
      issue: 'Missing security context',
      severity: 'low',
      details: 'No security context defined',
    },
  ]
}

// Demo data fallbacks
function getDemoClusters(): ClusterInfo[] {
  return [
    // One cluster for each provider type to showcase all icons
    { name: 'kind-local', context: 'kind-local', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 15, cpuCores: 4, memoryGB: 8, storageGB: 50, distribution: 'kind' },
    { name: 'minikube', context: 'minikube', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 12, cpuCores: 2, memoryGB: 4, storageGB: 20, distribution: 'minikube' },
    { name: 'k3s-edge', context: 'k3s-edge', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 28, cpuCores: 6, memoryGB: 12, storageGB: 100, distribution: 'k3s' },
    { name: 'eks-prod-us-east-1', context: 'eks-prod', healthy: true, source: 'kubeconfig', nodeCount: 12, podCount: 156, cpuCores: 96, memoryGB: 384, storageGB: 2000, server: 'https://ABC123.gr7.us-east-1.eks.amazonaws.com', distribution: 'eks' },
    { name: 'gke-staging', context: 'gke-staging', healthy: true, source: 'kubeconfig', nodeCount: 6, podCount: 78, cpuCores: 48, memoryGB: 192, storageGB: 1000, distribution: 'gke' },
    { name: 'aks-dev-westeu', context: 'aks-dev', healthy: true, source: 'kubeconfig', nodeCount: 4, podCount: 45, cpuCores: 32, memoryGB: 128, storageGB: 500, server: 'https://aks-dev-dns-abc123.hcp.westeurope.azmk8s.io:443', distribution: 'aks' },
    { name: 'openshift-prod', context: 'ocp-prod', healthy: true, source: 'kubeconfig', nodeCount: 9, podCount: 234, cpuCores: 72, memoryGB: 288, storageGB: 1500, server: 'api.openshift-prod.example.com:6443', distribution: 'openshift', namespaces: ['openshift-operators', 'openshift-monitoring'] },
    { name: 'oci-oke-phoenix', context: 'oke-phoenix', healthy: true, source: 'kubeconfig', nodeCount: 5, podCount: 67, cpuCores: 40, memoryGB: 160, storageGB: 800, server: 'https://abc123.us-phoenix-1.clusters.oci.oraclecloud.com:6443', distribution: 'oci' },
    { name: 'alibaba-ack-shanghai', context: 'ack-shanghai', healthy: false, source: 'kubeconfig', nodeCount: 8, podCount: 112, cpuCores: 64, memoryGB: 256, storageGB: 1200, distribution: 'alibaba' },
    { name: 'do-nyc1-prod', context: 'do-nyc1', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 34, cpuCores: 12, memoryGB: 48, storageGB: 300, distribution: 'digitalocean' },
    { name: 'rancher-mgmt', context: 'rancher-mgmt', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 89, cpuCores: 24, memoryGB: 96, storageGB: 400, distribution: 'rancher' },
    { name: 'vllm-gpu-cluster', context: 'vllm-d', healthy: true, source: 'kubeconfig', nodeCount: 8, podCount: 124, cpuCores: 256, memoryGB: 2048, storageGB: 8000, distribution: 'kubernetes' },
  ]
}

function getDemoHealth(cluster?: string): ClusterHealth {
  // Return cluster-specific demo health data
  const clusterMetrics: Record<string, { nodeCount: number; podCount: number; cpuCores: number; memoryGB: number; storageGB: number }> = {
    'kind-local': { nodeCount: 1, podCount: 15, cpuCores: 4, memoryGB: 8, storageGB: 50 },
    'minikube': { nodeCount: 1, podCount: 12, cpuCores: 2, memoryGB: 4, storageGB: 20 },
    'k3s-edge': { nodeCount: 3, podCount: 28, cpuCores: 6, memoryGB: 12, storageGB: 100 },
    'eks-prod-us-east-1': { nodeCount: 12, podCount: 156, cpuCores: 96, memoryGB: 384, storageGB: 2000 },
    'gke-staging': { nodeCount: 6, podCount: 78, cpuCores: 48, memoryGB: 192, storageGB: 1000 },
    'aks-dev-westeu': { nodeCount: 4, podCount: 45, cpuCores: 32, memoryGB: 128, storageGB: 500 },
    'openshift-prod': { nodeCount: 9, podCount: 234, cpuCores: 72, memoryGB: 288, storageGB: 1500 },
    'oci-oke-phoenix': { nodeCount: 5, podCount: 67, cpuCores: 40, memoryGB: 160, storageGB: 800 },
    'alibaba-ack-shanghai': { nodeCount: 8, podCount: 112, cpuCores: 64, memoryGB: 256, storageGB: 1200 },
    'do-nyc1-prod': { nodeCount: 3, podCount: 34, cpuCores: 12, memoryGB: 48, storageGB: 300 },
    'rancher-mgmt': { nodeCount: 3, podCount: 89, cpuCores: 24, memoryGB: 96, storageGB: 400 },
    'vllm-gpu-cluster': { nodeCount: 8, podCount: 124, cpuCores: 256, memoryGB: 2048, storageGB: 8000 },
  }
  const metrics = clusterMetrics[cluster || ''] || { nodeCount: 3, podCount: 45, cpuCores: 24, memoryGB: 96, storageGB: 500 }
  return {
    cluster: cluster || 'default',
    healthy: cluster !== 'alibaba-ack-shanghai',
    nodeCount: metrics.nodeCount,
    readyNodes: metrics.nodeCount,
    podCount: metrics.podCount,
    cpuCores: metrics.cpuCores,
    memoryGB: metrics.memoryGB,
    memoryBytes: metrics.memoryGB * 1024 * 1024 * 1024,
    storageGB: metrics.storageGB,
    storageBytes: metrics.storageGB * 1024 * 1024 * 1024,
    issues: [],
  }
}

function getDemoPodIssues(): PodIssue[] {
  return [
    {
      name: 'api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'prod-east',
      status: 'CrashLoopBackOff',
      reason: 'Error',
      issues: ['Container restarting', 'OOMKilled'],
      restarts: 15,
    },
    {
      name: 'worker-5c6d7e8f9-n3p2q',
      namespace: 'batch',
      cluster: 'vllm-d',
      status: 'ImagePullBackOff',
      reason: 'ImagePullBackOff',
      issues: ['Failed to pull image'],
      restarts: 0,
    },
    {
      name: 'cache-redis-0',
      namespace: 'data',
      cluster: 'staging',
      status: 'Pending',
      reason: 'Unschedulable',
      issues: ['Insufficient memory'],
      restarts: 0,
    },
  ]
}

function getDemoPods(): PodInfo[] {
  return [
    { name: 'api-server-7d8f9c6b5-x2k4m', namespace: 'production', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 15, age: '2d', node: 'node-1' },
    { name: 'worker-5c6d7e8f9-n3p2q', namespace: 'batch', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 8, age: '5h', node: 'gpu-node-2' },
    { name: 'cache-redis-0', namespace: 'data', cluster: 'staging', status: 'Running', ready: '1/1', restarts: 5, age: '14d', node: 'node-3' },
    { name: 'frontend-8e9f0a1b2-def34', namespace: 'web', cluster: 'prod-west', status: 'Running', ready: '1/1', restarts: 3, age: '1d', node: 'node-2' },
    { name: 'nginx-ingress-abc123', namespace: 'ingress', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 2, age: '7d', node: 'node-1' },
    { name: 'monitoring-agent-xyz', namespace: 'monitoring', cluster: 'staging', status: 'Running', ready: '1/1', restarts: 1, age: '30d', node: 'node-4' },
    { name: 'api-gateway-pod-1', namespace: 'production', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 0, age: '3d', node: 'node-2' },
    { name: 'worker-processor-1', namespace: 'batch', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '12h', node: 'gpu-node-1' },
    { name: 'database-primary-0', namespace: 'data', cluster: 'staging', status: 'Running', ready: '1/1', restarts: 0, age: '60d', node: 'node-5' },
    { name: 'scheduler-job-xyz', namespace: 'system', cluster: 'prod-east', status: 'Running', ready: '1/1', restarts: 0, age: '4h', node: 'node-1' },
  ]
}

function getDemoDeploymentIssues(): DeploymentIssue[] {
  return [
    {
      name: 'api-gateway',
      namespace: 'production',
      cluster: 'prod-east',
      replicas: 3,
      readyReplicas: 1,
      reason: 'Unavailable',
      message: 'Deployment does not have minimum availability',
    },
    {
      name: 'worker-service',
      namespace: 'batch',
      cluster: 'vllm-d',
      replicas: 5,
      readyReplicas: 3,
      reason: 'Progressing',
      message: 'ReplicaSet is progressing',
    },
  ]
}

function getDemoDeployments(): Deployment[] {
  return [
    {
      name: 'api-gateway',
      namespace: 'production',
      cluster: 'prod-east',
      status: 'running',
      replicas: 3,
      readyReplicas: 3,
      updatedReplicas: 3,
      availableReplicas: 3,
      progress: 100,
      image: 'api-gateway:v2.4.1',
      age: '5d',
    },
    {
      name: 'worker-service',
      namespace: 'batch',
      cluster: 'vllm-d',
      status: 'deploying',
      replicas: 3,
      readyReplicas: 2,
      updatedReplicas: 3,
      availableReplicas: 2,
      progress: 67,
      image: 'worker:v1.8.0',
      age: '2h',
    },
    {
      name: 'frontend',
      namespace: 'web',
      cluster: 'prod-west',
      status: 'failed',
      replicas: 3,
      readyReplicas: 1,
      updatedReplicas: 3,
      availableReplicas: 1,
      progress: 33,
      image: 'frontend:v3.0.0',
      age: '30m',
    },
    {
      name: 'cache-redis',
      namespace: 'data',
      cluster: 'staging',
      status: 'running',
      replicas: 1,
      readyReplicas: 1,
      updatedReplicas: 1,
      availableReplicas: 1,
      progress: 100,
      image: 'redis:7.2.0',
      age: '14d',
    },
  ]
}

function getDemoGPUNodes(): GPUNode[] {
  return [
    // vllm-gpu-cluster - Large GPU cluster for AI/ML workloads
    { name: 'gpu-node-1', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 6 },
    { name: 'gpu-node-2', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8 },
    { name: 'gpu-node-3', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4 },
    { name: 'gpu-node-4', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA H100', gpuCount: 8, gpuAllocated: 7 },
    // EKS - Production ML inference
    { name: 'eks-gpu-1', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 3 },
    { name: 'eks-gpu-2', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 4 },
    // GKE - Training workloads
    { name: 'gke-gpu-pool-1', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1 },
    { name: 'gke-gpu-pool-2', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 2 },
    // AKS - Dev/test GPUs
    { name: 'aks-gpu-node', cluster: 'aks-dev-westeu', gpuType: 'NVIDIA V100', gpuCount: 2, gpuAllocated: 1 },
    // OpenShift - Enterprise ML
    { name: 'ocp-gpu-worker-1', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 4 },
    { name: 'ocp-gpu-worker-2', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2 },
    // OCI - Oracle GPU shapes
    { name: 'oke-gpu-node', cluster: 'oci-oke-phoenix', gpuType: 'NVIDIA A10', gpuCount: 4, gpuAllocated: 3 },
    // Alibaba - China region ML
    { name: 'ack-gpu-worker', cluster: 'alibaba-ack-shanghai', gpuType: 'NVIDIA V100', gpuCount: 8, gpuAllocated: 6 },
    // Rancher - Managed GPU pool
    { name: 'rancher-gpu-1', cluster: 'rancher-mgmt', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1 },
  ]
}

// Hook to get namespaces for a cluster (derived from pods)
export function useNamespaces(cluster?: string) {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!cluster) {
      setNamespaces([])
      return
    }

    setIsLoading(true)
    try {
      // Fetch pods for the cluster to get namespaces
      const { data } = await api.get<{ pods: PodInfo[] }>(`/api/mcp/pods?cluster=${encodeURIComponent(cluster)}`)
      const nsSet = new Set<string>()
      data.pods?.forEach(pod => {
        if (pod.namespace) nsSet.add(pod.namespace)
      })
      // Sort and set namespaces
      setNamespaces(Array.from(nsSet).sort())
      setError(null)
    } catch (err) {
      setError('Failed to fetch namespaces')
      // Fallback to demo namespaces
      setNamespaces(getDemoNamespaces())
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { namespaces, isLoading, error, refetch }
}

function getDemoNamespaces(): string[] {
  return ['default', 'kube-system', 'kube-public', 'monitoring', 'production', 'staging', 'batch', 'data', 'web', 'ingress']
}

// Namespace stats interface
export interface NamespaceStats {
  name: string
  podCount: number
  runningPods: number
  pendingPods: number
  failedPods: number
}

// Hook to get namespace statistics for a cluster
export function useNamespaceStats(cluster?: string) {
  const [stats, setStats] = useState<NamespaceStats[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!cluster) {
      setStats([])
      return
    }

    setIsLoading(true)
    try {
      // Fetch all pods for the cluster (no limit)
      const { data } = await api.get<{ pods: PodInfo[] }>(`/api/mcp/pods?cluster=${encodeURIComponent(cluster)}&limit=1000`)

      // Group pods by namespace and calculate stats
      const nsMap: Record<string, NamespaceStats> = {}
      data.pods?.forEach(pod => {
        const ns = pod.namespace || 'default'
        if (!nsMap[ns]) {
          nsMap[ns] = { name: ns, podCount: 0, runningPods: 0, pendingPods: 0, failedPods: 0 }
        }
        nsMap[ns].podCount++
        if (pod.status === 'Running') {
          nsMap[ns].runningPods++
        } else if (pod.status === 'Pending') {
          nsMap[ns].pendingPods++
        } else if (pod.status === 'Failed' || pod.status === 'CrashLoopBackOff' || pod.status === 'Error') {
          nsMap[ns].failedPods++
        }
      })

      // Sort by pod count (descending)
      const sortedStats = Object.values(nsMap).sort((a, b) => b.podCount - a.podCount)
      setStats(sortedStats)
      setError(null)
    } catch (err) {
      setError('Failed to fetch namespace stats')
      // Fallback to demo data
      setStats(getDemoNamespaceStats())
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { stats, isLoading, error, refetch }
}

function getDemoNamespaceStats(): NamespaceStats[] {
  return [
    { name: 'production', podCount: 45, runningPods: 42, pendingPods: 2, failedPods: 1 },
    { name: 'kube-system', podCount: 28, runningPods: 28, pendingPods: 0, failedPods: 0 },
    { name: 'monitoring', podCount: 15, runningPods: 14, pendingPods: 1, failedPods: 0 },
    { name: 'staging', podCount: 12, runningPods: 10, pendingPods: 1, failedPods: 1 },
    { name: 'batch', podCount: 8, runningPods: 5, pendingPods: 3, failedPods: 0 },
    { name: 'default', podCount: 5, runningPods: 5, pendingPods: 0, failedPods: 0 },
  ]
}

// Operator types
export interface Operator {
  name: string
  namespace: string
  version: string
  status: 'Succeeded' | 'Failed' | 'Installing' | 'Upgrading'
  upgradeAvailable?: string
  cluster?: string
}

export interface OperatorSubscription {
  name: string
  namespace: string
  channel: string
  source: string
  installPlanApproval: 'Automatic' | 'Manual'
  currentCSV: string
  pendingUpgrade?: string
  cluster?: string
}

// Hook to get operators for a cluster
export function useOperators(cluster?: string) {
  const [operators, setOperators] = useState<Operator[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!cluster) {
      setOperators([])
      return
    }

    setIsRefreshing(true)
    if (operators.length === 0) {
      setIsLoading(true)
    }
    try {
      // Try to fetch from API - will fall back to demo data if not available
      const { data } = await api.get<{ operators: Operator[] }>(`/api/mcp/operators?cluster=${encodeURIComponent(cluster)}`)
      setOperators(data.operators || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch operators')
      // Use demo data with cluster-specific variation
      setOperators(getDemoOperators(cluster))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, operators.length])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { operators, isLoading, isRefreshing, error, refetch }
}

// Hook to get operator subscriptions for a cluster
export function useOperatorSubscriptions(cluster?: string) {
  const [subscriptions, setSubscriptions] = useState<OperatorSubscription[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!cluster) {
      setSubscriptions([])
      return
    }

    setIsRefreshing(true)
    if (subscriptions.length === 0) {
      setIsLoading(true)
    }
    try {
      const { data } = await api.get<{ subscriptions: OperatorSubscription[] }>(`/api/mcp/operator-subscriptions?cluster=${encodeURIComponent(cluster)}`)
      setSubscriptions(data.subscriptions || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch subscriptions')
      setSubscriptions(getDemoOperatorSubscriptions(cluster))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, subscriptions.length])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { subscriptions, isLoading, isRefreshing, error, refetch }
}

function getDemoOperators(cluster: string): Operator[] {
  // Vary demo data slightly based on cluster name
  const suffix = cluster.includes('prod') ? '-prod' : cluster.includes('staging') ? '-staging' : ''
  return [
    { name: 'prometheus-operator', namespace: 'monitoring', version: 'v0.65.1', status: 'Succeeded', cluster },
    { name: 'cert-manager', namespace: 'cert-manager', version: 'v1.12.0', status: 'Succeeded', upgradeAvailable: 'v1.13.0', cluster },
    { name: `elasticsearch-operator${suffix}`, namespace: 'elastic-system', version: 'v2.8.0', status: 'Succeeded', cluster },
    { name: 'strimzi-kafka-operator', namespace: 'kafka', version: 'v0.35.0', status: cluster.includes('staging') ? 'Installing' : 'Succeeded', cluster },
    { name: 'argocd-operator', namespace: 'argocd', version: 'v0.6.0', status: cluster.includes('prod') ? 'Succeeded' : 'Failed', cluster },
  ]
}

function getDemoOperatorSubscriptions(cluster: string): OperatorSubscription[] {
  return [
    {
      name: 'prometheus-operator',
      namespace: 'monitoring',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Automatic',
      currentCSV: 'prometheusoperator.v0.65.1',
      cluster,
    },
    {
      name: 'cert-manager',
      namespace: 'cert-manager',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Manual',
      currentCSV: 'cert-manager.v1.12.0',
      pendingUpgrade: 'cert-manager.v1.13.0',
      cluster,
    },
    {
      name: 'strimzi-kafka-operator',
      namespace: 'kafka',
      channel: 'stable',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Automatic',
      currentCSV: 'strimzi-cluster-operator.v0.35.0',
      cluster,
    },
    {
      name: 'argocd-operator',
      namespace: 'argocd',
      channel: 'alpha',
      source: 'operatorhubio-catalog',
      installPlanApproval: 'Manual',
      currentCSV: 'argocd-operator.v0.6.0',
      pendingUpgrade: cluster.includes('staging') ? 'argocd-operator.v0.7.0' : undefined,
      cluster,
    },
  ]
}

function getDemoEvents(): ClusterEvent[] {
  return [
    {
      type: 'Warning',
      reason: 'FailedScheduling',
      message: 'No nodes available to schedule pod',
      object: 'Pod/worker-5c6d7e8f9-n3p2q',
      namespace: 'batch',
      cluster: 'vllm-d',
      count: 3,
    },
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned pod to node-2',
      object: 'Pod/api-server-7d8f9c6b5-abc12',
      namespace: 'production',
      cluster: 'prod-east',
      count: 1,
    },
    {
      type: 'Warning',
      reason: 'BackOff',
      message: 'Back-off restarting failed container',
      object: 'Pod/api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'prod-east',
      count: 15,
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image pulled successfully',
      object: 'Pod/frontend-8e9f0a1b2-def34',
      namespace: 'web',
      cluster: 'staging',
      count: 1,
    },
    {
      type: 'Warning',
      reason: 'Unhealthy',
      message: 'Readiness probe failed: connection refused',
      object: 'Pod/cache-redis-0',
      namespace: 'data',
      cluster: 'staging',
      count: 8,
    },
  ]
}

function getDemoNodes(): NodeInfo[] {
  return [
    {
      name: 'node-1',
      cluster: 'prod-east',
      status: 'Ready',
      roles: ['control-plane', 'master'],
      internalIP: '10.0.1.10',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '8',
      memoryCapacity: '32Gi',
      storageCapacity: '200Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'node-role.kubernetes.io/control-plane': '' },
      taints: ['node-role.kubernetes.io/control-plane:NoSchedule'],
      age: '45d',
      unschedulable: false,
    },
    {
      name: 'node-2',
      cluster: 'prod-east',
      status: 'Ready',
      roles: ['worker'],
      internalIP: '10.0.1.11',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '16',
      memoryCapacity: '64Gi',
      storageCapacity: '500Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'node.kubernetes.io/instance-type': 'm5.4xlarge' },
      age: '45d',
      unschedulable: false,
    },
    {
      name: 'gpu-node-1',
      cluster: 'vllm-d',
      status: 'Ready',
      roles: ['worker'],
      internalIP: '10.0.2.20',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '32',
      memoryCapacity: '128Gi',
      storageCapacity: '1Ti',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'nvidia.com/gpu': 'true', 'node.kubernetes.io/instance-type': 'p3.8xlarge' },
      age: '30d',
      unschedulable: false,
    },
    {
      name: 'kind-control-plane',
      cluster: 'kind-local',
      status: 'Ready',
      roles: ['control-plane'],
      internalIP: '172.18.0.2',
      kubeletVersion: 'v1.27.3',
      containerRuntime: 'containerd://1.7.1',
      os: 'Ubuntu 22.04.2 LTS',
      architecture: 'amd64',
      cpuCapacity: '4',
      memoryCapacity: '8Gi',
      storageCapacity: '50Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      age: '7d',
      unschedulable: false,
    },
  ]
}

function getDemoServices(): Service[] {
  return [
    { name: 'kubernetes', namespace: 'default', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.0.1', ports: ['443/TCP'], age: '45d' },
    { name: 'api-gateway', namespace: 'production', cluster: 'prod-east', type: 'LoadBalancer', clusterIP: '10.96.10.50', externalIP: '52.14.123.45', ports: ['80/TCP', '443/TCP'], age: '30d' },
    { name: 'frontend', namespace: 'web', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.20.100', ports: ['3000/TCP'], age: '25d' },
    { name: 'postgres', namespace: 'data', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.30.10', ports: ['5432/TCP'], age: '40d' },
    { name: 'redis', namespace: 'data', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.30.20', ports: ['6379/TCP'], age: '40d' },
    { name: 'prometheus', namespace: 'monitoring', cluster: 'staging', type: 'ClusterIP', clusterIP: '10.96.40.10', ports: ['9090/TCP'], age: '20d' },
    { name: 'grafana', namespace: 'monitoring', cluster: 'staging', type: 'NodePort', clusterIP: '10.96.40.20', ports: ['3000:30300/TCP'], age: '20d' },
    { name: 'ml-inference', namespace: 'ml', cluster: 'vllm-d', type: 'LoadBalancer', clusterIP: '10.96.50.10', externalIP: '34.56.78.90', ports: ['8080/TCP'], age: '15d' },
  ]
}

function getDemoPVCs(): PVC[] {
  return [
    { name: 'postgres-data', namespace: 'data', cluster: 'prod-east', status: 'Bound', storageClass: 'gp3', capacity: '100Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-abc123', age: '40d' },
    { name: 'redis-data', namespace: 'data', cluster: 'prod-east', status: 'Bound', storageClass: 'gp3', capacity: '20Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-def456', age: '40d' },
    { name: 'prometheus-data', namespace: 'monitoring', cluster: 'staging', status: 'Bound', storageClass: 'standard', capacity: '50Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-ghi789', age: '20d' },
    { name: 'grafana-data', namespace: 'monitoring', cluster: 'staging', status: 'Bound', storageClass: 'standard', capacity: '10Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-jkl012', age: '20d' },
    { name: 'model-cache', namespace: 'ml', cluster: 'vllm-d', status: 'Bound', storageClass: 'fast-ssd', capacity: '500Gi', accessModes: ['ReadWriteMany'], volumeName: 'pvc-mno345', age: '15d' },
    { name: 'training-data', namespace: 'ml', cluster: 'vllm-d', status: 'Pending', storageClass: 'fast-ssd', capacity: '1Ti', accessModes: ['ReadWriteMany'], age: '1d' },
    { name: 'logs-archive', namespace: 'logging', cluster: 'prod-east', status: 'Bound', storageClass: 'cold-storage', capacity: '200Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-pqr678', age: '60d' },
  ]
}

function getDemoConfigMaps(): ConfigMap[] {
  return [
    { name: 'kube-root-ca.crt', namespace: 'default', cluster: 'prod-east', dataCount: 1, age: '45d' },
    { name: 'app-config', namespace: 'production', cluster: 'prod-east', dataCount: 5, age: '30d' },
    { name: 'nginx-config', namespace: 'web', cluster: 'prod-east', dataCount: 3, age: '25d' },
    { name: 'prometheus-config', namespace: 'monitoring', cluster: 'staging', dataCount: 2, age: '20d' },
    { name: 'grafana-dashboards', namespace: 'monitoring', cluster: 'staging', dataCount: 12, age: '20d' },
    { name: 'model-config', namespace: 'ml', cluster: 'vllm-d', dataCount: 8, age: '15d' },
    { name: 'coredns', namespace: 'kube-system', cluster: 'kind-local', dataCount: 2, age: '7d' },
  ]
}

function getDemoSecrets(): Secret[] {
  return [
    { name: 'default-token', namespace: 'default', cluster: 'prod-east', type: 'kubernetes.io/service-account-token', dataCount: 3, age: '45d' },
    { name: 'db-credentials', namespace: 'data', cluster: 'prod-east', type: 'Opaque', dataCount: 2, age: '40d' },
    { name: 'tls-cert', namespace: 'production', cluster: 'prod-east', type: 'kubernetes.io/tls', dataCount: 2, age: '30d' },
    { name: 'api-keys', namespace: 'production', cluster: 'prod-east', type: 'Opaque', dataCount: 4, age: '30d' },
    { name: 'grafana-admin', namespace: 'monitoring', cluster: 'staging', type: 'Opaque', dataCount: 1, age: '20d' },
    { name: 'ml-api-token', namespace: 'ml', cluster: 'vllm-d', type: 'Opaque', dataCount: 1, age: '15d' },
    { name: 'registry-credentials', namespace: 'default', cluster: 'kind-local', type: 'kubernetes.io/dockerconfigjson', dataCount: 1, age: '7d' },
  ]
}

function getDemoServiceAccounts(): ServiceAccount[] {
  return [
    { name: 'default', namespace: 'default', cluster: 'prod-east', secrets: ['default-token'], age: '45d' },
    { name: 'api-server', namespace: 'production', cluster: 'prod-east', secrets: ['api-server-token'], imagePullSecrets: ['registry-credentials'], age: '30d' },
    { name: 'prometheus', namespace: 'monitoring', cluster: 'staging', secrets: ['prometheus-token'], age: '20d' },
    { name: 'grafana', namespace: 'monitoring', cluster: 'staging', secrets: ['grafana-token'], age: '20d' },
    { name: 'ml-worker', namespace: 'ml', cluster: 'vllm-d', secrets: ['ml-worker-token'], imagePullSecrets: ['registry-credentials'], age: '15d' },
    { name: 'default', namespace: 'kube-system', cluster: 'kind-local', secrets: ['default-token'], age: '7d' },
  ]
}

function getDemoAllPods(): PodInfo[] {
  // Returns pods across all clusters for useAllPods
  return [
    ...getDemoPods(),
    { name: 'ml-inference-0', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '5d', node: 'gpu-node-1' },
    { name: 'ml-inference-1', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '5d', node: 'gpu-node-1' },
    { name: 'model-server-0', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '2/2', restarts: 1, age: '10d', node: 'gpu-node-1' },
    { name: 'training-job-abc', namespace: 'ml', cluster: 'vllm-d', status: 'Running', ready: '1/1', restarts: 0, age: '1d', node: 'gpu-node-1' },
  ]
}

function getDemoResourceQuotas(): ResourceQuota[] {
  return [
    {
      name: 'compute-quota',
      namespace: 'production',
      cluster: 'prod-east',
      hard: { 'requests.cpu': '10', 'requests.memory': '20Gi', 'limits.cpu': '20', 'limits.memory': '40Gi', pods: '50' },
      used: { 'requests.cpu': '5', 'requests.memory': '10Gi', 'limits.cpu': '8', 'limits.memory': '16Gi', pods: '25' },
      age: '30d'
    },
    {
      name: 'storage-quota',
      namespace: 'data',
      cluster: 'prod-east',
      hard: { 'requests.storage': '500Gi', persistentvolumeclaims: '10' },
      used: { 'requests.storage': '320Gi', persistentvolumeclaims: '5' },
      age: '40d'
    },
    {
      name: 'ml-quota',
      namespace: 'ml',
      cluster: 'vllm-d',
      hard: { 'requests.cpu': '100', 'requests.memory': '200Gi', 'limits.cpu': '200', 'limits.memory': '400Gi', 'requests.nvidia.com/gpu': '8', pods: '20' },
      used: { 'requests.cpu': '64', 'requests.memory': '128Gi', 'limits.cpu': '128', 'limits.memory': '256Gi', 'requests.nvidia.com/gpu': '4', pods: '8' },
      age: '15d'
    },
    {
      name: 'default-quota',
      namespace: 'default',
      cluster: 'staging',
      hard: { 'requests.cpu': '4', 'requests.memory': '8Gi', 'limits.cpu': '8', 'limits.memory': '16Gi', pods: '20' },
      used: { 'requests.cpu': '1', 'requests.memory': '2Gi', 'limits.cpu': '2', 'limits.memory': '4Gi', pods: '5' },
      age: '60d'
    },
  ]
}

function getDemoLimitRanges(): LimitRange[] {
  return [
    {
      name: 'container-limits',
      namespace: 'production',
      cluster: 'prod-east',
      limits: [
        {
          type: 'Container',
          default: { cpu: '500m', memory: '512Mi' },
          defaultRequest: { cpu: '100m', memory: '128Mi' },
          max: { cpu: '2', memory: '4Gi' },
          min: { cpu: '50m', memory: '64Mi' }
        }
      ],
      age: '30d'
    },
    {
      name: 'pod-limits',
      namespace: 'ml',
      cluster: 'vllm-d',
      limits: [
        {
          type: 'Container',
          default: { cpu: '1', memory: '2Gi' },
          defaultRequest: { cpu: '500m', memory: '1Gi' },
          max: { cpu: '16', memory: '64Gi' },
          min: { cpu: '100m', memory: '256Mi' }
        },
        {
          type: 'Pod',
          max: { cpu: '32', memory: '128Gi' }
        }
      ],
      age: '15d'
    },
    {
      name: 'storage-limits',
      namespace: 'data',
      cluster: 'prod-east',
      limits: [
        {
          type: 'PersistentVolumeClaim',
          max: { storage: '100Gi' },
          min: { storage: '1Gi' }
        }
      ],
      age: '40d'
    },
  ]
}

// ============================================
// RBAC Hooks - Roles and RoleBindings
// ============================================

// K8s role type (mirrors backend model)
export interface K8sRole {
  name: string
  namespace?: string
  cluster: string
  isCluster: boolean
  ruleCount: number
}

// K8s role binding type
export interface K8sRoleBinding {
  name: string
  namespace?: string
  cluster: string
  isCluster: boolean
  roleName: string
  roleKind: string
  subjects: Array<{
    kind: 'User' | 'Group' | 'ServiceAccount'
    name: string
    namespace?: string
  }>
}

// K8s service account type (for RBAC)
export interface K8sServiceAccountInfo {
  name: string
  namespace: string
  cluster: string
  secrets?: string[]
  roles?: string[]
  createdAt?: string
}

// Demo RBAC data for when demo mode is enabled
function getDemoK8sRoles(cluster?: string): K8sRole[] {
  const roles: K8sRole[] = [
    { name: 'admin', cluster: 'prod-east', namespace: 'default', isCluster: false, ruleCount: 12 },
    { name: 'edit', cluster: 'prod-east', namespace: 'default', isCluster: false, ruleCount: 8 },
    { name: 'view', cluster: 'prod-east', namespace: 'default', isCluster: false, ruleCount: 4 },
    { name: 'pod-reader', cluster: 'prod-east', namespace: 'default', isCluster: false, ruleCount: 2 },
    { name: 'cluster-admin', cluster: 'prod-east', isCluster: true, ruleCount: 20 },
    { name: 'cluster-view', cluster: 'prod-east', isCluster: true, ruleCount: 6 },
    { name: 'admin', cluster: 'staging', namespace: 'default', isCluster: false, ruleCount: 12 },
    { name: 'developer', cluster: 'staging', namespace: 'development', isCluster: false, ruleCount: 10 },
    { name: 'cluster-admin', cluster: 'staging', isCluster: true, ruleCount: 20 },
  ]
  return cluster ? roles.filter(r => r.cluster === cluster) : roles
}

function getDemoK8sRoleBindings(cluster?: string, namespace?: string): K8sRoleBinding[] {
  const bindings: K8sRoleBinding[] = [
    {
      name: 'admin-binding',
      cluster: 'prod-east',
      namespace: 'default',
      isCluster: false,
      roleName: 'admin',
      roleKind: 'Role',
      subjects: [
        { kind: 'User', name: 'admin-user' },
        { kind: 'Group', name: 'ops-team' },
      ],
    },
    {
      name: 'developer-binding',
      cluster: 'prod-east',
      namespace: 'default',
      isCluster: false,
      roleName: 'edit',
      roleKind: 'Role',
      subjects: [{ kind: 'Group', name: 'dev-team' }],
    },
    {
      name: 'readonly-binding',
      cluster: 'prod-east',
      namespace: 'default',
      isCluster: false,
      roleName: 'view',
      roleKind: 'Role',
      subjects: [{ kind: 'User', name: 'viewer' }],
    },
    {
      name: 'cluster-admin-binding',
      cluster: 'prod-east',
      isCluster: true,
      roleName: 'cluster-admin',
      roleKind: 'ClusterRole',
      subjects: [{ kind: 'User', name: 'super-admin' }],
    },
    {
      name: 'admin-binding',
      cluster: 'staging',
      namespace: 'default',
      isCluster: false,
      roleName: 'admin',
      roleKind: 'Role',
      subjects: [{ kind: 'ServiceAccount', name: 'deployer', namespace: 'default' }],
    },
  ]

  let result = bindings
  if (cluster) result = result.filter(b => b.cluster === cluster)
  if (namespace) result = result.filter(b => b.namespace === namespace || b.isCluster)
  return result
}

function getDemoK8sServiceAccounts(cluster?: string, namespace?: string): K8sServiceAccountInfo[] {
  const sas: K8sServiceAccountInfo[] = [
    { name: 'default', namespace: 'default', cluster: 'prod-east', secrets: ['default-token'] },
    { name: 'deployer', namespace: 'default', cluster: 'prod-east', secrets: ['deployer-token'], roles: ['admin'] },
    { name: 'monitoring', namespace: 'monitoring', cluster: 'prod-east', secrets: ['monitoring-token'], roles: ['view'] },
    { name: 'default', namespace: 'default', cluster: 'staging', secrets: ['default-token'] },
    { name: 'ci-bot', namespace: 'ci-cd', cluster: 'staging', secrets: ['ci-bot-token'], roles: ['edit'] },
  ]

  let result = sas
  if (cluster) result = result.filter(s => s.cluster === cluster)
  if (namespace) result = result.filter(s => s.namespace === namespace)
  return result
}

// Hook to fetch K8s roles from a cluster
export function useK8sRoles(cluster?: string, namespace?: string, includeSystem = false) {
  const [roles, setRoles] = useState<K8sRole[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // Demo mode returns demo data
    if (getDemoMode()) {
      setRoles(getDemoK8sRoles(cluster))
      setIsLoading(false)
      setError(null)
      return
    }

    if (!cluster) {
      setRoles([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      if (includeSystem) params.append('includeSystem', 'true')

      const { data } = await api.get<K8sRole[]>(`/api/rbac/roles?${params}`)
      setRoles(data || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch roles')
      // Fall back to demo data on error
      setRoles(getDemoK8sRoles(cluster))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, includeSystem])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { roles, isLoading, error, refetch }
}

// Hook to fetch K8s role bindings from a cluster
export function useK8sRoleBindings(cluster?: string, namespace?: string, includeSystem = false) {
  const [bindings, setBindings] = useState<K8sRoleBinding[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // Demo mode returns demo data
    if (getDemoMode()) {
      setBindings(getDemoK8sRoleBindings(cluster, namespace))
      setIsLoading(false)
      setError(null)
      return
    }

    if (!cluster) {
      setBindings([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      if (includeSystem) params.append('includeSystem', 'true')

      const { data } = await api.get<K8sRoleBinding[]>(`/api/rbac/bindings?${params}`)
      setBindings(data || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch role bindings')
      // Fall back to demo data on error
      setBindings(getDemoK8sRoleBindings(cluster, namespace))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, includeSystem])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { bindings, isLoading, error, refetch }
}

// Hook to fetch K8s service accounts for RBAC view
export function useK8sServiceAccounts(cluster?: string, namespace?: string) {
  const [serviceAccounts, setServiceAccounts] = useState<K8sServiceAccountInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // Demo mode returns demo data
    if (getDemoMode()) {
      setServiceAccounts(getDemoK8sServiceAccounts(cluster, namespace))
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)

      const { data } = await api.get<K8sServiceAccountInfo[]>(`/api/rbac/service-accounts?${params}`)
      setServiceAccounts(data || [])
      setError(null)
    } catch (err) {
      setError('Failed to fetch service accounts')
      // Fall back to demo data on error
      setServiceAccounts(getDemoK8sServiceAccounts(cluster, namespace))
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { serviceAccounts, isLoading, error, refetch }
}

// ============================================================================
// Helm Releases
// ============================================================================

export interface HelmRelease {
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  app_version: string
  cluster?: string
}

// Helm releases cache with localStorage persistence
const HELM_RELEASES_CACHE_KEY = 'kubestellar-helm-releases'
const HELM_CACHE_TTL_MS = 30000 // 30 seconds before stale
const HELM_REFRESH_INTERVAL_MS = 120000 // 2 minutes auto-refresh

interface HelmReleasesCache {
  data: HelmRelease[]
  timestamp: number
  consecutiveFailures: number
  lastError: string | null
  listeners: Set<(state: HelmReleasesCacheState) => void>
}

interface HelmReleasesCacheState {
  releases: HelmRelease[]
  isRefreshing: boolean
  consecutiveFailures: number
  lastError: string | null
  lastRefresh: number | null
}

// Load from localStorage
function loadHelmReleasesFromStorage(): { data: HelmRelease[], timestamp: number } {
  try {
    const stored = localStorage.getItem(HELM_RELEASES_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.data)) {
        return { data: parsed.data, timestamp: parsed.timestamp || 0 }
      }
    }
  } catch { /* ignore */ }
  return { data: [], timestamp: 0 }
}

// Save to localStorage
function saveHelmReleasesToStorage(data: HelmRelease[], timestamp: number) {
  try {
    localStorage.setItem(HELM_RELEASES_CACHE_KEY, JSON.stringify({ data, timestamp }))
  } catch { /* ignore storage errors */ }
}

// Initialize from localStorage
const storedHelmReleases = loadHelmReleasesFromStorage()

const helmReleasesCache: HelmReleasesCache = {
  data: storedHelmReleases.data,
  timestamp: storedHelmReleases.timestamp,
  consecutiveFailures: 0,
  lastError: null,
  listeners: new Set()
}

// Hook to get Helm releases - uses shared cache with localStorage persistence
export function useHelmReleases(cluster?: string) {
  // Initialize from cache (localStorage backed)
  const [releases, setReleases] = useState<HelmRelease[]>(helmReleasesCache.data)
  const [isLoading, setIsLoading] = useState(helmReleasesCache.data.length === 0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(helmReleasesCache.lastError)
  const [consecutiveFailures, setConsecutiveFailures] = useState(helmReleasesCache.consecutiveFailures)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    helmReleasesCache.timestamp > 0 ? helmReleasesCache.timestamp : null
  )

  // Register this component to receive cache updates
  useEffect(() => {
    const updateHandler = (state: HelmReleasesCacheState) => {
      setReleases(state.releases)
      setIsRefreshing(state.isRefreshing)
      setConsecutiveFailures(state.consecutiveFailures)
      setError(state.lastError)
      setLastRefresh(state.lastRefresh)
    }
    helmReleasesCache.listeners.add(updateHandler)
    return () => { helmReleasesCache.listeners.delete(updateHandler) }
  }, [])

  const notifyListeners = useCallback((isRefreshing: boolean) => {
    const state: HelmReleasesCacheState = {
      releases: helmReleasesCache.data,
      isRefreshing,
      consecutiveFailures: helmReleasesCache.consecutiveFailures,
      lastError: helmReleasesCache.lastError,
      lastRefresh: helmReleasesCache.timestamp > 0 ? helmReleasesCache.timestamp : null
    }
    helmReleasesCache.listeners.forEach(listener => listener(state))
  }, [])

  const refetch = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
      notifyListeners(true)
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      const { data } = await api.get<{ releases: HelmRelease[] }>(`/api/gitops/helm-releases?${params}`)
      const newReleases = data.releases || []

      // Update cache if fetching all clusters
      if (!cluster) {
        helmReleasesCache.data = newReleases
        helmReleasesCache.timestamp = Date.now()
        helmReleasesCache.consecutiveFailures = 0
        helmReleasesCache.lastError = null
        saveHelmReleasesToStorage(newReleases, helmReleasesCache.timestamp)
        notifyListeners(false)
      }

      setReleases(newReleases)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm releases'

      // Increment failure count
      if (!cluster) {
        helmReleasesCache.consecutiveFailures++
        helmReleasesCache.lastError = errorMessage
        notifyListeners(false)
      }

      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)
      // Keep existing cached data on error
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      if (!cluster) notifyListeners(false)
    }
  }, [cluster, notifyListeners])

  useEffect(() => {
    // Use cached data if fresh enough and we're fetching all clusters
    const now = Date.now()
    const cacheAge = now - helmReleasesCache.timestamp
    const cacheValid = !cluster && helmReleasesCache.data.length > 0 && cacheAge < HELM_CACHE_TTL_MS

    if (cacheValid) {
      setReleases(helmReleasesCache.data)
      setIsLoading(false)
      // Still refresh in background if somewhat stale
      if (cacheAge > HELM_CACHE_TTL_MS / 2) {
        refetch(true)
      }
    } else {
      refetch()
    }

    const interval = setInterval(() => refetch(true), HELM_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch, cluster])

  const isFailed = consecutiveFailures >= 3

  return { releases, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed, lastRefresh }
}

// Helm history entry from API
export interface HelmHistoryEntry {
  revision: number
  updated: string
  status: string
  chart: string
  app_version: string
  description: string
}

// Module-level cache for Helm history - keyed by cluster:release
const helmHistoryCache = new Map<string, {
  data: HelmHistoryEntry[]
  timestamp: number
  consecutiveFailures: number
}>()

// Hook to fetch Helm release history
export function useHelmHistory(cluster?: string, release?: string, namespace?: string) {
  const cacheKey = cluster && release ? `${cluster}:${release}` : ''
  const cachedEntry = cacheKey ? helmHistoryCache.get(cacheKey) : undefined

  const [history, setHistory] = useState<HelmHistoryEntry[]>(cachedEntry?.data || [])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(cachedEntry?.consecutiveFailures || 0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cachedEntry?.timestamp || null)

  const refetch = useCallback(async () => {
    if (!release) {
      setHistory([])
      return
    }

    // Always set isRefreshing to show animation on manual refresh
    setIsRefreshing(true)
    // Also set loading if no cached data (use functional update to check)
    setHistory(prev => {
      if (prev.length === 0 && (!cachedEntry?.data?.length)) {
        setIsLoading(true)
      }
      return prev
    })

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      params.append('release', release)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ history: HelmHistoryEntry[], error?: string }>(`/api/gitops/helm-history?${params}`)
      const newHistory = data.history || []
      setHistory(newHistory)
      setError(data.error || null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())

      // Update cache
      if (cluster && release) {
        helmHistoryCache.set(`${cluster}:${release}`, {
          data: newHistory,
          timestamp: Date.now(),
          consecutiveFailures: 0
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm history'
      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)

      // Update cache failure count
      if (cluster && release && cachedEntry) {
        helmHistoryCache.set(`${cluster}:${release}`, {
          ...cachedEntry,
          consecutiveFailures: (cachedEntry.consecutiveFailures || 0) + 1
        })
      }
      // Keep cached data on error
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, release, namespace, cachedEntry])

  useEffect(() => {
    // Use cached data if available
    const key = cluster && release ? `${cluster}:${release}` : ''
    const cached = key ? helmHistoryCache.get(key) : undefined
    if (cached && cached.data.length > 0) {
      setHistory(cached.data)
      setLastRefresh(cached.timestamp)
      setConsecutiveFailures(cached.consecutiveFailures || 0)
      // Only refetch if cache is stale (older than 30s)
      if (Date.now() - cached.timestamp > HELM_CACHE_TTL_MS) {
        refetch()
      }
    } else if (release) {
      refetch()
    }
  }, [cluster, release, refetch])

  const isFailed = consecutiveFailures >= 3

  return { history, isLoading, isRefreshing, error, refetch, isFailed, consecutiveFailures, lastRefresh }
}

// Module-level cache for Helm values - keyed by cluster:release
const helmValuesCache = new Map<string, {
  values: Record<string, unknown> | string | null
  format: 'json' | 'yaml'
  timestamp: number
  consecutiveFailures: number
}>()

// Hook to fetch Helm release values
export function useHelmValues(cluster?: string, release?: string, namespace?: string) {
  const cacheKey = cluster && release ? `${cluster}:${release}` : ''
  const cachedEntry = cacheKey ? helmValuesCache.get(cacheKey) : undefined

  const [values, setValues] = useState<Record<string, unknown> | string | null>(cachedEntry?.values || null)
  const [format, setFormat] = useState<'json' | 'yaml'>(cachedEntry?.format || 'json')
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(cachedEntry?.consecutiveFailures || 0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cachedEntry?.timestamp || null)

  const refetch = useCallback(async () => {
    if (!release) {
      setValues(null)
      return
    }

    // Always set isRefreshing to show animation on manual refresh
    setIsRefreshing(true)
    // Also set loading if no cached data (use functional update to check)
    setValues(prev => {
      if (prev === null && cachedEntry?.values === null) {
        setIsLoading(true)
      }
      return prev
    })

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      params.append('release', release)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ values: Record<string, unknown> | string, format: 'json' | 'yaml', error?: string }>(`/api/gitops/helm-values?${params}`)
      setValues(data.values)
      setFormat(data.format || 'json')
      setError(data.error || null)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())

      // Update cache
      if (cluster && release) {
        helmValuesCache.set(`${cluster}:${release}`, {
          values: data.values,
          format: data.format || 'json',
          timestamp: Date.now(),
          consecutiveFailures: 0
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Helm values'
      setError(errorMessage)
      setConsecutiveFailures(prev => prev + 1)

      // Update cache failure count
      if (cluster && release && cachedEntry) {
        helmValuesCache.set(`${cluster}:${release}`, {
          ...cachedEntry,
          consecutiveFailures: (cachedEntry.consecutiveFailures || 0) + 1
        })
      }
      // Keep cached data on error
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, release, namespace, cachedEntry])

  useEffect(() => {
    // Use cached data if available
    const key = cluster && release ? `${cluster}:${release}` : ''
    const cached = key ? helmValuesCache.get(key) : undefined
    if (cached && cached.values !== null) {
      setValues(cached.values)
      setFormat(cached.format)
      setLastRefresh(cached.timestamp)
      setConsecutiveFailures(cached.consecutiveFailures || 0)
      // Only refetch if cache is stale (older than 30s)
      if (Date.now() - cached.timestamp > HELM_CACHE_TTL_MS) {
        refetch()
      }
    } else if (release) {
      refetch()
    }
  }, [cluster, release, refetch])

  const isFailed = consecutiveFailures >= 3

  return { values, format, isLoading, isRefreshing, error, refetch, isFailed, consecutiveFailures, lastRefresh }
}

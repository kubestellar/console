import { useState, useEffect, useCallback, useRef } from 'react'
import { api, isBackendUnavailable } from '../../lib/api'
import { fetchSSE } from '../../lib/sseClient'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { isDemoMode } from '../../lib/demoMode'
import { registerCacheReset, registerRefetch } from '../../lib/modeTransition'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { STORAGE_KEY_TOKEN } from '../../lib/constants'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, LOCAL_AGENT_URL, clusterCacheRef } from './shared'
import type { PodInfo, PodIssue, Deployment, DeploymentIssue, Job, HPA, ReplicaSet, StatefulSet, DaemonSet, CronJob } from './types'

// ---------------------------------------------------------------------------
// Shared Workloads State - enables cache reset notifications to all consumers
// ---------------------------------------------------------------------------

interface WorkloadsSharedState {
  cacheVersion: number  // Increments when cache is cleared to trigger re-fetch
  isResetting: boolean  // True during cache reset, triggers skeleton display
}

let workloadsSharedState: WorkloadsSharedState = {
  cacheVersion: 0,
  isResetting: false,
}

// Subscribers that get notified when workloads cache is cleared
type WorkloadsSubscriber = (state: WorkloadsSharedState) => void
const workloadsSubscribers = new Set<WorkloadsSubscriber>()

// Notify all subscribers of cache reset
function notifyWorkloadsSubscribers() {
  workloadsSubscribers.forEach(subscriber => subscriber(workloadsSharedState))
}

// Subscribe to workloads cache changes (for hooks that need reactive updates)
export function subscribeWorkloadsCache(callback: WorkloadsSubscriber): () => void {
  workloadsSubscribers.add(callback)
  return () => workloadsSubscribers.delete(callback)
}

// ---------------------------------------------------------------------------
// Demo data (internal to this module)
// ---------------------------------------------------------------------------

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

function getDemoPodIssues(): PodIssue[] {
  return [
    {
      name: 'api-server-crash-7d8f9c6b5',
      namespace: 'production',
      cluster: 'prod-east',
      status: 'CrashLoopBackOff',
      restarts: 23,
      reason: 'CrashLoopBackOff',
      issues: ['Back-off 5m0s restarting failed container'],
    },
    {
      name: 'worker-oom-5c6d7e8f9',
      namespace: 'batch',
      cluster: 'vllm-d',
      status: 'OOMKilled',
      restarts: 8,
      reason: 'OOMKilled',
      issues: ['Container exceeded memory limit'],
    },
    {
      name: 'pending-pod-abc123',
      namespace: 'staging',
      cluster: 'staging',
      status: 'Pending',
      restarts: 0,
      reason: 'Unschedulable',
      issues: ['No nodes available with required resources'],
    },
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

// ---------------------------------------------------------------------------
// Module-level cache for pods data (persists across navigation)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// usePods – Hook to get pods with localStorage-backed caching
// ---------------------------------------------------------------------------

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
    // In demo mode, use demo data
    if (isDemoMode()) {
      const demoPods = getDemoPods().filter(p =>
        (!cluster || p.cluster === cluster) && (!namespace || p.namespace === namespace)
      )
      // Sort demo data the same way as live data
      const sortedDemoPods = sortBy === 'restarts'
        ? demoPods.sort((a, b) => b.restarts - a.restarts)
        : demoPods.sort((a, b) => a.name.localeCompare(b.name))
      setPods(sortedDemoPods.slice(0, limit))
      const now = new Date()
      setLastUpdated(now)
      setLastRefresh(now)
      setIsLoading(false)
      setError(null)
      if (!silent) {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
      return
    }

    // Skip backend fetch when backend is unavailable
    if (isBackendUnavailable()) {
      const now = new Date()
      setLastUpdated(now)
      setLastRefresh(now)
      setIsLoading(false)
      if (!silent) {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
      return
    }

    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      setIsRefreshing(true)
      const hasCachedData = podsCache && podsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace

      const allPods = await fetchSSE<PodInfo>({
        url: '/api/mcp/pods/stream',
        params: sseParams,
        itemsKey: 'pods',
        onClusterData: (_clusterName, items) => {
          // Progressive update — show data as it arrives
          setPods(prev => {
            const merged = [...prev, ...items]
            const sorted = sortBy === 'restarts'
              ? merged.sort((a, b) => b.restarts - a.restarts)
              : merged.sort((a, b) => a.name.localeCompare(b.name))
            return sorted.slice(0, limit)
          })
          setIsLoading(false)
        },
      })

      // Final sort & cache with all pods
      let sortedPods = allPods
      if (sortBy === 'restarts') {
        sortedPods = sortedPods.sort((a, b) => b.restarts - a.restarts)
      } else {
        sortedPods = sortedPods.sort((a, b) => a.name.localeCompare(b.name))
      }

      // Store all pods in cache (before limiting) so GPU workloads can use the full list
      const now = new Date()
      podsCache = { data: sortedPods, timestamp: now, key: cacheKey }
      savePodsCacheToStorage()

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
      setIsLoading(false)
      if (!silent) {
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [cluster, namespace, sortBy, limit, cacheKey])

  useEffect(() => {
    const hasCachedData = podsCache && podsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll for pod updates
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`pods:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      clearInterval(interval)
      unregisterRefetch()
    }
  }, [refetch, cacheKey])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: WorkloadsSharedState) => {
      if (state.isResetting) {
        // Cache was cleared - show skeleton by setting loading with no data
        setIsLoading(true)
        setPods([])
        setLastUpdated(null)
      }
    }
    const unsubscribe = subscribeWorkloadsCache(handleCacheReset)
    return unsubscribe
  }, [])

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

// ---------------------------------------------------------------------------
// useAllPods – Hook to get ALL pods (no limit)
// Uses the same cache as usePods but returns all pods without limiting
// ---------------------------------------------------------------------------

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
    if (isDemoMode()) {
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
    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace

      const allPods = await fetchSSE<PodInfo>({
        url: '/api/mcp/pods/stream',
        params: sseParams,
        itemsKey: 'pods',
        onClusterData: (_clusterName, items) => {
          setPods(prev => [...prev, ...items])
          setIsLoading(false)
        },
      })

      const now = new Date()
      podsCache = { data: allPods, timestamp: now, key: cacheKey }
      savePodsCacheToStorage()

      setPods(allPods)
      setError(null)
      setLastUpdated(now)
    } catch (err) {
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
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: WorkloadsSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setPods([])
        setLastUpdated(null)
      }
    }
    return subscribeWorkloadsCache(handleCacheReset)
  }, [])

  return { pods, isLoading, isRefreshing, lastUpdated, error, refetch: () => refetch(false) }
}

// ---------------------------------------------------------------------------
// Module-level cache for pod issues data (persists across navigation)
// ---------------------------------------------------------------------------

interface PodIssuesCache {
  data: PodIssue[]
  timestamp: Date
  key: string
}
let podIssuesCache: PodIssuesCache | null = null

// ---------------------------------------------------------------------------
// usePodIssues
// ---------------------------------------------------------------------------

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

  // Track previous values to detect actual changes (not just initial mount)
  const prevClusterRef = useRef<string | undefined>(cluster)
  const prevNamespaceRef = useRef<string | undefined>(namespace)

  // Reset state only when cluster/namespace actually CHANGES (not on initial mount)
  useEffect(() => {
    const clusterChanged = prevClusterRef.current !== cluster
    const namespaceChanged = prevNamespaceRef.current !== namespace

    if (clusterChanged || namespaceChanged) {
      setIssues([])
      setIsLoading(true)
      setError(null)
      prevClusterRef.current = cluster
      prevNamespaceRef.current = namespace
    }
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
    // In demo mode, use demo data
    if (isDemoMode()) {
      const demoIssues = getDemoPodIssues().filter(i =>
        (!cluster || i.cluster === cluster) && (!namespace || i.namespace === namespace)
      )
      setIssues(demoIssues)
      const now = new Date()
      setLastUpdated(now)
      setLastRefresh(now)
      setIsLoading(false)
      setError(null)
      if (!silent) {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
      return
    }

    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      // Always set isRefreshing first so indicator shows
      setIsRefreshing(true)
      const hasCachedData = podIssuesCache && podIssuesCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }

    // Try kubectl proxy first when cluster is specified (for cluster-specific issues)
    if (cluster && !isAgentUnavailable()) {
      try {
        const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
        const kubectlContext = clusterInfo?.context || cluster
        const podIssuesData = await kubectlProxy.getPodIssues(kubectlContext, namespace)
        const now = new Date()
        podIssuesCache = { data: podIssuesData, timestamp: now, key: cacheKey }
        setIssues(podIssuesData)
        setError(null)
        setLastUpdated(now)
        setConsecutiveFailures(0)
        setLastRefresh(now)
        setIsLoading(false)
        if (!silent) {
          setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        } else {
          setIsRefreshing(false)
        }
        return
      } catch {
        // kubectl proxy failed, fall through to SSE
      }
    }

    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace

      const allIssues = await fetchSSE<PodIssue>({
        url: '/api/mcp/pod-issues/stream',
        params: sseParams,
        itemsKey: 'issues',
        onClusterData: (_clusterName, items) => {
          setIssues(prev => [...prev, ...items])
          setIsLoading(false)
        },
      })

      const now = new Date()
      podIssuesCache = { data: allIssues, timestamp: now, key: cacheKey }
      setIssues(allIssues)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !podIssuesCache) {
        setError('Failed to fetch pod issues')
        setIssues([])
      }
    } finally {
      setIsLoading(false)
      if (!silent) {
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    const hasCachedData = podIssuesCache && podIssuesCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll every 30 seconds for pod issue updates
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: WorkloadsSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setIssues([])
        setLastUpdated(null)
      }
    }
    return subscribeWorkloadsCache(handleCacheReset)
  }, [])

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

// ---------------------------------------------------------------------------
// Module-level cache for deployment issues data (persists across navigation)
// ---------------------------------------------------------------------------

interface DeploymentIssuesCache {
  data: DeploymentIssue[]
  timestamp: Date
  key: string
}
let deploymentIssuesCache: DeploymentIssuesCache | null = null

// ---------------------------------------------------------------------------
// useDeploymentIssues
// ---------------------------------------------------------------------------

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
    // In demo mode, use demo data
    if (isDemoMode()) {
      const demoIssues = getDemoDeploymentIssues().filter(i =>
        (!cluster || i.cluster === cluster) && (!namespace || i.namespace === namespace)
      )
      setIssues(demoIssues)
      const now = new Date()
      setLastUpdated(now)
      setLastRefresh(now)
      setIsLoading(false)
      setError(null)
      if (!silent) {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
      return
    }

    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      // Always set isRefreshing first so indicator shows
      setIsRefreshing(true)
      const hasCachedData = deploymentIssuesCache && deploymentIssuesCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace

      const allIssues = await fetchSSE<DeploymentIssue>({
        url: '/api/mcp/deployment-issues/stream',
        params: sseParams,
        itemsKey: 'issues',
        onClusterData: (_clusterName, items) => {
          setIssues(prev => [...prev, ...items])
          setIsLoading(false)
        },
      })

      const now = new Date()
      deploymentIssuesCache = { data: allIssues, timestamp: now, key: cacheKey }
      setIssues(allIssues)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !deploymentIssuesCache) {
        setError('Failed to fetch deployment issues')
        setIssues(getDemoDeploymentIssues())
      }
    } finally {
      setIsLoading(false)
      if (!silent) {
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    const hasCachedData = deploymentIssuesCache && deploymentIssuesCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll every 30 seconds for deployment issues
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: WorkloadsSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setIssues([])
        setLastUpdated(null)
      }
    }
    return subscribeWorkloadsCache(handleCacheReset)
  }, [])

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

// ---------------------------------------------------------------------------
// Module-level cache for deployments data (persists across navigation)
// ---------------------------------------------------------------------------

interface DeploymentsCache {
  data: Deployment[]
  timestamp: Date
  key: string
}
let deploymentsCache: DeploymentsCache | null = null

// ---------------------------------------------------------------------------
// useDeployments – Hook to get deployments with rollout status
// ---------------------------------------------------------------------------

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

  // Track previous values to detect actual changes (not just initial mount)
  const prevClusterRef = useRef<string | undefined>(cluster)
  const prevNamespaceRef = useRef<string | undefined>(namespace)

  // Reset state only when cluster/namespace actually CHANGES (not on initial mount)
  useEffect(() => {
    const clusterChanged = prevClusterRef.current !== cluster
    const namespaceChanged = prevNamespaceRef.current !== namespace

    if (clusterChanged || namespaceChanged) {
      setDeployments([])
      setIsLoading(true)
      setError(null)
      prevClusterRef.current = cluster
      prevNamespaceRef.current = namespace
    }
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
    // In demo mode, use demo data
    if (isDemoMode()) {
      const demoDeployments = getDemoDeployments().filter(d =>
        (!cluster || d.cluster === cluster) && (!namespace || d.namespace === namespace)
      )
      setDeployments(demoDeployments)
      const now = new Date()
      setLastUpdated(now)
      setLastRefresh(now)
      setIsLoading(false)
      setError(null)
      if (!silent) {
        setIsRefreshing(true)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
      } else {
        setIsRefreshing(false)
      }
      return
    }

    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      // Always set isRefreshing first so indicator shows
      setIsRefreshing(true)
      if (!deploymentsCache || deploymentsCache.key !== cacheKey) {
        // Also show loading if no cache
        setIsLoading(true)
      }
    }

    // Try local agent HTTP endpoint first (works without backend)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/deployments?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          const deployData = (data.deployments || []).map((d: Deployment) => ({ ...d, cluster: d.cluster || cluster }))
          const now = new Date()
          // Update cache
          deploymentsCache = { data: deployData, timestamp: now, key: cacheKey }
          setDeployments(deployData)
          setError(null)
          setLastUpdated(now)
          setConsecutiveFailures(0)
          setLastRefresh(now)
          setIsLoading(false)
          if (!silent) {
            setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
          } else {
            setIsRefreshing(false)
          }
          reportAgentDataSuccess()
          return
        }
      } catch {
      }
    }

    // Try kubectl proxy as fallback
    if (cluster && !isAgentUnavailable()) {
      try {
        const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
        const kubectlContext = clusterInfo?.context || cluster
        // Add timeout to prevent hanging
        const deployPromise = kubectlProxy.getDeployments(kubectlContext, namespace)
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 15000)
        )
        const deployData = await Promise.race([deployPromise, timeoutPromise])

        if (deployData && deployData.length >= 0) {
          const enriched = deployData.map((d: Deployment) => ({ ...d, cluster: d.cluster || cluster }))
          const now = new Date()
          deploymentsCache = { data: enriched, timestamp: now, key: cacheKey }
          setDeployments(enriched)
          setError(null)
          setLastUpdated(now)
          setConsecutiveFailures(0)
          setLastRefresh(now)
          setIsLoading(false)
          if (!silent) {
            setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
          } else {
            setIsRefreshing(false)
          }
          return
        }
      } catch {
      }
    }

    // Fall back to REST API
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const url = `/api/mcp/deployments?${params}`

      if (isDemoMode()) {
        setDeployments([])
        const now = new Date()
        setLastUpdated(now)
        setLastRefresh(now)
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(url, { method: 'GET', headers })
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { deployments: Deployment[] }
      const newDeployments = (data.deployments || []).map(d => ({ ...d, cluster: d.cluster || cluster || 'unknown' }))
      setDeployments(newDeployments)
      setError(null)
      const now = new Date()
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
      deploymentsCache = { data: newDeployments, timestamp: now, key: cacheKey }
    } catch (err) {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !deploymentsCache) {
        setError('Failed to fetch deployments')
        setDeployments([])
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
        await new Promise(resolve => setTimeout(resolve, MIN_REFRESH_INDICATOR_MS))
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    // If we have cached data, do a silent refresh
    const hasCachedData = deploymentsCache && deploymentsCache.key === cacheKey
    refetch(hasCachedData ? true : false)
    // Poll every 30 seconds for deployment updates
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`deployments:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      clearInterval(interval)
      unregisterRefetch()
    }
  }, [refetch, cacheKey])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: WorkloadsSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setDeployments([])
        setLastUpdated(null)
      }
    }
    return subscribeWorkloadsCache(handleCacheReset)
  }, [])

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

// ---------------------------------------------------------------------------
// useJobs
// ---------------------------------------------------------------------------

export function useJobs(cluster?: string, namespace?: string) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/jobs?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setJobs(data.jobs || [])
          setError(null)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace
      const result = await fetchSSE<Job>({
        url: '/api/mcp/jobs/stream',
        params: sseParams,
        itemsKey: 'jobs',
        onClusterData: (_clusterName, items) => {
          setJobs(prev => [...prev, ...items])
          setIsLoading(false)
        },
      })
      setJobs(result)
      setError(null)
    } catch {
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

// ---------------------------------------------------------------------------
// useHPAs
// ---------------------------------------------------------------------------

export function useHPAs(cluster?: string, namespace?: string) {
  const [hpas, setHPAs] = useState<HPA[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/hpas?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setHPAs(data.hpas || [])
          setError(null)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ hpas: HPA[] }>(`/api/mcp/hpas?${params}`)
      setHPAs(data.hpas || [])
      setError(null)
    } catch {
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

// ---------------------------------------------------------------------------
// useReplicaSets
// ---------------------------------------------------------------------------

export function useReplicaSets(cluster?: string, namespace?: string) {
  const [replicasets, setReplicaSets] = useState<ReplicaSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    // Try local agent first
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/replicasets?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setReplicaSets(data.replicasets || [])
          setError(null)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ replicasets: ReplicaSet[] }>(`/api/mcp/replicasets?${params}`)
      setReplicaSets(data.replicasets || [])
      setError(null)
    } catch {
      setError('Failed to fetch ReplicaSets')
      setReplicaSets([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => { refetch() }, [refetch])
  return { replicasets, isLoading, error, refetch }
}

// ---------------------------------------------------------------------------
// useStatefulSets
// ---------------------------------------------------------------------------

export function useStatefulSets(cluster?: string, namespace?: string) {
  const [statefulsets, setStatefulSets] = useState<StatefulSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/statefulsets?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setStatefulSets(data.statefulsets || [])
          setError(null)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ statefulsets: StatefulSet[] }>(`/api/mcp/statefulsets?${params}`)
      setStatefulSets(data.statefulsets || [])
      setError(null)
    } catch {
      setError('Failed to fetch StatefulSets')
      setStatefulSets([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => { refetch() }, [refetch])
  return { statefulsets, isLoading, error, refetch }
}

// ---------------------------------------------------------------------------
// useDaemonSets
// ---------------------------------------------------------------------------

export function useDaemonSets(cluster?: string, namespace?: string) {
  const [daemonsets, setDaemonSets] = useState<DaemonSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/daemonsets?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setDaemonSets(data.daemonsets || [])
          setError(null)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ daemonsets: DaemonSet[] }>(`/api/mcp/daemonsets?${params}`)
      setDaemonSets(data.daemonsets || [])
      setError(null)
    } catch {
      setError('Failed to fetch DaemonSets')
      setDaemonSets([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => { refetch() }, [refetch])
  return { daemonsets, isLoading, error, refetch }
}

// ---------------------------------------------------------------------------
// useCronJobs
// ---------------------------------------------------------------------------

export function useCronJobs(cluster?: string, namespace?: string) {
  const [cronjobs, setCronJobs] = useState<CronJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(`${LOCAL_AGENT_URL}/cronjobs?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setCronJobs(data.cronjobs || [])
          setError(null)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ cronjobs: CronJob[] }>(`/api/mcp/cronjobs?${params}`)
      setCronJobs(data.cronjobs || [])
      setError(null)
    } catch {
      setError('Failed to fetch CronJobs')
      setCronJobs([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  useEffect(() => { refetch() }, [refetch])
  return { cronjobs, isLoading, error, refetch }
}

// ---------------------------------------------------------------------------
// usePodLogs
// ---------------------------------------------------------------------------

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

// ============================================================================
// Mode Transition Registration - Clear all workload caches for unified demo switching
// ============================================================================

if (typeof window !== 'undefined') {
  registerCacheReset('workloads', () => {
    // Set resetting flag to trigger skeleton display in all subscribed hooks
    workloadsSharedState = {
      cacheVersion: workloadsSharedState.cacheVersion + 1,
      isResetting: true,
    }
    notifyWorkloadsSubscribers()

    // Clear pods cache
    try {
      localStorage.removeItem(PODS_CACHE_KEY)
    } catch {
      // Ignore storage errors
    }
    podsCache = null

    // Clear other module-level caches
    podIssuesCache = null
    deploymentIssuesCache = null
    deploymentsCache = null

    // Reset the resetting flag after a tick (hooks will re-fetch)
    setTimeout(() => {
      workloadsSharedState = { ...workloadsSharedState, isResetting: false }
      notifyWorkloadsSubscribers()
    }, 0)
  })
}

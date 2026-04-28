import { useState, useEffect, useCallback, useRef } from 'react'
import { api, isBackendUnavailable } from '../../lib/api'
import { fetchSSE } from '../../lib/sseClient'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { isDemoMode } from '../../lib/demoMode'
import { registerCacheReset, registerRefetch } from '../../lib/modeTransition'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, LOCAL_AGENT_URL, clusterCacheRef, fetchWithRetry } from './shared'
import { subscribePolling } from './pollingManager'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../lib/constants/network'
import type { PodInfo, PodIssue, Deployment, DeploymentIssue, Job, HPA, ReplicaSet, StatefulSet, DaemonSet, CronJob } from './types'
import { classifyError, type ClusterErrorType } from '../../lib/errorClassifier'

/**
 * Per-cluster error surfaced by `useAllPods` when the backend emits a
 * `cluster_error` SSE event for a particular cluster (Issue 9353). Lets the
 * drill-down distinguish an RBAC denial ({@link ClusterErrorType} === 'auth')
 * from a transient 5xx/timeout failure so the UI can render a specific
 * explanation instead of a generic "detailed list is empty" warning.
 */
export interface PodClusterError {
  cluster: string
  errorType: ClusterErrorType
  message: string
}

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
  // Include sortBy and limit in cache key to prevent cross-view stale data (#7218)
  const cacheKey = `pods:${cluster || 'all'}:${namespace || 'all'}:${sortBy}:${limit}`

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
  const sseAbortRef = useRef<AbortController | null>(null)

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
    // Cancel any in-flight SSE request before starting a new one
    sseAbortRef.current?.abort()
    const abortController = new AbortController()
    sseAbortRef.current = abortController

    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace

      const allPods = await fetchSSE<PodInfo>({
        url: `${LOCAL_AGENT_HTTP_URL}/pods/stream`,
        params: sseParams,
        itemsKey: 'pods',
        signal: abortController.signal,
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
      // Ignore AbortError — expected when cluster/namespace changes during a fetch
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Keep stale data on error — only fall back to demo data when demo mode is active
      const message = err instanceof Error ? err.message : 'Failed to fetch pods'
      console.warn('[usePods] Fetch failed:', message)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !podsCache) {
        setError(message)
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
    // Poll for pod updates (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `pods:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`pods:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      unsubscribePolling()
      unregisterRefetch()
      sseAbortRef.current?.abort()
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

// When forceLive is true, skip demo mode fallback and always query the real API.
// Used by GPU cards when running in-cluster with OAuth.
export function useAllPods(cluster?: string, namespace?: string, forceLive = false) {
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
  // Per-cluster errors from the SSE `cluster_error` event (Issue 9353). Lets
  // consumers (drill-downs) distinguish an RBAC denial on one or more
  // clusters from a globally-transient failure so the UI can show a
  // specific "lacks list-pods RBAC on cluster X" message instead of a
  // generic "detailed list is empty" warning.
  const [clusterErrors, setClusterErrors] = useState<PodClusterError[]>(
    [],
  )
  const sseAbortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async (silent = false) => {
    // If demo mode is enabled (and not overridden by forceLive), use demo data
    if (!forceLive && isDemoMode()) {
      const demoPods = getDemoAllPods().filter(p =>
        (!cluster || p.cluster === cluster) && (!namespace || p.namespace === namespace)
      )
      setPods(demoPods)
      setIsLoading(false)
      setError(null)
      setClusterErrors([])
      setLastUpdated(new Date())
      return
    }
    if (!silent) {
      const hasCachedData = podsCache && podsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    // Cancel any in-flight SSE request before starting a new one
    sseAbortRef.current?.abort()
    const abortController = new AbortController()
    sseAbortRef.current = abortController

    // Collect per-cluster error events during this refetch. We replace the
    // previous snapshot atomically when the stream settles so a transient
    // flash of "cluster X failed" isn't left stale after a retry succeeds.
    const collectedErrors: PodClusterError[] = []

    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace

      const allPods = await fetchSSE<PodInfo>({
        url: `${LOCAL_AGENT_HTTP_URL}/pods/stream`,
        params: sseParams,
        itemsKey: 'pods',
        signal: abortController.signal,
        onClusterData: (_clusterName, items) => {
          setPods(prev => [...prev, ...items])
          setIsLoading(false)
        },
        onClusterError: (clusterName, errorMessage) => {
          // Classify the raw backend error so consumers can render an
          // RBAC-specific message (auth) instead of "transient failure"
          // (timeout/network/unknown). Backend error strings already
          // contain enough context ("pods is forbidden", "401",
          // "unauthorized", etc.) for the classifier to match.
          const classified = classifyError(errorMessage)
          collectedErrors.push({
            cluster: clusterName,
            errorType: classified.type,
            message: errorMessage,
          })
        },
      })

      const now = new Date()
      podsCache = { data: allPods, timestamp: now, key: cacheKey }
      savePodsCacheToStorage()

      setPods(allPods)
      setError(null)
      setClusterErrors(collectedErrors)
      setLastUpdated(now)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Failed to fetch pods'
      console.warn('[useAllPods] Fetch failed:', message)
      if (!silent && !podsCache) {
        setError(message)
      }
      // Even on catastrophic failure, surface any per-cluster errors we
      // collected before the stream aborted so the UI can still explain
      // the partial state.
      setClusterErrors(collectedErrors)
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace, cacheKey, forceLive])

  useEffect(() => {
    const hasCachedData = podsCache && podsCache.key === cacheKey
    refetch(!!hasCachedData) // silent=true if we have cached data
    // Poll for pod updates (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `allPods:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`allPods:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      unsubscribePolling()
      unregisterRefetch()
      sseAbortRef.current?.abort()
    }
  }, [refetch, cacheKey])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: WorkloadsSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setPods([])
        setClusterErrors([])
        setLastUpdated(null)
      }
    }
    return subscribeWorkloadsCache(handleCacheReset)
  }, [])

  return {
    pods,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    // Per-cluster errors surfaced from the SSE stream (Issue 9353) so the
    // multi-cluster drill-down can explain an empty list with "lacks
    // list-pods RBAC on cluster X" rather than a generic warning.
    clusterErrors,
    refetch: () => refetch(false) }
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
  const sseAbortRef = useRef<AbortController | null>(null)

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
        // Guard against null/undefined when proxy is disconnected or in cooldown
        const safePodIssues = podIssuesData || []
        const now = new Date()
        podIssuesCache = { data: safePodIssues, timestamp: now, key: cacheKey }
        setIssues(safePodIssues)
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
      } catch (proxyErr) {
        // kubectl proxy failed, fall through to SSE
        console.debug('[usePodIssues] kubectl proxy failed, falling back to SSE:', proxyErr)
      }
    }

    // Cancel any in-flight SSE request before starting a new one
    sseAbortRef.current?.abort()
    const abortController = new AbortController()
    sseAbortRef.current = abortController

    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace

      // pod-issues is a backend-only endpoint (#9996) — route SSE via /api/mcp/
      const allIssues = await fetchSSE<PodIssue>({
        url: `/api/mcp/pod-issues/stream`,
        params: sseParams,
        itemsKey: 'issues',
        signal: abortController.signal,
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
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Failed to fetch pod issues'
      console.warn('[usePodIssues] Fetch failed:', message)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !podIssuesCache) {
        setError(message)
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
    // Poll for pod issue updates (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `podIssues:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`podIssues:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      unsubscribePolling()
      unregisterRefetch()
      sseAbortRef.current?.abort()
    }
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
  const sseAbortRef = useRef<AbortController | null>(null)

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
    // Cancel any in-flight SSE request before starting a new one
    sseAbortRef.current?.abort()
    const abortController = new AbortController()
    sseAbortRef.current = abortController

    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace

      // deployment-issues is a backend-only endpoint (#9996) — route SSE via /api/mcp/
      const allIssues = await fetchSSE<DeploymentIssue>({
        url: `/api/mcp/deployment-issues/stream`,
        params: sseParams,
        itemsKey: 'issues',
        signal: abortController.signal,
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
      if (err instanceof DOMException && err.name === 'AbortError') return
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !deploymentIssuesCache) {
        setError('Failed to fetch deployment issues')
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
    // Poll for deployment issues (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `deploymentIssues:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`deploymentIssues:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      unsubscribePolling()
      unregisterRefetch()
      sseAbortRef.current?.abort()
    }
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
        const response = await fetchWithRetry(`${LOCAL_AGENT_URL}/deployments?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })

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
      } catch (agentErr) {
        // Agent unavailable — fall through to kubectl proxy
        console.debug('[useDeployments] Agent fetch failed, falling back to kubectl proxy:', agentErr)
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
          setTimeout(() => resolve(null), MCP_HOOK_TIMEOUT_MS)
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
      } catch (proxyErr) {
        // kubectl proxy unavailable — fall through to REST API
        console.debug('[useDeployments] kubectl proxy failed, falling back to REST API:', proxyErr)
      }
    }

    // Fall back to REST API
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const url = `${LOCAL_AGENT_HTTP_URL}/deployments?${params}`

      if (isDemoMode()) {
        setDeployments([])
        const now = new Date()
        setLastUpdated(now)
        setLastRefresh(now)
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: MCP_HOOK_TIMEOUT_MS,
      })
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
      const message = err instanceof Error ? err.message : 'Failed to fetch deployments'
      console.error('[useDeployments] All fetch sources failed:', message, err)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !deploymentsCache) {
        setError(message)
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
    // Poll for deployment updates (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `deployments:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS),
      () => refetch(true),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`deployments:${cacheKey}`, () => {
      refetch(false)
    })

    return () => {
      unsubscribePolling()
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
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const sseAbortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_URL}/jobs?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          setJobs(data.jobs || [])
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr) {
        // Agent failed — fall through to SSE
        console.debug('[useJobs] Agent fetch failed, falling back to SSE:', agentErr)
      }
    }

    // Cancel any in-flight SSE request before starting a new one
    sseAbortRef.current?.abort()
    const abortController = new AbortController()
    sseAbortRef.current = abortController

    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster
      if (namespace) sseParams.namespace = namespace
      const result = await fetchSSE<Job>({
        url: `${LOCAL_AGENT_HTTP_URL}/jobs/stream`,
        params: sseParams,
        itemsKey: 'jobs',
        signal: abortController.signal,
        onClusterData: (_clusterName, items) => {
          setJobs(prev => [...prev, ...items])
          setIsLoading(false)
        },
      })
      setJobs(result)
      setError(null)
      setConsecutiveFailures(0)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Failed to fetch jobs'
      console.warn('[useJobs] Fetch failed:', message)
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      setJobs([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  const jobsInitRef = useRef(false)
  useEffect(() => {
    if (jobsInitRef.current) return
    jobsInitRef.current = true
    refetch()
    return () => { sseAbortRef.current?.abort() }
  }, [refetch])

  return { jobs, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useHPAs
// ---------------------------------------------------------------------------

export function useHPAs(cluster?: string, namespace?: string) {
  const [hpas, setHPAs] = useState<HPA[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_URL}/hpas?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          setHPAs(data.hpas || [])
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr) {
        // Agent failed — fall through to REST API
        console.debug('[useHPAs] Agent fetch failed, falling back to REST API:', agentErr)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ hpas: HPA[] }>(`${LOCAL_AGENT_HTTP_URL}/hpas?${params}`)
      setHPAs(data.hpas || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch HPAs'
      if (err instanceof Error && err.name === 'UnauthenticatedError') { console.debug('[useHPAs] Skipped — no auth token') } else { console.error('[useHPAs] Fetch failed:', message, err) }
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      setHPAs([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  const hpasInitRef = useRef(false)
  useEffect(() => {
    if (hpasInitRef.current) return
    hpasInitRef.current = true
    refetch()
  }, [refetch])

  return { hpas, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useReplicaSets
// ---------------------------------------------------------------------------

export function useReplicaSets(cluster?: string, namespace?: string) {
  const [replicasets, setReplicaSets] = useState<ReplicaSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    // Try local agent first
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_URL}/replicasets?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          setReplicaSets(data.replicasets || [])
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr) {
        // Agent failed — fall through to REST API
        console.debug('[useReplicaSets] Agent fetch failed, falling back to REST API:', agentErr)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ replicasets: ReplicaSet[] }>(`${LOCAL_AGENT_HTTP_URL}/replicasets?${params}`)
      setReplicaSets(data.replicasets || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch ReplicaSets'
      if (err instanceof Error && err.name === 'UnauthenticatedError') { console.debug('[useReplicaSets] Skipped — no auth token') } else { console.error('[useReplicaSets] Fetch failed:', message, err) }
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      setReplicaSets([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  const replicaSetsInitRef = useRef(false)
  useEffect(() => {
    if (replicaSetsInitRef.current) return
    replicaSetsInitRef.current = true
    refetch()
  }, [refetch])
  return { replicasets, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useStatefulSets
// ---------------------------------------------------------------------------

export function useStatefulSets(cluster?: string, namespace?: string) {
  const [statefulsets, setStatefulSets] = useState<StatefulSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_URL}/statefulsets?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          setStatefulSets(data.statefulsets || [])
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr) {
        // Agent failed — fall through to REST API
        console.debug('[useStatefulSets] Agent fetch failed, falling back to REST API:', agentErr)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ statefulsets: StatefulSet[] }>(`${LOCAL_AGENT_HTTP_URL}/statefulsets?${params}`)
      setStatefulSets(data.statefulsets || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch StatefulSets'
      if (err instanceof Error && err.name === 'UnauthenticatedError') { console.debug('[useStatefulSets] Skipped — no auth token') } else { console.error('[useStatefulSets] Fetch failed:', message, err) }
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      setStatefulSets([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  const statefulSetsInitRef = useRef(false)
  useEffect(() => {
    if (statefulSetsInitRef.current) return
    statefulSetsInitRef.current = true
    refetch()
  }, [refetch])
  return { statefulsets, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useDaemonSets
// ---------------------------------------------------------------------------

export function useDaemonSets(cluster?: string, namespace?: string) {
  const [daemonsets, setDaemonSets] = useState<DaemonSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_URL}/daemonsets?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          setDaemonSets(data.daemonsets || [])
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr) {
        // Agent failed — fall through to REST API
        console.debug('[useDaemonSets] Agent fetch failed, falling back to REST API:', agentErr)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ daemonsets: DaemonSet[] }>(`${LOCAL_AGENT_HTTP_URL}/daemonsets?${params}`)
      setDaemonSets(data.daemonsets || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch DaemonSets'
      if (err instanceof Error && err.name === 'UnauthenticatedError') { console.debug('[useDaemonSets] Skipped — no auth token') } else { console.error('[useDaemonSets] Fetch failed:', message, err) }
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      setDaemonSets([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  const daemonSetsInitRef = useRef(false)
  useEffect(() => {
    if (daemonSetsInitRef.current) return
    daemonSetsInitRef.current = true
    refetch()
  }, [refetch])
  return { daemonsets, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useCronJobs
// ---------------------------------------------------------------------------

export function useCronJobs(cluster?: string, namespace?: string) {
  const [cronjobs, setCronJobs] = useState<CronJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_URL}/cronjobs?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          setCronJobs(data.cronjobs || [])
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr) {
        // Agent failed — fall through to REST API
        console.debug('[useCronJobs] Agent fetch failed, falling back to REST API:', agentErr)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ cronjobs: CronJob[] }>(`${LOCAL_AGENT_HTTP_URL}/cronjobs?${params}`)
      setCronJobs(data.cronjobs || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch CronJobs'
      if (err instanceof Error && err.name === 'UnauthenticatedError') { console.debug('[useCronJobs] Skipped — no auth token') } else { console.error('[useCronJobs] Fetch failed:', message, err) }
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      setCronJobs([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace])

  const cronJobsInitRef = useRef(false)
  useEffect(() => {
    if (cronJobsInitRef.current) return
    cronJobsInitRef.current = true
    refetch()
  }, [refetch])
  return { cronjobs, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// usePodLogs
// ---------------------------------------------------------------------------

/** Default tail line count when caller does not specify one (matches backend default). */
export const USE_POD_LOGS_DEFAULT_TAIL = 100

export function usePodLogs(cluster: string, namespace: string, pod: string, container?: string, tail = USE_POD_LOGS_DEFAULT_TAIL) {
  const [logs, setLogs] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!cluster || !namespace || !pod) {
      // Clear any stale state when required inputs are missing so the UI
      // doesn't continue to show logs from a previously selected pod.
      setLogs('')
      setError(null)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.append('cluster', cluster)
      params.append('namespace', namespace)
      params.append('pod', pod)
      if (container) params.append('container', container)
      params.append('tail', tail.toString())
      const { data } = await api.get<{ logs: string }>(`${LOCAL_AGENT_HTTP_URL}/pods/logs?${params}`)
      setLogs(data.logs || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs')
      setLogs('')
    } finally {
      setIsLoading(false)
    }
  }, [cluster, namespace, pod, container, tail])

  // Re-fetch whenever cluster/namespace/pod/container/tail change. A previous
  // implementation guarded this with a `useRef(false)` latch that only fired
  // once, which meant switching pods in the Logs dashboard never refreshed
  // the displayed logs.
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

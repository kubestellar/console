import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { getDemoMode } from '../useDemoMode'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, LOCAL_AGENT_URL, clusterCacheRef } from './shared'
import type { PodInfo, PodIssue, Deployment, DeploymentIssue, Job, HPA, ReplicaSet, StatefulSet, DaemonSet, CronJob } from './types'

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

// @ts-ignore - kept for demo mode reference
function __getDemoDeployments(): Deployment[] {
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

function getDemoJobs(): Job[] {
  return [
    { name: 'data-migration-job', namespace: 'data', cluster: 'prod-east', status: 'Complete', completions: '1/1', duration: '2m30s', age: '1d' },
    { name: 'backup-job-daily', namespace: 'data', cluster: 'prod-east', status: 'Complete', completions: '1/1', duration: '15m', age: '6h' },
    { name: 'ml-training-batch', namespace: 'ml', cluster: 'vllm-d', status: 'Running', completions: '2/5', duration: '45m', age: '1h' },
    { name: 'report-generator', namespace: 'batch', cluster: 'staging', status: 'Complete', completions: '1/1', duration: '5m', age: '2h' },
    { name: 'index-rebuild', namespace: 'data', cluster: 'prod-east', status: 'Failed', completions: '0/1', duration: '10m', age: '30m' },
    { name: 'cleanup-job', namespace: 'system', cluster: 'staging', status: 'Complete', completions: '1/1', duration: '1m', age: '4h' },
  ]
}

function getDemoHPAs(): HPA[] {
  return [
    { name: 'api-gateway-hpa', namespace: 'production', cluster: 'prod-east', reference: 'Deployment/api-gateway', minReplicas: 2, maxReplicas: 10, currentReplicas: 4, targetCPU: '70%', currentCPU: '65%' },
    { name: 'frontend-hpa', namespace: 'web', cluster: 'prod-east', reference: 'Deployment/frontend', minReplicas: 3, maxReplicas: 20, currentReplicas: 8, targetCPU: '70%', currentCPU: '78%' },
    { name: 'worker-hpa', namespace: 'batch', cluster: 'vllm-d', reference: 'Deployment/worker', minReplicas: 1, maxReplicas: 5, currentReplicas: 3, targetCPU: '60%', currentCPU: '55%' },
    { name: 'inference-hpa', namespace: 'ml', cluster: 'vllm-d', reference: 'Deployment/ml-inference', minReplicas: 2, maxReplicas: 8, currentReplicas: 4, targetCPU: '80%', currentCPU: '65%' },
    { name: 'cache-hpa', namespace: 'data', cluster: 'staging', reference: 'Deployment/redis-cache', minReplicas: 1, maxReplicas: 3, currentReplicas: 1, targetCPU: '70%', currentCPU: '45%' },
  ]
}

function getDemoReplicaSets(): ReplicaSet[] {
  return [
    { name: 'api-gateway-7d8f9c6b5', namespace: 'production', cluster: 'prod-east', replicas: 3, readyReplicas: 3, ownerName: 'api-gateway', ownerKind: 'Deployment', age: '5d' },
    { name: 'api-gateway-6c7e8d9a4', namespace: 'production', cluster: 'prod-east', replicas: 0, readyReplicas: 0, ownerName: 'api-gateway', ownerKind: 'Deployment', age: '10d' },
    { name: 'frontend-8e9f0a1b2', namespace: 'web', cluster: 'prod-east', replicas: 5, readyReplicas: 5, ownerName: 'frontend', ownerKind: 'Deployment', age: '2d' },
    { name: 'worker-5c6d7e8f9', namespace: 'batch', cluster: 'vllm-d', replicas: 3, readyReplicas: 3, ownerName: 'worker', ownerKind: 'Deployment', age: '1d' },
    { name: 'ml-inference-4b5c6d7e8', namespace: 'ml', cluster: 'vllm-d', replicas: 4, readyReplicas: 4, ownerName: 'ml-inference', ownerKind: 'Deployment', age: '3d' },
    { name: 'monitoring-agent-3a4b5c6d7', namespace: 'monitoring', cluster: 'staging', replicas: 2, readyReplicas: 2, ownerName: 'monitoring-agent', ownerKind: 'Deployment', age: '7d' },
  ]
}

function getDemoStatefulSets(): StatefulSet[] {
  return [
    { name: 'postgres', namespace: 'data', cluster: 'prod-east', replicas: 3, readyReplicas: 3, status: 'Running', image: 'postgres:15', age: '30d' },
    { name: 'redis-cluster', namespace: 'data', cluster: 'prod-east', replicas: 6, readyReplicas: 6, status: 'Running', image: 'redis:7', age: '25d' },
    { name: 'kafka', namespace: 'streaming', cluster: 'prod-east', replicas: 3, readyReplicas: 3, status: 'Running', image: 'confluentinc/cp-kafka:7.5', age: '20d' },
    { name: 'elasticsearch', namespace: 'logging', cluster: 'prod-east', replicas: 3, readyReplicas: 2, status: 'Degraded', image: 'elasticsearch:8.12', age: '15d' },
    { name: 'prometheus', namespace: 'monitoring', cluster: 'staging', replicas: 2, readyReplicas: 2, status: 'Running', image: 'prom/prometheus:v2.50', age: '10d' },
    { name: 'zookeeper', namespace: 'streaming', cluster: 'prod-east', replicas: 3, readyReplicas: 3, status: 'Running', image: 'confluentinc/cp-zookeeper:7.5', age: '20d' },
  ]
}

function getDemoDaemonSets(): DaemonSet[] {
  return [
    { name: 'node-exporter', namespace: 'monitoring', cluster: 'prod-east', desiredScheduled: 5, currentScheduled: 5, ready: 5, status: 'Running', age: '30d' },
    { name: 'fluentd', namespace: 'logging', cluster: 'prod-east', desiredScheduled: 5, currentScheduled: 5, ready: 5, status: 'Running', age: '30d' },
    { name: 'nvidia-device-plugin', namespace: 'kube-system', cluster: 'vllm-d', desiredScheduled: 4, currentScheduled: 4, ready: 4, status: 'Running', age: '15d' },
    { name: 'kube-proxy', namespace: 'kube-system', cluster: 'prod-east', desiredScheduled: 5, currentScheduled: 5, ready: 5, status: 'Running', age: '45d' },
    { name: 'calico-node', namespace: 'kube-system', cluster: 'prod-east', desiredScheduled: 5, currentScheduled: 5, ready: 4, status: 'Degraded', age: '45d' },
    { name: 'datadog-agent', namespace: 'monitoring', cluster: 'staging', desiredScheduled: 3, currentScheduled: 3, ready: 3, status: 'Running', age: '20d' },
  ]
}

function getDemoCronJobs(): CronJob[] {
  return [
    { name: 'daily-backup', namespace: 'data', cluster: 'prod-east', schedule: '0 2 * * *', suspend: false, active: 0, lastSchedule: '6h', age: '30d' },
    { name: 'hourly-metrics', namespace: 'monitoring', cluster: 'prod-east', schedule: '0 * * * *', suspend: false, active: 1, lastSchedule: '15m', age: '25d' },
    { name: 'weekly-report', namespace: 'batch', cluster: 'prod-east', schedule: '0 8 * * 1', suspend: false, active: 0, lastSchedule: '5d', age: '60d' },
    { name: 'cleanup-old-data', namespace: 'data', cluster: 'staging', schedule: '0 3 * * *', suspend: false, active: 0, lastSchedule: '21h', age: '45d' },
    { name: 'model-retrain', namespace: 'ml', cluster: 'vllm-d', schedule: '0 0 * * 0', suspend: true, active: 0, lastSchedule: '14d', age: '20d' },
    { name: 'certificate-renewal', namespace: 'system', cluster: 'prod-east', schedule: '0 0 1 * *', suspend: false, active: 0, lastSchedule: '15d', age: '90d' },
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
    // Skip backend fetch only when not logged in at all
    const token = localStorage.getItem('token')
    if (!token) {
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
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const url = `/api/mcp/pods?${params}`

      // Use direct fetch to bypass the global circuit breaker
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      const response = await fetch(url, { method: 'GET', headers })
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { pods: PodInfo[] }
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
      setIsLoading(false)
      // Keep isRefreshing true for minimum time so user can see it, then reset
      if (!silent) {
        setTimeout(() => {
          setIsRefreshing(false)
        }, MIN_REFRESH_INDICATOR_MS)
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
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [refetch, cacheKey])

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

  // Reset state when cluster changes
  useEffect(() => {
    setIssues([])
    setIsLoading(true)
    setError(null)
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
    // Skip only if not logged in at all
    const token = localStorage.getItem('token')
    if (!token) {
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
        // Look up the cluster's context for kubectl commands
        const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
        const kubectlContext = clusterInfo?.context || cluster
        const podIssuesData = await kubectlProxy.getPodIssues(kubectlContext, namespace)
        const now = new Date()

        // Update module-level cache
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
      } catch (err) {
        // kubectl proxy failed, fall through to API
        console.error(`[usePodIssues] kubectl proxy failed for ${cluster}, trying API`)
      }
    }

    // Fall back to REST API
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
        // Don't use demo data - show empty instead to avoid confusion
        setIssues([])
      }
    } finally {
      setIsLoading(false)
      // Keep isRefreshing true for minimum time so user can see it, then reset
      if (!silent) {
        setTimeout(() => {
          setIsRefreshing(false)
        }, MIN_REFRESH_INDICATOR_MS)
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
    // Skip only when not logged in at all - allow demo-token to proceed so MSW can handle it
    const token = localStorage.getItem('token')
    if (!token) {
      if (!deploymentIssuesCache) {
        setIssues(getDemoDeploymentIssues())
      }
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
      // Always set isRefreshing first so indicator shows
      setIsRefreshing(true)
      const hasCachedData = deploymentIssuesCache && deploymentIssuesCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
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
      setIsLoading(false)
      // Keep isRefreshing true for minimum time so user can see it, then reset
      if (!silent) {
        setTimeout(() => {
          setIsRefreshing(false)
        }, MIN_REFRESH_INDICATOR_MS)
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

  // Reset state when cluster changes
  useEffect(() => {
    setDeployments([])
    setIsLoading(true)
    setError(null)
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
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

      const token = localStorage.getItem('token')
      // Skip only if no token at all (not logged in) - allow demo-token to proceed so MSW can handle it
      if (!token) {
        setDeployments([])
        const now = new Date()
        setLastUpdated(now)
        setLastRefresh(now)
        setIsLoading(false)
        setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        return
      }

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

// ---------------------------------------------------------------------------
// useJobs
// ---------------------------------------------------------------------------

export function useJobs(cluster?: string, namespace?: string) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoJobs = getDemoJobs().filter(j =>
        (!cluster || j.cluster === cluster) && (!namespace || j.namespace === namespace)
      )
      setJobs(demoJobs)
      setIsLoading(false)
      setError(null)
      return
    }
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
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const { data } = await api.get<{ jobs: Job[] }>(`/api/mcp/jobs?${params}`)
      setJobs(data.jobs || [])
      setError(null)
    } catch {
      setError('Failed to fetch jobs')
      // Fall back to demo data on error
      setJobs(getDemoJobs().filter(j =>
        (!cluster || j.cluster === cluster) && (!namespace || j.namespace === namespace)
      ))
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
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoHPAs = getDemoHPAs().filter(h =>
        (!cluster || h.cluster === cluster) && (!namespace || h.namespace === namespace)
      )
      setHPAs(demoHPAs)
      setIsLoading(false)
      setError(null)
      return
    }
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
      // Fall back to demo data on error
      setHPAs(getDemoHPAs().filter(h =>
        (!cluster || h.cluster === cluster) && (!namespace || h.namespace === namespace)
      ))
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
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoRS = getDemoReplicaSets().filter(rs =>
        (!cluster || rs.cluster === cluster) && (!namespace || rs.namespace === namespace)
      )
      setReplicaSets(demoRS)
      setIsLoading(false)
      setError(null)
      return
    }
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
      // Fall back to demo data on error
      setReplicaSets(getDemoReplicaSets().filter(rs =>
        (!cluster || rs.cluster === cluster) && (!namespace || rs.namespace === namespace)
      ))
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
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoSS = getDemoStatefulSets().filter(ss =>
        (!cluster || ss.cluster === cluster) && (!namespace || ss.namespace === namespace)
      )
      setStatefulSets(demoSS)
      setIsLoading(false)
      setError(null)
      return
    }
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
      // Fall back to demo data on error
      setStatefulSets(getDemoStatefulSets().filter(ss =>
        (!cluster || ss.cluster === cluster) && (!namespace || ss.namespace === namespace)
      ))
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
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoDS = getDemoDaemonSets().filter(ds =>
        (!cluster || ds.cluster === cluster) && (!namespace || ds.namespace === namespace)
      )
      setDaemonSets(demoDS)
      setIsLoading(false)
      setError(null)
      return
    }
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
      // Fall back to demo data on error
      setDaemonSets(getDemoDaemonSets().filter(ds =>
        (!cluster || ds.cluster === cluster) && (!namespace || ds.namespace === namespace)
      ))
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
    // If demo mode is enabled, use demo data
    if (getDemoMode()) {
      const demoCJ = getDemoCronJobs().filter(cj =>
        (!cluster || cj.cluster === cluster) && (!namespace || cj.namespace === namespace)
      )
      setCronJobs(demoCJ)
      setIsLoading(false)
      setError(null)
      return
    }
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
      // Fall back to demo data on error
      setCronJobs(getDemoCronJobs().filter(cj =>
        (!cluster || cj.cluster === cluster) && (!namespace || cj.namespace === namespace)
      ))
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

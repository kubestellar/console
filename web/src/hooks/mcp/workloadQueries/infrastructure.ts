import { useState, useEffect, useCallback, useRef } from 'react'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { fetchSSE } from '../../../lib/sseClient'
import { getClusterModeBaseUrl, isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { agentFetch, fetchWithRetry } from '../shared'
import type { CronJob, DaemonSet, HPA, Job, ReplicaSet, StatefulSet } from '../types'
import {
  fetchInClusterCollection,
  type UseCronJobsResult,
  type UseDaemonSetsResult,
  type UseHPAsResult,
  type UseJobsResult,
  type UseReplicaSetsResult,
  type UsePodLogsResult,
  type UseStatefulSetsResult,
} from './shared'

interface CollectionCache<T> {
  data: T[]
  key: string
}

function getCollectionCache<T>(cache: CollectionCache<T> | null, key: string): CollectionCache<T> | null {
  return cache?.key === key ? cache : null
}

let jobsCache: CollectionCache<Job> | null = null
let hpasCache: CollectionCache<HPA> | null = null
let replicaSetsCache: CollectionCache<ReplicaSet> | null = null
let statefulSetsCache: CollectionCache<StatefulSet> | null = null
let daemonSetsCache: CollectionCache<DaemonSet> | null = null
let cronJobsCache: CollectionCache<CronJob> | null = null

/**
 * Test utility to reset all module-level caches.
 * Should be called in test beforeEach() to ensure test isolation.
 */
export function __resetInfrastructureCaches(): void {
  jobsCache = null
  hpasCache = null
  replicaSetsCache = null
  statefulSetsCache = null
  daemonSetsCache = null
  cronJobsCache = null
}

// ---------------------------------------------------------------------------
// useJobs
// ---------------------------------------------------------------------------

export function useJobs(cluster?: string, namespace?: string): UseJobsResult {
  const cacheKey = `jobs:${cluster || 'all'}:${namespace || 'all'}`
  const cached = getCollectionCache(jobsCache, cacheKey)
  const [jobs, setJobs] = useState<Job[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const sseAbortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    const hasCachedData = jobsCache?.key === cacheKey
    if (!hasCachedData) {
      setIsLoading(true)
    }
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isClusterModeBackend()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_HTTP_URL}/jobs?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          const nextJobs = data.jobs || []
          jobsCache = { data: nextJobs, key: cacheKey }
          setJobs(nextJobs)
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr: unknown) {
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
        url: `${getClusterModeBaseUrl()}/jobs/stream`,
        params: sseParams,
        itemsKey: 'jobs',
        signal: abortController.signal,
        onClusterData: (_clusterName, items) => {
          setJobs(prev => [...prev, ...items])
          setIsLoading(false)
        },
      })
      jobsCache = { data: result, key: cacheKey }
      setJobs(result)
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Failed to fetch jobs'
      console.warn('[useJobs] Fetch failed:', message)
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      if (!hasCachedData) {
        setJobs([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [cacheKey, cluster, namespace])

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

export function useHPAs(cluster?: string, namespace?: string): UseHPAsResult {
  const cacheKey = `hpas:${cluster || 'all'}:${namespace || 'all'}`
  const cached = getCollectionCache(hpasCache, cacheKey)
  const [hpas, setHPAs] = useState<HPA[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    const hasCachedData = hpasCache?.key === cacheKey
    if (!hasCachedData) {
      setIsLoading(true)
    }
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isClusterModeBackend()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_HTTP_URL}/hpas?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          const nextHPAs = data.hpas || []
          hpasCache = { data: nextHPAs, key: cacheKey }
          setHPAs(nextHPAs)
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr: unknown) {
        // Agent failed — fall through to REST API
        console.debug('[useHPAs] Agent fetch failed, falling back to REST API:', agentErr)
      }
    }
    if (isClusterModeBackend()) {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendHPAs = await fetchInClusterCollection<HPA>('hpas', params, 'hpas')
      if (backendHPAs) {
        hpasCache = { data: backendHPAs, key: cacheKey }
        setHPAs(backendHPAs)
        setError(null)
        setConsecutiveFailures(0)
      }
      setIsLoading(false)
      return
    }
    if (!LOCAL_AGENT_HTTP_URL) {
      setIsLoading(false)
      return
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/hpas?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const nextHPAs = data.hpas || []
      hpasCache = { data: nextHPAs, key: cacheKey }
      setHPAs(nextHPAs)
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch HPAs'
      if (err instanceof Error && err.name === 'UnauthenticatedError') { console.debug('[useHPAs] Skipped — no auth token') } else { console.error('[useHPAs] Fetch failed:', message, err) }
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      if (!hasCachedData) {
        setHPAs([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [cacheKey, cluster, namespace])

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

export function useReplicaSets(cluster?: string, namespace?: string): UseReplicaSetsResult {
  const cacheKey = `replicasets:${cluster || 'all'}:${namespace || 'all'}`
  const cached = getCollectionCache(replicaSetsCache, cacheKey)
  const [replicaSets, setReplicaSets] = useState<ReplicaSet[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    const hasCachedData = replicaSetsCache?.key === cacheKey
    if (!hasCachedData) {
      setIsLoading(true)
    }
    // Try local agent first
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isClusterModeBackend()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_HTTP_URL}/replicasets?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          const nextReplicaSets = data.replicasets || []
          replicaSetsCache = { data: nextReplicaSets, key: cacheKey }
          setReplicaSets(nextReplicaSets)
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr: unknown) {
        // Agent failed — fall through to REST API
        console.debug('[useReplicaSets] Agent fetch failed, falling back to REST API:', agentErr)
      }
    }
    if (isClusterModeBackend()) {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendReplicaSets = await fetchInClusterCollection<ReplicaSet>('replicasets', params, 'replicasets')
      if (backendReplicaSets) {
        replicaSetsCache = { data: backendReplicaSets, key: cacheKey }
        setReplicaSets(backendReplicaSets)
        setError(null)
        setConsecutiveFailures(0)
      }
      setIsLoading(false)
      return
    }
    if (!LOCAL_AGENT_HTTP_URL) {
      setIsLoading(false)
      return
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/replicasets?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const nextReplicaSets = data.replicasets || []
      replicaSetsCache = { data: nextReplicaSets, key: cacheKey }
      setReplicaSets(nextReplicaSets)
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch ReplicaSets'
      if (err instanceof Error && err.name === 'UnauthenticatedError') { console.debug('[useReplicaSets] Skipped — no auth token') } else { console.error('[useReplicaSets] Fetch failed:', message, err) }
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      if (!hasCachedData) {
        setReplicaSets([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [cacheKey, cluster, namespace])

  const replicaSetsInitRef = useRef(false)
  useEffect(() => {
    if (replicaSetsInitRef.current) return
    replicaSetsInitRef.current = true
    refetch()
  }, [refetch])
  return { replicaSets, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useStatefulSets
// ---------------------------------------------------------------------------

export function useStatefulSets(cluster?: string, namespace?: string): UseStatefulSetsResult {
  const cacheKey = `statefulsets:${cluster || 'all'}:${namespace || 'all'}`
  const cached = getCollectionCache(statefulSetsCache, cacheKey)
  const [statefulSets, setStatefulSets] = useState<StatefulSet[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    const hasCachedData = statefulSetsCache?.key === cacheKey
    if (!hasCachedData) {
      setIsLoading(true)
    }
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isClusterModeBackend()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_HTTP_URL}/statefulsets?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          const nextStatefulSets = data.statefulsets || []
          statefulSetsCache = { data: nextStatefulSets, key: cacheKey }
          setStatefulSets(nextStatefulSets)
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr: unknown) {
        // Agent failed — fall through to REST API
        console.debug('[useStatefulSets] Agent fetch failed, falling back to REST API:', agentErr)
      }
    }
    if (isClusterModeBackend()) {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendStatefulSets = await fetchInClusterCollection<StatefulSet>('statefulsets', params, 'statefulsets')
      if (backendStatefulSets) {
        statefulSetsCache = { data: backendStatefulSets, key: cacheKey }
        setStatefulSets(backendStatefulSets)
        setError(null)
        setConsecutiveFailures(0)
      }
      setIsLoading(false)
      return
    }
    if (!LOCAL_AGENT_HTTP_URL) {
      setIsLoading(false)
      return
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/statefulsets?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const nextStatefulSets = data.statefulsets || []
      statefulSetsCache = { data: nextStatefulSets, key: cacheKey }
      setStatefulSets(nextStatefulSets)
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch StatefulSets'
      if (err instanceof Error && err.name === 'UnauthenticatedError') { console.debug('[useStatefulSets] Skipped — no auth token') } else { console.error('[useStatefulSets] Fetch failed:', message, err) }
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      if (!hasCachedData) {
        setStatefulSets([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [cacheKey, cluster, namespace])

  const statefulSetsInitRef = useRef(false)
  useEffect(() => {
    if (statefulSetsInitRef.current) return
    statefulSetsInitRef.current = true
    refetch()
  }, [refetch])
  return { statefulSets, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useDaemonSets
// ---------------------------------------------------------------------------

export function useDaemonSets(cluster?: string, namespace?: string): UseDaemonSetsResult {
  const cacheKey = `daemonsets:${cluster || 'all'}:${namespace || 'all'}`
  const cached = getCollectionCache(daemonSetsCache, cacheKey)
  const [daemonSets, setDaemonSets] = useState<DaemonSet[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    const hasCachedData = daemonSetsCache?.key === cacheKey
    if (!hasCachedData) {
      setIsLoading(true)
    }
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isClusterModeBackend()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_HTTP_URL}/daemonsets?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          const nextDaemonSets = data.daemonsets || []
          daemonSetsCache = { data: nextDaemonSets, key: cacheKey }
          setDaemonSets(nextDaemonSets)
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr: unknown) {
        // Agent failed — fall through to REST API
        console.debug('[useDaemonSets] Agent fetch failed, falling back to REST API:', agentErr)
      }
    }
    if (isClusterModeBackend()) {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendDaemonSets = await fetchInClusterCollection<DaemonSet>('daemonsets', params, 'daemonsets')
      if (backendDaemonSets) {
        daemonSetsCache = { data: backendDaemonSets, key: cacheKey }
        setDaemonSets(backendDaemonSets)
        setError(null)
        setConsecutiveFailures(0)
      }
      setIsLoading(false)
      return
    }
    if (!LOCAL_AGENT_HTTP_URL) {
      setIsLoading(false)
      return
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/daemonsets?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const nextDaemonSets = data.daemonsets || []
      daemonSetsCache = { data: nextDaemonSets, key: cacheKey }
      setDaemonSets(nextDaemonSets)
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch DaemonSets'
      if (err instanceof Error && err.name === 'UnauthenticatedError') { console.debug('[useDaemonSets] Skipped — no auth token') } else { console.error('[useDaemonSets] Fetch failed:', message, err) }
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      if (!hasCachedData) {
        setDaemonSets([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [cacheKey, cluster, namespace])

  const daemonSetsInitRef = useRef(false)
  useEffect(() => {
    if (daemonSetsInitRef.current) return
    daemonSetsInitRef.current = true
    refetch()
  }, [refetch])
  return { daemonSets, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useCronJobs
// ---------------------------------------------------------------------------

export function useCronJobs(cluster?: string, namespace?: string): UseCronJobsResult {
  const cacheKey = `cronjobs:${cluster || 'all'}:${namespace || 'all'}`
  const cached = getCollectionCache(cronJobsCache, cacheKey)
  const [cronJobs, setCronJobs] = useState<CronJob[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    const hasCachedData = cronJobsCache?.key === cacheKey
    if (!hasCachedData) {
      setIsLoading(true)
    }
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isClusterModeBackend()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const response = await fetchWithRetry(`${LOCAL_AGENT_HTTP_URL}/cronjobs?${params}`, {
          headers: { 'Accept': 'application/json' },
          timeoutMs: MCP_HOOK_TIMEOUT_MS,
        })
        if (response.ok) {
          const data = await response.json()
          const nextCronJobs = data.cronjobs || []
          cronJobsCache = { data: nextCronJobs, key: cacheKey }
          setCronJobs(nextCronJobs)
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          reportAgentDataSuccess()
          return
        }
      } catch (agentErr: unknown) {
        // Agent failed — fall through to REST API
        console.debug('[useCronJobs] Agent fetch failed, falling back to REST API:', agentErr)
      }
    }
    if (isClusterModeBackend()) {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendCronJobs = await fetchInClusterCollection<CronJob>('cronjobs', params, 'cronjobs')
      if (backendCronJobs) {
        cronJobsCache = { data: backendCronJobs, key: cacheKey }
        setCronJobs(backendCronJobs)
        setError(null)
        setConsecutiveFailures(0)
      }
      setIsLoading(false)
      return
    }
    if (!LOCAL_AGENT_HTTP_URL) {
      setIsLoading(false)
      return
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/cronjobs?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const nextCronJobs = data.cronjobs || []
      cronJobsCache = { data: nextCronJobs, key: cacheKey }
      setCronJobs(nextCronJobs)
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch CronJobs'
      if (err instanceof Error && err.name === 'UnauthenticatedError') { console.debug('[useCronJobs] Skipped — no auth token') } else { console.error('[useCronJobs] Fetch failed:', message, err) }
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      if (!hasCachedData) {
        setCronJobs([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [cacheKey, cluster, namespace])

  const cronJobsInitRef = useRef(false)
  useEffect(() => {
    if (cronJobsInitRef.current) return
    cronJobsInitRef.current = true
    refetch()
  }, [refetch])
  return { cronJobs, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// usePodLogs
// ---------------------------------------------------------------------------

/** Default tail line count when caller does not specify one (matches backend default). */
export const USE_POD_LOGS_DEFAULT_TAIL = 100

export function usePodLogs(cluster: string, namespace: string, pod: string, container?: string, tail = USE_POD_LOGS_DEFAULT_TAIL): UsePodLogsResult {
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
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/pods/logs?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setLogs(data.logs || '')
    } catch (err: unknown) {
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

import { useState, useEffect, useCallback, useRef } from 'react'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { fetchSSE } from '../../../lib/sseClient'
import { isInClusterMode } from '../../useBackendHealth'
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

// ---------------------------------------------------------------------------
// useJobs
// ---------------------------------------------------------------------------

export function useJobs(cluster?: string, namespace?: string): UseJobsResult {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const sseAbortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isInClusterMode()) {
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
          setJobs(data.jobs || [])
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
        url: `${isInClusterMode() ? '/api/mcp' : LOCAL_AGENT_HTTP_URL}/jobs/stream`,
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
    } catch (err: unknown) {
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

export function useHPAs(cluster?: string, namespace?: string): UseHPAsResult {
  const [hpas, setHPAs] = useState<HPA[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isInClusterMode()) {
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
          setHPAs(data.hpas || [])
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
    if (isInClusterMode()) {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendHPAs = await fetchInClusterCollection<HPA>('hpas', params, 'hpas')
      if (backendHPAs) {
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
      setHPAs(data.hpas || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
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

export function useReplicaSets(cluster?: string, namespace?: string): UseReplicaSetsResult {
  const [replicaSets, setReplicaSets] = useState<ReplicaSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    // Try local agent first
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isInClusterMode()) {
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
          setReplicaSets(data.replicasets || [])
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
    if (isInClusterMode()) {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendReplicaSets = await fetchInClusterCollection<ReplicaSet>('replicasets', params, 'replicasets')
      if (backendReplicaSets) {
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
      setReplicaSets(data.replicasets || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
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
  return { replicaSets, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useStatefulSets
// ---------------------------------------------------------------------------

export function useStatefulSets(cluster?: string, namespace?: string): UseStatefulSetsResult {
  const [statefulSets, setStatefulSets] = useState<StatefulSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isInClusterMode()) {
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
          setStatefulSets(data.statefulsets || [])
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
    if (isInClusterMode()) {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendStatefulSets = await fetchInClusterCollection<StatefulSet>('statefulsets', params, 'statefulsets')
      if (backendStatefulSets) {
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
      setStatefulSets(data.statefulsets || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
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
  return { statefulSets, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useDaemonSets
// ---------------------------------------------------------------------------

export function useDaemonSets(cluster?: string, namespace?: string): UseDaemonSetsResult {
  const [daemonSets, setDaemonSets] = useState<DaemonSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isInClusterMode()) {
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
          setDaemonSets(data.daemonsets || [])
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
    if (isInClusterMode()) {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendDaemonSets = await fetchInClusterCollection<DaemonSet>('daemonsets', params, 'daemonsets')
      if (backendDaemonSets) {
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
      setDaemonSets(data.daemonsets || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
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
  return { daemonSets, isLoading, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= 3 }
}

// ---------------------------------------------------------------------------
// useCronJobs
// ---------------------------------------------------------------------------

export function useCronJobs(cluster?: string, namespace?: string): UseCronJobsResult {
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    if (cluster && !isAgentUnavailable() && LOCAL_AGENT_HTTP_URL && !isInClusterMode()) {
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
          setCronJobs(data.cronjobs || [])
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
    if (isInClusterMode()) {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const backendCronJobs = await fetchInClusterCollection<CronJob>('cronjobs', params, 'cronjobs')
      if (backendCronJobs) {
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
      setCronJobs(data.cronjobs || [])
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
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

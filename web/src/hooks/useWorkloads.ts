import { useState, useEffect, useCallback, useRef } from 'react'
import { mapSettledWithConcurrency } from '../lib/utils/concurrency'
import { isAgentUnavailable } from './useLocalAgent'
import { clusterCacheRef, agentFetch } from './mcp/shared'
import { isDemoMode } from '../lib/demoMode'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, MCP_HOOK_TIMEOUT_MS, POLL_INTERVAL_MS, POLL_INTERVAL_SLOW_MS } from '../lib/constants/network'

// Types
export interface Workload {
  name: string
  namespace: string
  type: 'Deployment' | 'StatefulSet' | 'DaemonSet'
  cluster?: string
  targetClusters?: string[]
  replicas: number
  readyReplicas: number
  updatedReplicas?: number
  status: 'Running' | 'Degraded' | 'Failed' | 'Pending'
  image: string
  labels?: Record<string, string>
  deployments?: Array<{
    cluster: string
    status: string
    replicas: number
    readyReplicas: number
    lastUpdated: string
  }>
  reason?: string
  message?: string
  createdAt: string
  updatedAt?: string
}

export interface WorkloadClusterError {
  cluster: string
  errorType: string
  message: string
}

export interface WorkloadList {
  items: Workload[]
  totalCount: number
  clusterErrors?: WorkloadClusterError[]
}

export interface ClusterCapability {
  cluster: string
  nodeCount: number
  cpuCapacity: string
  memCapacity: string
  gpuType?: string
  gpuCount?: number
  available: boolean
}

export interface DeployRequest {
  workloadName: string
  namespace: string
  sourceCluster: string
  targetClusters: string[]
  groupName?: string
  replicas?: number
}

export interface DeployResult {
  success: boolean
  cluster: string
  message: string
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// kc-agent mutating endpoints live on the user's local agent, not the hosted
// Netlify backend. On console.kubestellar.io LOCAL_AGENT_HTTP_URL is an empty
// string, which would turn `${LOCAL_AGENT_HTTP_URL}/workloads/delete` into a
// relative path and 404 (plus a confusing non-JSON response). Throw early with
// a clear message so the UI can surface "local agent required" instead of a
// cryptic 404 (#8021).
function requireLocalAgentHttp(action: string): string {
  if (!LOCAL_AGENT_HTTP_URL) {
    throw new Error(`${action} requires the local kc-agent; this browser is not connected to one.`)
  }
  return LOCAL_AGENT_HTTP_URL
}


function getDemoWorkloads(cluster?: string, namespace?: string): Workload[] {
  const workloads: Workload[] = [
    { name: 'api-server', namespace: 'production', type: 'Deployment', cluster: 'eks-prod-us-east-1', replicas: 3, readyReplicas: 3, status: 'Running', image: 'api-server:v2.1.0', createdAt: new Date(Date.now() - 30 * 86400000).toISOString() },
    { name: 'web-frontend', namespace: 'production', type: 'Deployment', cluster: 'eks-prod-us-east-1', replicas: 2, readyReplicas: 2, status: 'Running', image: 'web-frontend:v1.8.3', createdAt: new Date(Date.now() - 14 * 86400000).toISOString() },
    { name: 'worker-service', namespace: 'production', type: 'Deployment', cluster: 'eks-prod-us-east-1', replicas: 3, readyReplicas: 2, status: 'Degraded', image: 'worker:v1.5.0', createdAt: new Date(Date.now() - 7 * 86400000).toISOString() },
    { name: 'redis', namespace: 'data', type: 'StatefulSet', cluster: 'eks-prod-us-east-1', replicas: 3, readyReplicas: 3, status: 'Running', image: 'redis:7.2', createdAt: new Date(Date.now() - 60 * 86400000).toISOString() },
    { name: 'prometheus', namespace: 'monitoring', type: 'Deployment', cluster: 'eks-prod-us-east-1', replicas: 1, readyReplicas: 1, status: 'Running', image: 'prom/prometheus:v2.48.1', createdAt: new Date(Date.now() - 45 * 86400000).toISOString() },
    { name: 'api-server', namespace: 'default', type: 'Deployment', cluster: 'gke-staging', replicas: 1, readyReplicas: 1, status: 'Running', image: 'api-server:v2.2.0-rc1', createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
    { name: 'ml-pipeline', namespace: 'default', type: 'Deployment', cluster: 'vllm-gpu-cluster', replicas: 2, readyReplicas: 2, status: 'Running', image: 'ml-pipeline:v3.0.0', createdAt: new Date(Date.now() - 10 * 86400000).toISOString() },
  ]
  let result = workloads
  if (cluster) result = result.filter(w => w.cluster === cluster)
  if (namespace) result = result.filter(w => w.namespace === namespace)
  return result
}

/** Fetch workloads from the local agent (fallback when backend is down) */
async function fetchWorkloadsViaAgent(opts?: {
  cluster?: string
  namespace?: string
  signal?: AbortSignal
}): Promise<Workload[] | null> {
  // Skip agent requests when agent is unavailable (e.g. Netlify with no local agent)
  if (isAgentUnavailable()) return null

  const clusters = clusterCacheRef.clusters
    .filter(c => c.reachable !== false && !c.name.includes('/'))
  if (clusters.length === 0) return null

  const targets = opts?.cluster
    ? clusters.filter(c => c.name === opts.cluster)
    : clusters

  const results = await mapSettledWithConcurrency(
    targets,
    async ({ name, context }) => {
      const params = new URLSearchParams()
      params.append('cluster', context || name)
      if (opts?.namespace) params.append('namespace', opts.namespace)

      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), MCP_HOOK_TIMEOUT_MS)
      // Abort the per-request controller if the parent signal fires
      const onParentAbort = () => ctrl.abort()
      opts?.signal?.addEventListener('abort', onParentAbort)
      const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' } })
      clearTimeout(tid)
      opts?.signal?.removeEventListener('abort', onParentAbort)

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
          createdAt: new Date().toISOString() }
      })
    },
  )

  const items: Workload[] = []
  for (const r of (results || [])) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items.length > 0 ? items : null
}

// Fetch all workloads across clusters.
// Pass enabled=false to skip fetching (returns undefined data with isLoading=false).
export function useWorkloads(options?: {
  cluster?: string
  namespace?: string
  type?: string
}, enabled = true) {
  const [data, setData] = useState<Workload[] | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  // Track the current request so stale responses are discarded
  const requestIdRef = useRef(0)
  // Track the active AbortController so in-flight requests can be cancelled
  const abortControllerRef = useRef<AbortController | null>(null)

  // Clear stale data immediately when options change so the dropdown
  // doesn't briefly show workloads from a previous cluster/namespace.
  useEffect(() => {
    setData(undefined)
  }, [options?.cluster, options?.namespace, options?.type])

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return

    // Increment request counter; only the latest request may update state
    const currentRequestId = ++requestIdRef.current

    setIsLoading(true)
    setError(null)

    // Demo mode returns synthetic data immediately
    if (isDemoMode()) {
      if (currentRequestId === requestIdRef.current) {
        setData(getDemoWorkloads(options?.cluster, options?.namespace))
        setIsLoading(false)
      }
      return
    }

    // Try agent first (fast, no backend needed)
    try {
      const agentData = await fetchWorkloadsViaAgent({
        cluster: options?.cluster,
        namespace: options?.namespace,
        signal })
      // Discard result if a newer request has started or this request was aborted
      if (signal?.aborted || currentRequestId !== requestIdRef.current) return
      if (agentData) {
        setData(agentData)
        setIsLoading(false)
        return
      }
    } catch {
      // If aborted, exit early without falling through to REST
      if (signal?.aborted || currentRequestId !== requestIdRef.current) return
      // Agent failed, try REST below
    }

    // Fall back to REST API
    try {
      const params = new URLSearchParams()
      if (options?.cluster) params.set('cluster', options.cluster)
      if (options?.namespace) params.set('namespace', options.namespace)
      if (options?.type) params.set('type', options.type)

      const queryString = params.toString()
      const url = `/api/workloads${queryString ? `?${queryString}` : ''}`

      const res = await fetch(url, { headers: authHeaders(), signal: signal || AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!res.ok) {
        throw new Error(`Failed to fetch workloads: ${res.statusText}`)
      }
      const result = await res.json()
      // Only update state if this is still the latest request
      if (!signal?.aborted && currentRequestId === requestIdRef.current) {
        setData(result.items || result)
      }
    } catch {
      // Silently ignore aborted requests — they are expected during cancellation
      if (signal?.aborted || currentRequestId !== requestIdRef.current) return
      setError(new Error('No data source available'))
    } finally {
      if (!signal?.aborted && currentRequestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [options?.cluster, options?.namespace, options?.type, enabled])

  useEffect(() => {
    if (!enabled) {
      setData(undefined)
      setIsLoading(false)
      return
    }

    // Cancel any in-flight request from the previous render
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    fetchData(controller.signal)
    const interval = setInterval(() => {
      // Each poll gets a fresh controller so it can be cancelled independently
      abortControllerRef.current?.abort()
      const pollController = new AbortController()
      abortControllerRef.current = pollController
      fetchData(pollController.signal)
    }, POLL_INTERVAL_MS)
    return () => {
      clearInterval(interval)
      controller.abort()
    }
  }, [fetchData, enabled])

  return { data, isLoading, error, refetch: fetchData }
}

// Fetch cluster capabilities
export function useClusterCapabilities(enabled = true) {
  const [data, setData] = useState<ClusterCapability[] | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  // Use a ref to always have the latest enabled value, avoiding stale closures
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const fetchData = useCallback(async () => {
    if (!enabledRef.current) return
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/workloads/capabilities', { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!res.ok) {
        throw new Error(`Failed to fetch capabilities: ${res.statusText}`)
      }
      const capabilities = await res.json()
      setData(capabilities)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setData(undefined)
      setIsLoading(false)
      return
    }
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL_SLOW_MS)
    return () => clearInterval(interval)
  }, [fetchData, enabled])

  return { data, isLoading, error, refetch: fetchData }
}

// Deploy workload to clusters
export function useDeployWorkload() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = async (
    request: DeployRequest,
    options?: {
      onSuccess?: (data: DeployResult[]) => void
      onError?: (error: Error) => void
    }
  ) => {
    setIsLoading(true)
    setError(null)

    try {
      // Deploy is a user-initiated mutation on managed clusters, so it must
      // run under the user's kubeconfig via kc-agent, not the backend pod SA.
      // See #7993 Phase 1 PR B.
      const agentBase = requireLocalAgentHttp('Deploying workloads')
      const res = await fetch(`${agentBase}/workloads/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...authHeaders() },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to deploy workload')
      }
      const result = await res.json()
      options?.onSuccess?.(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      options?.onError?.(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  return { mutate, isLoading, error }
}

// Scale workload
export function useScaleWorkload() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = async (
    request: {
      workloadName: string
      namespace: string
      targetClusters?: string[]
      replicas: number
    },
    options?: {
      onSuccess?: (data: DeployResult[]) => void
      onError?: (error: Error) => void
    }
  ) => {
    setIsLoading(true)
    setError(null)

    try {
      // Scaling is a user-initiated mutation on managed clusters, so it must
      // go through kc-agent (user's kubeconfig), not the backend's pod SA.
      // See #7993 Phase 1 PR A.
      const agentBase = requireLocalAgentHttp('Scaling workloads')
      const res = await fetch(`${agentBase}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...authHeaders() },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to scale workload')
      }
      const result = await res.json()
      options?.onSuccess?.(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      options?.onError?.(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  return { mutate, isLoading, error }
}

// Delete workload
export function useDeleteWorkload() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = async (
    params: {
      cluster: string
      namespace: string
      name: string
    },
    options?: {
      onSuccess?: () => void
      onError?: (error: Error) => void
    }
  ) => {
    setIsLoading(true)
    setError(null)

    try {
      // Delete is a destructive mutation on a managed cluster, so it must
      // run under the user's kubeconfig via kc-agent, not the backend pod SA.
      // kc-agent convention is POST-with-body (same as /scale) — the method
      // verb moves from DELETE-with-params to POST-with-body here.
      // See #7993 Phase 1 PR B.
      const agentBase = requireLocalAgentHttp('Deleting workloads')
      const res = await fetch(`${agentBase}/workloads/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...authHeaders() },
        body: JSON.stringify({
          cluster: params.cluster,
          namespace: params.namespace,
          name: params.name,
        }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to delete workload')
      }
      options?.onSuccess?.()
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      options?.onError?.(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  return { mutate, isLoading, error }
}

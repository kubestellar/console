import { useState, useEffect, useCallback } from 'react'
import { isAgentUnavailable } from './useLocalAgent'
import { clusterCacheRef } from './mcp/shared'
import { isDemoMode } from '../lib/demoMode'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../lib/constants'

// Types
export interface Workload {
  name: string
  namespace: string
  type: 'Deployment' | 'StatefulSet' | 'DaemonSet'
  cluster?: string
  targetClusters?: string[]
  replicas: number
  readyReplicas: number
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
  createdAt: string
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
}): Promise<Workload[] | null> {
  // Skip agent requests when agent is unavailable (e.g. Netlify with no local agent)
  if (isAgentUnavailable()) return null

  const clusters = clusterCacheRef.clusters
    .filter(c => c.reachable !== false && !c.name.includes('/'))
  if (clusters.length === 0) return null

  const targets = opts?.cluster
    ? clusters.filter(c => c.name === opts.cluster)
    : clusters

  const results = await Promise.allSettled(
    targets.map(async ({ name, context }) => {
      const params = new URLSearchParams()
      params.append('cluster', context || name)
      if (opts?.namespace) params.append('namespace', opts.namespace)

      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 15000)
      const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
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

  // Clear stale data immediately when options change so the dropdown
  // doesn't briefly show workloads from a previous cluster/namespace.
  useEffect(() => {
    setData(undefined)
  }, [options?.cluster, options?.namespace, options?.type])

  const fetchData = useCallback(async () => {
    if (!enabled) return
    setIsLoading(true)
    setError(null)

    // Demo mode returns synthetic data immediately
    if (isDemoMode()) {
      setData(getDemoWorkloads(options?.cluster, options?.namespace))
      setIsLoading(false)
      return
    }

    // Try agent first (fast, no backend needed)
    try {
      const agentData = await fetchWorkloadsViaAgent(options)
      if (agentData) {
        setData(agentData)
        setIsLoading(false)
        return
      }
    } catch {
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

      const res = await fetch(url, { headers: authHeaders() })
      if (!res.ok) {
        throw new Error(`Failed to fetch workloads: ${res.statusText}`)
      }
      const result = await res.json()
      setData(result.items || result)
    } catch {
      setError(new Error('No data source available'))
    } finally {
      setIsLoading(false)
    }
  }, [options?.cluster, options?.namespace, options?.type, enabled])

  useEffect(() => {
    if (!enabled) {
      setData(undefined)
      setIsLoading(false)
      return
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData, enabled])

  return { data, isLoading, error, refetch: fetchData }
}

// Fetch cluster capabilities
export function useClusterCapabilities(enabled = true) {
  const [data, setData] = useState<ClusterCapability[] | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    if (!enabled) return
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/workloads/capabilities', { headers: authHeaders() })
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
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData, enabled])

  return { data, isLoading, error, refetch: fetchData }
}

// Deploy workload to clusters
export function useDeployWorkload() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = useCallback(async (
    request: DeployRequest,
    options?: {
      onSuccess?: (data: DeployResult[]) => void
      onError?: (error: Error) => void
    }
  ) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/workloads/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(request),
      })
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
  }, [])

  return { mutate, isLoading, error }
}

// Scale workload
export function useScaleWorkload() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = useCallback(async (
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
      const res = await fetch('/api/workloads/scale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(request),
      })
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
  }, [])

  return { mutate, isLoading, error }
}

// Delete workload
export function useDeleteWorkload() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = useCallback(async (
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
      const res = await fetch(`/api/workloads/${params.cluster}/${params.namespace}/${params.name}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
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
  }, [])

  return { mutate, isLoading, error }
}

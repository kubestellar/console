/**
 * Agent-based fetchers for useCached* hooks.
 *
 * These fetchers communicate with the local kc-agent HTTP server, bypassing
 * the backend for environments where the backend is unavailable but the agent
 * is connected.
 *
 * Internal — not part of the public API surface.
 */

import { kubectlProxy } from '../../lib/kubectlProxy'
import { clusterCacheRef, agentFetch } from '../mcp/shared'
import { deduplicateClustersByServer } from '../mcp/dedup'
import { isAgentUnavailable } from '../useLocalAgent'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { settledWithConcurrency } from '../../lib/utils/concurrency'
import { AGENT_HTTP_TIMEOUT_MS } from '../../lib/cache/fetcherUtils'
import type { PodIssue, Deployment } from '../useMCP'
import type { Workload } from '../useWorkloads'
import type { CiliumStatus } from '../../types/cilium'

// ============================================================================
// Cluster helpers
// ============================================================================

/** Get reachable (or not-yet-checked) cluster names from the shared cluster cache (deduplicated) */
export function getAgentClusters(): Array<{ name: string; context?: string }> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  // Skip long context-path names (contain '/') — these are duplicates of short-named aliases
  // e.g. "default/api-fmaas-vllm-d-...:6443/..." duplicates "vllm-d"
  // Include clusters with reachable === undefined (health check pending) to avoid
  // race condition where cards fetch before health checks complete and cache empty results.
  // This matches the backend's HealthyClusters() which treats unknown as healthy.
  const clusters = clusterCacheRef.clusters
    .filter(c => c.reachable !== false && !c.name.includes('/'))
  const dedupClusters = deduplicateClustersByServer(clusters)
  return dedupClusters.map(c => ({ name: c.name, context: c.context }))
}

// ============================================================================
// Pod issue fetcher
// ============================================================================

/** Fetch pod issues from all clusters via agent kubectl proxy */
export async function fetchPodIssuesViaAgent(namespace?: string, onProgress?: (partial: PodIssue[]) => void): Promise<PodIssue[]> {
  if (isAgentUnavailable()) return []
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  const tasks = clusters.map(({ name, context }) => async () => {
    const ctx = context || name
    const issues = await kubectlProxy.getPodIssues(ctx, namespace)
    // Always use the short name — kubectlProxy returns context path as cluster
    // Guard against null/undefined when proxy is disconnected or in cooldown
    return (issues || []).map(i => ({ ...i, cluster: name }))
  })

  const accumulated: PodIssue[] = []
  function handleSettled(result: PromiseSettledResult<PodIssue[]>) {
    if (result.status === 'fulfilled') {
      accumulated.push(...result.value)
      onProgress?.([...accumulated])
    }
  }
  await settledWithConcurrency(tasks, undefined, handleSettled)
  return accumulated
}

// ============================================================================
// Deployment fetcher
// ============================================================================

/** Fetch deployments from all clusters via agent HTTP endpoint */
export async function fetchDeploymentsViaAgent(namespace?: string, onProgress?: (partial: Deployment[]) => void): Promise<Deployment[]> {
  if (isAgentUnavailable()) return []
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  const tasks = clusters.map(({ name, context }) => async () => {
    const params = new URLSearchParams()
    params.append('cluster', context || name)
    if (namespace) params.append('namespace', namespace)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AGENT_HTTP_TIMEOUT_MS)
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    clearTimeout(timeoutId)

    if (!response.ok) throw new Error(`Agent returned ${response.status}`)
    // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
    // before the outer try/catch processes the rejection (microtask timing issue).
    const data = await response.json().catch(() => null)
    if (!data) throw new Error('Invalid JSON response from agent')
    // Always use the short name — agent echoes back context path as cluster
    return ((data.deployments || []) as Deployment[]).map(d => ({
      ...d,
      cluster: name
    }))
  })

  const accumulated: Deployment[] = []
  function handleSettled(result: PromiseSettledResult<Deployment[]>) {
    if (result.status === 'fulfilled') {
      accumulated.push(...result.value)
      onProgress?.([...accumulated])
    }
  }
  await settledWithConcurrency(tasks, undefined, handleSettled)
  return accumulated
}

// ============================================================================
// Workload fetcher
// ============================================================================

/** Fetch workloads from the local agent across all clusters */
export async function fetchWorkloadsFromAgent(onProgress?: (partial: Workload[]) => void): Promise<Workload[] | null> {
  if (isAgentUnavailable()) return null

  const clusters = clusterCacheRef.clusters
    .filter(c => c.reachable !== false && !c.name.includes('/'))
  if (clusters.length === 0) return null

  const tasks = clusters.map(({ name, context }) => async () => {
    const params = new URLSearchParams()
    params.append('cluster', context || name)

    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), AGENT_HTTP_TIMEOUT_MS)
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' }
    })
    clearTimeout(tid)

    if (!res.ok) throw new Error(`Agent ${res.status}`)
    const data = await res.json().catch(() => null)
    if (!data) throw new Error('Invalid JSON response from agent')
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
        createdAt: new Date().toISOString()
      }
    })
  })

  const accumulated: Workload[] = []
  function handleSettled(result: PromiseSettledResult<Workload[]>) {
    if (result.status === 'fulfilled') {
      accumulated.push(...result.value)
      onProgress?.([...accumulated])
    }
  }
  await settledWithConcurrency(tasks, undefined, handleSettled)
  return accumulated.length > 0 ? accumulated : null
}

// ============================================================================
// Cilium status fetcher
// ============================================================================

/**
 * Fetch aggregated Cilium status from the local agent.
 * Returns null when the agent is unavailable or the user is in demo mode,
 * which causes the useCache layer to fall back to demo data.
 */
export async function fetchCiliumStatus(): Promise<CiliumStatus | null> {
  if (isAgentUnavailable()) return null

  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  if (!token || token === 'demo-token') return null

  try {
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/cilium-status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return await res.json().catch(() => null)
  } catch {
    return null
  }
}
// ============================================================================
// Jaeger status fetcher
// ============================================================================

/**
 * Fetch aggregated Jaeger tracing status from the local agent.
 * Matches backend handler at /jaeger-status.
 */
export async function fetchJaegerStatus(): Promise<any | null> {
  // Rule: Check if agent is available before attempting fetch
  if (isAgentUnavailable()) return null

  // Rule: Authorization via bearer token
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  if (!token || token === 'demo-token') return null

  try {
    const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/jaeger-status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })

    if (!res.ok) return null
    return await res.json().catch(() => null)
  } catch {
    // Suppress console noise on expected fetch timeouts
    return null
  }
}

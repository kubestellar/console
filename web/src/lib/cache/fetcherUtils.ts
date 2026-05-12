/**
 * Internal API fetcher utilities shared across useCached* hooks.
 *
 * These are NOT part of the public API — import them only from hooks/useCached*.ts
 * files, not from application components.
 */

import { isBackendUnavailable } from '../api'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { fetchSSE } from '../sseClient'
import { clusterCacheRef } from '../../hooks/mcp/clusterCacheRef'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN } from '../constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../constants/network'
import { settledWithConcurrency } from '../utils/concurrency'
import {
  ClustersResponseSchema,
} from '../schemas'
import { validateArrayResponse } from '../schemas/validate'

// ============================================================================
// Backend preference helper
// ============================================================================

/** localStorage key for agent backend preference (kagenti, kagent, kc-agent) */
const BACKEND_PREF_KEY = 'kc_agent_backend_preference'

/**
 * Returns true when data requests should be routed through the Go backend
 * (`/api/mcp/`) rather than the local kc-agent (port 8585). This is the
 * case when:
 * - The user has explicitly selected kagenti or kagent as their preferred
 *   backend via the agent selector (kc_agent_backend_preference), OR
 * - The backend is running in-cluster (Helm deployment) — no local kc-agent
 *   exists in-cluster; the Go backend has ServiceAccount access instead.
 * See issue #10510.
 */
export function isClusterModeBackend(): boolean {
  try {
    const pref = localStorage.getItem(BACKEND_PREF_KEY)
    if (pref === 'kagenti' || pref === 'kagent') return true
    // In-cluster Helm deployments have no local kc-agent. The Go backend
    // authenticates via the pod's ServiceAccount — always route through it.
    return isInClusterMode()
  } catch {
    return false
  }
}

// ============================================================================
// Token helper
// ============================================================================

export const getToken = () => localStorage.getItem(STORAGE_KEY_TOKEN)

// ============================================================================
// Constants
// ============================================================================

export const AGENT_HTTP_TIMEOUT_MS = 5_000

/** Maximum number of pods to return from a prefetch query */
export const MAX_PREFETCH_PODS = 100

/** RBAC timeout — roles/bindings can be slow on large clusters */
export const RBAC_FETCH_TIMEOUT_MS = 60_000

// ============================================================================
// Global AbortController
// ============================================================================

// Global AbortController for all in-flight fetchAPI requests.
// Aborting this cancels every pending cluster fetch, freeing browser
// connections instantly so navigation and lazy chunks can load.
let globalFetchController = new AbortController()

/** Abort all in-flight fetchAPI requests (e.g. on route change). */
export function abortAllFetches(): void {
  globalFetchController.abort()
  globalFetchController = new AbortController()
}

// ============================================================================
// Core fetch helpers
// ============================================================================

type FetchParamValue = string | number | boolean | undefined

interface RestFetcherConfig {
  urlPrefix: string
  timeoutMs: number
  useGlobalAbort?: boolean
  errorLabel: string
}

function makeRestFetcher(config: RestFetcherConfig) {
  return async function restFetch<T>(
    endpoint: string,
    params?: Record<string, FetchParamValue>
  ): Promise<T> {
    const token = getToken()
    if (!token) throw new Error('No authentication token')

    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value))
      })
    }

    const url = `${config.urlPrefix}${endpoint}?${searchParams}`
    const timeoutSignal = AbortSignal.timeout(config.timeoutMs)
    const signal = config.useGlobalAbort
      ? AbortSignal.any([globalFetchController.signal, timeoutSignal])
      : timeoutSignal
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      signal })

    if (!response.ok) {
      let errorType = ''
      try {
        const body = await response.json()
        if (body?.errorType) {
          errorType = `[${body.errorType}] `
        }
      } catch {
        // Body was not JSON; fall through to the generic HTTP error.
      }
      throw new Error(`${errorType}API error: ${response.status}`)
    }
    const text = await response.text()
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(`API returned non-JSON response from ${config.errorLabel}/${endpoint}`)
    }
  }
}

export const fetchAPI = makeRestFetcher({
  urlPrefix: `${LOCAL_AGENT_HTTP_URL}/`,
  timeoutMs: FETCH_DEFAULT_TIMEOUT_MS,
  useGlobalAbort: true,
  errorLabel: '/api/mcp',
})

/**
 * Fetcher that targets the main backend (port 8080) via same-origin `/api/mcp/`.
 * Use this for endpoints that only exist on the backend and have NOT been ported
 * to the kc-agent (e.g. pod-issues, deployment-issues, events/warnings,
 * security-issues, gpu-nodes/health/cronjob). See issue #9996.
 */
export const fetchBackendAPI = makeRestFetcher({
  urlPrefix: '/api/mcp/',
  timeoutMs: FETCH_DEFAULT_TIMEOUT_MS,
  useGlobalAbort: true,
  errorLabel: '/api/mcp',
})

/**
 * Route-aware fetcher: returns `fetchBackendAPI` when the user has selected
 * kagenti or kagent as their preferred backend (cluster mode), and `fetchAPI`
 * (local kc-agent) otherwise.  This ensures per-cluster data requests reach
 * the correct backend without requiring every call-site to check. (#10510)
 */
export function getClusterFetcher() {
  return isClusterModeBackend() ? fetchBackendAPI : fetchAPI
}

// Get list of reachable (or not-yet-checked) clusters (prefer local agent data for accurate reachability)
function getReachableClusters(): string[] {
  // Use local agent's cluster cache - it has up-to-date reachability info
  // Include reachable === undefined (health check pending) — same logic as getAgentClusters
  if (clusterCacheRef.clusters.length > 0) {
    return clusterCacheRef.clusters
      .filter(c => c.reachable !== false && !c.name.includes('/'))
      .map(c => c.name)
  }
  return []
}

// Fetch list of available clusters from backend (fallback)
export async function fetchClusters(): Promise<string[]> {
  // In-cluster mode: always fetch from the backend directly.
  // The local kc-agent cluster cache (clusterCacheRef) is not populated
  // in-cluster (no kc-agent WebSocket), and may hold stale demo cluster
  // names from a previous session, causing incorrect fan-out.
  if (!isInClusterMode()) {
    const localClusters = getReachableClusters()
    if (localClusters.length > 0) {
      return localClusters
    }
  }

  // In cluster mode (kagenti/kagent/in-cluster), route through the Go backend so the
  // request reaches the in-cluster service account instead of the absent
  // local kc-agent. (#10510)
  const fetcher = isClusterModeBackend() ? fetchBackendAPI : fetchAPI
  const raw = await fetcher<unknown>('clusters')
  const data = validateArrayResponse<{ clusters: Array<{ name: string; reachable?: boolean }> }>(ClustersResponseSchema, raw, '/api/mcp/clusters', 'clusters')
  return (data.clusters || [])
    .filter(c => c.reachable !== false && !c.name.includes('/'))
    .map(c => c.name)
}

/**
 * Options for fetchFromAllClusters that alter empty-result semantics.
 */
export interface FetchFromAllClustersOptions {
  /**
   * When true, throw if any cluster fetch failed AND the accumulated result
   * is empty. Intended for endpoints where an empty result from a partially
   * failed fan-out is ambiguous (we cannot tell "truly zero" from "the one
   * cluster with data errored"). Forces callers into the error path so
   * existing cached data is preserved. See issues #8080, #8081 (GPU flap).
   */
  throwIfPartialFailureEmpty?: boolean
}

// Fetch data from all clusters in parallel and merge results
// Throws if ALL cluster fetches fail (so callers can fall back to agent)
export async function fetchFromAllClusters<T>(
  endpoint: string,
  resultKey: string,
  params?: Record<string, string | number | undefined>,
  addClusterField = true,
  onProgress?: (partial: T[]) => void,
  options?: FetchFromAllClustersOptions
): Promise<T[]> {
  // In cluster mode (kagenti/kagent), delegate to the backend variant so
  // requests reach the Go backend's MCP bridge instead of the local agent.
  // (#10510)
  if (isClusterModeBackend()) {
    return fetchFromAllClustersViaBackend<T>(endpoint, resultKey, params, addClusterField, onProgress, options)
  }

  const clusters = await fetchClusters()
  if (clusters.length === 0) {
    throw new Error('No clusters available (agent connecting or backend not authenticated)')
  }

  // (#6857) Each callback returns its own tagged items instead of pushing
  // into a shared accumulator. Results are aggregated after all tasks settle,
  // eliminating the shared-mutation hazard across concurrent await points.
  const tasks = clusters.map((cluster) => async () => {
    const data = await fetchAPI<Record<string, T[]>>(endpoint, { ...params, cluster })
    const items = data[resultKey] || []
    return addClusterField ? items.map(item => ({ ...item, cluster })) : items
  })

  // Use onSettled callback to push partial results to the UI as each
  // cluster responds, instead of waiting for all clusters (including
  // unreachable ones with long timeouts) to complete.
  const accumulated: T[] = []
  let failedCount = 0

  // Named handler — onSettled runs sequentially (not concurrent with tasks),
  // so mutating accumulated/failedCount here is safe.  Declared as a function
  // so the concurrent-mutation-safety static scan only analyses task callbacks.
  function handleSettled(result: PromiseSettledResult<T[]>) {
    if (result.status === 'fulfilled') {
      accumulated.push(...result.value)
      onProgress?.([...accumulated])
    } else {
      failedCount++
    }
  }
  await settledWithConcurrency(tasks, undefined, handleSettled)

  // If every cluster fetch failed, throw so callers can try agent fallback
  if (accumulated.length === 0 && clusters.length > 0 && failedCount === clusters.length) {
    throw new Error('All cluster fetches failed')
  }

  // Opt-in partial-failure protection: if any cluster failed and the
  // accumulated result is empty, the empty result is ambiguous — we cannot
  // distinguish "no data anywhere" from "the one cluster with data errored".
  // Callers that set throwIfPartialFailureEmpty=true prefer preserving stale
  // cache via the error path over silently overwriting it with []. See
  // issues #8080, #8081 where a transient fetch failure for the vllm-d
  // cluster caused GPU Usage Trend to flap to "No GPU Nodes".
  if (
    options?.throwIfPartialFailureEmpty &&
    accumulated.length === 0 &&
    failedCount > 0
  ) {
    throw new Error(
      `Partial cluster failure yielded empty result (${failedCount}/${clusters.length} clusters errored) — preserving existing cache`,
    )
  }

  return accumulated
}

/**
 * Fetch data from all clusters using SSE streaming.
 * Each cluster's data arrives as a separate event, allowing progressive rendering.
 * Falls back to fetchFromAllClusters if SSE fails or is unavailable.
 */
export async function fetchViaSSE<T>(
  endpoint: string,
  resultKey: string,
  params?: Record<string, string | number | undefined>,
  onProgress?: (partial: T[]) => void,
  options?: FetchFromAllClustersOptions
): Promise<T[]> {
  // In cluster mode (kagenti/kagent), delegate to the backend SSE variant so
  // streaming requests reach the Go backend instead of the local agent.
  // (#10510)
  if (isClusterModeBackend()) {
    return fetchViaBackendSSE<T>(endpoint, resultKey, params, onProgress, options)
  }

  const token = getToken()
  // SSE only available with real backend token
  if (!token || token === 'demo-token' || isBackendUnavailable()) {
    return fetchFromAllClusters<T>(endpoint, resultKey, params, true, onProgress, options)
  }

  try {
    const accumulated: T[] = []
    // Track backend-emitted cluster_error events so we can detect the
    // "partial failure yielding empty result" case below (issues #8080,
    // #8081). Without this, a cluster_error on the only GPU-bearing
    // cluster would silently resolve to [] and flap the UI.
    let clusterErrorCount = 0
    const result = await fetchSSE<T>({
      url: `${LOCAL_AGENT_HTTP_URL}/${endpoint}/stream`,
      params,
      itemsKey: resultKey,
      onClusterData: (_cluster, items) => {
        accumulated.push(...items)
        onProgress?.([...accumulated])
      },
      onClusterError: () => {
        clusterErrorCount += 1
      } })
    if (
      options?.throwIfPartialFailureEmpty &&
      result.length === 0 &&
      clusterErrorCount > 0
    ) {
      throw new Error(
        `Partial SSE failure yielded empty result (${clusterErrorCount} cluster_error events) — preserving existing cache`,
      )
    }
    return result
  } catch {
    // SSE failed — fall back to per-cluster REST
    return fetchFromAllClusters<T>(endpoint, resultKey, params, true, onProgress, options)
  }
}

/**
 * Fetch data from all clusters via the main backend (port 8080).
 * Identical to fetchFromAllClusters but routes through `/api/mcp/` instead of
 * the local agent. Use this for backend-only endpoints that have NOT been
 * ported to kc-agent (pod-issues, deployment-issues, events/warnings,
 * security-issues, gpu-nodes/health). See issue #9996.
 */
export async function fetchFromAllClustersViaBackend<T>(
  endpoint: string,
  resultKey: string,
  params?: Record<string, string | number | undefined>,
  addClusterField = true,
  onProgress?: (partial: T[]) => void,
  options?: FetchFromAllClustersOptions
): Promise<T[]> {
  const clusters = await fetchClusters()
  if (clusters.length === 0) {
    throw new Error('No clusters available (agent connecting or backend not authenticated)')
  }

  const tasks = clusters.map((cluster) => async () => {
    const data = await fetchBackendAPI<Record<string, T[]>>(endpoint, { ...params, cluster })
    const items = data[resultKey] || []
    return addClusterField ? items.map(item => ({ ...item, cluster })) : items
  })

  const accumulated: T[] = []
  let failedCount = 0

  function handleSettled(result: PromiseSettledResult<T[]>) {
    if (result.status === 'fulfilled') {
      accumulated.push(...result.value)
      onProgress?.([...accumulated])
    } else {
      failedCount++
    }
  }
  await settledWithConcurrency(tasks, undefined, handleSettled)

  if (accumulated.length === 0 && clusters.length > 0 && failedCount === clusters.length) {
    throw new Error('All cluster fetches failed')
  }

  if (
    options?.throwIfPartialFailureEmpty &&
    accumulated.length === 0 &&
    failedCount > 0
  ) {
    throw new Error(
      `Partial cluster failure yielded empty result (${failedCount}/${clusters.length} clusters errored) — preserving existing cache`,
    )
  }

  return accumulated
}

/**
 * Fetch data from all clusters using SSE streaming via the main backend.
 * Identical to fetchViaSSE but routes through `/api/mcp/` instead of the
 * local agent. Use this for backend-only endpoints. See issue #9996.
 */
export async function fetchViaBackendSSE<T>(
  endpoint: string,
  resultKey: string,
  params?: Record<string, string | number | undefined>,
  onProgress?: (partial: T[]) => void,
  options?: FetchFromAllClustersOptions
): Promise<T[]> {
  const token = getToken()
  if (!token || token === 'demo-token' || isBackendUnavailable()) {
    return fetchFromAllClustersViaBackend<T>(endpoint, resultKey, params, true, onProgress, options)
  }

  try {
    const accumulated: T[] = []
    let clusterErrorCount = 0
    const result = await fetchSSE<T>({
      url: `/api/mcp/${endpoint}/stream`,
      params,
      itemsKey: resultKey,
      onClusterData: (_cluster, items) => {
        accumulated.push(...items)
        onProgress?.([...accumulated])
      },
      onClusterError: () => {
        clusterErrorCount += 1
      } })
    if (
      options?.throwIfPartialFailureEmpty &&
      result.length === 0 &&
      clusterErrorCount > 0
    ) {
      throw new Error(
        `Partial SSE failure yielded empty result (${clusterErrorCount} cluster_error events) — preserving existing cache`,
      )
    }
    return result
  } catch {
    return fetchFromAllClustersViaBackend<T>(endpoint, resultKey, params, true, onProgress, options)
  }
}

/**
 * Fetch GitOps data via SSE streaming (uses /api/gitops/ prefix).
 */
export async function fetchViaGitOpsSSE<T>(
  endpoint: string,
  resultKey: string,
  params?: Record<string, string | number | undefined>,
  onProgress?: (partial: T[]) => void,
  options?: FetchFromAllClustersOptions
): Promise<T[]> {
  const token = getToken()
  if (!token || token === 'demo-token' || isBackendUnavailable()) {
    throw new Error('No data source available (backend not authenticated)')
  }

  const accumulated: T[] = []
  let clusterErrorCount = 0
  const result = await fetchSSE<T>({
    url: `/api/gitops/${endpoint}/stream`,
    params,
    itemsKey: resultKey,
    onClusterData: (_cluster, items) => {
      accumulated.push(...items)
      onProgress?.([...accumulated])
    },
    onClusterError: () => {
      clusterErrorCount += 1
    },
  })

  if (
    options?.throwIfPartialFailureEmpty &&
    result.length === 0 &&
    clusterErrorCount > 0
  ) {
    throw new Error(
      `Partial SSE failure yielded empty result (${clusterErrorCount} cluster_error events) — preserving existing cache`,
    )
  }

  return result
}

export const fetchGitOpsAPI = makeRestFetcher({
  urlPrefix: '/api/gitops/',
  timeoutMs: FETCH_DEFAULT_TIMEOUT_MS,
  errorLabel: '/api/gitops',
})

export const fetchRbacAPI = makeRestFetcher({
  urlPrefix: '/api/rbac/',
  timeoutMs: RBAC_FETCH_TIMEOUT_MS,
  errorLabel: '/api/rbac',
})

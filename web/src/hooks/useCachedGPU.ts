/**
 * Cached hooks for GPU node data, GPU health monitoring, hardware health,
 * and warning events.
 *
 * Extracted from useCachedData.ts for maintainability.
 */

import { useState } from 'react'
import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { fetchBackendAPI, fetchFromAllClustersViaBackend, fetchViaSSE, fetchViaBackendSSE, getToken, getClusterFetcher, AGENT_HTTP_TIMEOUT_MS } from '../lib/cache/fetcherUtils'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, AI_PREDICTION_TIMEOUT_MS } from '../lib/constants/network'
import { clusterCacheRef, deduplicateClustersByServer, agentFetch } from './mcp/shared'
import {
  getDemoGPUNodes,
  getDemoCachedGPUNodeHealth,
  getDemoCachedWarningEvents,
  HW_INITIAL_DATA,
  HW_DEMO_DATA,
} from './useCachedData/demoData'
import {
  GPUNodesResponseSchema,
  GPUNodeHealthResponseSchema,
} from '../lib/schemas'
import { validateArrayResponse } from '../lib/schemas/validate'
import type { GPUNode, GPUNodeHealthStatus, ClusterEvent, GPUHealthCronJobStatus } from './useMCP'

// ============================================================================
// Shared types
// ============================================================================

// ============================================================================
// Hardware health types (canonical definitions)
// ============================================================================

/** Device alert from agent */
export interface DeviceAlert {
  id: string
  nodeName: string
  cluster: string
  deviceType: string
  previousCount: number
  currentCount: number
  droppedCount: number
  firstSeen: string
  lastSeen: string
  severity: string
}

interface DeviceAlertsResponse {
  alerts: DeviceAlert[]
  nodeCount: number
  timestamp: string
}

export interface DeviceCounts {
  gpuCount: number
  nicCount: number
  nvmeCount: number
  infinibandCount: number
  sriovCapable: boolean
  rdmaAvailable: boolean
  mellanoxPresent: boolean
  nvidiaNicPresent: boolean
  spectrumScale: boolean
  mofedReady: boolean
  gpuDriverReady: boolean
}

export interface NodeDeviceInventory {
  nodeName: string
  cluster: string
  devices: DeviceCounts
  lastSeen: string
}

interface DeviceInventoryResponse {
  nodes: NodeDeviceInventory[]
  timestamp: string
}

export interface HardwareHealthData {
  alerts: DeviceAlert[]
  inventory: NodeDeviceInventory[]
  nodeCount: number
  lastUpdate: string | null
}

// ============================================================================
// Private helpers
// ============================================================================

async function fetchHardwareHealth(): Promise<HardwareHealthData> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_PREDICTION_TIMEOUT_MS)

  try {
    const [alertsRes, inventoryRes] = await Promise.all([
      agentFetch(`${LOCAL_AGENT_HTTP_URL}/devices/alerts`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal }).catch(() => null),
      agentFetch(`${LOCAL_AGENT_HTTP_URL}/devices/inventory`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal }).catch(() => null),
    ])
    clearTimeout(timeoutId)

    const result: HardwareHealthData = {
      alerts: [],
      inventory: [],
      nodeCount: 0,
      lastUpdate: new Date().toISOString() }

    if (alertsRes?.ok) {
      const data = await alertsRes.json().catch(() => null) as DeviceAlertsResponse | null
      if (data) {
        result.alerts = data.alerts || []
        result.nodeCount = data.nodeCount
      }
    }

    if (inventoryRes?.ok) {
      const data = await inventoryRes.json().catch(() => null) as DeviceInventoryResponse | null
      if (data) {
        result.inventory = data.nodes || []
        if (data.nodes && data.nodes.length > 0) {
          result.nodeCount = data.nodes.length
        }
      }
    }

    // If neither endpoint returned data, throw so useCache tracks the failure
    if (!alertsRes?.ok && !inventoryRes?.ok) {
      throw new Error('Device endpoints unavailable')
    }

    return result
  } catch (e: unknown) {
    clearTimeout(timeoutId)
    throw e
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for fetching GPU nodes with caching.
 */
export function useCachedGPUNodes(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<GPUNode[]> & { nodes: GPUNode[] } {
  const { category = 'gpu' } = options || {}
  const key = `gpuNodes:${cluster || 'all'}`

  // Partial-failure protection (#8080, #8081): on the multi-cluster fan-out
  // path, a transient error for the ONE cluster that actually has GPUs
  // combined with empty results from the others is indistinguishable from
  // "no GPUs anywhere". Rather than silently overwrite the cache with [],
  // throw so useCache takes the error path and preserves the previous
  // inventory. This is opt-in and GPU-specific — other endpoints (pods,
  // deployments, etc.) still return partial data on partial failure.
  const gpuFetchOptions = { throwIfPartialFailureEmpty: true }

  const result = useCache({
    key,
    category,
    initialData: [] as GPUNode[],
    demoData: getDemoGPUNodes(),
    fetcher: async () => {
      if (cluster) {
        const raw = await getClusterFetcher()<unknown>('gpu-nodes', { cluster })
        const data = validateArrayResponse<{ nodes: GPUNode[] }>(GPUNodesResponseSchema, raw, '/api/mcp/gpu-nodes', 'nodes')
        return (data.nodes || []).map(n => ({ ...n, cluster }))
      }

      // Deduplicate clusters before fan-out (#9502). Multiple kubeconfig
      // contexts can point to the same physical cluster. Without dedup,
      // fetchFromAllClusters queries every raw context — if two contexts
      // share a server, one cluster's GPUs appear twice while the other
      // GPU-bearing cluster's data may be lost due to name collisions in
      // the accumulated results. See MEMORY.md: "ALWAYS use
      // DeduplicatedClusters() when iterating clusters".
      const allClusters = clusterCacheRef.clusters || []
      const deduped = deduplicateClustersByServer(allClusters)
      const reachable = deduped.filter(
        (c) => c.reachable !== false && !c.name.includes('/'),
      )
      if (reachable.length === 0) {
        throw new Error(
          'No reachable clusters (agent connecting or backend not authenticated)',
        )
      }

      const tasks = reachable.map((cl) => async () => {
        const raw = await getClusterFetcher()<unknown>('gpu-nodes', { cluster: cl.name })
        const data = validateArrayResponse<{ nodes: GPUNode[] }>(
          GPUNodesResponseSchema, raw, '/api/mcp/gpu-nodes', 'nodes',
        )
        return (data.nodes || []).map(n => ({ ...n, cluster: cl.name }))
      })

      const accumulated: GPUNode[] = []
      let failedCount = 0
      function handleSettled(result: PromiseSettledResult<GPUNode[]>) {
        if (result.status === 'fulfilled') {
          accumulated.push(...result.value)
        } else {
          failedCount++
        }
      }
      await settledWithConcurrency(tasks, undefined, handleSettled)

      // Partial-failure protection (#8080, #8081): if any cluster errored
      // and the accumulated result is empty, preserve stale cache.
      if (accumulated.length === 0 && failedCount > 0) {
        throw new Error(
          `Partial cluster failure yielded empty GPU result (${failedCount}/${reachable.length} clusters errored) — preserving existing cache`,
        )
      }

      return accumulated
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<GPUNode>('gpu-nodes', 'nodes', {}, onProgress, gpuFetchOptions)
    } })

  return {
    nodes: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching GPU node health data with caching and SSE streaming.
 */
export function useCachedGPUNodeHealth(
  cluster?: string,
): CachedHookResult<GPUNodeHealthStatus[]> & { nodes: GPUNodeHealthStatus[] } {
  const key = `gpu-node-health:${cluster || 'all'}`

  const result = useCache({
    key,
    category: 'pods' as RefreshCategory,
    initialData: [] as GPUNodeHealthStatus[],
    demoData: getDemoCachedGPUNodeHealth(),
    persist: true,
    fetcher: async () => {
      // gpu-nodes/health is a backend-only endpoint (#9996)
      if (cluster) {
        const raw = await fetchBackendAPI<unknown>('gpu-nodes/health', { cluster })
        const data = validateArrayResponse<{ nodes: GPUNodeHealthStatus[] }>(GPUNodeHealthResponseSchema, raw, '/api/mcp/gpu-nodes/health', 'nodes')
        return (data.nodes || []).map(n => ({ ...n, cluster }))
      }
      return fetchFromAllClustersViaBackend<GPUNodeHealthStatus>('gpu-nodes/health', 'nodes', {})
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return fetchViaBackendSSE<GPUNodeHealthStatus>('gpu-nodes/health', 'nodes', {}, onProgress)
    } })

  return {
    nodes: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for managing GPU health CronJob installation per cluster.
 * Uses useCache for persistent status caching; install/uninstall are imperative actions.
 */
export function useGPUHealthCronJob(cluster?: string) {
  const key = `gpu-cronjob-status:${cluster || 'none'}`
  const [actionInProgress, setActionInProgress] = useState<'install' | 'uninstall' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const result = useCache<GPUHealthCronJobStatus | null>({
    key,
    category: 'pods' as RefreshCategory,
    initialData: null,
    demoData: null,
    persist: true,
    enabled: !!cluster,
    fetcher: async () => {
      if (!cluster) return null
      // GET gpu-nodes/health/cronjob is a backend-only endpoint (#9996)
      return fetchBackendAPI<GPUHealthCronJobStatus>('gpu-nodes/health/cronjob', { cluster })
    } })

  const install = async (opts?: { namespace?: string; schedule?: string; tier?: number }) => {
    if (!cluster) return
    setActionInProgress('install')
    setActionError(null)
    try {
      const token = getToken()
      if (!token) throw new Error('No authentication token')
      // #7993 Phase 3e: GPU health cronjob install is a user-initiated
      // tooling install. It runs through kc-agent under the user's own
      // kubeconfig instead of the backend pod ServiceAccount.
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/gpu-health-cronjob`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          cluster,
          namespace: opts?.namespace,
          schedule: opts?.schedule,
          tier: opts?.tier ?? 2 }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Install failed: ${response.status}`)
      }
      await result.refetch()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to install CronJob')
    } finally {
      setActionInProgress(null)
    }
  }

  const uninstall = async (opts?: { namespace?: string }) => {
    if (!cluster) return
    setActionInProgress('uninstall')
    setActionError(null)
    try {
      const token = getToken()
      if (!token) throw new Error('No authentication token')
      // #7993 Phase 3e: GPU health cronjob uninstall goes through kc-agent
      // under the user's own kubeconfig.
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/gpu-health-cronjob`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          cluster,
          namespace: opts?.namespace }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Uninstall failed: ${response.status}`)
      }
      await result.refetch()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to uninstall CronJob')
    } finally {
      setActionInProgress(null)
    }
  }

  return {
    status: result.data,
    isLoading: result.isLoading,
    error: actionError || result.error,
    actionInProgress,
    install,
    uninstall,
    refetch: result.refetch }
}

/**
 * Hook for fetching hardware health data (device alerts + inventory) with caching.
 * Uses IndexedDB persistence so data survives navigation.
 */
export function useCachedHardwareHealth(): CachedHookResult<HardwareHealthData> & { retryFetch: () => Promise<void> } {
  const result = useCache({
    key: 'hardware-health',
    category: 'pods', // 30-second refresh
    initialData: HW_INITIAL_DATA,
    demoData: HW_DEMO_DATA,
    persist: true,
    // Don't gate on isAgentUnavailable() — the agent may connect after the hook
    // mounts and `enabled` is only read once. The fetcher handles unavailability
    // internally by throwing, which useCache tracks as consecutive failures.
    fetcher: fetchHardwareHealth })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
    retryFetch: result.retryFetch }
}

/**
 * Hook for fetching warning events with caching and SSE streaming.
 * When no cluster is specified, fetches from all clusters via SSE.
 */
export function useCachedWarningEvents(
  cluster?: string,
  namespace?: string,
  options?: { limit?: number; category?: RefreshCategory }
): CachedHookResult<ClusterEvent[]> & { events: ClusterEvent[] } {
  const { limit = 50, category = 'realtime' } = options || {}
  const key = `warningEvents:${cluster || 'all'}:${namespace || 'all'}:${limit}`

  const result = useCache({
    key,
    category,
    initialData: [] as ClusterEvent[],
    demoData: getDemoCachedWarningEvents(),
    fetcher: async () => {
      // events/warnings is a backend-only endpoint (#9996)
      if (cluster) {
        const data = await fetchBackendAPI<{ events: ClusterEvent[] }>('events/warnings', { cluster, namespace, limit })
        return (data.events || []).map(e => ({ ...e, cluster }))
      }
      const events = await fetchFromAllClustersViaBackend<ClusterEvent>('events/warnings', 'events', { namespace, limit })
      return events.slice(0, limit)
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      const events = await fetchViaBackendSSE<ClusterEvent>('events/warnings', 'events', { namespace, limit }, (partial) => {
        onProgress(partial.slice(0, limit))
      })
      return events.slice(0, limit)
    } })

  return {
    events: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

// Re-export AGENT_HTTP_TIMEOUT_MS for use in the workaround in useCachedCoreWorkloads
export { AGENT_HTTP_TIMEOUT_MS }

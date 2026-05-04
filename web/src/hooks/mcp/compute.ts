import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchSSE } from '../../lib/sseClient'
import { reportAgentDataSuccess, isAgentUnavailable } from '../useLocalAgent'
import { isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerCacheReset, registerRefetch } from '../../lib/modeTransition'
import { STORAGE_KEY_TOKEN } from '../../lib/constants'
import { GPU_POLL_INTERVAL_MS, getEffectiveInterval, getLocalAgentURL, agentFetch } from './shared'
import { subscribePolling } from './pollingManager'
import { MCP_EXTENDED_TIMEOUT_MS, MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../lib/constants/network'
import { classifyError, type ClusterErrorType } from '../../lib/errorClassifier'
import { isInClusterMode } from '../useBackendHealth'
import type { GPUNode, NodeInfo, NVIDIAOperatorStatus } from './types'

/**
 * Per-cluster error surfaced by {@link useNodes} when the backend emits a
 * `cluster_error` SSE event for a particular cluster (Issue 9355). Lets
 * consumers distinguish an RBAC denial ({@link ClusterErrorType} === 'auth')
 * from a transient 5xx/timeout failure so the UI can render a specific
 * "lacks list-nodes RBAC" explanation instead of a generic "detailed list
 * is empty" warning.
 */
export interface NodeClusterError {
  cluster: string
  errorType: ClusterErrorType
  message: string
}

// Module-level cache for GPU nodes (persists across navigation)
interface GPUNodeCache {
  nodes: GPUNode[]
  lastUpdated: Date | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  consecutiveFailures: number
  lastRefresh: Date | null
}

// Try to restore GPU cache from localStorage for instant display on page load
const GPU_CACHE_KEY = 'kubestellar-gpu-cache'
/** Cache TTL: 30 seconds — consider GPU data stale after this */
const CACHE_TTL_MS = 30_000
function loadGPUCacheFromStorage(): GPUNodeCache {
  try {
    const stored = localStorage.getItem(GPU_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        return {
          nodes: parsed.nodes,
          lastUpdated: parsed.lastUpdated ? new Date(parsed.lastUpdated) : null,
          isLoading: false,
          isRefreshing: false,
          error: null,
          consecutiveFailures: 0,
          lastRefresh: parsed.lastUpdated ? new Date(parsed.lastUpdated) : null,
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { nodes: [], lastUpdated: null, isLoading: false, isRefreshing: false, error: null, consecutiveFailures: 0, lastRefresh: null }
}

function saveGPUCacheToStorage(cache: GPUNodeCache) {
  try {
    // Never save demo data to localStorage - only save real cluster data
    // Demo data has cluster names like "vllm-gpu-cluster" which don't match real clusters
    if (cache.nodes.length > 0 && !isDemoMode()) {
      localStorage.setItem(GPU_CACHE_KEY, JSON.stringify({
        nodes: cache.nodes,
        lastUpdated: cache.lastUpdated?.toISOString(),
      }))
    }
  } catch {
    // Ignore storage errors
  }
}

export let gpuNodeCache: GPUNodeCache = loadGPUCacheFromStorage()

export const gpuNodeSubscribers = new Set<(cache: GPUNodeCache) => void>()

export function notifyGPUNodeSubscribers() {
  Array.from(gpuNodeSubscribers).forEach(subscriber => subscriber(gpuNodeCache))
}

// Register with mode transition coordinator for unified cache clearing
if (typeof window !== 'undefined') {
  registerCacheReset('gpu-nodes', () => {
    try {
      localStorage.removeItem(GPU_CACHE_KEY)
    } catch {
      // Ignore storage errors
    }

    // Force reset to loading state (bypasses updateGPUNodeCache protection)
    gpuNodeCache = {
      nodes: [],
      lastUpdated: null,
      isLoading: true, // Triggers skeleton display
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
    }
    notifyGPUNodeSubscribers()
  })
}

export function updateGPUNodeCache(updates: Partial<GPUNodeCache>) {
  // NOTE: We used to have a "CRITICAL: Never allow clearing nodes if we have
  // good data" guard here that silently dropped any `nodes: []` update. That
  // guard was the root cause of issue #6111 — when all GPU nodes were removed
  // from a cluster, the cache would never update to reflect the new reality
  // and the UI would keep showing stale nodes indefinitely.
  //
  // Cache-preservation across transient failures is now handled at the fetch
  // site (`fetchGPUNodes`): only a successful empty response is applied; a
  // failure keeps the existing cache untouched. Callers that intentionally
  // clear the cache (e.g. resetGPUNodeCache) or that wish to apply an
  // authoritative empty result are no longer silently ignored.
  gpuNodeCache = { ...gpuNodeCache, ...updates }

  // Persist to localStorage when nodes are updated (and we have data)
  if (updates.nodes !== undefined && gpuNodeCache.nodes.length > 0) {
    saveGPUCacheToStorage(gpuNodeCache)
  }
  notifyGPUNodeSubscribers()
}

// Fetch GPU nodes (shared across all consumers)
let gpuFetchInProgress = false
async function fetchGPUNodes(cluster?: string, _source?: string) {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  // GPU data is always live — try real sources first, fall back to demo only if all fail

  if (gpuFetchInProgress) return
  gpuFetchInProgress = true

  // NOTE: We no longer clear localStorage cache before fetch.
  // This prevents losing GPU data if the fetch fails.
  // The cache is only updated when we successfully get new data.

  // Show loading only if no cached data, otherwise show refreshing
  if (gpuNodeCache.nodes.length === 0) {
    updateGPUNodeCache({ isLoading: true, isRefreshing: false })
  } else {
    updateGPUNodeCache({ isLoading: false, isRefreshing: true })
  }

  try {
    const params = new URLSearchParams()
    if (cluster) params.append('cluster', cluster)

    let newNodes: GPUNode[] = []
    let agentSucceeded = false
    // Tracks whether at least one upstream source successfully returned a
    // response for this fetch cycle — regardless of whether it contained any
    // nodes. This is the signal we use to decide whether an empty result is a
    // legitimate "no GPUs here any more" (clear the cache) or a transient
    // failure (keep the stale cache). See issue #6111.
    let fetchSucceeded = false

    // Try local agent first (works without backend running).
    // Skip when agent URL is suppressed (in-cluster deployments set it to '').
    const agentURL = getLocalAgentURL()
    if (agentURL && !isAgentUnavailable() && !isInClusterMode()) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), MCP_EXTENDED_TIMEOUT_MS)
        const response = await agentFetch(`${agentURL}/gpu-nodes?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          newNodes = data.nodes || []
          agentSucceeded = true // Agent worked, even if it returned 0 nodes
          fetchSucceeded = true
          reportAgentDataSuccess()
        } else {
          throw new Error('Local agent returned error')
        }
      } catch {
        // Agent failed, will try backend below
      }
    }

    // If agent didn't work (not just "returned 0 nodes"), try SSE streaming then REST.
    // In-cluster mode uses cookie auth (no localStorage token), so allow the fallback.
    if (!agentSucceeded && (token || isInClusterMode())) {
      try {
        // Try SSE streaming first for progressive rendering
        const sseResult = await fetchSSE<GPUNode>({
          url: `${isInClusterMode() ? '/api/mcp' : LOCAL_AGENT_HTTP_URL}/gpu-nodes/stream`,
          params: Object.fromEntries(params.entries()),
          itemsKey: 'nodes',
          onClusterData: (_cluster, items) => {
            if (items.length > 0) {
              newNodes = [...newNodes, ...items]
              updateGPUNodeCache({
                nodes: [...newNodes],
                isLoading: false,
                isRefreshing: true,
              })
            }
          },
        })
        newNodes = sseResult
        fetchSucceeded = true
      } catch {
        // SSE failed, try REST fallback
        try {
          const resp = await agentFetch(`${isInClusterMode() ? '/api/mcp' : LOCAL_AGENT_HTTP_URL}/gpu-nodes?${params}`)
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const data = await resp.json()
          newNodes = data.nodes || []
          fetchSucceeded = true
        } catch {
          if (gpuNodeCache.nodes.length === 0) {
            throw new Error('Both SSE and REST failed')
          }
        }
      }
    }

    // Update with new data. Previously this code would refuse to overwrite a
    // populated cache with an empty result, which caused the cache to retain
    // stale GPU nodes long after they had been removed from the cluster
    // (issue #6111). We now distinguish two cases:
    //
    //   a) `fetchSucceeded === true` — at least one upstream returned a valid
    //      response (even an empty list). This is an authoritative "truth" and
    //      we MUST apply it, including the empty-array case, so removed nodes
    //      disappear.
    //
    //   b) `fetchSucceeded === false` — every upstream errored out. Keep the
    //      stale cache so the UI doesn't flicker to empty on a transient
    //      network failure.
    if (fetchSucceeded) {
      updateGPUNodeCache({
        nodes: newNodes,
        lastUpdated: new Date(),
        isLoading: false,
        isRefreshing: false,
        error: null,
        consecutiveFailures: 0,
        lastRefresh: new Date(),
      })
    } else {
      updateGPUNodeCache({
        isLoading: false,
        isRefreshing: false,
        lastRefresh: new Date(),
        // Don't set error for "no GPU nodes" - that's expected, not an error
        error: null,
      })
    }
  } catch {
    const newFailures = gpuNodeCache.consecutiveFailures + 1

    // On error, preserve existing cached data
    // Only use demo data if demo mode is explicitly enabled
    if (gpuNodeCache.nodes.length === 0 && isDemoMode()) {
      updateGPUNodeCache({
        nodes: getDemoGPUNodes(),
        isLoading: false,
        isRefreshing: false,
        error: null, // Don't show error - GPU nodes are optional
        consecutiveFailures: newFailures,
        lastRefresh: new Date(),
      })
    } else {
      // Try to restore from localStorage if memory cache is empty
      if (gpuNodeCache.nodes.length === 0) {
        const storedCache = loadGPUCacheFromStorage()
        if (storedCache.nodes.length > 0) {
          updateGPUNodeCache({
            ...storedCache,
            error: 'Using cached data - fetch failed',
            consecutiveFailures: newFailures,
            lastRefresh: new Date(),
          })
        } else {
          // No cache to restore, update state (no error - GPU nodes are optional)
          updateGPUNodeCache({
            isLoading: false,
            isRefreshing: false,
            error: null, // Don't show error - GPU nodes are optional
            consecutiveFailures: newFailures,
            lastRefresh: new Date(),
          })
        }
      } else {
        // Preserve existing memory cache on error (no error message - GPU nodes are optional)
        updateGPUNodeCache({
          isLoading: false,
          isRefreshing: false,
          error: null, // Don't show error - GPU nodes are optional
          consecutiveFailures: newFailures,
          lastRefresh: new Date(),
        })
      }

      // Retry logic: schedule a retry if we haven't exceeded max retries
      const MAX_RETRIES = 2
      const RETRY_DELAYS = [2000, 5000] // 2s, then 5s
      if (newFailures <= MAX_RETRIES && !isDemoMode()) {
        const delay = RETRY_DELAYS[newFailures - 1] || 5000
        setTimeout(() => {
          fetchGPUNodes(cluster, `retry-${newFailures}`)
        }, delay)
      }
    }
  } finally {
    gpuFetchInProgress = false
  }
}

// Hook to get GPU nodes with shared caching
export function useGPUNodes(cluster?: string) {
  const [state, setState] = useState<GPUNodeCache>(gpuNodeCache)
  const { isDemoMode: demoMode } = useDemoMode()

  // Stable refetch function for registration
  const refetchRef = useRef(() => fetchGPUNodes(cluster, 'mode-switch'))
  refetchRef.current = () => fetchGPUNodes(cluster, 'mode-switch')

  // Re-fetch when demo mode changes (not on initial mount)
  const initialMountRef = useRef(true)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    fetchGPUNodes(cluster, 'mode-switch')
  }, [demoMode, cluster])

  useEffect(() => {
    // Subscribe to cache updates
    const handleUpdate = (cache: GPUNodeCache) => setState(cache)
    gpuNodeSubscribers.add(handleUpdate)

    // Fetch if cache is empty or stale (older than 30 seconds)
    const isStale = !gpuNodeCache.lastUpdated ||
      (Date.now() - gpuNodeCache.lastUpdated.getTime()) > CACHE_TTL_MS
    if (gpuNodeCache.nodes.length === 0 || isStale) {
      fetchGPUNodes(cluster)
    }

    // Poll GPU node data periodically (shared interval prevents duplicates across components)
    const unsubscribePolling = subscribePolling(
      `gpuNodes:${cluster || 'all'}`,
      getEffectiveInterval(GPU_POLL_INTERVAL_MS, gpuNodeCache.consecutiveFailures),
      () => fetchGPUNodes(cluster, 'poll'),
    )

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`gpu-nodes:${cluster || 'all'}`, () => {
      refetchRef.current()
    })

    return () => {
      gpuNodeSubscribers.delete(handleUpdate)
      unsubscribePolling()
      unregisterRefetch()
    }
  }, [cluster, gpuNodeCache.consecutiveFailures])

  const refetch = useCallback(() => {
    fetchGPUNodes(cluster)
  }, [cluster])

  // Deduplicate GPU nodes by name to avoid counting same physical node twice
  // This handles cases where the same node appears under different cluster contexts
  const deduplicatedNodes = useMemo(() => {
    const seenNodes = new Map<string, GPUNode>()
    state.nodes.forEach(node => {
      const nodeKey = node.name
      const existing = seenNodes.get(nodeKey)

      // Prefer short cluster names (without '/') over long context paths
      // Short names like 'vllm-d' match filtering better than 'default/api-fmaas-vllm-d-...'
      const isShortName = !node.cluster.includes('/')
      const existingIsShortName = existing ? !existing.cluster.includes('/') : false

      if (!existing) {
        // First time seeing this node - ensure gpuAllocated doesn't exceed gpuCount
        // Guard against undefined/NaN values from incomplete API data
        const count = node.gpuCount || 0
        const allocated = node.gpuAllocated || 0
        seenNodes.set(nodeKey, {
          ...node,
          gpuCount: count,
          gpuAllocated: Math.min(allocated, count)
        })
      } else if (isShortName && !existingIsShortName) {
        // New entry has short cluster name, existing has long - prefer short
        const count = node.gpuCount || 0
        const allocated = node.gpuAllocated || 0
        seenNodes.set(nodeKey, {
          ...node,
          gpuCount: count,
          gpuAllocated: Math.min(allocated, count)
        })
      } else if (!isShortName && existingIsShortName) {
        // Existing has short name, keep it - don't replace
      } else {
        // Both have same type of name - keep the one with more reasonable data
        const existingValid = existing.gpuAllocated <= existing.gpuCount
        const newCount = node.gpuCount || 0
        const newAllocated = node.gpuAllocated || 0
        const newValid = newAllocated <= newCount
        if (newValid && !existingValid) {
          seenNodes.set(nodeKey, {
            ...node,
            gpuCount: newCount,
            gpuAllocated: Math.min(newAllocated, newCount)
          })
        }
      }
    })
    return Array.from(seenNodes.values())
  }, [state.nodes])

  // Filter by cluster if specified
  const filteredNodes = cluster
    ? deduplicatedNodes.filter(n => n.cluster === cluster || n.cluster.startsWith(cluster))
    : deduplicatedNodes

  return {
    nodes: filteredNodes,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    error: state.error,
    refetch,
    consecutiveFailures: state.consecutiveFailures,
    isFailed: state.consecutiveFailures >= 3,
    lastRefresh: state.lastRefresh,
  }
}

// Hook to get detailed node information
export function useNodes(cluster?: string) {
  const [nodes, setNodes] = useState<NodeInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Per-cluster errors from the SSE `cluster_error` event (Issue 9355). Lets
  // consumers (drill-downs) distinguish an RBAC denial on one or more
  // clusters from a globally-transient failure so the UI can show a
  // specific "lacks list-nodes RBAC on cluster X" message instead of a
  // generic "detailed list is empty" warning.
  const [clusterErrors, setClusterErrors] = useState<NodeClusterError[]>([])
  const { isDemoMode: demoMode } = useDemoMode()

  // Track previous cluster to detect actual changes (not just initial mount)
  const prevClusterRef = useRef<string | undefined>(cluster)
  const initialMountRef = useRef(true)

  // Reset state only when cluster actually CHANGES (not on initial mount)
  useEffect(() => {
    if (prevClusterRef.current !== cluster) {
      setNodes([])
      setIsLoading(true)
      setError(null)
      setClusterErrors([])
      prevClusterRef.current = cluster
    }
  }, [cluster])

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data
    if (isDemoMode()) {
      const demoNodes = getDemoNodes().filter(n => !cluster || n.cluster === cluster)
      setNodes(demoNodes)
      setIsLoading(false)
      setError(null)
      setClusterErrors([])
      return
    }
    setIsLoading(true)

    // Try local agent HTTP endpoint first (works without backend)
    const nodeAgentURL = getLocalAgentURL()
    if (cluster && nodeAgentURL && !isAgentUnavailable() && !isInClusterMode()) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
        const response = await agentFetch(`${nodeAgentURL}/nodes?cluster=${encodeURIComponent(cluster)}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          const nodeData = data.nodes || []
          if (nodeData.length > 0) {
            // Map to NodeInfo format
            const mappedNodes: NodeInfo[] = nodeData.map((n: Record<string, unknown>) => ({
              name: n.name as string,
              cluster: cluster,
              status: n.status as string || 'Unknown',
              roles: n.roles as string[] || [],
              kubeletVersion: n.kubeletVersion as string || '',
              cpuCapacity: n.cpuCapacity as string || '0',
              memoryCapacity: n.memoryCapacity as string || '0',
              podCapacity: n.podCapacity as string || '110',
              conditions: n.conditions as Array<{type: string; status: string; reason: string; message: string}> || [],
              unschedulable: n.unschedulable as boolean || false,
            }))
            setNodes(mappedNodes)
            setError(null)
            setClusterErrors([])
            setIsLoading(false)
            reportAgentDataSuccess()
            return
          }
        }
      } catch (err: unknown) {
        console.error(`[useNodes] Local agent failed for ${cluster}:`, err)
      }
    }

    // Collect per-cluster error events during this refetch. We replace the
    // previous snapshot atomically when the stream settles so a transient
    // flash of "cluster X failed" isn't left stale after a retry succeeds
    // (Issue 9355).
    const collectedErrors: NodeClusterError[] = []

    // Use SSE streaming for progressive multi-cluster data
    try {
      const sseParams: Record<string, string> = {}
      if (cluster) sseParams.cluster = cluster

      const allNodes = await fetchSSE<NodeInfo>({
        url: `${isInClusterMode() ? '/api/mcp' : LOCAL_AGENT_HTTP_URL}/nodes/stream`,
        params: sseParams,
        itemsKey: 'nodes',
        onClusterData: (_clusterName, items) => {
          setNodes(prev => [...prev, ...items])
          setIsLoading(false)
        },
        onClusterError: (clusterName, errorMessage) => {
          // Classify the raw backend error so consumers can render an
          // RBAC-specific message (auth) instead of "transient failure"
          // (timeout/network/unknown). Backend error strings already
          // contain enough context ("nodes is forbidden", "401",
          // "unauthorized", etc.) for the classifier to match.
          const classified = classifyError(errorMessage)
          collectedErrors.push({
            cluster: clusterName,
            errorType: classified.type,
            message: errorMessage,
          })
        },
      })

      setNodes(allNodes)
      setError(null)
      setClusterErrors(collectedErrors)
    } catch {
      // On error, show empty state instead of fabricating placeholder nodes
      // that would masquerade as real Ready nodes (#7351).  Even on
      // catastrophic failure, surface any per-cluster errors we collected
      // before the stream aborted so the UI can still explain the partial
      // state (Issue 9355).
      setError(null)
      setNodes([])
      setClusterErrors(collectedErrors)
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`nodes:${cluster || 'all'}`, () => {
      refetch()
    })

    return () => {
      unregisterRefetch()
    }
  }, [refetch, cluster])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch()
  }, [demoMode, refetch])

  // Per-cluster errors surfaced from the SSE stream (Issue 9355) so the
  // multi-cluster drill-down can explain an empty list with "lacks
  // list-nodes RBAC on cluster X" rather than a generic warning.
  return { nodes, isLoading, error, clusterErrors, refetch }
}

// Hook to get NVIDIA operator status
export function useNVIDIAOperators(cluster?: string) {
  const [operators, setOperators] = useState<NVIDIAOperatorStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      if (cluster) params.cluster = cluster

      // Try SSE streaming first
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      if ((token && token !== 'demo-token') || isInClusterMode()) {
        try {
          const accumulated: NVIDIAOperatorStatus[] = []
          const result = await fetchSSE<NVIDIAOperatorStatus>({
            url: `${isInClusterMode() ? '/api/mcp' : LOCAL_AGENT_HTTP_URL}/nvidia-operators/stream`,
            params,
            itemsKey: 'operators',
            onClusterData: (_clusterName, items) => {
              accumulated.push(...items)
              setOperators([...accumulated])
              setIsLoading(false)
            },
          })
          setOperators(result)
          setError(null)
          setIsLoading(false)
          return
        } catch {
          // SSE failed, fall through to REST
        }
      }

      // REST fallback
      const urlParams = new URLSearchParams()
      if (cluster) urlParams.append('cluster', cluster)
      const resp = await agentFetch(`${isInClusterMode() ? '/api/mcp' : LOCAL_AGENT_HTTP_URL}/nvidia-operators?${urlParams}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      if (data.operators) {
        setOperators(data.operators)
      } else if (data.operator) {
        setOperators([data.operator])
      } else {
        setOperators([])
      }
      setError(null)
    } catch {
      setError(null)
      setOperators([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { operators, isLoading, error, refetch }
}

// Demo data functions (not exported)

function getDemoGPUNodes(): GPUNode[] {
  return [
    // vllm-gpu-cluster - Large GPU cluster for AI/ML workloads
    { name: 'gpu-node-1', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' },
    { name: 'gpu-node-2', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8, acceleratorType: 'GPU' },
    { name: 'gpu-node-3', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' },
    { name: 'gpu-node-4', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA H100', gpuCount: 8, gpuAllocated: 7, acceleratorType: 'GPU' },
    // EKS - Production ML inference
    { name: 'eks-gpu-1', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU' },
    { name: 'eks-gpu-2', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 4, acceleratorType: 'GPU' },
    // GKE - Training workloads with GPUs and TPUs
    { name: 'gke-gpu-pool-1', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
    { name: 'gke-gpu-pool-2', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 2, acceleratorType: 'GPU' },
    // GKE - TPU nodes (Google Cloud)
    { name: 'gke-tpu-node-1', cluster: 'gke-staging', gpuType: 'Google TPU v4', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'TPU', manufacturer: 'Google' },
    { name: 'gke-tpu-node-2', cluster: 'gke-staging', gpuType: 'Google TPU v5e', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'TPU', manufacturer: 'Google' },
    // AKS - Dev/test GPUs
    { name: 'aks-gpu-node', cluster: 'aks-dev-westeu', gpuType: 'NVIDIA V100', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
    // OpenShift - Enterprise ML
    { name: 'ocp-gpu-worker-1', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 4, acceleratorType: 'GPU' },
    { name: 'ocp-gpu-worker-2', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' },
    // Intel Gaudi (AI accelerator, classified as GPU)
    { name: 'gaudi-node-1', cluster: 'openshift-prod', gpuType: 'Intel Gaudi2', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU', manufacturer: 'Intel' },
    // IBM AIU nodes (on OCI cluster)
    { name: 'oci-aiu-node-1', cluster: 'oci-oke-phoenix', gpuType: 'IBM AIU', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'AIU', manufacturer: 'IBM' },
    { name: 'oci-aiu-node-2', cluster: 'oci-oke-phoenix', gpuType: 'IBM AIU', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'AIU', manufacturer: 'IBM' },
    // Intel XPU nodes (on AKS cluster)
    { name: 'aks-xpu-node-1', cluster: 'aks-dev-westeu', gpuType: 'Intel Data Center GPU Max', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'XPU', manufacturer: 'Intel' },
    { name: 'aks-xpu-node-2', cluster: 'aks-dev-westeu', gpuType: 'Intel Data Center GPU Flex', gpuCount: 8, gpuAllocated: 5, acceleratorType: 'XPU', manufacturer: 'Intel' },
    // OCI - Oracle GPU shapes
    { name: 'oke-gpu-node', cluster: 'oci-oke-phoenix', gpuType: 'NVIDIA A10', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU' },
    // Alibaba - China region ML
    { name: 'ack-gpu-worker', cluster: 'alibaba-ack-shanghai', gpuType: 'NVIDIA V100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' },
    // Rancher - Managed GPU pool
    { name: 'rancher-gpu-1', cluster: 'rancher-mgmt', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
  ]
}

function getDemoNodes(): NodeInfo[] {
  return [
    {
      name: 'node-1',
      cluster: 'prod-east',
      status: 'Ready',
      roles: ['control-plane', 'master'],
      internalIP: '10.0.1.10',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '8',
      memoryCapacity: '32Gi',
      storageCapacity: '200Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'node-role.kubernetes.io/control-plane': '' },
      taints: ['node-role.kubernetes.io/control-plane:NoSchedule'],
      age: '45d',
      unschedulable: false,
    },
    {
      name: 'node-2',
      cluster: 'prod-east',
      status: 'Ready',
      roles: ['worker'],
      internalIP: '10.0.1.11',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '16',
      memoryCapacity: '64Gi',
      storageCapacity: '500Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'node.kubernetes.io/instance-type': 'm5.4xlarge' },
      age: '45d',
      unschedulable: false,
    },
    {
      name: 'gpu-node-1',
      cluster: 'vllm-d',
      status: 'Ready',
      roles: ['worker'],
      internalIP: '10.0.2.20',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '32',
      memoryCapacity: '128Gi',
      storageCapacity: '1Ti',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'nvidia.com/gpu': 'true', 'node.kubernetes.io/instance-type': 'p3.8xlarge' },
      age: '30d',
      unschedulable: false,
    },
    {
      name: 'kind-control-plane',
      cluster: 'kind-local',
      status: 'Ready',
      roles: ['control-plane'],
      internalIP: '172.18.0.2',
      kubeletVersion: 'v1.27.3',
      containerRuntime: 'containerd://1.7.1',
      os: 'Ubuntu 22.04.2 LTS',
      architecture: 'amd64',
      cpuCapacity: '4',
      memoryCapacity: '8Gi',
      storageCapacity: '50Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      age: '7d',
      unschedulable: false,
    },
  ]
}

export const __computeTestables = {
  loadGPUCacheFromStorage,
  GPU_CACHE_KEY,
}

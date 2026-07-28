/**
 * GPU nodes cache, fetch, and hook.
 *
 * Extracted from compute.ts — see issue #15790 / #21606.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchSSE } from '../../../lib/sseClient'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerCacheReset, registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { GPU_POLL_INTERVAL_MS, getEffectiveInterval, getLocalAgentURL, agentFetch } from '../shared'
import { subscribePolling } from '../pollingManager'
import { MCP_EXTENDED_TIMEOUT_MS, POLL_INTERVAL_FAST_MS, LOADING_TIMEOUT_MS } from '../../../lib/constants/network'
import { isInClusterMode } from '../../useBackendHealth'
import { getClusterModeBaseUrl, isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import type { GPUNode } from '../types'

const GPU_FETCH_MAX_RETRIES = 2
const GPU_FETCH_RETRY_DELAYS = [POLL_INTERVAL_FAST_MS, LOADING_TIMEOUT_MS]
const GPU_FETCH_DEFAULT_RETRY_DELAY = LOADING_TIMEOUT_MS

interface GPUNodeCache {
  nodes: GPUNode[]
  lastUpdated: Date | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  consecutiveFailures: number
  lastRefresh: Date | null
}

const GPU_CACHE_KEY = 'kubestellar-gpu-cache'
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
  } catch { /* Ignore parse errors */ }
  return { nodes: [], lastUpdated: null, isLoading: false, isRefreshing: false, error: null, consecutiveFailures: 0, lastRefresh: null }
}

function saveGPUCacheToStorage(cache: GPUNodeCache) {
  try {
    if (cache.nodes.length > 0 && !isDemoMode()) {
      localStorage.setItem(GPU_CACHE_KEY, JSON.stringify({
        nodes: cache.nodes,
        lastUpdated: cache.lastUpdated?.toISOString(),
      }))
    }
  } catch { /* Ignore storage errors */ }
}

export let gpuNodeCache: GPUNodeCache = loadGPUCacheFromStorage()
export const gpuNodeSubscribers = new Set<(cache: GPUNodeCache) => void>()

export function notifyGPUNodeSubscribers() {
  Array.from(gpuNodeSubscribers).forEach(subscriber => subscriber(gpuNodeCache))
}

if (typeof window !== 'undefined') {
  registerCacheReset('gpu-nodes', () => {
    try { localStorage.removeItem(GPU_CACHE_KEY) } catch { /* Ignore */ }
    gpuNodeCache = { nodes: [], lastUpdated: null, isLoading: true, isRefreshing: false, error: null, consecutiveFailures: 0, lastRefresh: null }
    notifyGPUNodeSubscribers()
  })
}

export function updateGPUNodeCache(updates: Partial<GPUNodeCache>) {
  gpuNodeCache = { ...gpuNodeCache, ...updates }
  if (updates.nodes !== undefined && gpuNodeCache.nodes.length > 0) {
    saveGPUCacheToStorage(gpuNodeCache)
  }
  notifyGPUNodeSubscribers()
}

let gpuFetchInProgress = false
async function fetchGPUNodes(cluster?: string, _source?: string) {
  const token = await getStoredAuthToken()
  if (gpuFetchInProgress) return
  gpuFetchInProgress = true
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
    let fetchSucceeded = false
    const agentURL = getLocalAgentURL()
    if (agentURL && !isAgentUnavailable() && !isClusterModeBackend()) {
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
          agentSucceeded = true
          fetchSucceeded = true
          reportAgentDataSuccess()
        } else {
          throw new Error('Local agent returned error')
        }
      } catch { /* Agent failed */ }
    }
    if (!agentSucceeded && (token || isInClusterMode())) {
      try {
        const sseResult = await fetchSSE<GPUNode>({
          url: `${getClusterModeBaseUrl()}/gpu-nodes/stream`,
          params: Object.fromEntries(params.entries()),
          itemsKey: 'nodes',
          onClusterData: (_cluster, items) => {
            if (items.length > 0) {
              newNodes = [...newNodes, ...items]
              updateGPUNodeCache({ nodes: [...newNodes], isLoading: false, isRefreshing: true })
            }
          },
        })
        newNodes = sseResult
        fetchSucceeded = true
      } catch {
        try {
          const resp = await agentFetch(`${getClusterModeBaseUrl()}/gpu-nodes?${params}`)
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const data = await resp.json()
          newNodes = data.nodes || []
          fetchSucceeded = true
        } catch {
          if (gpuNodeCache.nodes.length === 0) throw new Error('Both SSE and REST failed')
        }
      }
    }
    if (fetchSucceeded) {
      const effectiveNodes = (newNodes.length === 0 && isDemoMode()) ? getDemoGPUNodes() : newNodes
      updateGPUNodeCache({ nodes: effectiveNodes, lastUpdated: new Date(), isLoading: false, isRefreshing: false, error: null, consecutiveFailures: 0, lastRefresh: new Date() })
    } else {
      updateGPUNodeCache({ isLoading: false, isRefreshing: false, lastRefresh: new Date(), error: null })
    }
  } catch {
    const newFailures = gpuNodeCache.consecutiveFailures + 1
    if (gpuNodeCache.nodes.length === 0 && isDemoMode()) {
      updateGPUNodeCache({ nodes: getDemoGPUNodes(), isLoading: false, isRefreshing: false, error: null, consecutiveFailures: newFailures, lastRefresh: new Date() })
    } else {
      if (gpuNodeCache.nodes.length === 0) {
        const storedCache = loadGPUCacheFromStorage()
        if (storedCache.nodes.length > 0) {
          updateGPUNodeCache({ ...storedCache, error: 'Using cached data - fetch failed', consecutiveFailures: newFailures, lastRefresh: new Date() })
        } else {
          updateGPUNodeCache({ isLoading: false, isRefreshing: false, error: null, consecutiveFailures: newFailures, lastRefresh: new Date() })
        }
      } else {
        updateGPUNodeCache({ isLoading: false, isRefreshing: false, error: null, consecutiveFailures: newFailures, lastRefresh: new Date() })
      }
      if (newFailures <= GPU_FETCH_MAX_RETRIES && !isDemoMode()) {
        const delay = GPU_FETCH_RETRY_DELAYS[newFailures - 1] || GPU_FETCH_DEFAULT_RETRY_DELAY
        setTimeout(() => { fetchGPUNodes(cluster, `retry-${newFailures}`) }, delay)
      }
    }
  } finally {
    gpuFetchInProgress = false
  }
}

export function useGPUNodes(cluster?: string) {
  const [state, setState] = useState<GPUNodeCache>(gpuNodeCache)
  const { isDemoMode: demoMode } = useDemoMode()
  const refetchRef = useRef(() => fetchGPUNodes(cluster, 'mode-switch'))
  refetchRef.current = () => fetchGPUNodes(cluster, 'mode-switch')
  const initialMountRef = useRef(true)
  useEffect(() => {
    if (initialMountRef.current) { initialMountRef.current = false; return }
    fetchGPUNodes(cluster, 'mode-switch')
  }, [demoMode, cluster])
  useEffect(() => {
    const handleUpdate = (cache: GPUNodeCache) => setState(cache)
    gpuNodeSubscribers.add(handleUpdate)
    const isStale = !gpuNodeCache.lastUpdated || (Date.now() - gpuNodeCache.lastUpdated.getTime()) > CACHE_TTL_MS
    if (gpuNodeCache.nodes.length === 0 || isStale) fetchGPUNodes(cluster)
    const unsubscribePolling = subscribePolling(
      `gpuNodes:${cluster || 'all'}`,
      getEffectiveInterval(GPU_POLL_INTERVAL_MS, gpuNodeCache.consecutiveFailures),
      () => fetchGPUNodes(cluster, 'poll'),
    )
    const unregisterRefetch = registerRefetch(`gpu-nodes:${cluster || 'all'}`, () => { refetchRef.current() })
    return () => { gpuNodeSubscribers.delete(handleUpdate); unsubscribePolling(); unregisterRefetch() }
  }, [cluster, gpuNodeCache.consecutiveFailures])
  const refetch = useCallback(() => { fetchGPUNodes(cluster) }, [cluster])
  const deduplicatedNodes = useMemo(() => {
    const seenNodes = new Map<string, GPUNode>()
    state.nodes.forEach(node => {
      const nodeKey = node.name
      const existing = seenNodes.get(nodeKey)
      const isShortName = !node.cluster.includes('/')
      const existingIsShortName = existing ? !existing.cluster.includes('/') : false
      if (!existing) {
        const count = node.gpuCount || 0
        const allocated = node.gpuAllocated || 0
        seenNodes.set(nodeKey, { ...node, gpuCount: count, gpuAllocated: Math.min(allocated, count) })
      } else if (isShortName && !existingIsShortName) {
        const count = node.gpuCount || 0
        const allocated = node.gpuAllocated || 0
        seenNodes.set(nodeKey, { ...node, gpuCount: count, gpuAllocated: Math.min(allocated, count) })
      } else if (!isShortName && existingIsShortName) {
        // Existing has short name, keep it
      } else {
        const existingValid = existing.gpuAllocated <= existing.gpuCount
        const newCount = node.gpuCount || 0
        const newAllocated = node.gpuAllocated || 0
        const newValid = newAllocated <= newCount
        if (newValid && !existingValid) {
          seenNodes.set(nodeKey, { ...node, gpuCount: newCount, gpuAllocated: Math.min(newAllocated, newCount) })
        }
      }
    })
    return Array.from(seenNodes.values())
  }, [state.nodes])
  const filteredNodes = cluster ? deduplicatedNodes.filter(n => n.cluster === cluster || n.cluster.startsWith(cluster)) : deduplicatedNodes
  return { nodes: filteredNodes, isLoading: state.isLoading, isRefreshing: state.isRefreshing, error: state.error, refetch, consecutiveFailures: state.consecutiveFailures, isFailed: state.consecutiveFailures >= 3, lastRefresh: state.lastRefresh }
}

function getDemoGPUNodes(): GPUNode[] {
  return [
    { name: 'gpu-node-1', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' },
    { name: 'gpu-node-2', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8, acceleratorType: 'GPU' },
    { name: 'gpu-node-3', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' },
    { name: 'gpu-node-4', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA H100', gpuCount: 8, gpuAllocated: 7, acceleratorType: 'GPU' },
    { name: 'eks-gpu-1', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU' },
    { name: 'eks-gpu-2', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 4, acceleratorType: 'GPU' },
    { name: 'gke-gpu-pool-1', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
    { name: 'gke-gpu-pool-2', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 2, acceleratorType: 'GPU' },
    { name: 'gke-tpu-node-1', cluster: 'gke-staging', gpuType: 'Google TPU v4', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'TPU', manufacturer: 'Google' },
    { name: 'gke-tpu-node-2', cluster: 'gke-staging', gpuType: 'Google TPU v5e', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'TPU', manufacturer: 'Google' },
    { name: 'aks-gpu-node', cluster: 'aks-dev-westeu', gpuType: 'NVIDIA V100', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
    { name: 'ocp-gpu-worker-1', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 4, acceleratorType: 'GPU' },
    { name: 'ocp-gpu-worker-2', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' },
    { name: 'gaudi-node-1', cluster: 'openshift-prod', gpuType: 'Intel Gaudi2', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU', manufacturer: 'Intel' },
    { name: 'oci-aiu-node-1', cluster: 'oci-oke-phoenix', gpuType: 'IBM AIU', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'AIU', manufacturer: 'IBM' },
    { name: 'oci-aiu-node-2', cluster: 'oci-oke-phoenix', gpuType: 'IBM AIU', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'AIU', manufacturer: 'IBM' },
    { name: 'aks-xpu-node-1', cluster: 'aks-dev-westeu', gpuType: 'Intel Data Center GPU Max', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'XPU', manufacturer: 'Intel' },
    { name: 'aks-xpu-node-2', cluster: 'aks-dev-westeu', gpuType: 'Intel Data Center GPU Flex', gpuCount: 8, gpuAllocated: 5, acceleratorType: 'XPU', manufacturer: 'Intel' },
    { name: 'oke-gpu-node', cluster: 'oci-oke-phoenix', gpuType: 'NVIDIA A10', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU' },
    { name: 'ack-gpu-worker', cluster: 'alibaba-ack-shanghai', gpuType: 'NVIDIA V100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' },
    { name: 'rancher-gpu-1', cluster: 'rancher-mgmt', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
  ]
}

export const __computeTestables = {
  loadGPUCacheFromStorage,
  GPU_CACHE_KEY,
}

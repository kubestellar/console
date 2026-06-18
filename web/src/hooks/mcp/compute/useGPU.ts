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
import { getDemoGPUNodes, GPU_CACHE_KEY, loadGPUCacheFromStorage, saveGPUCacheToStorage, type GPUNodeCache } from './gpuShared'

const GPU_FETCH_MAX_RETRIES = 2
const GPU_FETCH_RETRY_DELAYS = [POLL_INTERVAL_FAST_MS, LOADING_TIMEOUT_MS]
const GPU_FETCH_DEFAULT_RETRY_DELAY = LOADING_TIMEOUT_MS
const CACHE_TTL_MS = 30_000

export let gpuNodeCache: GPUNodeCache = loadGPUCacheFromStorage()
export const gpuNodeSubscribers = new Set<(cache: GPUNodeCache) => void>()

export function notifyGPUNodeSubscribers() {
  Array.from(gpuNodeSubscribers).forEach(subscriber => subscriber(gpuNodeCache))
}

export function updateGPUNodeCache(updates: Partial<GPUNodeCache>) {
  gpuNodeCache = { ...gpuNodeCache, ...updates }
  if (updates.nodes !== undefined && gpuNodeCache.nodes.length > 0) {
    saveGPUCacheToStorage(gpuNodeCache)
  }
  notifyGPUNodeSubscribers()
}

if (typeof window !== 'undefined') {
  registerCacheReset('gpu-nodes', () => {
    try {
      localStorage.removeItem(GPU_CACHE_KEY)
    } catch {
      // Ignore storage errors
    }

    gpuNodeCache = {
      nodes: [],
      lastUpdated: null,
      isLoading: true,
      isRefreshing: false,
      error: null,
      consecutiveFailures: 0,
      lastRefresh: null,
    }
    notifyGPUNodeSubscribers()
  })
}

let gpuFetchInProgress = false

async function fetchGPUNodes(cluster?: string, source?: string) {
  void source
  const token = await getStoredAuthToken()
  if (gpuFetchInProgress) return
  gpuFetchInProgress = true

  updateGPUNodeCache(gpuNodeCache.nodes.length === 0
    ? { isLoading: true, isRefreshing: false }
    : { isLoading: false, isRefreshing: true })

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
          headers: { Accept: 'application/json' },
        })
        clearTimeout(timeoutId)
        if (!response.ok) throw new Error('Local agent returned error')
        const data = await response.json()
        newNodes = data.nodes || []
        agentSucceeded = true
        fetchSucceeded = true
        reportAgentDataSuccess()
      } catch {
        // Fall through to backend fetches
      }
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
      const effectiveNodes = newNodes.length === 0 && isDemoMode() ? getDemoGPUNodes() : newNodes
      updateGPUNodeCache({
        nodes: effectiveNodes,
        lastUpdated: new Date(),
        isLoading: false,
        isRefreshing: false,
        error: null,
        consecutiveFailures: 0,
        lastRefresh: new Date(),
      })
    } else {
      updateGPUNodeCache({ isLoading: false, isRefreshing: false, lastRefresh: new Date(), error: null })
    }
  } catch {
    const newFailures = gpuNodeCache.consecutiveFailures + 1

    if (gpuNodeCache.nodes.length === 0 && isDemoMode()) {
      updateGPUNodeCache({
        nodes: getDemoGPUNodes(),
        isLoading: false,
        isRefreshing: false,
        error: null,
        consecutiveFailures: newFailures,
        lastRefresh: new Date(),
      })
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
        setTimeout(() => { void fetchGPUNodes(cluster, `retry-${newFailures}`) }, delay)
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
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    void fetchGPUNodes(cluster, 'mode-switch')
  }, [demoMode, cluster])

  useEffect(() => {
    const handleUpdate = (cache: GPUNodeCache) => setState(cache)
    gpuNodeSubscribers.add(handleUpdate)

    const isStale = !gpuNodeCache.lastUpdated || Date.now() - gpuNodeCache.lastUpdated.getTime() > CACHE_TTL_MS
    if (gpuNodeCache.nodes.length === 0 || isStale) {
      void fetchGPUNodes(cluster)
    }

    const unsubscribePolling = subscribePolling(
      `gpuNodes:${cluster || 'all'}`,
      getEffectiveInterval(GPU_POLL_INTERVAL_MS, gpuNodeCache.consecutiveFailures),
      () => fetchGPUNodes(cluster, 'poll'),
    )
    const unregisterRefetch = registerRefetch(`gpu-nodes:${cluster || 'all'}`, () => { refetchRef.current() })

    return () => {
      gpuNodeSubscribers.delete(handleUpdate)
      unsubscribePolling()
      unregisterRefetch()
    }
  }, [cluster, state.consecutiveFailures])

  const refetch = useCallback(() => { void fetchGPUNodes(cluster) }, [cluster])
  const deduplicatedNodes = useMemo(() => {
    const seenNodes = new Map<string, GPUNode>()
    state.nodes.forEach(node => {
      const existing = seenNodes.get(node.name)
      const isShortName = !node.cluster.includes('/')
      const existingIsShortName = existing ? !existing.cluster.includes('/') : false
      const count = node.gpuCount || 0
      const allocated = node.gpuAllocated || 0
      const normalized = { ...node, gpuCount: count, gpuAllocated: Math.min(allocated, count) }

      if (!existing || (isShortName && !existingIsShortName)) {
        seenNodes.set(node.name, normalized)
        return
      }
      if (!isShortName && existingIsShortName) return

      const existingValid = existing.gpuAllocated <= existing.gpuCount
      if (allocated <= count && !existingValid) {
        seenNodes.set(node.name, normalized)
      }
    })
    return Array.from(seenNodes.values())
  }, [state.nodes])

  const filteredNodes = cluster
    ? deduplicatedNodes.filter(node => node.cluster === cluster || node.cluster.startsWith(cluster))
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

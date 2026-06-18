import { useState, useEffect, useCallback, useRef } from 'react'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { isDemoMode } from '../../../lib/demoMode'
import { registerCacheReset, registerRefetch } from '../../../lib/modeTransition'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { REFRESH_INTERVAL_MS, getEffectiveInterval, getLocalAgentURL, agentFetch, clusterCacheRef } from '../shared'
import { deduplicateClustersByServer } from '../dedup'
import { subscribePolling } from '../pollingManager'
import { settledWithConcurrency } from '../../../lib/utils/concurrency'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { CONSECUTIVE_FAILURE_THRESHOLD } from '../../../lib/cache'
import { isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import type { PVC } from '../types'

// ---------------------------------------------------------------------------
// Shared Storage State - enables cache reset notifications to all consumers
// ---------------------------------------------------------------------------

interface StorageSharedState {
  cacheVersion: number
  isResetting: boolean
}

let storageSharedState: StorageSharedState = {
  cacheVersion: 0,
  isResetting: false,
}

type StorageSubscriber = (state: StorageSharedState) => void
const storageSubscribers = new Set<StorageSubscriber>()

function notifyStorageSubscribers() {
  Array.from(storageSubscribers).forEach(subscriber => subscriber(storageSharedState))
}

export function subscribeStorageCache(callback: StorageSubscriber): () => void {
  storageSubscribers.add(callback)
  return () => storageSubscribers.delete(callback)
}

// Module-level cache for PVCs data (persists across navigation)
const PVCS_CACHE_KEY = 'kubestellar-pvcs-cache'

interface PVCsCache {
  data: PVC[]
  timestamp: Date
  key: string
}

let pvcsCache: PVCsCache | null = null

// Load PVCs cache from localStorage
function loadPVCsCacheFromStorage(cacheKey: string): { data: PVC[], timestamp: Date } | null {
  try {
    const stored = localStorage.getItem(PVCS_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date()
        pvcsCache = { data: parsed.data, timestamp, key: cacheKey }
        return { data: parsed.data, timestamp }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function savePVCsCacheToStorage() {
  if (pvcsCache) {
    try {
      localStorage.setItem(PVCS_CACHE_KEY, JSON.stringify({
        data: pvcsCache.data,
        timestamp: pvcsCache.timestamp.toISOString(),
        key: pvcsCache.key
      }))
    } catch {
      // Ignore storage errors
    }
  }
}

// Hook to get PVCs with localStorage-backed caching
export function usePVCs(cluster?: string, namespace?: string) {
  const cacheKey = `pvcs:${cluster || 'all'}:${namespace || 'all'}`

  // Initialize from cache if available
  const getCachedData = () => {
    if (pvcsCache && pvcsCache.key === cacheKey) {
      return { data: pvcsCache.data, timestamp: pvcsCache.timestamp }
    }
    return loadPVCsCacheFromStorage(cacheKey)
  }

  const cached = getCachedData()
  const [pvcs, setPVCs] = useState<PVC[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)

  // Track mounted state to prevent state updates after unmount (StrictMode)
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // Reset state when cluster changes (only if still mounted)
  // Don't reset to loading if we have cached data (stale-while-revalidate)
  useEffect(() => {
    if (!isMountedRef.current) return
    const newCacheKey = `pvcs:${cluster || 'all'}:${namespace || 'all'}`
    const hasCached = pvcsCache && pvcsCache.key === newCacheKey
    if (!hasCached) {
      setPVCs([])
      setIsLoading(true)
    }
    setError(null)
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
    if (!isMountedRef.current) return
    if (!silent) {
      setIsRefreshing(true)
    }
    // If demo mode is enabled, use demo data
    if (isDemoMode()) {
      const demoPVCs = getDemoPVCs().filter(p =>
        (!cluster || p.cluster === cluster) && (!namespace || p.namespace === namespace)
      )
      if (!isMountedRef.current) return
      setPVCs(demoPVCs)
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      setLastUpdated(new Date())
      return
    }

    // Try local agent HTTP endpoint first
    if (!isAgentUnavailable()) {
      try {
        // If cluster is specified, fetch from that cluster only
        // If no cluster specified, aggregate from all clusters
        const allClusters = clusterCacheRef.clusters.filter(c => c.reachable !== false)
        const dedupClusters = deduplicateClustersByServer(allClusters)
        const clustersToFetch = cluster
          ? [{ name: cluster, context: cluster }]
          : dedupClusters

        if (clustersToFetch.length > 0) {
          const allPVCs: PVC[] = []
          let anySuccess = false

          // Fetch PVCs from each cluster (in parallel for speed)
          const fetchTasks = clustersToFetch.map((c) => async () => {
            try {
              const params = new URLSearchParams()
              params.append('cluster', c.context || c.name)
              if (namespace) params.append('namespace', namespace)
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
              const response = await agentFetch(`${getLocalAgentURL()}/pvcs?${params}`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' },
              })
              clearTimeout(timeoutId)
              if (response.ok) {
                const agentData = await response.json()
                const mappedPVCs: PVC[] = (agentData.pvcs || []).map((p: PVC) => ({ ...p, cluster: c.name }))
                return { success: true, pvcs: mappedPVCs }
              }
            } catch {
              // Individual cluster failure - continue with others
            }
            return { success: false, pvcs: [] }
          })

          const settled = await settledWithConcurrency(fetchTasks)
          for (const entry of (settled || [])) {
            if (entry.status === 'fulfilled' && entry.value.success) {
              anySuccess = true
              allPVCs.push(...entry.value.pvcs)
            }
          }

          if (anySuccess) {
            const now = new Date()
            pvcsCache = { data: allPVCs, timestamp: now, key: cacheKey }
            savePVCsCacheToStorage()
            if (!isMountedRef.current) return
            setPVCs(allPVCs)
            setError(null)
            setLastUpdated(now)
            setConsecutiveFailures(0)
            setLastRefresh(now)
            setIsLoading(false)
            setIsRefreshing(false)
            reportAgentDataSuccess()
            return
          }
        }
      } catch {
        // Fall through to kubectl proxy
      }
    }

    // Try kubectl proxy as fallback
    if (!isAgentUnavailable()) {
      try {
        const allClusters = clusterCacheRef.clusters.filter(c => c.reachable !== false)
        const dedupClusters = deduplicateClustersByServer(allClusters)
        const clustersToFetch = cluster
          ? [{ name: cluster, context: clusterCacheRef.clusters.find(c => c.name === cluster)?.context || cluster }]
          : dedupClusters

        if (clustersToFetch.length > 0) {
          const allPVCs: PVC[] = []
          let anySuccess = false

          for (const c of (clustersToFetch || [])) {
            try {
              const kubectlContext = c.context || c.name
              const pvcData = await kubectlProxy.getPVCs(kubectlContext, namespace)
              const mappedPVCs: PVC[] = pvcData.map(p => ({
                name: p.name,
                namespace: p.namespace,
                cluster: c.name,
                status: p.status,
                capacity: p.capacity,
                storageClass: p.storageClass,
              }))
              allPVCs.push(...mappedPVCs)
              anySuccess = true
            } catch {
              // Individual cluster failure - continue with others
            }
          }

          if (anySuccess) {
            const now = new Date()
            pvcsCache = { data: allPVCs, timestamp: now, key: cacheKey }
            savePVCsCacheToStorage()
            if (!isMountedRef.current) return
            setPVCs(allPVCs)
            setError(null)
            setLastUpdated(now)
            setConsecutiveFailures(0)
            setLastRefresh(now)
            setIsLoading(false)
            setIsRefreshing(false)
            return
          }
        }
      } catch {
        console.error(`[usePVCs] kubectl proxy failed, trying API`)
      }
    }

    if (!isMountedRef.current) return
    if (!silent) {
      const hasCachedData = pvcsCache && pvcsCache.key === cacheKey
      if (!hasCachedData) {
        setIsLoading(true)
      }
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      if (isClusterModeBackend()) {
        try {
          const response = await fetch(`/api/mcp/pvcs?${params}`, {
            signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
          })
          if (response.ok) {
            const data = await response.json()
            const newData = data.pvcs || []
            const now = new Date()

            pvcsCache = { data: newData, timestamp: now, key: cacheKey }
            savePVCsCacheToStorage()

            if (!isMountedRef.current) return
            setPVCs(newData)
            setError(null)
            setLastUpdated(now)
            setConsecutiveFailures(0)
            setLastRefresh(now)
            setIsLoading(false)
            return
          }
        } catch (err) {
          console.error('[pvcs] Backend fetch failed:', err)
          // Error propagated via hook error state; log here for debugging
        }
        if (!isMountedRef.current) return
        setIsLoading(false)
        return
      }
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/pvcs?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const newData = data.pvcs || []
      const now = new Date()

      // Update module-level cache
      pvcsCache = { data: newData, timestamp: now, key: cacheKey }
      savePVCsCacheToStorage()

      if (!isMountedRef.current) return
      setPVCs(newData)
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err: unknown) {
      if (!isMountedRef.current) return
      const message = err instanceof Error ? err.message : 'Failed to fetch PVCs'
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !pvcsCache) {
        setError(message)
      }
    } finally {
      if (isMountedRef.current) {
        if (!silent) {
          setIsLoading(false)
        }
        setIsRefreshing(false)
      }
    }
  }, [cluster, namespace, cacheKey])

  useEffect(() => {
    let cancelled = false

    const doFetch = async () => {
      const hasCachedData = pvcsCache && pvcsCache.key === cacheKey
      if (!cancelled) {
        await refetch(!!hasCachedData)
      }
    }

    void doFetch()

    const unregisterRefetch = registerRefetch(`pvcs:${cacheKey}`, () => {
      if (!cancelled) {
        void refetch(false)
      }
    })

    return () => {
      cancelled = true
      unregisterRefetch()
    }
  }, [cacheKey, refetch])

  useEffect(() => {
    let cancelled = false

    const unsubscribePolling = subscribePolling(
      `pvcs:${cacheKey}`,
      getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
      () => {
        if (!cancelled) {
          void refetch(true)
        }
      },
    )

    return () => {
      cancelled = true
      unsubscribePolling()
    }
  }, [cacheKey, consecutiveFailures, refetch])

  // Subscribe to cache reset notifications - triggers skeleton when cache is cleared
  useEffect(() => {
    const handleCacheReset = (state: StorageSharedState) => {
      if (state.isResetting) {
        setIsLoading(true)
        setPVCs([])
        setLastUpdated(null)
      }
    }
    return subscribeStorageCache(handleCacheReset)
  }, [])

  return {
    pvcs,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch: () => refetch(false),
    consecutiveFailures,
    isFailed: consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD,
    lastRefresh,
  }
}


function getDemoPVCs(): PVC[] {
  return [
    { name: 'postgres-data', namespace: 'data', cluster: 'prod-east', status: 'Bound', storageClass: 'gp3', capacity: '100Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-abc123', age: '40d' },
    { name: 'redis-data', namespace: 'data', cluster: 'prod-east', status: 'Bound', storageClass: 'gp3', capacity: '20Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-def456', age: '40d' },
    { name: 'prometheus-data', namespace: 'monitoring', cluster: 'staging', status: 'Bound', storageClass: 'standard', capacity: '50Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-ghi789', age: '20d' },
    { name: 'grafana-data', namespace: 'monitoring', cluster: 'staging', status: 'Bound', storageClass: 'standard', capacity: '10Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-jkl012', age: '20d' },
    { name: 'model-cache', namespace: 'ml', cluster: 'vllm-d', status: 'Bound', storageClass: 'fast-ssd', capacity: '500Gi', accessModes: ['ReadWriteMany'], volumeName: 'pvc-mno345', age: '15d' },
    { name: 'training-data', namespace: 'ml', cluster: 'vllm-d', status: 'Pending', storageClass: 'fast-ssd', capacity: '1Ti', accessModes: ['ReadWriteMany'], age: '1d' },
    { name: 'logs-archive', namespace: 'logging', cluster: 'prod-east', status: 'Bound', storageClass: 'cold-storage', capacity: '200Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-pqr678', age: '60d' },
  ]
}


registerCacheReset('storage', () => {
  // Set resetting flag to trigger skeleton display
  storageSharedState = {
    cacheVersion: storageSharedState.cacheVersion + 1,
    isResetting: true,
  }
  notifyStorageSubscribers()

  try {
    localStorage.removeItem(PVCS_CACHE_KEY)
  } catch {
    // Ignore storage errors
  }
  pvcsCache = null

  // Reset the resetting flag after a tick
  setTimeout(() => {
    storageSharedState = { ...storageSharedState, isResetting: false }
    notifyStorageSubscribers()
  }, 0)
})

export const __storageTestables = {
  getDemoPVCs,
  loadPVCsCacheFromStorage,
  savePVCsCacheToStorage,
  PVCS_CACHE_KEY,
}

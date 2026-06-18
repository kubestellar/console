import { useState, useEffect, useCallback, useRef } from 'react'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { isDemoMode } from '../../../lib/demoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { REFRESH_INTERVAL_MS, getEffectiveInterval, getLocalAgentURL, agentFetch, clusterCacheRef } from '../shared'
import { deduplicateClustersByServer } from '../dedup'
import { subscribePolling } from '../pollingManager'
import { settledWithConcurrency } from '../../../lib/utils/concurrency'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { CONSECUTIVE_FAILURE_THRESHOLD } from '../../../lib/cache'
import { isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import type { PVC } from '../types'
import { loadPVCsCacheFromStorage, pvcsCache, savePVCsCacheToStorage, setPVCsCache, subscribeStorageCache } from './shared'

function getClustersToFetch(cluster?: string) {
  const allClusters = clusterCacheRef.clusters.filter(item => item.reachable !== false)
  const dedupClusters = deduplicateClustersByServer(allClusters)
  return cluster ? [{ name: cluster, context: cluster }] : dedupClusters
}

async function fetchPVCsViaLocalAgent(cluster?: string, namespace?: string): Promise<PVC[] | null> {
  const clustersToFetch = getClustersToFetch(cluster)
  if (clustersToFetch.length === 0) return null

  const tasks = clustersToFetch.map(item => async () => {
    try {
      const params = new URLSearchParams()
      params.append('cluster', item.context || item.name)
      if (namespace) params.append('namespace', namespace)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
      const response = await agentFetch(`${getLocalAgentURL()}/pvcs?${params}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      clearTimeout(timeoutId)
      if (response.ok) {
        const data = await response.json()
        return { success: true, pvcs: (data.pvcs || []).map((pvc: PVC) => ({ ...pvc, cluster: item.name })) }
      }
    } catch {
      // Ignore per-cluster failure
    }
    return { success: false, pvcs: [] as PVC[] }
  })

  const settled = await settledWithConcurrency(tasks)
  const allPVCs: PVC[] = []
  let anySuccess = false
  for (const entry of settled || []) {
    if (entry.status === 'fulfilled' && entry.value.success) {
      anySuccess = true
      allPVCs.push(...entry.value.pvcs)
    }
  }
  return anySuccess ? allPVCs : null
}

async function fetchPVCsViaKubectl(cluster?: string, namespace?: string): Promise<PVC[] | null> {
  const allClusters = clusterCacheRef.clusters.filter(item => item.reachable !== false)
  const dedupClusters = deduplicateClustersByServer(allClusters)
  const clustersToFetch = cluster
    ? [{ name: cluster, context: clusterCacheRef.clusters.find(item => item.name === cluster)?.context || cluster }]
    : dedupClusters

  if (clustersToFetch.length === 0) return null
  const allPVCs: PVC[] = []
  let anySuccess = false

  for (const item of clustersToFetch) {
    try {
      const data = await kubectlProxy.getPVCs(item.context || item.name, namespace)
      allPVCs.push(...data.map(pvc => ({
        name: pvc.name,
        namespace: pvc.namespace,
        cluster: item.name,
        status: pvc.status,
        capacity: pvc.capacity,
        storageClass: pvc.storageClass,
      })))
      anySuccess = true
    } catch {
      // Ignore per-cluster failure
    }
  }

  return anySuccess ? allPVCs : null
}

function saveFetchedPVCs(data: PVC[], cacheKey: string) {
  const now = new Date()
  setPVCsCache({ data, timestamp: now, key: cacheKey })
  savePVCsCacheToStorage()
  return now
}

export function usePVCs(cluster?: string, namespace?: string) {
  const cacheKey = `pvcs:${cluster || 'all'}:${namespace || 'all'}`
  const cached = (pvcsCache && pvcsCache.key === cacheKey) ? { data: pvcsCache.data, timestamp: pvcsCache.timestamp } : loadPVCsCacheFromStorage(cacheKey)
  const [pvcs, setPVCs] = useState<PVC[]>(cached?.data || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cached?.timestamp || null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(cached?.timestamp || null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!isMountedRef.current) return
    const nextCacheKey = `pvcs:${cluster || 'all'}:${namespace || 'all'}`
    if (!(pvcsCache && pvcsCache.key === nextCacheKey)) {
      setPVCs([])
      setIsLoading(true)
    }
    setError(null)
  }, [cluster, namespace])

  const refetch = useCallback(async (silent = false) => {
    if (!isMountedRef.current) return
    if (!silent) setIsRefreshing(true)

    if (isDemoMode()) {
      const demoPVCs = getDemoPVCs().filter(item => (!cluster || item.cluster === cluster) && (!namespace || item.namespace === namespace))
      if (!isMountedRef.current) return
      setPVCs(demoPVCs)
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      setLastUpdated(new Date())
      return
    }

    if (!isAgentUnavailable()) {
      const agentPVCs = await fetchPVCsViaLocalAgent(cluster, namespace)
      if (agentPVCs) {
        const now = saveFetchedPVCs(agentPVCs, cacheKey)
        if (!isMountedRef.current) return
        setPVCs(agentPVCs)
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

    if (!isAgentUnavailable()) {
      const kubectlPVCs = await fetchPVCsViaKubectl(cluster, namespace)
      if (kubectlPVCs) {
        const now = saveFetchedPVCs(kubectlPVCs, cacheKey)
        if (!isMountedRef.current) return
        setPVCs(kubectlPVCs)
        setError(null)
        setLastUpdated(now)
        setConsecutiveFailures(0)
        setLastRefresh(now)
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }
    }

    if (!isMountedRef.current) return
    if (!silent && !(pvcsCache && pvcsCache.key === cacheKey)) {
      setIsLoading(true)
    }

    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      if (isClusterModeBackend()) {
        try {
          const response = await fetch(`/api/mcp/pvcs?${params}`, { signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
          if (response.ok) {
            const data = await response.json()
            const now = saveFetchedPVCs(data.pvcs || [], cacheKey)
            if (!isMountedRef.current) return
            setPVCs(data.pvcs || [])
            setError(null)
            setLastUpdated(now)
            setConsecutiveFailures(0)
            setLastRefresh(now)
            setIsLoading(false)
            return
          }
        } catch (err) {
          console.error('[pvcs] Backend fetch failed:', err)
        }
        if (!isMountedRef.current) return
        setIsLoading(false)
        return
      }

      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/pvcs?${params}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const now = saveFetchedPVCs(data.pvcs || [], cacheKey)
      if (!isMountedRef.current) return
      setPVCs(data.pvcs || [])
      setError(null)
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err: unknown) {
      if (!isMountedRef.current) return
      const message = err instanceof Error ? err.message : 'Failed to fetch PVCs'
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && !pvcsCache) setError(message)
    } finally {
      if (isMountedRef.current) {
        if (!silent) setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [cacheKey, cluster, namespace])

  useEffect(() => {
    let cancelled = false
    void (async () => { await refetch(!!(pvcsCache && pvcsCache.key === cacheKey)) })()
    const unregisterRefetch = registerRefetch(`pvcs:${cacheKey}`, () => { if (!cancelled) void refetch(false) })
    return () => {
      cancelled = true
      unregisterRefetch()
    }
  }, [cacheKey, refetch])

  useEffect(() => subscribePolling(
    `pvcs:${cacheKey}`,
    getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
    () => { void refetch(true) },
  ), [cacheKey, consecutiveFailures, refetch])

  useEffect(() => subscribeStorageCache(state => {
    if (state.isResetting) {
      setIsLoading(true)
      setPVCs([])
      setLastUpdated(null)
    }
  }), [])

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

export const usePersistentVolumeClaims = usePVCs

export function getDemoPVCs(): PVC[] {
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

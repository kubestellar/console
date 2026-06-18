import { useState, useEffect, useCallback, useRef } from 'react'
import { isAgentUnavailable } from '../../useLocalAgent'
import { isDemoMode } from '../../../lib/demoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { REFRESH_INTERVAL_MS, getEffectiveInterval, agentFetch, clusterCacheRef } from '../shared'
import { deduplicateClustersByServer } from '../dedup'
import { subscribePolling } from '../pollingManager'
import { settledWithConcurrency } from '../../../lib/utils/concurrency'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { CONSECUTIVE_FAILURE_THRESHOLD } from '../../../lib/cache'
import { isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import type { PV } from '../types'

export function usePVs(cluster?: string) {
  const [pvs, setPVs] = useState<PV[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!isMountedRef.current) return
    setIsRefreshing(true)

    if (isDemoMode()) {
      setPVs([])
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      return
    }

    if (isAgentUnavailable()) {
      if (isMountedRef.current) {
        setError('Agent unavailable')
        setConsecutiveFailures(prev => prev + 1)
        setIsLoading(false)
        setIsRefreshing(false)
      }
      return
    }

    try {
      const allClusters = clusterCacheRef.clusters.filter(item => item.reachable !== false)
      const dedupClusters = deduplicateClustersByServer(allClusters)
      const clustersToFetch = cluster ? [{ name: cluster, context: cluster }] : dedupClusters
      if (clustersToFetch.length === 0) {
        if (isMountedRef.current) {
          setPVs([])
          setIsLoading(false)
          setIsRefreshing(false)
          setError(null)
        }
        return
      }

      const tasks = clustersToFetch.map(item => async () => {
        try {
          const params = new URLSearchParams()
          params.append('cluster', item.context || item.name)
          if (isClusterModeBackend()) {
            try {
              const response = await fetch(`/api/mcp/pvs?${params}`, { signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
              if (response.ok) {
                const data = await response.json()
                return { success: true, pvs: (data.pvs || []).map((pv: PV) => ({ ...pv, cluster: item.name })) }
              }
            } catch (err) {
              console.error('[pvs] Backend fetch failed:', err)
            }
            return { success: false, pvs: [] as PV[] }
          }

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
          const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/pvs?${params}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          })
          clearTimeout(timeoutId)
          if (response.ok) {
            const data = await response.json()
            return { success: true, pvs: (data.pvs || []).map((pv: PV) => ({ ...pv, cluster: item.name })) }
          }
        } catch {
          // Ignore per-cluster failure
        }
        return { success: false, pvs: [] as PV[] }
      })

      const settled = await settledWithConcurrency(tasks)
      const allPVs: PV[] = []
      let anySuccess = false
      for (const entry of settled || []) {
        if (entry.status === 'fulfilled' && entry.value.success) {
          anySuccess = true
          allPVs.push(...entry.value.pvs)
        }
      }

      if (!isMountedRef.current) return
      if (anySuccess) {
        setPVs(allPVs)
        setError(null)
        setConsecutiveFailures(0)
      } else {
        setError('Failed to fetch PVs from any cluster')
        setConsecutiveFailures(prev => prev + 1)
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch PVs')
        setConsecutiveFailures(prev => prev + 1)
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [cluster])

  useEffect(() => {
    void refetch()
    return registerRefetch(`pvs:${cluster || 'all'}`, () => { void refetch() })
  }, [cluster, refetch])

  useEffect(() => subscribePolling(
    `pvs:${cluster || 'all'}`,
    getEffectiveInterval(REFRESH_INTERVAL_MS, consecutiveFailures),
    () => { void refetch() },
  ), [cluster, consecutiveFailures, refetch])

  return { pvs, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD }
}

export const usePersistentVolumes = usePVs

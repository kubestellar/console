/**
 * Hook to fetch in-toto supply chain security data from connected clusters.
 *
 * Uses parallel cluster checks with progressive streaming:
 * - Phase 1: CRD existence check per cluster (8s timeout)
 * - Phase 2: Fetch layouts and link metadata from installed clusters (30s timeout)
 * - Clusters checked with bounded concurrency (default 8 parallel)
 * - Results stream to the card as each cluster completes
 * - localStorage cache with auto-refresh
 * - Demo fallback when no clusters are connected
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { settledWithConcurrency } from '../../lib/utils/concurrency'
import { registerRefetch, registerCacheReset, unregisterCacheReset } from '../../lib/modeTransition'
import { useDemoMode } from '../useDemoMode'
import { useClusters } from '../useMCP'
import { getDemoStatus } from './demoData'
import {
  clearCache,
  fetchSingleCluster,
  INTOTO_CACHE_MAX_AGE_MS,
  loadFromCache,
  saveToCache,
} from './fetchers'
import type { IntotoClusterStatus } from './types'

const FAILURE_THRESHOLD = 3
const DEFAULT_DEMO_CLUSTERS = ['us-east-1', 'eu-central-1', 'us-west-2']

export type { IntotoClusterStatus, IntotoLayout, IntotoStats, IntotoStep } from './types'
export { computeIntotoStats } from './transforms'

export function useIntoto() {
  const { isDemoMode } = useDemoMode()
  // (#11156) deduplicateClustersByServer now sorts reachable contexts first and uses the primary's reachable
  // flag authoritatively, so deduplicatedClusters is safe to use for kubectl-based operations.
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading } = useClusters()

  const cachedData = useRef(loadFromCache())
  const cachedSnapshot = cachedData.current
  const [statuses, setStatuses] = useState<Record<string, IntotoClusterStatus>>(
    cachedSnapshot?.statuses || {}
  )
  const [isLoading, setIsLoading] = useState(!cachedSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(
    cachedSnapshot?.timestamp ? new Date(cachedSnapshot.timestamp) : null
  )
  const [clustersChecked, setClustersChecked] = useState(0)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const initialLoadDone = useRef(!!cachedSnapshot)
  const fetchInProgress = useRef(false)

  const clusters = allClusters.filter(cluster => cluster.reachable === true).map(cluster => cluster.name)
  const clustersKey = useMemo(() => [...clusters].sort().join(','), [clusters])

  const refetch = useCallback(async (silent = false) => {
    if (clusters.length === 0) {
      setIsLoading(false)
      return
    }

    if (fetchInProgress.current) return
    fetchInProgress.current = true

    try {
      if (!silent) {
        setIsRefreshing(true)
        if (!initialLoadDone.current) setIsLoading(true)
      }
      setClustersChecked(0)

      const tasks = (clusters || []).map(cluster => async () => {
        const status = await fetchSingleCluster(cluster)
        setStatuses(prev => ({ ...prev, [cluster]: status }))
        setClustersChecked(prev => prev + 1)
        if (!initialLoadDone.current && status.installed) {
          initialLoadDone.current = true
          setIsLoading(false)
        }
        return { cluster, status }
      })

      const settled = await settledWithConcurrency(tasks)
      const allStatuses: Record<string, IntotoClusterStatus> = {}

      for (const result of (settled || [])) {
        if (result.status === 'fulfilled' && result.value) {
          const { cluster, status } = result.value as {
            cluster: string
            status: IntotoClusterStatus
          }
          allStatuses[cluster] = status
        }
      }

      const anyCleanResult = Object.values(allStatuses).some(status => !status.error)
      if (anyCleanResult) {
        setConsecutiveFailures(0)
      } else {
        setConsecutiveFailures(prev => prev + 1)
      }

      saveToCache(allStatuses)
      setLastRefresh(new Date())
      initialLoadDone.current = true
      setIsLoading(false)
      setIsRefreshing(false)
    } finally {
      fetchInProgress.current = false
    }
  }, [clusters])

  useEffect(() => {
    if (isDemoMode) {
      const demoNames = clusters.length > 0 ? clusters : DEFAULT_DEMO_CLUSTERS
      const demoStatuses: Record<string, IntotoClusterStatus> = {}
      for (const name of (demoNames || [])) {
        demoStatuses[name] = getDemoStatus(name)
      }
      setStatuses(demoStatuses)
      setClustersChecked(demoNames.length)
      setIsLoading(false)
      setLastRefresh(new Date())
      initialLoadDone.current = true
      return
    }

    if (clusters.length > 0) {
      refetch()
    } else if (!clustersLoading) {
      setIsLoading(false)
    }
  }, [clusters.length, isDemoMode, clustersLoading, clustersKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    registerCacheReset('intoto', () => {
      clearCache()
      setStatuses({})
      setIsLoading(true)
      setLastRefresh(null)
      setClustersChecked(0)
      setConsecutiveFailures(0)
      initialLoadDone.current = false
    })

    const unregisterRefetch = registerRefetch('intoto', () => {
      refetch(false)
    })

    return () => {
      unregisterCacheReset('intoto')
      unregisterRefetch()
    }
  }, [refetch])

  useEffect(() => {
    if (isDemoMode || clusters.length === 0) return
    const interval = setInterval(() => refetch(true), INTOTO_CACHE_MAX_AGE_MS)
    return () => clearInterval(interval)
  }, [clusters.length, refetch, isDemoMode, clustersKey])

  const isDemoData = isDemoMode
  const installed = Object.values(statuses).some(status => status.installed)
  const hasErrors = Object.values(statuses).some(status => !!status.error)
  const isFailed = consecutiveFailures >= FAILURE_THRESHOLD

  return {
    statuses,
    isLoading,
    isRefreshing,
    lastRefresh,
    installed,
    hasErrors,
    isDemoData,
    isFailed,
    consecutiveFailures,
    clustersChecked,
    totalClusters: clusters.length,
    refetch,
  }
}

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

import { useState, useEffect, useCallback, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { MS_PER_HOUR, MS_PER_MINUTE } from '../lib/constants/time'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import { useDemoMode } from './useDemoMode'
import { registerRefetch, registerCacheReset, unregisterCacheReset } from '../lib/modeTransition'
import { STORAGE_KEY_INTOTO_CACHE, STORAGE_KEY_INTOTO_CACHE_TIME } from '../lib/constants/storage'
import { DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../lib/constants'
import { CRD_CHECK_TIMEOUT_MS, CRD_DATA_FETCH_TIMEOUT_MS } from '../lib/constants/network'

// ── Types ────────────────────────────────────────────────────────────────

export interface IntotoStep {
  name: string
  status: 'verified' | 'failed' | 'missing' | 'unknown'
  functionary: string
  linksFound: number
}

export interface IntotoLayout {
  name: string
  cluster: string
  namespace?: string
  steps: IntotoStep[]
  expectedProducts: number
  verifiedSteps: number
  failedSteps: number
  createdAt: string
}

export interface IntotoClusterStatus {
  cluster: string
  installed: boolean
  loading: boolean
  error?: string
  layouts: IntotoLayout[]
  totalLayouts: number
  totalSteps: number
  verifiedSteps: number
  failedSteps: number
  missingSteps: number
}

export interface IntotoStats {
  totalLayouts: number
  totalSteps: number
  verifiedSteps: number
  failedSteps: number
  missingSteps: number
}

/**
 * Pure function to compute aggregate statistics for in-toto layouts.
 * Used for both per-cluster status and global component-level statistics.
 */
export function computeIntotoStats(layouts: IntotoLayout[]): IntotoStats {
  const stats = {
    totalLayouts: layouts.length,
    totalSteps: 0,
    verifiedSteps: 0,
    failedSteps: 0,
    missingSteps: 0,
  }

  for (const layout of layouts) {
    stats.totalSteps += layout.steps.length
    stats.verifiedSteps += layout.verifiedSteps
    stats.failedSteps += layout.failedSteps
  }

  stats.missingSteps = stats.totalSteps - stats.verifiedSteps - stats.failedSteps
  return stats
}


interface CacheData {
  statuses: Record<string, IntotoClusterStatus>
  timestamp: number
}

// ── Cache helpers ────────────────────────────────────────────────────────

function loadFromCache(): CacheData | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_INTOTO_CACHE)
    const cacheTime = localStorage.getItem(STORAGE_KEY_INTOTO_CACHE_TIME)
    if (!cached || !cacheTime) return null
    // Stale-while-revalidate: always return cached data. Auto-refresh handles freshness.
    return { statuses: JSON.parse(cached), timestamp: parseInt(cacheTime, 10) }
  } catch {
    return null
  }
}

function saveToCache(statuses: Record<string, IntotoClusterStatus>): void {
  try {
    // Only cache completed (non-loading, non-error) statuses
    const completed = Object.fromEntries(
      Object.entries(statuses).filter(([, s]) => !s.loading && !s.error)
    )
    if (Object.keys(completed).length > 0) {
      localStorage.setItem(STORAGE_KEY_INTOTO_CACHE, JSON.stringify(completed))
      localStorage.setItem(STORAGE_KEY_INTOTO_CACHE_TIME, Date.now().toString())
    }
  } catch {
    // Ignore storage errors
  }
}

/** Clear localStorage cache so stale data doesn't persist across mode transitions */
function clearCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_INTOTO_CACHE)
    localStorage.removeItem(STORAGE_KEY_INTOTO_CACHE_TIME)
  } catch {
    // Ignore storage errors
  }
}

// ── Demo data ────────────────────────────────────────────────────────────

function getDemoLayouts(cluster: string): IntotoLayout[] {
  return [
    {
      name: 'build-and-push',
      cluster,
      steps: [
        { name: 'clone-repo', status: 'verified', functionary: 'ci-bot', linksFound: 1 },
        { name: 'run-tests', status: 'verified', functionary: 'ci-bot', linksFound: 1 },
        { name: 'build-image', status: 'verified', functionary: 'ci-bot', linksFound: 1 },
        { name: 'push-image', status: 'verified', functionary: 'registry-bot', linksFound: 1 },
      ],
      expectedProducts: 4,
      verifiedSteps: 4,
      failedSteps: 0,
      createdAt: new Date(Date.now() - 2 * MS_PER_HOUR).toISOString(),
    },
    {
      name: 'deploy-pipeline',
      cluster,
      steps: [
        { name: 'pull-image', status: 'verified', functionary: 'deploy-bot', linksFound: 1 },
        { name: 'scan-image', status: 'failed', functionary: 'scanner-bot', linksFound: 0 },
        { name: 'apply-manifests', status: 'missing', functionary: 'deploy-bot', linksFound: 0 },
      ],
      expectedProducts: 3,
      verifiedSteps: 1,
      failedSteps: 2,
      createdAt: new Date(Date.now() - 1 * MS_PER_HOUR).toISOString(),
    },
    {
      name: 'release-signing',
      cluster,
      steps: [
        { name: 'sign-artifact', status: 'verified', functionary: 'release-bot', linksFound: 1 },
        { name: 'upload-provenance', status: 'verified', functionary: 'release-bot', linksFound: 1 },
      ],
      expectedProducts: 2,
      verifiedSteps: 2,
      failedSteps: 0,
      createdAt: new Date(Date.now() - 30 * MS_PER_MINUTE).toISOString(),
    },
  ]
}

function getDemoStatus(cluster: string): IntotoClusterStatus {
  const layouts = getDemoLayouts(cluster)
  const stats = computeIntotoStats(layouts)
  return {
    cluster,
    installed: true,
    loading: false,
    layouts,
    ...stats,
  }
}

// ── Kubernetes resource types ────────────────────────────────────────────

interface IntotoLayoutResource {
  metadata: {
    name: string
    namespace?: string
    creationTimestamp?: string
  }
  spec: {
    steps?: Array<{
      name: string
      pubkeys?: string[]
      expectedMaterials?: unknown[]
      expectedProducts?: unknown[]
    }>
    inspect?: unknown[]
    keys?: Record<string, unknown>
  }
}

interface IntotoLinkResource {
  metadata: {
    name: string
    namespace?: string
    labels?: Record<string, string>
  }
  spec: {
    name?: string
    command?: string[]
    materials?: Record<string, unknown>
    products?: Record<string, unknown>
  }
  status?: {
    verified?: boolean
  }
}

// ── Empty status helper ──────────────────────────────────────────────────

function emptyStatus(cluster: string, installed: boolean, error?: string): IntotoClusterStatus {
  return {
    cluster, installed, loading: false, error,
    layouts: [], totalLayouts: 0, totalSteps: 0,
    verifiedSteps: 0, failedSteps: 0, missingSteps: 0,
  }
}

// ── Single-cluster fetch (used in parallel) ──────────────────────────────

async function fetchSingleCluster(cluster: string): Promise<IntotoClusterStatus> {
  try {
    // Phase 1: CRD check for in-toto layouts
    const crdCheck = await kubectlProxy.exec(
      ['get', 'crd', 'layouts.in-toto.io', '-o', 'name'],
      { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
    )

    if (crdCheck.exitCode !== 0) {
      return emptyStatus(cluster, false)
    }

    // Phase 2: Fetch Layouts
    const layoutResult = await kubectlProxy.exec(
      ['get', 'layouts.in-toto.io', '-A', '-o', 'json'],
      { context: cluster, timeout: CRD_DATA_FETCH_TIMEOUT_MS }
    )

    if (layoutResult.exitCode !== 0) {
      return emptyStatus(
        cluster, true,
        layoutResult.output?.trim() || 'intoto_supply_chain.fetchErrorLayouts'
      )
    }

    const layouts: IntotoLayout[] = []

    if (layoutResult.output) {
      const data = JSON.parse(layoutResult.output)
      for (const item of (data.items || []) as IntotoLayoutResource[]) {
        const steps: IntotoStep[] = (item.spec.steps || []).map(s => ({
          name: s.name,
          status: 'unknown' as const,
          functionary: (s.pubkeys || []).join(', ') || 'unknown',
          linksFound: 0,
        }))

        layouts.push({
          name: item.metadata.name,
          cluster,
          namespace: item.metadata.namespace,
          steps,
          expectedProducts: steps.length,
          verifiedSteps: 0,
          failedSteps: 0,
          createdAt: item.metadata.creationTimestamp || new Date().toISOString(),
        })
      }
    }

    // Phase 3: Fetch Links to back-populate step verification status
    const linkResult = await kubectlProxy.exec(
      ['get', 'links.in-toto.io', '-A', '-o', 'json'],
      { context: cluster, timeout: CRD_DATA_FETCH_TIMEOUT_MS }
    )

    if (linkResult.exitCode === 0 && linkResult.output) {
      const linkData = JSON.parse(linkResult.output)
      for (const link of (linkData.items || []) as IntotoLinkResource[]) {
        const layoutName = link.metadata.labels?.['layout-name']
        const stepName = link.spec.name || link.metadata.labels?.['step-name']
        if (!layoutName || !stepName) continue

        const layout = layouts.find(l => l.name === layoutName)
        if (!layout) continue

        const step = layout.steps.find(s => s.name === stepName)
        if (!step) continue

        step.linksFound += 1
        const isVerified = link.status?.verified === true
        const newStatus = isVerified ? 'verified' : 'failed'

        // Undo the previous counter contribution from this step before
        // re-evaluating — a step with multiple links must not be counted twice.
        if (step.status === 'verified') layout.verifiedSteps -= 1
        else if (step.status === 'failed') layout.failedSteps -= 1

        step.status = newStatus
        if (newStatus === 'verified') layout.verifiedSteps += 1
        else layout.failedSteps += 1
      }
    }

    // Mark steps with no links found as missing
    for (const layout of layouts) {
      for (const step of layout.steps) {
        if (step.status === 'unknown' && step.linksFound === 0) {
          step.status = 'missing'
        }
      }
    }

    const stats = computeIntotoStats(layouts)

    return {
      cluster,
      installed: true,
      loading: false,
      layouts,
      ...stats,
    }
  } catch (err: unknown) {
    const isDemoError = err instanceof Error && err.message.includes('demo mode')
    if (!isDemoError) {
      console.error(`[useIntoto] Error fetching from ${cluster}:`, err)
    }
    return emptyStatus(
      cluster, false,
      err instanceof Error ? err.message : 'intoto_supply_chain.connectionFailed'
    )
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useIntoto() {
  const { isDemoMode } = useDemoMode()
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading } = useClusters()

  // Snapshot ref value to avoid reading ref during render
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
  /** Number of clusters that have completed checking (for progressive UI) */
  const [clustersChecked, setClustersChecked] = useState(0)
  /**
   * Number of consecutive fetch cycles where every cluster returned an error
   * (connection failed — not merely "not installed", which is a valid state).
   * Reset to 0 on any cycle where at least one cluster responds cleanly.
   */
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const initialLoadDone = useRef(!!cachedSnapshot)
  /** Guard to prevent concurrent refetch calls from flooding the request queue */
  const fetchInProgress = useRef(false)

  const clusters = allClusters.filter(c => c.reachable === true).map(c => c.name)

  const refetch = useCallback(async (silent = false) => {
    if (clusters.length === 0) {
      setIsLoading(false)
      return
    }

    // Skip if a fetch is already in progress to prevent queue flooding
    if (fetchInProgress.current) return
    fetchInProgress.current = true

    try {
      if (!silent) {
        setIsRefreshing(true)
        if (!initialLoadDone.current) setIsLoading(true)
      }
      setClustersChecked(0)

      // Check all clusters with bounded concurrency, stream results progressively
      const clusterList = clusters || []

      const tasks = clusterList.map(cluster => async () => {
        const status = await fetchSingleCluster(cluster)
        // Stream each result immediately — card re-renders progressively
        setStatuses(prev => ({ ...prev, [cluster]: status }))
        setClustersChecked(prev => prev + 1)
        // Clear loading state once first cluster with data arrives
        if (!initialLoadDone.current && status.installed) {
          initialLoadDone.current = true
          setIsLoading(false)
        }
        return { cluster, status }
      })

      const settled = await settledWithConcurrency(tasks)

      // Collect results from settled promises — no shared mutable state
      const allStatuses: Record<string, IntotoClusterStatus> = {}
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          const { cluster, status } = result.value as { cluster: string; status: IntotoClusterStatus }
          allStatuses[cluster] = status
        }
      }

      // A cycle "fails" only when every cluster returned a connection error —
      // "not installed" is a clean result and should reset the counter.
      const anyCleanResult = Object.values(allStatuses).some(s => !s.error)
      if (anyCleanResult) {
        setConsecutiveFailures(0)
      } else {
        setConsecutiveFailures(prev => prev + 1)
      }

      // Final: save complete cache and clear refresh state
      saveToCache(allStatuses)
      setLastRefresh(new Date())
      initialLoadDone.current = true
      setIsLoading(false)
      setIsRefreshing(false)
    } finally {
      fetchInProgress.current = false
    }
  }, [clusters])

  // Demo mode
  useEffect(() => {
    if (isDemoMode) {
      const demoNames = clusters.length > 0
        ? clusters
        : ['us-east-1', 'eu-central-1', 'us-west-2']
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
      // Only clear loading when cluster list has actually been fetched
      // (prevents premature empty state while useClusters is still resolving)
      setIsLoading(false)
    }
  }, [clusters.length, isDemoMode, clustersLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register with unified mode transition system so skeleton/refetch works
  // in sync with all other cards when demo mode is toggled
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

  // Auto-refresh — always poll when clusters exist so we detect tools
  // that get installed later or clusters that become reachable
  useEffect(() => {
    if (isDemoMode || clusters.length === 0) return
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [clusters.length, refetch, isDemoMode])

  const isDemoData = isDemoMode
  const installed = Object.values(statuses).some(s => s.installed)

  /** True when at least one cluster had a fetch error (distinct from "not installed") */
  const hasErrors = Object.values(statuses).some(s => !!s.error)

  /** Three or more consecutive all-error cycles → card is in failed state */
  const FAILURE_THRESHOLD = 3
  const isFailed = consecutiveFailures >= FAILURE_THRESHOLD

  return {
    statuses,
    isLoading,
    isRefreshing,
    lastRefresh,
    installed,
    /** True when at least one cluster had a fetch error */
    hasErrors,
    isDemoData,
    /** True when 3+ consecutive fetch cycles all produced only connection errors */
    isFailed,
    /** Number of consecutive all-error fetch cycles */
    consecutiveFailures,
    /** Number of clusters checked so far (for progressive UI) */
    clustersChecked,
    /** Total number of clusters being checked */
    totalClusters: clusters.length,
    refetch,
  }
}

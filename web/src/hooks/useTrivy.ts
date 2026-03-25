/**
 * Hook to fetch Trivy Operator vulnerability data from connected clusters.
 *
 * Uses parallel cluster checks with progressive streaming:
 * - Phase 1: CRD existence check per cluster (3s timeout)
 * - Phase 2: Fetch VulnerabilityReports from installed clusters (15s timeout)
 * - Clusters checked with bounded concurrency (default 8 parallel)
 * - Results stream to the card as each cluster completes
 * - localStorage cache with auto-refresh
 * - Demo fallback when no clusters are connected
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import { useDemoMode } from './useDemoMode'
import { registerRefetch, registerCacheReset, unregisterCacheReset } from '../lib/modeTransition'
import { STORAGE_KEY_TRIVY_CACHE, STORAGE_KEY_TRIVY_CACHE_TIME } from '../lib/constants/storage'

/** Refresh interval for automatic polling (2 minutes) */
const REFRESH_INTERVAL_MS = 120_000

/** Cache TTL: 2 minutes — matches refresh interval */
// Unused after stale-while-revalidate change: const CACHE_TTL_MS = 120_000

/** Timeout for CRD existence check (fast — missing resources fail instantly) */
const CRD_CHECK_TIMEOUT_MS = 8_000

/** Timeout for data fetch */
const DATA_FETCH_TIMEOUT_MS = 30_000

/** Maximum images to store per cluster to keep cache size reasonable */
const MAX_IMAGES_PER_CLUSTER = 50

// ── Types ────────────────────────────────────────────────────────────────

export interface TrivyVulnSummary {
  critical: number
  high: number
  medium: number
  low: number
  unknown: number
}

/** Per-image vulnerability breakdown for drill-down modals */
export interface TrivyImageReport {
  image: string
  tag: string
  namespace: string
  critical: number
  high: number
  medium: number
  low: number
}

export interface TrivyClusterStatus {
  cluster: string
  installed: boolean
  loading: boolean
  error?: string
  vulnerabilities: TrivyVulnSummary
  totalReports: number
  scannedImages: number
  /** Top images by severity for drill-down detail view */
  images: TrivyImageReport[]
}

interface CacheData {
  statuses: Record<string, TrivyClusterStatus>
  timestamp: number
}

// ── Cache helpers ────────────────────────────────────────────────────────

function loadFromCache(): CacheData | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_TRIVY_CACHE)
    const cacheTime = localStorage.getItem(STORAGE_KEY_TRIVY_CACHE_TIME)
    if (!cached || !cacheTime) return null
    // Always return cached data (stale-while-revalidate). The auto-refresh
    // interval handles freshness — showing stale data is better than showing
    // "Checking clusters... 0/8" for 30+ seconds on every page load.
    return { statuses: JSON.parse(cached), timestamp: parseInt(cacheTime, 10) }
  } catch {
    return null
  }
}

function saveToCache(statuses: Record<string, TrivyClusterStatus>): void {
  try {
    const completed = Object.fromEntries(
      Object.entries(statuses).filter(([, s]) => !s.loading)
    )
    if (Object.keys(completed).length > 0) {
      localStorage.setItem(STORAGE_KEY_TRIVY_CACHE, JSON.stringify(completed))
      localStorage.setItem(STORAGE_KEY_TRIVY_CACHE_TIME, Date.now().toString())
    }
  } catch {
    // Ignore storage errors
  }
}

/** Clear localStorage cache so stale data doesn't persist across mode transitions */
function clearCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_TRIVY_CACHE)
    localStorage.removeItem(STORAGE_KEY_TRIVY_CACHE_TIME)
  } catch {
    // Ignore storage errors
  }
}

// ── Demo data ────────────────────────────────────────────────────────────

function getDemoStatus(cluster: string): TrivyClusterStatus {
  // Slight variation per cluster for realism
  const seed = cluster.length
  return {
    cluster,
    installed: true,
    loading: false,
    vulnerabilities: {
      critical: 2 + (seed % 3),
      high: 8 + (seed % 7),
      medium: 20 + (seed % 12),
      low: 35 + (seed % 15),
      unknown: seed % 4,
    },
    totalReports: 15 + (seed % 10),
    scannedImages: 12 + (seed % 8),
    images: [
      { image: 'nginx', tag: '1.25', namespace: 'default', critical: 1, high: 3, medium: 5, low: 8 },
      { image: 'redis', tag: '7.2', namespace: 'cache', critical: 0, high: 2, medium: 4, low: 6 },
      { image: 'postgres', tag: '16', namespace: 'database', critical: 1 + (seed % 2), high: 1, medium: 3, low: 5 },
      { image: 'node', tag: '20-alpine', namespace: 'app', critical: 0, high: 1 + (seed % 3), medium: 4, low: 7 },
      { image: 'python', tag: '3.12-slim', namespace: 'ml', critical: 0, high: 1, medium: 2 + (seed % 4), low: 4 },
      { image: 'grafana/grafana', tag: '10.2', namespace: 'monitoring', critical: 0, high: 0, medium: 2, low: 5 },
    ],
  }
}

// ── Kubernetes resource types ────────────────────────────────────────────

interface VulnerabilityReportResource {
  metadata: { name: string; namespace: string; labels?: Record<string, string> }
  report: {
    artifact?: { repository?: string; tag?: string }
    summary?: { criticalCount: number; highCount: number; mediumCount: number; lowCount: number; unknownCount?: number }
    vulnerabilities?: Array<{ severity: string }>
  }
}

// ── Single-cluster fetch (used in parallel) ──────────────────────────────

async function fetchSingleCluster(cluster: string): Promise<TrivyClusterStatus> {
  try {
    // Phase 1: CRD check
    const crdCheck = await kubectlProxy.exec(
      ['get', 'crd', 'vulnerabilityreports.aquasecurity.github.io', '-o', 'name'],
      { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
    )

    if (crdCheck.exitCode !== 0) {
      return {
        cluster, installed: false, loading: false,
        vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
        totalReports: 0, scannedImages: 0, images: [],
      }
    }

    // Phase 2: Fetch VulnerabilityReports
    const result = await kubectlProxy.exec(
      ['get', 'vulnerabilityreports', '-A', '-o', 'json'],
      { context: cluster, timeout: DATA_FETCH_TIMEOUT_MS }
    )

    if (result.exitCode !== 0) {
      return {
        cluster, installed: true, loading: false,
        error: result.output?.trim() || 'Failed to fetch vulnerability reports',
        vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
        totalReports: 0, scannedImages: 0, images: [],
      }
    }

    const summary: TrivyVulnSummary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
    let totalReports = 0
    const imageSet = new Set<string>()
    const imageReports: TrivyImageReport[] = []

    if (result.output) {
      const data = JSON.parse(result.output)
      const items = (data.items || []) as VulnerabilityReportResource[]
      totalReports = items.length

      for (const item of (items || [])) {
        const repo = item.report?.artifact?.repository || ''
        const tag = item.report?.artifact?.tag || 'latest'
        const ns = item.metadata?.namespace || 'default'
        if (repo) imageSet.add(repo)

        const crit = item.report?.summary?.criticalCount || 0
        const high = item.report?.summary?.highCount || 0
        const med = item.report?.summary?.mediumCount || 0
        const low = item.report?.summary?.lowCount || 0

        if (item.report?.summary) {
          summary.critical += crit
          summary.high += high
          summary.medium += med
          summary.low += low
          summary.unknown += item.report.summary.unknownCount || 0
        }

        // Collect per-image data for drill-down
        if (repo) {
          imageReports.push({ image: repo, tag, namespace: ns, critical: crit, high, medium: med, low })
        }
      }
    }

    // Sort by severity (critical+high desc) and limit to top N
    imageReports.sort((a, b) => (b.critical + b.high) - (a.critical + a.high))
    const topImages = imageReports.slice(0, MAX_IMAGES_PER_CLUSTER)

    return {
      cluster,
      installed: true,
      loading: false,
      vulnerabilities: summary,
      totalReports,
      scannedImages: imageSet.size,
      images: topImages,
    }
  } catch (err) {
    const isDemoError = err instanceof Error && err.message.includes('demo mode')
    if (!isDemoError) {
      console.error(`[useTrivy] Error fetching from ${cluster}:`, err)
    }
    return {
      cluster, installed: false, loading: false,
      error: err instanceof Error ? err.message : 'Connection failed',
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
      totalReports: 0, scannedImages: 0, images: [],
    }
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useTrivy() {
  const { isDemoMode } = useDemoMode()
  const { clusters: allClusters, isLoading: clustersLoading } = useClusters()

  const cachedData = useRef(loadFromCache())
  const [statuses, setStatuses] = useState<Record<string, TrivyClusterStatus>>(
    cachedData.current?.statuses || {}
  )
  const [isLoading, setIsLoading] = useState(!cachedData.current)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(
    cachedData.current?.timestamp ? new Date(cachedData.current.timestamp) : null
  )
  /** Number of clusters that have completed checking (for progressive UI) */
  const [clustersChecked, setClustersChecked] = useState(0)
  const initialLoadDone = useRef(!!cachedData.current)
  /** Guard to prevent concurrent refetch calls from flooding the request queue */
  const fetchInProgress = useRef(false)

  const clusters = useMemo(() =>
    allClusters.filter(c => c.reachable === true).map(c => c.name),
    [allClusters]
  )

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
    const allStatuses: Record<string, TrivyClusterStatus> = {}

    const tasks = (clusters || []).map(cluster => async () => {
      const status = await fetchSingleCluster(cluster)
      allStatuses[cluster] = status
      // Stream each result immediately — card re-renders progressively
      setStatuses(prev => ({ ...prev, [cluster]: status }))
      setClustersChecked(prev => prev + 1)
      // Clear loading state once first cluster with data arrives
      if (!initialLoadDone.current && status.installed) {
        initialLoadDone.current = true
        setIsLoading(false)
      }
    })

    await settledWithConcurrency(tasks)

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
      const demoStatuses: Record<string, TrivyClusterStatus> = {}
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
    registerCacheReset('trivy', () => {
      clearCache()
      setStatuses({})
      setIsLoading(true)
      setLastRefresh(null)
      setClustersChecked(0)
      initialLoadDone.current = false
    })

    const unregisterRefetch = registerRefetch('trivy', () => {
      refetch(false)
    })

    return () => {
      unregisterCacheReset('trivy')
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
  const hasErrors = useMemo(() =>
    Object.values(statuses).some(s => !!s.error),
    [statuses]
  )

  // Aggregate across all clusters
  const aggregated = useMemo((): TrivyVulnSummary => {
    const agg: TrivyVulnSummary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
    for (const s of Object.values(statuses)) {
      if (!s.installed) continue
      agg.critical += s.vulnerabilities.critical
      agg.high += s.vulnerabilities.high
      agg.medium += s.vulnerabilities.medium
      agg.low += s.vulnerabilities.low
      agg.unknown += s.vulnerabilities.unknown
    }
    return agg
  }, [statuses])

  return {
    statuses,
    aggregated,
    isLoading,
    isRefreshing,
    lastRefresh,
    installed,
    /** True when at least one cluster had a fetch error */
    hasErrors,
    isDemoData,
    /** Number of clusters checked so far (for progressive UI) */
    clustersChecked,
    /** Total number of clusters being checked */
    totalClusters: clusters.length,
    refetch,
  }
}

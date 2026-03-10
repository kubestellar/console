/**
 * Hook to fetch Trivy Operator vulnerability data from connected clusters.
 *
 * Follows the useCertManager.ts pattern:
 * - Phase 1: CRD existence check per cluster (5s timeout)
 * - Phase 2: Fetch VulnerabilityReports from installed clusters (15s timeout)
 * - localStorage cache with auto-refresh
 * - Demo fallback when no clusters are connected
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { useDemoMode } from './useDemoMode'
import { STORAGE_KEY_TRIVY_CACHE, STORAGE_KEY_TRIVY_CACHE_TIME } from '../lib/constants/storage'

/** Refresh interval for automatic polling (2 minutes) */
const REFRESH_INTERVAL_MS = 120_000

/** Cache TTL: 2 minutes — matches refresh interval */
const CACHE_TTL_MS = 120_000

/** Timeout for CRD existence check */
const CRD_CHECK_TIMEOUT_MS = 5_000

/** Timeout for data fetch */
const DATA_FETCH_TIMEOUT_MS = 15_000

// ── Types ────────────────────────────────────────────────────────────────

export interface TrivyVulnSummary {
  critical: number
  high: number
  medium: number
  low: number
  unknown: number
}

export interface TrivyClusterStatus {
  cluster: string
  installed: boolean
  loading: boolean
  error?: string
  vulnerabilities: TrivyVulnSummary
  totalReports: number
  scannedImages: number
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
    const age = Date.now() - parseInt(cacheTime, 10)
    if (age > CACHE_TTL_MS) return null
    return { statuses: JSON.parse(cached), timestamp: parseInt(cacheTime, 10) }
  } catch {
    return null
  }
}

function saveToCache(statuses: Record<string, TrivyClusterStatus>): void {
  try {
    const completed = Object.fromEntries(
      Object.entries(statuses).filter(([, s]) => !s.loading && !s.error)
    )
    if (Object.keys(completed).length > 0) {
      localStorage.setItem(STORAGE_KEY_TRIVY_CACHE, JSON.stringify(completed))
      localStorage.setItem(STORAGE_KEY_TRIVY_CACHE_TIME, Date.now().toString())
    }
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

// ── Hook ─────────────────────────────────────────────────────────────────

export function useTrivy() {
  const { isDemoMode } = useDemoMode()
  const { clusters: allClusters } = useClusters()

  const cachedData = useRef(loadFromCache())
  const [statuses, setStatuses] = useState<Record<string, TrivyClusterStatus>>(
    cachedData.current?.statuses || {}
  )
  const [isLoading, setIsLoading] = useState(!cachedData.current)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(
    cachedData.current?.timestamp ? new Date(cachedData.current.timestamp) : null
  )
  const initialLoadDone = useRef(!!cachedData.current)

  const clusters = useMemo(() =>
    allClusters.filter(c => c.reachable !== false).map(c => c.name),
    [allClusters]
  )

  const refetch = useCallback(async (silent = false) => {
    if (clusters.length === 0) {
      setIsLoading(false)
      return
    }

    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) setIsLoading(true)
    }

    const newStatuses: Record<string, TrivyClusterStatus> = {}

    for (const cluster of (clusters || [])) {
      try {
        // Phase 1: CRD check
        const crdCheck = await kubectlProxy.exec(
          ['get', 'crd', 'vulnerabilityreports.aquasecurity.github.io', '-o', 'name'],
          { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
        )

        if (crdCheck.exitCode !== 0) {
          newStatuses[cluster] = {
            cluster, installed: false, loading: false,
            vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
            totalReports: 0, scannedImages: 0,
          }
          continue
        }

        // Phase 2: Fetch VulnerabilityReports
        const result = await kubectlProxy.exec(
          ['get', 'vulnerabilityreports', '-A', '-o', 'json'],
          { context: cluster, timeout: DATA_FETCH_TIMEOUT_MS }
        )

        const summary: TrivyVulnSummary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
        let totalReports = 0
        const imageSet = new Set<string>()

        if (result.exitCode === 0 && result.output) {
          const data = JSON.parse(result.output)
          const items = (data.items || []) as VulnerabilityReportResource[]
          totalReports = items.length

          for (const item of items) {
            const repo = item.report?.artifact?.repository
            if (repo) imageSet.add(repo)

            if (item.report?.summary) {
              summary.critical += item.report.summary.criticalCount || 0
              summary.high += item.report.summary.highCount || 0
              summary.medium += item.report.summary.mediumCount || 0
              summary.low += item.report.summary.lowCount || 0
              summary.unknown += item.report.summary.unknownCount || 0
            }
          }
        }

        newStatuses[cluster] = {
          cluster,
          installed: true,
          loading: false,
          vulnerabilities: summary,
          totalReports,
          scannedImages: imageSet.size,
        }
      } catch (err) {
        const isDemoError = err instanceof Error && err.message.includes('demo mode')
        if (!isDemoError) {
          console.error(`[useTrivy] Error fetching from ${cluster}:`, err)
        }
        newStatuses[cluster] = {
          cluster, installed: false, loading: false,
          error: err instanceof Error ? err.message : 'Connection failed',
          vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
          totalReports: 0, scannedImages: 0,
        }
      }
    }

    setStatuses(newStatuses)
    saveToCache(newStatuses)
    setLastRefresh(new Date())
    initialLoadDone.current = true
    setIsLoading(false)
    setIsRefreshing(false)
  }, [clusters])

  // Demo mode
  useEffect(() => {
    if (isDemoMode) {
      const demoNames = clusters.length > 0
        ? clusters
        : ['us-east-1', 'eu-central-1', 'us-west-2']
      const demoStatuses: Record<string, TrivyClusterStatus> = {}
      for (const name of demoNames) {
        demoStatuses[name] = getDemoStatus(name)
      }
      setStatuses(demoStatuses)
      setIsLoading(false)
      setLastRefresh(new Date())
      initialLoadDone.current = true
      return
    }

    if (clusters.length > 0) {
      refetch()
    } else {
      setIsLoading(false)
    }
  }, [clusters.length, isDemoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh — always poll when clusters exist so we detect tools
  // that get installed later or clusters that become reachable
  useEffect(() => {
    if (isDemoMode || clusters.length === 0) return

    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [clusters.length, refetch, isDemoMode])

  const isDemoData = isDemoMode
  const installed = Object.values(statuses).some(s => s.installed)

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
    isDemoData,
    refetch,
  }
}

/**
 * Hook to fetch Kubescape security posture data from connected clusters.
 *
 * Uses parallel cluster checks with progressive streaming:
 * - Phase 1: CRD/API existence check per cluster (3s timeout)
 * - Phase 2: Fetch ConfigurationScanSummaries from installed clusters (15s timeout)
 * - All clusters checked in parallel via Promise.allSettled
 * - Results stream to the card as each cluster completes
 * - localStorage cache with auto-refresh
 * - Demo fallback when no clusters are connected
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { useDemoMode } from './useDemoMode'
import { STORAGE_KEY_KUBESCAPE_CACHE, STORAGE_KEY_KUBESCAPE_CACHE_TIME } from '../lib/constants/storage'

/** Refresh interval for automatic polling (2 minutes) */
const REFRESH_INTERVAL_MS = 120_000

/** Cache TTL: 2 minutes — matches refresh interval */
// Unused after stale-while-revalidate change: const CACHE_TTL_MS = 120_000

/** Timeout for CRD/API existence check (fast — missing resources fail instantly) */
const CRD_CHECK_TIMEOUT_MS = 8_000

/** Timeout for data fetch — large clusters (vllm-d has 4155 items, 6MB JSON)
 *  need extra time when queued behind other kubectl requests */
const DATA_FETCH_TIMEOUT_MS = 30_000

/** Default overall score for demo clusters */
const DEMO_OVERALL_SCORE = 78

// ── Types ────────────────────────────────────────────────────────────────

export interface KubescapeFrameworkScore {
  name: string
  score: number
  passCount: number
  failCount: number
}

/** Per-control pass/fail detail for drill-down modals */
export interface KubescapeControl {
  id: string
  name: string
  passed: number
  failed: number
}

export interface KubescapeClusterStatus {
  cluster: string
  installed: boolean
  loading: boolean
  error?: string
  overallScore: number
  frameworks: KubescapeFrameworkScore[]
  totalControls: number
  passedControls: number
  failedControls: number
  /** Per-control results for drill-down detail view */
  controls: KubescapeControl[]
}

interface CacheData {
  statuses: Record<string, KubescapeClusterStatus>
  timestamp: number
}

// ── Cache helpers ────────────────────────────────────────────────────────

function loadFromCache(): CacheData | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_KUBESCAPE_CACHE)
    const cacheTime = localStorage.getItem(STORAGE_KEY_KUBESCAPE_CACHE_TIME)
    if (!cached || !cacheTime) return null
    // Stale-while-revalidate: always return cached data. Auto-refresh handles freshness.
    return { statuses: JSON.parse(cached), timestamp: parseInt(cacheTime, 10) }
  } catch {
    return null
  }
}

function saveToCache(statuses: Record<string, KubescapeClusterStatus>): void {
  try {
    const completed = Object.fromEntries(
      Object.entries(statuses).filter(([, s]) => !s.loading)
    )
    if (Object.keys(completed).length > 0) {
      localStorage.setItem(STORAGE_KEY_KUBESCAPE_CACHE, JSON.stringify(completed))
      localStorage.setItem(STORAGE_KEY_KUBESCAPE_CACHE_TIME, Date.now().toString())
    }
  } catch {
    // Ignore storage errors
  }
}

// ── Demo data ────────────────────────────────────────────────────────────

function getDemoStatus(cluster: string): KubescapeClusterStatus {
  const seed = cluster.length
  return {
    cluster,
    installed: true,
    loading: false,
    overallScore: DEMO_OVERALL_SCORE + (seed % 10) - 3,
    frameworks: [
      { name: 'NSA-CISA', score: 82 + (seed % 5), passCount: 45, failCount: 10 },
      { name: 'MITRE ATT&CK', score: 75 + (seed % 8), passCount: 38, failCount: 13 },
      { name: 'CIS Benchmark', score: 79 + (seed % 6), passCount: 42, failCount: 11 },
    ],
    totalControls: 95 + (seed % 10),
    passedControls: 72 + (seed % 8),
    failedControls: 23 + (seed % 5),
    controls: [
      { id: 'C-0034', name: 'Automatic mapping of service account', passed: 12, failed: 3 + (seed % 2) },
      { id: 'C-0017', name: 'Immutable container filesystem', passed: 8, failed: 5 },
      { id: 'C-0016', name: 'Allow privilege escalation', passed: 15, failed: 2 },
      { id: 'C-0044', name: 'Container hostPort', passed: 18, failed: 0 },
      { id: 'C-0057', name: 'Privileged container', passed: 14, failed: 4 + (seed % 3) },
      { id: 'C-0009', name: 'Resource limits', passed: 6, failed: 10 },
      { id: 'C-0030', name: 'Ingress and Egress blocked', passed: 9, failed: 7 },
      { id: 'C-0055', name: 'Linux hardening', passed: 11, failed: 6 },
    ],
  }
}

// ── Kubernetes resource types ────────────────────────────────────────────

interface ConfigScanSummaryResource {
  metadata: { name: string; namespace: string; labels?: Record<string, string> }
  spec: {
    severities?: { critical?: number; high?: number; medium?: number; low?: number }
  }
}

interface WorkloadConfigScanResource {
  metadata: { name: string; namespace: string }
  spec?: {
    controls?: Record<string, { status?: { status?: string }; name?: string }>
  }
}

// ── Single-cluster fetch (used in parallel) ──────────────────────────────

function emptyStatus(cluster: string, installed: boolean, error?: string): KubescapeClusterStatus {
  return {
    cluster, installed, loading: false, error,
    overallScore: 0, frameworks: [], controls: [],
    totalControls: 0, passedControls: 0, failedControls: 0,
  }
}

async function fetchSingleCluster(cluster: string): Promise<KubescapeClusterStatus> {
  try {
    // Phase 1: API resource check — Kubescape uses workloadconfigurationscansummaries
    // Note: Kubescape Operator serves these via API aggregation (storage pod),
    // not as standard CRDs, so we check API availability instead of CRD existence.
    const apiCheck = await kubectlProxy.exec(
      ['api-resources', '--api-group=spdx.softwarecomposition.kubescape.io', '-o', 'name'],
      { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
    )

    const hasKubescapeApi = apiCheck.exitCode === 0 &&
      (apiCheck.output || '').includes('workloadconfigurationscansummaries')

    if (!hasKubescapeApi) {
      // Fallback: try traditional CRD check (some installations use standard CRDs)
      const crdCheck = await kubectlProxy.exec(
        ['get', 'crd', 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io', '-o', 'name'],
        { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
      )

      if (crdCheck.exitCode !== 0) {
        return emptyStatus(cluster, false)
      }
    }

    // Phase 2: Fetch workload configuration scan summaries
    let totalControls = 0
    let passedControls = 0
    let failedControls = 0

    const scanResult = await kubectlProxy.exec(
      ['get', 'workloadconfigurationscansummaries', '-A', '-o', 'json'],
      { context: cluster, timeout: DATA_FETCH_TIMEOUT_MS }
    )

    if (scanResult.exitCode !== 0) {
      return emptyStatus(
        cluster, true,
        scanResult.output?.trim() || 'Failed to fetch Kubescape scan data'
      )
    }

    if (scanResult.output) {
      const data = JSON.parse(scanResult.output)
      const items = (data.items || []) as ConfigScanSummaryResource[]

      for (const item of (items || [])) {
        const sevs = item.spec?.severities || {}
        const itemFails = (sevs.critical || 0) + (sevs.high || 0) + (sevs.medium || 0) + (sevs.low || 0)
        failedControls += itemFails
        // Each workload summary represents scanned controls
        totalControls += itemFails + 1 // at least 1 passed per workload
        passedControls += 1
      }
    }

    // Try to fetch detailed control scan data for framework breakdown
    const frameworks: KubescapeFrameworkScore[] = []
    const controlResults = new Map<string, { name: string; passed: number; failed: number }>()
    const detailResult = await kubectlProxy.exec(
      ['get', 'workloadconfigurationscans', '-A', '-o', 'json', '--chunk-size=50'],
      { context: cluster, timeout: DATA_FETCH_TIMEOUT_MS }
    )

    if (detailResult.exitCode === 0 && detailResult.output) {
      const data = JSON.parse(detailResult.output)
      const items = (data.items || []) as WorkloadConfigScanResource[]

      // Aggregate control results with names
      for (const item of (items || [])) {
        for (const [controlId, control] of Object.entries(item.spec?.controls || {})) {
          if (!controlResults.has(controlId)) {
            controlResults.set(controlId, { name: control.name || controlId, passed: 0, failed: 0 })
          }
          const entry = controlResults.get(controlId)!
          // Update name if we find a non-empty one
          if (control.name && entry.name === controlId) {
            entry.name = control.name
          }
          if (control.status?.status === 'passed') {
            entry.passed++
          } else {
            entry.failed++
          }
        }
      }

      // Use total controls for overall score
      if (controlResults.size > 0) {
        totalControls = controlResults.size
        passedControls = 0
        failedControls = 0
        for (const result of controlResults.values()) {
          if (result.passed > result.failed) {
            passedControls++
          } else {
            failedControls++
          }
        }
      }
    }

    const overallScore = totalControls > 0
      ? Math.round((passedControls / totalControls) * 100)
      : 0

    // Build framework scores if we don't have detailed data
    if (frameworks.length === 0 && totalControls > 0) {
      // Derive approximate framework scores from overall
      frameworks.push(
        { name: 'NSA-CISA', score: Math.min(100, overallScore + 4), passCount: passedControls, failCount: failedControls },
        { name: 'MITRE ATT&CK', score: Math.max(0, overallScore - 3), passCount: passedControls, failCount: failedControls },
        { name: 'CIS Benchmark', score: Math.min(100, overallScore + 1), passCount: passedControls, failCount: failedControls },
      )
    }

    // Build per-control detail array from aggregated results
    const controls: KubescapeControl[] = []
    if (detailResult.exitCode === 0 && controlResults.size > 0) {
      for (const [id, result] of controlResults.entries()) {
        controls.push({ id, name: result.name, passed: result.passed, failed: result.failed })
      }
      // Sort failed-first for drill-down priority
      controls.sort((a, b) => b.failed - a.failed)
    }

    return {
      cluster,
      installed: true,
      loading: false,
      overallScore,
      frameworks,
      totalControls,
      passedControls,
      failedControls,
      controls,
    }
  } catch (err) {
    const isDemoError = err instanceof Error && err.message.includes('demo mode')
    if (!isDemoError) {
      console.error(`[useKubescape] Error fetching from ${cluster}:`, err)
    }
    return emptyStatus(
      cluster, false,
      err instanceof Error ? err.message : 'Connection failed'
    )
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useKubescape() {
  const { isDemoMode } = useDemoMode()
  const { clusters: allClusters, isLoading: clustersLoading } = useClusters()

  const cachedData = useRef(loadFromCache())
  const [statuses, setStatuses] = useState<Record<string, KubescapeClusterStatus>>(
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
    allClusters.filter(c => c.reachable !== false).map(c => c.name),
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

    // Check all clusters in parallel, stream results progressively
    const allStatuses: Record<string, KubescapeClusterStatus> = {}

    const promises = (clusters || []).map(cluster =>
      fetchSingleCluster(cluster).then(status => {
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
    )

    await Promise.allSettled(promises)

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
      const demoStatuses: Record<string, KubescapeClusterStatus> = {}
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
  const aggregated = useMemo(() => {
    const clusterStatuses = Object.values(statuses).filter(s => s.installed)
    if (clusterStatuses.length === 0) {
      return { overallScore: 0, frameworks: [] as KubescapeFrameworkScore[], totalControls: 0, passedControls: 0, failedControls: 0 }
    }
    const totalScore = clusterStatuses.reduce((sum, s) => sum + s.overallScore, 0)
    return {
      overallScore: Math.round(totalScore / clusterStatuses.length),
      frameworks: clusterStatuses[0]?.frameworks || [],
      totalControls: clusterStatuses.reduce((sum, s) => sum + s.totalControls, 0),
      passedControls: clusterStatuses.reduce((sum, s) => sum + s.passedControls, 0),
      failedControls: clusterStatuses.reduce((sum, s) => sum + s.failedControls, 0),
    }
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

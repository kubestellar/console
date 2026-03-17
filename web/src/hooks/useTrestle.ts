/**
 * Hook to fetch Compliance Trestle / OSCAL assessment data from connected clusters.
 *
 * Uses parallel cluster checks with progressive streaming:
 * - Phase 1: CRD existence check per cluster (5s timeout)
 * - Phase 2: Fetch assessment data from installed clusters (15s timeout)
 * - All clusters checked in parallel via Promise.allSettled
 * - Results stream to the card as each cluster completes
 * - localStorage cache with auto-refresh
 * - Demo fallback when no clusters are connected
 *
 * Compliance Trestle (CNCF Sandbox) uses NIST OSCAL to manage compliance-as-code.
 * It bridges OSCAL documents to Kubernetes policy engines via the c2p (Compliance-to-Policy)
 * framework, producing AssessmentResult resources.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { useDemoMode } from './useDemoMode'
import { STORAGE_KEY_TRESTLE_CACHE, STORAGE_KEY_TRESTLE_CACHE_TIME } from '../lib/constants/storage'

/** Refresh interval for automatic polling (2 minutes) */
const REFRESH_INTERVAL_MS = 120_000

/** Cache TTL: 2 minutes — matches refresh interval */
// Unused after stale-while-revalidate change: const CACHE_TTL_MS = 120_000

/** Timeout for CRD/deployment existence check (fast — missing resources fail instantly) */
const CRD_CHECK_TIMEOUT_MS = 8_000

/** Timeout for data fetch */
const DATA_FETCH_TIMEOUT_MS = 30_000

/** Demo overall compliance percentage */
const DEMO_OVERALL_SCORE = 82

/** Demo control count for generating varied demo data */
const DEMO_CONTROL_BASE = 120

// ── Types ────────────────────────────────────────────────────────────────

export interface OscalControlResult {
  controlId: string
  title: string
  status: 'pass' | 'fail' | 'other' | 'not-applicable'
  description?: string
}

export interface OscalProfile {
  name: string
  controlsPassed: number
  controlsFailed: number
  controlsOther: number
  totalControls: number
}

export interface TrestleClusterStatus {
  cluster: string
  installed: boolean
  loading: boolean
  error?: string
  /** Overall OSCAL compliance score (0-100) */
  overallScore: number
  /** Profiles assessed (e.g., FedRAMP Moderate, NIST 800-53) */
  profiles: OscalProfile[]
  /** Total controls assessed */
  totalControls: number
  /** Controls passing */
  passedControls: number
  /** Controls failing */
  failedControls: number
  /** Controls with other/not-applicable status */
  otherControls: number
  /** Per-control results for drill-down */
  controlResults: OscalControlResult[]
  /** Last assessment timestamp */
  lastAssessment?: string
}

interface CacheData {
  statuses: Record<string, TrestleClusterStatus>
  timestamp: number
}

// ── Cache helpers ────────────────────────────────────────────────────────

function loadFromCache(): CacheData | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_TRESTLE_CACHE)
    const cacheTime = localStorage.getItem(STORAGE_KEY_TRESTLE_CACHE_TIME)
    if (!cached || !cacheTime) return null
    // Stale-while-revalidate: always return cached data. Auto-refresh handles freshness.
    return { statuses: JSON.parse(cached), timestamp: parseInt(cacheTime, 10) }
  } catch {
    return null
  }
}

function saveToCache(statuses: Record<string, TrestleClusterStatus>): void {
  try {
    const completed = Object.fromEntries(
      Object.entries(statuses).filter(([, s]) => !s.loading)
    )
    if (Object.keys(completed).length > 0) {
      localStorage.setItem(STORAGE_KEY_TRESTLE_CACHE, JSON.stringify(completed))
      localStorage.setItem(STORAGE_KEY_TRESTLE_CACHE_TIME, Date.now().toString())
    }
  } catch {
    // Ignore storage errors
  }
}

// ── Demo data ────────────────────────────────────────────────────────────

function getDemoStatus(cluster: string): TrestleClusterStatus {
  const seed = cluster.length
  const score = DEMO_OVERALL_SCORE + (seed % 15) - 7
  const total = DEMO_CONTROL_BASE + (seed % 30)
  const passed = Math.round(total * score / 100)
  const failed = Math.round(total * (100 - score) / 100 * 0.7)
  const other = total - passed - failed

  return {
    cluster,
    installed: true,
    loading: false,
    overallScore: Math.max(0, Math.min(100, score)),
    profiles: [
      {
        name: 'NIST 800-53 rev5',
        totalControls: Math.round(total * 0.6),
        controlsPassed: Math.round(passed * 0.6),
        controlsFailed: Math.round(failed * 0.6),
        controlsOther: Math.round(other * 0.6),
      },
      {
        name: 'FedRAMP Moderate',
        totalControls: Math.round(total * 0.4),
        controlsPassed: Math.round(passed * 0.4),
        controlsFailed: Math.round(failed * 0.4),
        controlsOther: Math.round(other * 0.4),
      },
    ],
    totalControls: total,
    passedControls: passed,
    failedControls: failed,
    otherControls: other,
    controlResults: [],
    lastAssessment: new Date(Date.now() - (seed % 60) * 60_000).toISOString(),
  }
}

// ── CRD names for detection ──────────────────────────────────────────────

/** CRDs that indicate Compliance Trestle / OSCAL Compass / c2p is deployed */
const TRESTLE_CRD_NAMES = [
  'assessmentresults.oscal.io',
  'componentdefinitions.oscal.io',
  'complianceassessments.compliance.oscal.io',
]

/** Deployment markers: namespace/name pairs for trestle-bot or c2p */
const TRESTLE_DEPLOYMENT_CHECKS = [
  { ns: 'trestle-system', name: 'trestle-bot' },
  { ns: 'c2p-system', name: 'c2p-controller' },
  { ns: 'compliance-trestle', name: 'trestle-operator' },
]

// ── Empty status helper ──────────────────────────────────────────────────

function emptyStatus(cluster: string, installed: boolean, error?: string): TrestleClusterStatus {
  return {
    cluster,
    installed,
    loading: false,
    error,
    overallScore: 0,
    profiles: [],
    totalControls: 0,
    passedControls: 0,
    failedControls: 0,
    otherControls: 0,
    controlResults: [],
  }
}

// ── Single-cluster fetch (used in parallel) ──────────────────────────────

async function fetchSingleCluster(cluster: string): Promise<TrestleClusterStatus> {
  try {
    // Phase 1: Fast detection — race all CRD + deployment checks in parallel
    // First success wins; if all fail, Trestle is not installed.
    // Uses Promise.allSettled + find to emulate Promise.any (es2021 not available).
    const allChecks = [
      ...(TRESTLE_CRD_NAMES || []).map(crdName =>
        kubectlProxy.exec(
          ['get', 'crd', crdName, '-o', 'name'],
          { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
        )
      ),
      ...(TRESTLE_DEPLOYMENT_CHECKS || []).map(dep =>
        kubectlProxy.exec(
          ['get', 'deployment', dep.name, '-n', dep.ns, '-o', 'name'],
          { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
        )
      ),
    ]

    const results = await Promise.allSettled(allChecks)
    const found = results.some(
      r => r.status === 'fulfilled' && r.value.exitCode === 0
    )

    if (!found) {
      return emptyStatus(cluster, false)
    }

    // Phase 2: Fetch assessment data
    const apiGroups = [
      { group: 'oscal.io', version: 'v1alpha1', resource: 'assessmentresults' },
      { group: 'compliance.oscal.io', version: 'v1', resource: 'complianceassessments' },
      { group: 'oscal.io', version: 'v1', resource: 'assessmentresults' },
    ]

    for (const api of (apiGroups || [])) {
      const result = await kubectlProxy.exec(
        ['get', `${api.resource}.${api.group}`, '-A', '-o', 'json'],
        { context: cluster, timeout: DATA_FETCH_TIMEOUT_MS }
      )

      if (result.exitCode === 0 && result.output) {
        try {
          const data = JSON.parse(result.output)
          const items = (data.items || []) as Array<Record<string, unknown>>

          if (items.length > 0) {
            const profiles: OscalProfile[] = []
            const controlResults: OscalControlResult[] = []

            for (const item of (items || [])) {
              const spec = (item.spec || {}) as Record<string, unknown>
              const status = (item.status || {}) as Record<string, unknown>
              const meta = (item.metadata || {}) as Record<string, unknown>
              const profileName = String(spec.profile || spec.profileName || meta.name || 'Unknown Profile')

              const results = (status.results || status.controlResults || []) as Array<Record<string, unknown>>
              let passed = 0
              let failed = 0
              let other = 0

              for (const r of (results || [])) {
                const controlStatus = String(r.status || r.state || 'other').toLowerCase()
                const controlId = String(r.controlId || r.control || r.id || '')
                const title = String(r.title || r.description || controlId)

                if (controlStatus === 'pass' || controlStatus === 'satisfied') {
                  passed++
                  controlResults.push({ controlId, title, status: 'pass' })
                } else if (controlStatus === 'fail' || controlStatus === 'not-satisfied') {
                  failed++
                  controlResults.push({ controlId, title, status: 'fail' })
                } else {
                  other++
                  controlResults.push({
                    controlId, title,
                    status: controlStatus === 'not-applicable' ? 'not-applicable' : 'other',
                  })
                }
              }

              profiles.push({
                name: profileName,
                totalControls: passed + failed + other,
                controlsPassed: passed,
                controlsFailed: failed,
                controlsOther: other,
              })
            }

            const totalControls = controlResults.length
            const passedControls = controlResults.filter(c => c.status === 'pass').length
            const failedControls = controlResults.filter(c => c.status === 'fail').length
            const otherControls = totalControls - passedControls - failedControls
            const overallScore = totalControls > 0
              ? Math.round((passedControls / totalControls) * 100)
              : 0

            return {
              cluster,
              installed: true,
              loading: false,
              overallScore,
              profiles,
              totalControls,
              passedControls,
              failedControls,
              otherControls,
              controlResults,
              lastAssessment: new Date().toISOString(),
            }
          }
        } catch {
          // JSON parse error, try next API group
        }
      }
    }

    // Installed but no assessment data yet
    return emptyStatus(cluster, true)
  } catch (err) {
    return emptyStatus(
      cluster, false,
      err instanceof Error ? err.message : 'Unknown error'
    )
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useTrestle() {
  const { deduplicatedClusters } = useClusters()
  const { isDemoMode } = useDemoMode()
  const [statuses, setStatuses] = useState<Record<string, TrestleClusterStatus>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  /** Number of clusters that have completed checking (for progressive UI) */
  const [clustersChecked, setClustersChecked] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const clusterNames = useMemo(
    () => (deduplicatedClusters || []).map(c => c.name),
    [deduplicatedClusters],
  )

  const fetchData = useCallback(async (isRefresh = false) => {
    if (clusterNames.length === 0 && !isDemoMode) {
      setStatuses({})
      setIsLoading(false)
      return
    }

    if (isRefresh) setIsRefreshing(true)
    else setIsLoading(true)
    setClustersChecked(0)

    // Demo mode
    if (isDemoMode) {
      const demoNames = clusterNames.length > 0 ? clusterNames : ['cluster-1', 'cluster-2', 'cluster-3']
      const demoStatuses: Record<string, TrestleClusterStatus> = {}
      for (const name of (demoNames || [])) {
        demoStatuses[name] = getDemoStatus(name)
      }
      if (mountedRef.current) {
        setStatuses(demoStatuses)
        setClustersChecked(demoNames.length)
        setIsLoading(false)
        setIsRefreshing(false)
        setLastRefresh(new Date())
      }
      return
    }

    // Real mode: check all clusters in parallel, stream results progressively
    const allStatuses: Record<string, TrestleClusterStatus> = {}

    const promises = (clusterNames || []).map(cluster =>
      fetchSingleCluster(cluster).then(status => {
        allStatuses[cluster] = status
        if (mountedRef.current) {
          // Stream each result immediately — card re-renders progressively
          setStatuses(prev => ({ ...prev, [cluster]: status }))
          setClustersChecked(prev => prev + 1)
          // Clear initial loading after first result arrives
          setIsLoading(false)
        }
      })
    )

    await Promise.allSettled(promises)

    if (mountedRef.current) {
      // If no cluster has Trestle installed, fall back to demo data so the
      // card renders sample scores instead of showing 0% with empty profiles.
      const anyInstalled = Object.values(allStatuses).some(s => s.installed)
      if (!anyInstalled) {
        const demoNames = clusterNames.length > 0 ? clusterNames : ['cluster-1', 'cluster-2', 'cluster-3']
        const demoStatuses: Record<string, TrestleClusterStatus> = {}
        for (const name of (demoNames || [])) {
          demoStatuses[name] = getDemoStatus(name)
        }
        setStatuses(demoStatuses)
        setClustersChecked(demoNames.length)
      } else {
        saveToCache(allStatuses)
      }
      setIsLoading(false)
      setIsRefreshing(false)
      setLastRefresh(new Date())
    }
  }, [clusterNames, isDemoMode])

  // Initial load with cache
  useEffect(() => {
    mountedRef.current = true
    const cached = loadFromCache()
    if (cached) {
      setStatuses(cached.statuses)
      setIsLoading(false)
      setLastRefresh(new Date(cached.timestamp))
      // Still refresh in background
      fetchData(true)
    } else {
      fetchData()
    }
    return () => { mountedRef.current = false }
  }, [fetchData])

  // Auto-refresh
  useEffect(() => {
    intervalRef.current = setInterval(() => fetchData(true), REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchData])

  const installed = useMemo(
    () => Object.values(statuses).some(s => s.installed),
    [statuses],
  )

  const isDemoData = isDemoMode || (!installed && !isLoading)

  const aggregated = useMemo(() => {
    const agg = { totalControls: 0, passedControls: 0, failedControls: 0, otherControls: 0, overallScore: 0 }
    const installedStatuses = Object.values(statuses).filter(s => s.installed)
    if (installedStatuses.length === 0) return agg
    for (const s of (installedStatuses || [])) {
      agg.totalControls += s.totalControls
      agg.passedControls += s.passedControls
      agg.failedControls += s.failedControls
      agg.otherControls += s.otherControls
    }
    agg.overallScore = agg.totalControls > 0
      ? Math.round((agg.passedControls / agg.totalControls) * 100)
      : 0
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
    /** Number of clusters checked so far (for progressive UI) */
    clustersChecked,
    /** Total number of clusters being checked */
    totalClusters: clusterNames.length,
    refetch: () => fetchData(true),
  }
}

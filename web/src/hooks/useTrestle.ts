/**
 * Hook to fetch Compliance Trestle / OSCAL assessment data from connected clusters.
 *
 * Uses parallel cluster checks with progressive streaming:
 * - Phase 1: CRD existence check per cluster (5s timeout)
 * - Phase 2: Fetch assessment data from installed clusters (15s timeout)
 * - Clusters checked with bounded concurrency (default 8 parallel)
 * - Results stream to the card as each cluster completes
 * - localStorage cache with auto-refresh
 * - Demo fallback when no clusters are connected
 *
 * Compliance Trestle (CNCF Sandbox) uses NIST OSCAL to manage compliance-as-code.
 * It bridges OSCAL documents to Kubernetes policy engines via the c2p (Compliance-to-Policy)
 * framework, producing AssessmentResult resources.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import { useDemoMode } from './useDemoMode'
import { registerRefetch, registerCacheReset, unregisterCacheReset } from '../lib/modeTransition'
import { STORAGE_KEY_TRESTLE_CACHE, STORAGE_KEY_TRESTLE_CACHE_TIME } from '../lib/constants/storage'
import { DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../lib/constants'
import { CRD_CHECK_TIMEOUT_MS, CRD_DATA_FETCH_TIMEOUT_MS } from '../lib/constants/network'

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
  severity?: 'critical' | 'high' | 'medium' | 'low'
  profile?: string
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

/** Clear localStorage cache so stale data doesn't persist across mode transitions */
function clearCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_TRESTLE_CACHE)
    localStorage.removeItem(STORAGE_KEY_TRESTLE_CACHE_TIME)
  } catch {
    // Ignore storage errors
  }
}

// ── Demo data ────────────────────────────────────────────────────────────

/** Demo NIST 800-53 control families for realistic demo data */
const DEMO_CONTROL_FAMILIES = [
  { id: 'AC', name: 'Access Control', controls: ['AC-1','AC-2','AC-3','AC-4','AC-5','AC-6','AC-7','AC-8','AC-11','AC-12','AC-14','AC-17','AC-18','AC-19','AC-20','AC-21','AC-22'] },
  { id: 'AU', name: 'Audit and Accountability', controls: ['AU-1','AU-2','AU-3','AU-4','AU-5','AU-6','AU-7','AU-8','AU-9','AU-11','AU-12'] },
  { id: 'AT', name: 'Awareness and Training', controls: ['AT-1','AT-2','AT-3','AT-4'] },
  { id: 'CM', name: 'Configuration Management', controls: ['CM-1','CM-2','CM-3','CM-4','CM-5','CM-6','CM-7','CM-8','CM-9','CM-10','CM-11'] },
  { id: 'CP', name: 'Contingency Planning', controls: ['CP-1','CP-2','CP-3','CP-4','CP-6','CP-7','CP-8','CP-9','CP-10'] },
  { id: 'IA', name: 'Identification and Authentication', controls: ['IA-1','IA-2','IA-3','IA-4','IA-5','IA-6','IA-7','IA-8'] },
  { id: 'IR', name: 'Incident Response', controls: ['IR-1','IR-2','IR-3','IR-4','IR-5','IR-6','IR-7','IR-8'] },
  { id: 'MA', name: 'Maintenance', controls: ['MA-1','MA-2','MA-3','MA-4','MA-5','MA-6'] },
  { id: 'MP', name: 'Media Protection', controls: ['MP-1','MP-2','MP-3','MP-4','MP-5','MP-6','MP-7'] },
  { id: 'PE', name: 'Physical and Environmental Protection', controls: ['PE-1','PE-2','PE-3','PE-4','PE-6','PE-8','PE-9','PE-10','PE-11','PE-12','PE-13','PE-14','PE-15','PE-16'] },
  { id: 'PL', name: 'Planning', controls: ['PL-1','PL-2','PL-4','PL-8'] },
  { id: 'PS', name: 'Personnel Security', controls: ['PS-1','PS-2','PS-3','PS-4','PS-5','PS-6','PS-7','PS-8'] },
  { id: 'RA', name: 'Risk Assessment', controls: ['RA-1','RA-2','RA-3','RA-5'] },
  { id: 'SA', name: 'System and Services Acquisition', controls: ['SA-1','SA-2','SA-3','SA-4','SA-5','SA-8','SA-9','SA-10','SA-11'] },
  { id: 'SC', name: 'System and Communications Protection', controls: ['SC-1','SC-2','SC-4','SC-5','SC-7','SC-8','SC-10','SC-12','SC-13','SC-15','SC-17','SC-18','SC-19','SC-20','SC-21','SC-22','SC-23','SC-28','SC-39'] },
  { id: 'SI', name: 'System and Information Integrity', controls: ['SI-1','SI-2','SI-3','SI-4','SI-5','SI-7','SI-8','SI-10','SI-11','SI-12','SI-16'] },
  { id: 'SR', name: 'Supply Chain Risk Management', controls: ['SR-1','SR-2','SR-3','SR-5','SR-6','SR-8','SR-10','SR-11','SR-12'] },
]

const DEMO_SEVERITIES: Array<'critical' | 'high' | 'medium' | 'low'> = ['critical', 'high', 'medium', 'low']

/** Deterministic pseudo-random from seed */
function demoRand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

function generateDemoControlResults(cluster: string, total: number, passed: number, failed: number, _other: number): OscalControlResult[] {
  const results: OscalControlResult[] = []
  const clusterSeed = cluster.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  let idx = 0
  const profiles = ['NIST 800-53 rev5', 'FedRAMP Moderate']

  for (const family of DEMO_CONTROL_FAMILIES) {
    for (const controlId of family.controls) {
      if (idx >= total) break
      const rand = demoRand(clusterSeed + idx)
      let status: 'pass' | 'fail' | 'other'
      if (idx < passed) status = 'pass'
      else if (idx < passed + failed) status = 'fail'
      else status = 'other'

      results.push({
        controlId,
        title: `${family.name}: ${controlId}`,
        description: `Ensure ${family.name.toLowerCase()} control ${controlId} requirements are satisfied`,
        status,
        severity: DEMO_SEVERITIES[Math.floor(rand * 4)],
        profile: profiles[idx % 2 === 0 ? 0 : 1] })
      idx++
    }
  }
  return results
}

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
        controlsOther: Math.round(other * 0.6) },
      {
        name: 'FedRAMP Moderate',
        totalControls: Math.round(total * 0.4),
        controlsPassed: Math.round(passed * 0.4),
        controlsFailed: Math.round(failed * 0.4),
        controlsOther: Math.round(other * 0.4) },
    ],
    totalControls: total,
    passedControls: passed,
    failedControls: failed,
    otherControls: other,
    controlResults: generateDemoControlResults(cluster, total, passed, failed, other),
    lastAssessment: new Date(Date.now() - (seed % 60) * 60_000).toISOString() }
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
    controlResults: [] }
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
        { context: cluster, timeout: CRD_DATA_FETCH_TIMEOUT_MS }
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
                const description = String(r.description || r.title || '')
                const severity = (String(r.severity || r.priority || 'medium').toLowerCase()) as 'critical' | 'high' | 'medium' | 'low'

                if (controlStatus === 'pass' || controlStatus === 'satisfied') {
                  passed++
                  controlResults.push({ controlId, title, status: 'pass', description, severity, profile: profileName })
                } else if (controlStatus === 'fail' || controlStatus === 'not-satisfied') {
                  failed++
                  controlResults.push({ controlId, title, status: 'fail', description, severity, profile: profileName })
                } else {
                  other++
                  controlResults.push({
                    controlId, title,
                    status: controlStatus === 'not-applicable' ? 'not-applicable' : 'other',
                    description, severity, profile: profileName })
                }
              }

              profiles.push({
                name: profileName,
                totalControls: passed + failed + other,
                controlsPassed: passed,
                controlsFailed: failed,
                controlsOther: other })
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
              lastAssessment: new Date().toISOString() }
          }
        } catch {
          // JSON parse error, try next API group
        }
      }
    }

    // Installed but no assessment data yet
    return emptyStatus(cluster, true)
  } catch (err: unknown) {
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

  const clusterNames = (deduplicatedClusters || []).map(c => c.name)

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

    // (#6857) Return { cluster, status } from each callback to avoid shared mutation.
    const tasks = (clusterNames || []).map(cluster => async () => {
      const status = await fetchSingleCluster(cluster)
      return { cluster, status }
    })

    const settled = await settledWithConcurrency(tasks)

    const allStatuses: Record<string, TrestleClusterStatus> = {}
    let checked = 0
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        allStatuses[result.value.cluster] = result.value.status
        checked++
      }
    }

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
        setStatuses(allStatuses)
        setClustersChecked(checked)
        saveToCache(allStatuses)
      }
      setIsLoading(false)
      setIsRefreshing(false)
      setLastRefresh(new Date())
    }
  }, [clusterNames, isDemoMode])

  // Initial load with cache — ref guard prevents re-running on fetchData identity changes
  const trestleInitRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    if (!trestleInitRef.current) {
      trestleInitRef.current = true
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

  // Register with unified mode transition system so skeleton/refetch works
  // in sync with all other cards when demo mode is toggled
  useEffect(() => {
    registerCacheReset('trestle', () => {
      clearCache()
      setStatuses({})
      setIsLoading(true)
      setLastRefresh(null)
      setClustersChecked(0)
    })

    const unregisterRefetch = registerRefetch('trestle', () => {
      fetchData(false)
    })

    return () => {
      unregisterCacheReset('trestle')
      unregisterRefetch()
    }
  }, [fetchData])

  const installed = Object.values(statuses).some(s => s.installed)

  const isDemoData = isDemoMode || (!installed && !isLoading)

  const aggregated = (() => {
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
  })()

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
    refetch: () => fetchData(true) }
}

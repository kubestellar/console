/**
 * Hook to fetch Kyverno policy data from connected clusters.
 *
 * Uses parallel cluster checks with progressive streaming:
 * - Phase 1: CRD existence check per cluster (3s timeout)
 * - Phase 2: Fetch policies/reports from installed clusters (15s timeout)
 * - All clusters checked in parallel via Promise.allSettled
 * - Results stream to the card as each cluster completes
 * - localStorage cache with auto-refresh
 * - Demo fallback when no clusters are connected
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { useDemoMode } from './useDemoMode'
import { registerRefetch, registerCacheReset, unregisterCacheReset } from '../lib/modeTransition'
import { STORAGE_KEY_KYVERNO_CACHE, STORAGE_KEY_KYVERNO_CACHE_TIME } from '../lib/constants/storage'

/** Refresh interval for automatic polling (2 minutes) */
const REFRESH_INTERVAL_MS = 120_000

/** Cache TTL: 2 minutes — matches refresh interval */
const CACHE_TTL_MS = 120_000

/** Timeout for CRD existence check (fast — missing resources fail instantly) */
const CRD_CHECK_TIMEOUT_MS = 3_000

/** Timeout for data fetch */
const DATA_FETCH_TIMEOUT_MS = 15_000

// ── Types ────────────────────────────────────────────────────────────────

export interface KyvernoPolicy {
  name: string
  kind: 'ClusterPolicy' | 'Policy'
  namespace?: string
  cluster: string
  category: string
  status: 'enforcing' | 'audit' | 'unknown'
  violations: number
  description: string
  background: boolean
}

export interface KyvernoPolicyReport {
  name: string
  namespace: string
  cluster: string
  pass: number
  fail: number
  warn: number
  error: number
  skip: number
}

export interface KyvernoClusterStatus {
  cluster: string
  installed: boolean
  loading: boolean
  error?: string
  policies: KyvernoPolicy[]
  reports: KyvernoPolicyReport[]
  totalPolicies: number
  totalViolations: number
  enforcingCount: number
  auditCount: number
}

interface CacheData {
  statuses: Record<string, KyvernoClusterStatus>
  timestamp: number
}

// ── Cache helpers ────────────────────────────────────────────────────────

function loadFromCache(): CacheData | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_KYVERNO_CACHE)
    const cacheTime = localStorage.getItem(STORAGE_KEY_KYVERNO_CACHE_TIME)
    if (!cached || !cacheTime) return null
    const age = Date.now() - parseInt(cacheTime, 10)
    if (age > CACHE_TTL_MS) return null
    return { statuses: JSON.parse(cached), timestamp: parseInt(cacheTime, 10) }
  } catch {
    return null
  }
}

function saveToCache(statuses: Record<string, KyvernoClusterStatus>): void {
  try {
    // Only cache completed (non-loading, non-error) statuses
    const completed = Object.fromEntries(
      Object.entries(statuses).filter(([, s]) => !s.loading && !s.error)
    )
    if (Object.keys(completed).length > 0) {
      localStorage.setItem(STORAGE_KEY_KYVERNO_CACHE, JSON.stringify(completed))
      localStorage.setItem(STORAGE_KEY_KYVERNO_CACHE_TIME, Date.now().toString())
    }
  } catch {
    // Ignore storage errors
  }
}

/** Clear localStorage cache so stale data doesn't persist across mode transitions */
function clearCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_KYVERNO_CACHE)
    localStorage.removeItem(STORAGE_KEY_KYVERNO_CACHE_TIME)
  } catch {
    // Ignore storage errors
  }
}

// ── Demo data ────────────────────────────────────────────────────────────

function getDemoPolicies(cluster: string): KyvernoPolicy[] {
  return [
    { name: 'disallow-privileged', kind: 'ClusterPolicy', cluster, category: 'Pod Security', status: 'audit', violations: 2, description: 'Disallow privileged containers', background: true },
    { name: 'require-labels', kind: 'ClusterPolicy', cluster, category: 'Best Practices', status: 'audit', violations: 8, description: 'Require app and team labels', background: true },
    { name: 'restrict-image-registries', kind: 'ClusterPolicy', cluster, category: 'Supply Chain', status: 'audit', violations: 5, description: 'Only allow images from approved registries', background: false },
    { name: 'add-network-policy', kind: 'ClusterPolicy', cluster, category: 'Network', status: 'audit', violations: 0, description: 'Automatically add default network policy', background: true },
    { name: 'validate-resources', kind: 'Policy', namespace: 'default', cluster, category: 'Resources', status: 'audit', violations: 12, description: 'Validate resource requests and limits', background: true },
  ]
}

function getDemoStatus(cluster: string): KyvernoClusterStatus {
  const policies = getDemoPolicies(cluster)
  return {
    cluster,
    installed: true,
    loading: false,
    policies,
    reports: [],
    totalPolicies: policies.length,
    totalViolations: policies.reduce((sum, p) => sum + p.violations, 0),
    enforcingCount: policies.filter(p => p.status === 'enforcing').length,
    auditCount: policies.filter(p => p.status === 'audit').length,
  }
}

// ── Kubernetes resource types ────────────────────────────────────────────

interface KyvernoPolicyResource {
  metadata: { name: string; namespace?: string; annotations?: Record<string, string> }
  spec: {
    validationFailureAction?: string
    background?: boolean
    rules?: Array<{ name: string }>
  }
  status?: {
    conditions?: Array<{ type: string; status: string }>
    rulecount?: { validate?: number; mutate?: number; generate?: number }
  }
}

interface PolicyReportResult {
  policy: string
  rule: string
  result: 'pass' | 'fail' | 'warn' | 'error' | 'skip'
  message?: string
  source?: string
  resources?: Array<{ name: string; namespace?: string; kind: string }>
}

interface PolicyReportResource {
  metadata: { name: string; namespace: string }
  summary?: { pass: number; fail: number; warn: number; error: number; skip: number }
  results?: PolicyReportResult[]
}

// ── Empty status helper ──────────────────────────────────────────────────

function emptyStatus(cluster: string, installed: boolean, error?: string): KyvernoClusterStatus {
  return {
    cluster, installed, loading: false, error, policies: [], reports: [],
    totalPolicies: 0, totalViolations: 0, enforcingCount: 0, auditCount: 0,
  }
}

// ── Single-cluster fetch (used in parallel) ──────────────────────────────

async function fetchSingleCluster(cluster: string): Promise<KyvernoClusterStatus> {
  try {
    // Phase 1: CRD check
    const crdCheck = await kubectlProxy.exec(
      ['get', 'crd', 'clusterpolicies.kyverno.io', '-o', 'name'],
      { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
    )

    if (crdCheck.exitCode !== 0) {
      return emptyStatus(cluster, false)
    }

    // Phase 2: Fetch ClusterPolicies
    const policies: KyvernoPolicy[] = []

    const cpResult = await kubectlProxy.exec(
      ['get', 'clusterpolicies', '-o', 'json'],
      { context: cluster, timeout: DATA_FETCH_TIMEOUT_MS }
    )

    if (cpResult.exitCode !== 0) {
      return emptyStatus(
        cluster, true,
        cpResult.output?.trim() || 'Failed to fetch Kyverno policies'
      )
    }

    if (cpResult.output) {
      const data = JSON.parse(cpResult.output)
      for (const item of (data.items || []) as KyvernoPolicyResource[]) {
        const action = (item.spec.validationFailureAction || 'Audit').toLowerCase()
        policies.push({
          name: item.metadata.name,
          kind: 'ClusterPolicy',
          cluster,
          category: item.metadata.annotations?.['policies.kyverno.io/category'] || 'Other',
          status: action === 'enforce' ? 'enforcing' : 'audit',
          violations: 0, // Will be populated from reports
          description: item.metadata.annotations?.['policies.kyverno.io/description'] || '',
          background: item.spec.background !== false,
        })
      }
    }

    // Fetch namespaced Policies
    const pResult = await kubectlProxy.exec(
      ['get', 'policies', '-A', '-o', 'json'],
      { context: cluster, timeout: DATA_FETCH_TIMEOUT_MS }
    )

    if (pResult.exitCode === 0 && pResult.output) {
      const data = JSON.parse(pResult.output)
      for (const item of (data.items || []) as KyvernoPolicyResource[]) {
        const action = (item.spec.validationFailureAction || 'Audit').toLowerCase()
        policies.push({
          name: item.metadata.name,
          kind: 'Policy',
          namespace: item.metadata.namespace,
          cluster,
          category: item.metadata.annotations?.['policies.kyverno.io/category'] || 'Other',
          status: action === 'enforce' ? 'enforcing' : 'audit',
          violations: 0,
          description: item.metadata.annotations?.['policies.kyverno.io/description'] || '',
          background: item.spec.background !== false,
        })
      }
    }

    // Fetch PolicyReports for violation counts
    const reports: KyvernoPolicyReport[] = []
    const reportResult = await kubectlProxy.exec(
      ['get', 'policyreports', '-A', '-o', 'json'],
      { context: cluster, timeout: DATA_FETCH_TIMEOUT_MS }
    )

    let totalViolations = 0
    if (reportResult.exitCode === 0 && reportResult.output) {
      const data = JSON.parse(reportResult.output)
      for (const item of (data.items || []) as PolicyReportResource[]) {
        const summary = item.summary || { pass: 0, fail: 0, warn: 0, error: 0, skip: 0 }
        reports.push({
          name: item.metadata.name,
          namespace: item.metadata.namespace,
          cluster,
          pass: summary.pass,
          fail: summary.fail,
          warn: summary.warn,
          error: summary.error,
          skip: summary.skip,
        })
        totalViolations += summary.fail

        // Back-populate per-policy violation counts from report results
        if (item.results) {
          for (const result of (item.results || [])) {
            if (result.result === 'fail' && result.policy) {
              const matchingPolicy = policies.find(p => p.name === result.policy)
              if (matchingPolicy) {
                matchingPolicy.violations += 1
              }
            }
          }
        }
      }
    }

    // Also check ClusterPolicyReports
    const clusterReportResult = await kubectlProxy.exec(
      ['get', 'clusterpolicyreports', '-o', 'json'],
      { context: cluster, timeout: DATA_FETCH_TIMEOUT_MS }
    )

    if (clusterReportResult.exitCode === 0 && clusterReportResult.output) {
      const data = JSON.parse(clusterReportResult.output)
      for (const item of (data.items || []) as PolicyReportResource[]) {
        const summary = item.summary || { pass: 0, fail: 0, warn: 0, error: 0, skip: 0 }
        totalViolations += summary.fail

        // Back-populate per-policy violation counts from cluster report results
        if (item.results) {
          for (const result of (item.results || [])) {
            if (result.result === 'fail' && result.policy) {
              const matchingPolicy = policies.find(p => p.name === result.policy)
              if (matchingPolicy) {
                matchingPolicy.violations += 1
              }
            }
          }
        }
      }
    }

    return {
      cluster,
      installed: true,
      loading: false,
      policies,
      reports,
      totalPolicies: policies.length,
      totalViolations,
      enforcingCount: policies.filter(p => p.status === 'enforcing').length,
      auditCount: policies.filter(p => p.status === 'audit').length,
    }
  } catch (err) {
    const isDemoError = err instanceof Error && err.message.includes('demo mode')
    if (!isDemoError) {
      console.error(`[useKyverno] Error fetching from ${cluster}:`, err)
    }
    return emptyStatus(
      cluster, false,
      err instanceof Error ? err.message : 'Connection failed'
    )
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useKyverno() {
  const { isDemoMode } = useDemoMode()
  const { clusters: allClusters, isLoading: clustersLoading } = useClusters()

  const cachedData = useRef(loadFromCache())
  const [statuses, setStatuses] = useState<Record<string, KyvernoClusterStatus>>(
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
    const allStatuses: Record<string, KyvernoClusterStatus> = {}

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
      const demoStatuses: Record<string, KyvernoClusterStatus> = {}
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
    registerCacheReset('kyverno', () => {
      clearCache()
      setStatuses({})
      setIsLoading(true)
      setLastRefresh(null)
      setClustersChecked(0)
      initialLoadDone.current = false
    })

    const unregisterRefetch = registerRefetch('kyverno', () => {
      refetch(false)
    })

    return () => {
      unregisterCacheReset('kyverno')
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

  return {
    statuses,
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

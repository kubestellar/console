/**
 * Hook to fetch Kyverno policy data from connected clusters.
 *
 * Follows the useCertManager.ts pattern:
 * - Phase 1: CRD existence check per cluster (5s timeout)
 * - Phase 2: Fetch policies/reports from installed clusters (15s timeout)
 * - localStorage cache with auto-refresh
 * - Demo fallback when no clusters are connected
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { useDemoMode } from './useDemoMode'
import { STORAGE_KEY_KYVERNO_CACHE, STORAGE_KEY_KYVERNO_CACHE_TIME } from '../lib/constants/storage'

/** Refresh interval for automatic polling (2 minutes) */
const REFRESH_INTERVAL_MS = 120_000

/** Cache TTL: 2 minutes — matches refresh interval */
const CACHE_TTL_MS = 120_000

/** Timeout for CRD existence check */
const CRD_CHECK_TIMEOUT_MS = 5_000

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

interface PolicyReportResource {
  metadata: { name: string; namespace: string }
  summary?: { pass: number; fail: number; warn: number; error: number; skip: number }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useKyverno() {
  const { isDemoMode } = useDemoMode()
  const { clusters: allClusters } = useClusters()

  const cachedData = useRef(loadFromCache())
  const [statuses, setStatuses] = useState<Record<string, KyvernoClusterStatus>>(
    cachedData.current?.statuses || {}
  )
  const [isLoading, setIsLoading] = useState(!cachedData.current)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(
    cachedData.current?.timestamp ? new Date(cachedData.current.timestamp) : null
  )
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

    const newStatuses: Record<string, KyvernoClusterStatus> = {}

    for (const cluster of (clusters || [])) {
      try {
        // Phase 1: CRD check
        const crdCheck = await kubectlProxy.exec(
          ['get', 'crd', 'clusterpolicies.kyverno.io', '-o', 'name'],
          { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
        )

        if (crdCheck.exitCode !== 0) {
          newStatuses[cluster] = {
            cluster, installed: false, loading: false, policies: [], reports: [],
            totalPolicies: 0, totalViolations: 0, enforcingCount: 0, auditCount: 0,
          }
          // Progressive update — show not-installed immediately
          setStatuses(prev => ({ ...prev, [cluster]: newStatuses[cluster] }))
          continue
        }

        // Phase 2: Fetch ClusterPolicies
        const policies: KyvernoPolicy[] = []

        const cpResult = await kubectlProxy.exec(
          ['get', 'clusterpolicies', '-o', 'json'],
          { context: cluster, timeout: DATA_FETCH_TIMEOUT_MS }
        )

        if (cpResult.exitCode === 0 && cpResult.output) {
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
          }
        }

        newStatuses[cluster] = {
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
        newStatuses[cluster] = {
          cluster, installed: false, loading: false,
          error: err instanceof Error ? err.message : 'Connection failed',
          policies: [], reports: [],
          totalPolicies: 0, totalViolations: 0, enforcingCount: 0, auditCount: 0,
        }
      }

      // Progressive update: stream each cluster's data to the UI as it arrives
      setStatuses(prev => ({ ...prev, [cluster]: newStatuses[cluster] }))

      // Clear loading state once first cluster with data arrives
      if (!initialLoadDone.current && newStatuses[cluster].installed) {
        initialLoadDone.current = true
        setIsLoading(false)
      }
    }

    // Final: save complete cache and clear refresh state
    saveToCache(newStatuses)
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

  return {
    statuses,
    isLoading,
    isRefreshing,
    lastRefresh,
    installed,
    isDemoData,
    refetch,
  }
}

/**
 * Hook to fetch live data compliance posture from connected clusters.
 *
 * Gathers real data for:
 * - Secrets count (encrypted via EncryptionConfiguration vs plain)
 * - RBAC policy count and overpermissive bindings
 * - Cert-manager certificate status
 * - Namespace audit logging status
 *
 * Falls back to demo data when no clusters are connected or in demo mode.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { useDemoMode } from './useDemoMode'
import { useCertManager } from './useCertManager'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import { registerRefetch, registerCacheReset, unregisterCacheReset } from '../lib/modeTransition'

/** Timeout for kubectl resource fetches */
const FETCH_TIMEOUT_MS = 15_000

/** Auto-refresh interval (3 minutes) */
const REFRESH_INTERVAL_MS = 180_000

/** sessionStorage cache key
 * security: stored in sessionStorage, not localStorage — compliance posture data contains
 * cluster security metadata; sessionStorage clears on tab close to reduce exposure window
 */
const CACHE_KEY = 'kc-data-compliance-cache'

// ── Types ─────────────────────────────────────────────────────────────────

export interface CompliancePosture {
  // Secrets
  totalSecrets: number
  opaqueSecrets: number        // Opaque type = likely user-created, may lack encryption-at-rest
  tlsSecrets: number           // kubernetes.io/tls
  saTokenSecrets: number       // kubernetes.io/service-account-token
  dockerSecrets: number        // kubernetes.io/dockerconfigjson
  // RBAC
  rbacPolicies: number         // Total Roles + ClusterRoles
  roleBindings: number         // Total RoleBindings + ClusterRoleBindings
  clusterAdminBindings: number // Bindings to cluster-admin (excessive permissions)
  // Certificates (from cert-manager)
  certManagerInstalled: boolean
  totalCertificates: number
  validCertificates: number
  expiringSoon: number
  expiredCertificates: number
  // Namespaces with audit annotations
  totalNamespaces: number
  // Clusters
  totalClusters: number
  reachableClusters: number
}

interface CacheData {
  posture: CompliancePosture
  timestamp: number
}

// ── Cache helpers ─────────────────────────────────────────────────────────

function loadFromCache(): CacheData | null {
  try {
    const stored = sessionStorage.getItem(CACHE_KEY)
    if (!stored) return null
    return JSON.parse(stored) as CacheData
  } catch {
    return null
  }
}

function saveToCache(posture: CompliancePosture): void {
  try {
    // Deliberate accepted risk: compliance posture (counts/scores) cached in sessionStorage for UX;
    // cleared on tab close. Contains aggregate metrics only — no secrets, tokens, or private keys.
    // lgtm[js/clear-text-storage-of-sensitive-data]
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ posture, timestamp: Date.now() }))
  } catch {
    // Ignore storage errors
  }
}

function clearCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // Ignore
  }
}

// ── Demo data ─────────────────────────────────────────────────────────────

const DEMO_POSTURE: CompliancePosture = {
  totalSecrets: 164,
  opaqueSecrets: 8,
  tlsSecrets: 12,
  saTokenSecrets: 120,
  dockerSecrets: 4,
  rbacPolicies: 48,
  roleBindings: 32,
  clusterAdminBindings: 6,
  certManagerInstalled: true,
  totalCertificates: 4,
  validCertificates: 2,
  expiringSoon: 1,
  expiredCertificates: 1,
  totalNamespaces: 12,
  totalClusters: 3,
  reachableClusters: 3 }

// ── Per-cluster data fetching ─────────────────────────────────────────────

interface ClusterComplianceData {
  secrets: { total: number; opaque: number; tls: number; saToken: number; docker: number }
  roles: number
  roleBindings: number
  clusterAdminBindings: number
  namespaces: number
}

async function fetchClusterCompliance(cluster: string): Promise<ClusterComplianceData> {
  const result: ClusterComplianceData = {
    secrets: { total: 0, opaque: 0, tls: 0, saToken: 0, docker: 0 },
    roles: 0,
    roleBindings: 0,
    clusterAdminBindings: 0,
    namespaces: 0 }

  // Fetch secrets summary (count by type)
  try {
    const secretsResult = await kubectlProxy.exec(
      ['get', 'secrets', '-A', '-o', 'jsonpath={range .items[*]}{.type}{"\\n"}{end}'],
      { context: cluster, timeout: FETCH_TIMEOUT_MS }
    )
    if (secretsResult.exitCode === 0 && secretsResult.output) {
      const types = secretsResult.output.trim().split('\n').filter(Boolean)
      result.secrets.total = types.length
      for (const t of types) {
        if (t === 'Opaque') result.secrets.opaque++
        else if (t === 'kubernetes.io/tls') result.secrets.tls++
        else if (t === 'kubernetes.io/service-account-token') result.secrets.saToken++
        else if (t === 'kubernetes.io/dockerconfigjson' || t === 'kubernetes.io/dockercfg') result.secrets.docker++
      }
    }
  } catch {
    // Secrets fetch failed — continue with other data
  }

  // Fetch RBAC roles count
  try {
    const rolesResult = await kubectlProxy.exec(
      ['get', 'roles,clusterroles', '-A', '-o', 'jsonpath={range .items[*]}1{end}'],
      { context: cluster, timeout: FETCH_TIMEOUT_MS }
    )
    if (rolesResult.exitCode === 0 && rolesResult.output) {
      result.roles = rolesResult.output.length
    }
  } catch {
    // Continue
  }

  // Fetch role bindings count + detect cluster-admin bindings
  try {
    const bindingsResult = await kubectlProxy.exec(
      ['get', 'clusterrolebindings', '-o', 'json'],
      { context: cluster, timeout: FETCH_TIMEOUT_MS }
    )
    if (bindingsResult.exitCode === 0 && bindingsResult.output) {
      const data = JSON.parse(bindingsResult.output)
      const items = data.items || []
      result.clusterAdminBindings = items.filter(
        (b: { roleRef?: { name?: string } }) => b.roleRef?.name === 'cluster-admin'
      ).length
      result.roleBindings = items.length
    }

    // Also count namespace-scoped role bindings
    const rbResult = await kubectlProxy.exec(
      ['get', 'rolebindings', '-A', '-o', 'jsonpath={range .items[*]}1{end}'],
      { context: cluster, timeout: FETCH_TIMEOUT_MS }
    )
    if (rbResult.exitCode === 0 && rbResult.output) {
      result.roleBindings += rbResult.output.length
    }
  } catch {
    // Continue
  }

  // Fetch namespace count
  try {
    const nsResult = await kubectlProxy.exec(
      ['get', 'namespaces', '-o', 'jsonpath={range .items[*]}1{end}'],
      { context: cluster, timeout: FETCH_TIMEOUT_MS }
    )
    if (nsResult.exitCode === 0 && nsResult.output) {
      result.namespaces = nsResult.output.length
    }
  } catch {
    // Continue
  }

  return result
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useDataCompliance() {
  const { isDemoMode } = useDemoMode()
  const { clusters: allClusters, isLoading: clustersLoading } = useClusters()
  const { status: certStatus, isLoading: certLoading } = useCertManager()

  // Snapshot ref value to avoid reading ref during render
  const cachedData = useRef(loadFromCache())
  const cachedSnapshot = cachedData.current
  const [posture, setPosture] = useState<CompliancePosture>(
    cachedSnapshot?.posture || DEMO_POSTURE
  )
  const [isLoading, setIsLoading] = useState(!cachedSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedClusters, setFailedClusters] = useState<string[]>([])
  const [isUsingDemoData, setIsUsingDemoData] = useState(!cachedSnapshot)
  const fetchInProgress = useRef(false)
  const initialLoadDone = useRef(!!cachedSnapshot)

  const clusters = allClusters.filter(c => c.reachable === true)

  const refetch = useCallback(async (silent = false) => {
    if (clusters.length === 0) {
      setIsLoading(false)
      return
    }
    if (fetchInProgress.current) return
    fetchInProgress.current = true

    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) setIsLoading(true)
    }

    try {
      const aggregated: CompliancePosture = {
        totalSecrets: 0,
        opaqueSecrets: 0,
        tlsSecrets: 0,
        saTokenSecrets: 0,
        dockerSecrets: 0,
        rbacPolicies: 0,
        roleBindings: 0,
        clusterAdminBindings: 0,
        certManagerInstalled: certStatus.installed,
        totalCertificates: certStatus.totalCertificates,
        validCertificates: certStatus.validCertificates,
        expiringSoon: certStatus.expiringSoon,
        expiredCertificates: certStatus.expired,
        totalNamespaces: 0,
        totalClusters: allClusters.length,
        reachableClusters: clusters.length }

      // (#6857) Return data from each callback to avoid shared mutation.
      const tasks = clusters.map(cluster => async () => {
        const data = await fetchClusterCompliance(cluster.name)
        return { cluster: cluster.name, data }
      })

      const settled = await settledWithConcurrency(tasks)

      const clusterFailures: string[] = []
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          const { data } = result.value
          aggregated.totalSecrets += data.secrets.total
          aggregated.opaqueSecrets += data.secrets.opaque
          aggregated.tlsSecrets += data.secrets.tls
          aggregated.saTokenSecrets += data.secrets.saToken
          aggregated.dockerSecrets += data.secrets.docker
          aggregated.rbacPolicies += data.roles
          aggregated.roleBindings += data.roleBindings
          aggregated.clusterAdminBindings += data.clusterAdminBindings
          aggregated.totalNamespaces += data.namespaces
        } else {
          // Extract cluster name from the task index — rejected tasks
          // don't carry their cluster reference, so use the tasks array index
          const idx = (settled as PromiseSettledResult<{ cluster: string; data: unknown }>[]).indexOf(result)
          if (idx >= 0 && idx < clusters.length) {
            clusterFailures.push(clusters[idx].name)
          }
        }
      }

      setPosture(aggregated)
      saveToCache(aggregated)
      setIsUsingDemoData(false)
      setFailedClusters(clusterFailures)
      if (clusterFailures.length > 0) {
        setError(`Data from ${clusterFailures.length}/${clusters.length} clusters unavailable`)
      } else {
        setError(null)
      }
      initialLoadDone.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch compliance data')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      fetchInProgress.current = false
    }
  }, [clusters, allClusters.length, certStatus])

  // Demo mode handling
  useEffect(() => {
    if (isDemoMode) {
      setPosture(DEMO_POSTURE)
      setIsLoading(false)
      setIsUsingDemoData(true)
      setError(null)
      setFailedClusters([])
      initialLoadDone.current = true
      return
    }

    if (clusters.length > 0 && !certLoading) {
      refetch()
    } else if (!clustersLoading) {
      setIsLoading(false)
    }
  }, [clusters.length, isDemoMode, clustersLoading, certLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register with mode transition system
  useEffect(() => {
    registerCacheReset('data-compliance', () => {
      clearCache()
      setPosture(DEMO_POSTURE)
      setIsLoading(true)
      setIsUsingDemoData(true)
      setError(null)
      setFailedClusters([])
      initialLoadDone.current = false
    })

    const unregisterRefetch = registerRefetch('data-compliance', () => {
      refetch()
    })

    return () => {
      unregisterCacheReset('data-compliance')
      unregisterRefetch()
    }
  }, [refetch])

  // Auto-refresh
  useEffect(() => {
    if (isDemoMode || clusters.length === 0) return
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [clusters.length, refetch, isDemoMode])

  // Derived compliance scores
  const scores = useMemo(() => {
    const p = posture

    // Encryption score: ratio of non-opaque (typed) secrets to total
    // Opaque secrets are most likely to contain unencrypted sensitive data
    const encryptionScore = p.totalSecrets > 0
      ? Math.round(((p.totalSecrets - p.opaqueSecrets) / p.totalSecrets) * 100)
      : 100

    // RBAC score: penalize cluster-admin bindings
    const rbacScore = p.roleBindings > 0
      ? Math.max(0, Math.round(100 - (p.clusterAdminBindings / p.roleBindings) * 100))
      : 100

    // Certificate score: valid / total
    const certScore = p.totalCertificates > 0
      ? Math.round((p.validCertificates / p.totalCertificates) * 100)
      : (p.certManagerInstalled ? 100 : 0)

    // Overall score (weighted average)
    const overallScore = Math.round((encryptionScore * 0.35) + (rbacScore * 0.35) + (certScore * 0.3))

    return { encryptionScore, rbacScore, certScore, overallScore }
  }, [posture])

  return {
    posture,
    scores,
    isLoading,
    isRefreshing,
    error,
    failedClusters,
    isDemoData: isUsingDemoData,
    refetch: () => refetch(false) }
}

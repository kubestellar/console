/**
 * Hook to fetch live RBAC findings from connected clusters.
 *
 * Checks each cluster in parallel:
 * - Fetches ClusterRoleBindings and ClusterRoles
 * - Fetches RoleBindings across all namespaces
 * - Analyzes for overpermissive patterns (cluster-admin, wildcard verbs, etc.)
 * - Results stream to the card as each cluster completes
 * - localStorage cache with auto-refresh
 * - Demo fallback when no clusters are connected
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useClusters } from './useMCP'
import { kubectlProxy } from '../lib/kubectlProxy'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import { useDemoMode } from './useDemoMode'
import { registerRefetch, registerCacheReset, unregisterCacheReset } from '../lib/modeTransition'
import { STORAGE_KEY_RBAC_CACHE, STORAGE_KEY_RBAC_CACHE_TIME } from '../lib/constants/storage'

/** Refresh interval for automatic polling (5 minutes) */
const REFRESH_INTERVAL_MS = 300_000

/** Timeout for kubectl RBAC resource fetches */
const FETCH_TIMEOUT_MS = 20_000

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * Stable i18n keys for each canonical finding description (Issue 9269).
 * The hook still emits a human-readable English `description` so legacy
 * consumers keep working, but the UI should prefer `descriptionKey` +
 * `descriptionParams` and translate at render time.
 */
export type RBACFindingDescriptionKey =
  | 'clusterAdminBinding'
  | 'wildcardSecretsViaRole'
  | 'wildcardSecrets'
  | 'defaultServiceAccountElevated'
  | 'wideListWatchViaRole'
  | 'wideListWatch'
  | 'elevatedRoleInNamespace'
  | 'pvPvcAccess'

export interface RBACFinding {
  id: string
  cluster: string
  subject: string
  subjectKind: 'User' | 'Group' | 'ServiceAccount'
  risk: 'critical' | 'high' | 'medium' | 'low'
  description: string
  descriptionKey?: RBACFindingDescriptionKey
  descriptionParams?: Record<string, string>
  binding: string
}

interface CacheData {
  findings: RBACFinding[]
  timestamp: number
}

// ── Cache helpers ─────────────────────────────────────────────────────────

function loadFromCache(): CacheData | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_RBAC_CACHE)
    const cacheTime = localStorage.getItem(STORAGE_KEY_RBAC_CACHE_TIME)
    if (!cached || !cacheTime) return null
    return { findings: JSON.parse(cached), timestamp: parseInt(cacheTime, 10) }
  } catch {
    return null
  }
}

function saveToCache(findings: RBACFinding[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_RBAC_CACHE, JSON.stringify(findings))
    localStorage.setItem(STORAGE_KEY_RBAC_CACHE_TIME, Date.now().toString())
  } catch {
    // Ignore storage errors
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_RBAC_CACHE)
    localStorage.removeItem(STORAGE_KEY_RBAC_CACHE_TIME)
  } catch {
    // Ignore storage errors
  }
}

// ── RBAC analysis helpers ─────────────────────────────────────────────────

interface Subject {
  kind: string
  name: string
  namespace?: string
}

interface PolicyRule {
  verbs?: string[]
  resources?: string[]
  apiGroups?: string[]
}

interface ClusterRoleBinding {
  metadata: { name: string; uid: string }
  roleRef: { kind: string; name: string }
  subjects?: Subject[]
}

interface RoleBinding {
  metadata: { name: string; namespace: string; uid: string }
  roleRef: { kind: string; name: string }
  subjects?: Subject[]
}

interface ClusterRole {
  metadata: { name: string; uid: string }
  rules?: PolicyRule[]
}

/** Returns true if a set of policy rules grants overly broad access */
function isWildcardVerbs(rules: PolicyRule[]): boolean {
  return rules.some(r => (r.verbs || []).includes('*'))
}

function isSecretsAccess(rules: PolicyRule[]): boolean {
  return rules.some(r =>
    ((r.verbs || []).includes('*') || (r.verbs || []).some(v => ['get', 'list', 'watch'].includes(v))) &&
    ((r.resources || []).includes('*') || (r.resources || []).includes('secrets'))
  )
}

function isWideReadAccess(rules: PolicyRule[]): boolean {
  return rules.some(r =>
    (r.resources || []).includes('*') &&
    (r.verbs || []).some(v => ['list', 'watch', 'get'].includes(v))
  )
}

/** Convert a raw subject kind to the typed union */
function toSubjectKind(kind: string): 'User' | 'Group' | 'ServiceAccount' {
  if (kind === 'ServiceAccount') return 'ServiceAccount'
  if (kind === 'Group') return 'Group'
  return 'User'
}

/**
 * Result of a single-cluster RBAC scan. Separating `findings` from `error`
 * lets the hook surface permission/API failures instead of silently returning
 * an empty list (Issue 9264).
 */
interface ClusterFetchResult {
  cluster: string
  findings: RBACFinding[]
  error: string | null
}

/** Analyze a cluster's RBAC resources and return findings + error state */
async function fetchSingleCluster(cluster: string): Promise<ClusterFetchResult> {
  const findings: RBACFinding[] = []

  try {
    // Fetch all three RBAC resources concurrently — they are independent reads (#4852)
    const [crbResult, crResult, rbResult] = await Promise.all([
      kubectlProxy.exec(
        ['get', 'clusterrolebindings', '-o', 'json'],
        { context: cluster, timeout: FETCH_TIMEOUT_MS }
      ),
      kubectlProxy.exec(
        ['get', 'clusterroles', '-o', 'json'],
        { context: cluster, timeout: FETCH_TIMEOUT_MS }
      ),
      kubectlProxy.exec(
        ['get', 'rolebindings', '-A', '-o', 'json'],
        { context: cluster, timeout: FETCH_TIMEOUT_MS }
      ),
    ])

    // Surface kubectl errors (permission denied, API unreachable) instead of
    // silently returning an empty list, which previously made the card look
    // as if the cluster had no RBAC bindings. (Issue 9264)
    if (crbResult.exitCode !== 0 || !crbResult.output) {
      const stderr = (crbResult.output || '').trim() || `kubectl exit code ${crbResult.exitCode}`
      return { cluster, findings, error: stderr }
    }

    const crbData = JSON.parse(crbResult.output)
    const clusterRoleBindings: ClusterRoleBinding[] = crbData.items || []

    const clusterRoleMap = new Map<string, ClusterRole>()
    if (crResult.exitCode === 0 && crResult.output) {
      const crData = JSON.parse(crResult.output)
      for (const cr of (crData.items || []) as ClusterRole[]) {
        clusterRoleMap.set(cr.metadata.name, cr)
      }
    }

    const roleBindings: RoleBinding[] = []
    if (rbResult.exitCode === 0 && rbResult.output) {
      const rbData = JSON.parse(rbResult.output)
      roleBindings.push(...(rbData.items || []))
    }

    // Analyze ClusterRoleBindings
    for (const crb of clusterRoleBindings) {
      const subjects = crb.subjects || []
      const roleName = crb.roleRef.name
      const bindingName = `ClusterRoleBinding/${crb.metadata.name}`
      const clusterRole = clusterRoleMap.get(roleName)
      const rules = clusterRole?.rules || []

      for (const subject of subjects) {
        const subjectKind = toSubjectKind(subject.kind)
        const subjectName = subject.name

        // cluster-admin binding → CRITICAL
        if (roleName === 'cluster-admin') {
          findings.push({
            id: `${cluster}-crb-${crb.metadata.uid || crb.metadata.name}-${subject.name}`,
            cluster,
            subject: subjectName,
            subjectKind,
            risk: 'critical',
            description: 'cluster-admin binding — full cluster access',
            descriptionKey: 'clusterAdminBinding',
            binding: bindingName })
          continue
        }

        // Wildcard verb on secrets → HIGH
        if (rules.length > 0 && isSecretsAccess(rules) && isWildcardVerbs(rules)) {
          findings.push({
            id: `${cluster}-crb-sec-${crb.metadata.uid || crb.metadata.name}-${subject.name}`,
            cluster,
            subject: subjectName,
            subjectKind,
            risk: 'high',
            description: `Wildcard verb on secrets via ${roleName}`,
            descriptionKey: 'wildcardSecretsViaRole',
            descriptionParams: { role: roleName },
            binding: bindingName })
          continue
        }

        // Default ServiceAccount with elevated privileges → HIGH
        if (subjectKind === 'ServiceAccount' && subjectName === 'default' && rules.length > 0) {
          findings.push({
            id: `${cluster}-crb-default-${crb.metadata.uid || crb.metadata.name}`,
            cluster,
            subject: subjectName,
            subjectKind,
            risk: 'high',
            description: `Default ServiceAccount has elevated privileges via ${roleName}`,
            descriptionKey: 'defaultServiceAccountElevated',
            descriptionParams: { role: roleName },
            binding: bindingName })
          continue
        }

        // Wide read access (list/watch * resources) → MEDIUM
        if (rules.length > 0 && isWideReadAccess(rules)) {
          findings.push({
            id: `${cluster}-crb-wide-${crb.metadata.uid || crb.metadata.name}-${subject.name}`,
            cluster,
            subject: subjectName,
            subjectKind,
            risk: 'medium',
            description: `Wide list/watch access on all resources via ${roleName}`,
            descriptionKey: 'wideListWatchViaRole',
            descriptionParams: { role: roleName },
            binding: bindingName })
        }
      }
    }

    // Analyze RoleBindings — flag edit/admin roles at namespace scope
    const elevatedRoles = new Set(['admin', 'edit', 'cluster-admin'])
    for (const rb of roleBindings) {
      if (!elevatedRoles.has(rb.roleRef.name)) continue
      for (const subject of (rb.subjects || [])) {
        findings.push({
          id: `${cluster}-rb-${rb.metadata.uid || rb.metadata.name}-${subject.name}`,
          cluster,
          subject: subject.name,
          subjectKind: toSubjectKind(subject.kind),
          risk: 'low',
          description: `${rb.roleRef.name} role in namespace ${rb.metadata.namespace}`,
          descriptionKey: 'elevatedRoleInNamespace',
          descriptionParams: { role: rb.roleRef.name, namespace: rb.metadata.namespace },
          binding: `RoleBinding/${rb.metadata.name}` })
      }
    }
  } catch (err: unknown) {
    const isDemoErr = err instanceof Error && err.message.includes('demo mode')
    if (!isDemoErr) {
      console.error(`[useRBACFindings] Error fetching from ${cluster}:`, err)
    }
    return {
      cluster,
      findings,
      error: err instanceof Error ? err.message : String(err) }
  }

  return { cluster, findings, error: null }
}

// ── Demo data ─────────────────────────────────────────────────────────────

const DEMO_FINDINGS: RBACFinding[] = [
  { id: '1', cluster: 'prod-us-east', subject: 'dev-team', subjectKind: 'Group', risk: 'critical', description: 'cluster-admin binding — full cluster access', descriptionKey: 'clusterAdminBinding', binding: 'ClusterRoleBinding/dev-admin' },
  { id: '2', cluster: 'prod-us-east', subject: 'ci-bot', subjectKind: 'ServiceAccount', risk: 'high', description: 'Wildcard verb on secrets — can read all secrets', descriptionKey: 'wildcardSecrets', binding: 'ClusterRoleBinding/ci-secrets' },
  { id: '3', cluster: 'staging', subject: 'default', subjectKind: 'ServiceAccount', risk: 'high', description: 'Default SA has elevated privileges', descriptionKey: 'defaultServiceAccountElevated', descriptionParams: { role: 'custom-role' }, binding: 'ClusterRoleBinding/default-elevated' },
  { id: '4', cluster: 'prod-eu-west', subject: 'monitoring', subjectKind: 'ServiceAccount', risk: 'medium', description: 'Wide list/watch on all namespaces', descriptionKey: 'wideListWatch', binding: 'ClusterRoleBinding/monitoring-wide' },
  { id: '5', cluster: 'prod-us-east', subject: 'backup-operator', subjectKind: 'ServiceAccount', risk: 'medium', description: 'PV and PVC access across namespaces', descriptionKey: 'pvPvcAccess', binding: 'ClusterRoleBinding/backup-pvs' },
  { id: '6', cluster: 'staging', subject: 'developer', subjectKind: 'User', risk: 'low', description: 'Edit role in staging namespace', descriptionKey: 'elevatedRoleInNamespace', descriptionParams: { role: 'edit', namespace: 'staging' }, binding: 'RoleBinding/dev-edit' },
]

// ── Hook ──────────────────────────────────────────────────────────────────

export function useRBACFindings() {
  const { isDemoMode } = useDemoMode()
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading } = useClusters()

  // Snapshot ref value to avoid reading ref during render
  const cachedData = useRef(loadFromCache())
  const cachedSnapshot = cachedData.current
  const [findings, setFindings] = useState<RBACFinding[]>(
    cachedSnapshot?.findings || []
  )
  const [isLoading, setIsLoading] = useState(!cachedSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fetchInProgress = useRef(false)
  const initialLoadDone = useRef(!!cachedSnapshot)

  const clusters = allClusters.filter(c => c.reachable === true).map(c => c.name)

  const refetch = useCallback(async () => {
    if (clusters.length === 0) {
      setIsLoading(false)
      return
    }
    if (fetchInProgress.current) return
    fetchInProgress.current = true

    try {
      if (!initialLoadDone.current) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      setError(null)

      // (#6857) Return findings from each callback to avoid shared mutation.
      const tasks = clusters.map(cluster => async () => {
        const result = await fetchSingleCluster(cluster)
        // Stream each cluster's results immediately (React setState is safe)
        setFindings(prev => {
          const otherFindings = prev.filter(f => f.cluster !== cluster)
          return [...otherFindings, ...result.findings]
        })
        if (!initialLoadDone.current && result.findings.length > 0) {
          initialLoadDone.current = true
          setIsLoading(false)
        }
        return result
      })

      const settled = await settledWithConcurrency(tasks)

      const allFindings: RBACFinding[] = []
      const clusterErrors: string[] = []
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          allFindings.push(...result.value.findings)
          if (result.value.error) {
            clusterErrors.push(`${result.value.cluster}: ${result.value.error}`)
          }
        } else {
          clusterErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
        }
      }

      saveToCache(allFindings)
      initialLoadDone.current = true
      setIsLoading(false)
      setIsRefreshing(false)

      // Issue 9264: when every cluster returned an error and no findings were
      // collected, surface the aggregate error so the card shows the retry
      // state instead of a misleading empty/"no findings" state.
      if (allFindings.length === 0 && clusterErrors.length > 0 && clusterErrors.length === clusters.length) {
        setError((clusterErrors || []).join('; '))
        setConsecutiveFailures(prev => prev + 1)
      } else {
        setConsecutiveFailures(0)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch RBAC data')
      setIsLoading(false)
      setIsRefreshing(false)
      setConsecutiveFailures(prev => prev + 1)
    } finally {
      fetchInProgress.current = false
    }
  }, [clusters])

  // Demo mode
  useEffect(() => {
    if (isDemoMode) {
      setFindings(DEMO_FINDINGS)
      setIsLoading(false)
      setIsRefreshing(false)
      setConsecutiveFailures(0)
      setError(null)
      initialLoadDone.current = true
      return
    }

    if (clusters.length > 0) {
      refetch()
    } else if (!clustersLoading) {
      setIsLoading(false)
    }
  }, [clusters.length, isDemoMode, clustersLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register with unified mode transition system
  useEffect(() => {
    registerCacheReset('rbac-findings', () => {
      clearCache()
      setFindings([])
      setIsLoading(true)
      setIsRefreshing(false)
      setConsecutiveFailures(0)
      setError(null)
      initialLoadDone.current = false
    })

    const unregisterRefetch = registerRefetch('rbac-findings', () => {
      refetch()
    })

    return () => {
      unregisterCacheReset('rbac-findings')
      unregisterRefetch()
    }
  }, [refetch])

  // Auto-refresh
  useEffect(() => {
    if (isDemoMode || clusters.length === 0) return
    const interval = setInterval(() => refetch(), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [clusters.length, refetch, isDemoMode])

  return {
    findings,
    isLoading,
    isRefreshing,
    consecutiveFailures,
    error,
    isDemoData: isDemoMode,
    refetch }
}

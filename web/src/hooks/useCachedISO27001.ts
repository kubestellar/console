/**
 * ISO 27001 Security Audit Cached Hooks
 *
 * Provides cached hooks for running ISO 27001 compliance checks against
 * Kubernetes clusters via kubectl proxy.
 * Extracted from useCachedData.ts for maintainability.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { kubectlProxy } from '../lib/kubectlProxy'
import { KUBECTL_EXTENDED_TIMEOUT_MS } from '../lib/constants/network'
import { clusterCacheRef } from './mcp/shared'
import { isAgentUnavailable } from './useLocalAgent'
import { settledWithConcurrency } from '../lib/utils/concurrency'

// ============================================================================
// ISO 27001 Audit Types
// ============================================================================

export interface ISO27001Finding {
  checkId: string
  category: string
  label: string
  status: 'pass' | 'fail' | 'warning' | 'manual'
  cluster: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  details: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get reachable (or not-yet-checked) cluster names from the shared cluster cache (deduplicated).
 * Filters out clusters with `reachable === false` to skip unreachable ones, and skips long
 * context-path names (those containing '/') which are duplicates of short-named aliases
 * (e.g. "default/api-fmaas-vllm-d-...:6443/..." duplicates "vllm-d").
 * Clusters with `reachable === undefined` (health check pending) are included to avoid
 * a race condition where cards fetch before health checks complete and cache empty results.
 */
function getAgentClusters(): Array<{ name: string; context?: string }> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  // Skip long context-path names (contain '/') — these are duplicates of short-named aliases
  // Include clusters with reachable === undefined (health check pending) to avoid
  // race condition where cards fetch before health checks complete and cache empty results.
  return clusterCacheRef.clusters
    .filter(c => c.reachable !== false && !c.name.includes('/'))
    .map(c => ({ name: c.name, context: c.context }))
}

// ============================================================================
// ISO 27001 Security Audit — kubectl-based compliance checks
// ============================================================================

/** Run ISO 27001 compliance checks against a single cluster */
async function runISO27001ChecksForCluster(
  clusterName: string,
  context: string,
): Promise<ISO27001Finding[]> {
  const findings: ISO27001Finding[] = []
  const ctx = context || clusterName

  // Helper to run kubectl and parse JSON
  const execJson = async (args: string[]) => {
    const res = await kubectlProxy.exec(args, { context: ctx, timeout: KUBECTL_EXTENDED_TIMEOUT_MS })
    if (res.exitCode !== 0) return null
    try { return JSON.parse(res.output) } catch { return null }
  }

  // ── RBAC checks ──
  const crbs = await execJson(['get', 'clusterrolebindings', '-o', 'json'])
  if (crbs) {
    const adminBindings = (crbs.items || []).filter(
      (b: { roleRef?: { name?: string }; metadata?: { namespace?: string } }) =>
        b.roleRef?.name === 'cluster-admin' && b.metadata?.namespace !== 'kube-system'
    )
    findings.push({
      checkId: 'rbac-1', category: 'RBAC & Access Control',
      label: 'No cluster-admin bindings outside kube-system',
      status: adminBindings.length === 0 ? 'pass' : 'fail',
      cluster: clusterName, severity: 'critical',
      details: adminBindings.length === 0 ? 'No unauthorized cluster-admin bindings' : `${adminBindings.length} cluster-admin binding(s) outside kube-system`,
    })

    const roles = await execJson(['get', 'clusterroles', '-o', 'json'])
    if (roles) {
      const wildcardRoles = (roles.items || []).filter(
        (r: { rules?: Array<{ verbs?: string[]; resources?: string[] }> }) =>
          (r.rules || []).some((rule: { verbs?: string[]; resources?: string[] }) =>
            rule.verbs?.includes('*') || rule.resources?.includes('*')
          )
      )
      findings.push({
        checkId: 'rbac-3', category: 'RBAC & Access Control',
        label: 'No wildcard permissions (*) in production',
        status: wildcardRoles.length <= 2 ? 'pass' : 'fail',
        cluster: clusterName, severity: 'critical',
        details: `${wildcardRoles.length} ClusterRole(s) with wildcard permissions`,
      })
    }
  }

  // ── Network Policies ──
  const netpols = await execJson(['get', 'networkpolicies', '-A', '-o', 'json'])
  const namespaces = await execJson(['get', 'namespaces', '-o', 'json'])
  if (netpols && namespaces) {
    const nsNames: string[] = (namespaces.items || [])
      .map((ns: { metadata?: { name?: string } }) => ns.metadata?.name || '')
      .filter((n: string) => !n.startsWith('kube-'))
    const nsWithPolicies = new Set(
      (netpols.items || []).map((p: { metadata?: { namespace?: string } }) => p.metadata?.namespace)
    )
    const nsMissing = nsNames.filter((n: string) => !nsWithPolicies.has(n))
    findings.push({
      checkId: 'net-1', category: 'Network Policies',
      label: 'Default-deny ingress in all namespaces',
      status: nsMissing.length === 0 ? 'pass' : 'fail',
      cluster: clusterName, severity: 'high',
      details: nsMissing.length === 0 ? 'All namespaces have NetworkPolicies' : `${nsMissing.length} namespace(s) missing NetworkPolicies: ${nsMissing.slice(0, 3).join(', ')}`,
    })
  }

  // ── Pod Security checks ──
  const pods = await execJson(['get', 'pods', '-A', '-o', 'json'])
  if (pods) {
    const items: Array<{
      metadata?: { name?: string; namespace?: string }
      spec?: {
        securityContext?: { runAsNonRoot?: boolean; runAsUser?: number }
        hostNetwork?: boolean
        volumes?: Array<{ hostPath?: unknown }>
        containers?: Array<{
          image?: string
          securityContext?: {
            privileged?: boolean
            runAsNonRoot?: boolean
            readOnlyRootFilesystem?: boolean
          }
        }>
      }
    }> = pods.items || []

    const userPods = items.filter(p => {
      const ns = p.metadata?.namespace || ''
      return !ns.startsWith('kube-') && ns !== 'local-path-storage'
    })

    const privileged = userPods.filter(p =>
      (p.spec?.containers || []).some(c => c.securityContext?.privileged === true)
    )
    findings.push({
      checkId: 'pod-2', category: 'Pod Security',
      label: 'No privileged containers',
      status: privileged.length === 0 ? 'pass' : 'fail',
      cluster: clusterName, severity: 'critical',
      details: privileged.length === 0 ? 'No privileged containers found' : `${privileged.length} pod(s) with privileged containers`,
    })

    const noRunAsNonRoot = userPods.filter(p => {
      const podSc = p.spec?.securityContext
      return !(podSc?.runAsNonRoot === true) && (p.spec?.containers || []).some(
        c => !(c.securityContext?.runAsNonRoot === true)
      )
    })
    findings.push({
      checkId: 'pod-3', category: 'Pod Security',
      label: 'runAsNonRoot enforced',
      status: noRunAsNonRoot.length === 0 ? 'pass' : noRunAsNonRoot.length <= 3 ? 'warning' : 'fail',
      cluster: clusterName, severity: 'high',
      details: noRunAsNonRoot.length === 0 ? 'All pods enforce runAsNonRoot' : `${noRunAsNonRoot.length} pod(s) missing runAsNonRoot`,
    })

    const noReadOnly = userPods.filter(p =>
      (p.spec?.containers || []).some(c => !(c.securityContext?.readOnlyRootFilesystem === true))
    )
    findings.push({
      checkId: 'pod-4', category: 'Pod Security',
      label: 'Read-only root filesystem',
      status: noReadOnly.length === 0 ? 'pass' : noReadOnly.length <= 5 ? 'warning' : 'fail',
      cluster: clusterName, severity: 'medium',
      details: noReadOnly.length === 0 ? 'All containers use readOnlyRootFilesystem' : `${noReadOnly.length} pod(s) without read-only root filesystem`,
    })

    const hostPath = userPods.filter(p =>
      (p.spec?.volumes || []).some(v => v.hostPath)
    )
    findings.push({
      checkId: 'pod-5', category: 'Pod Security',
      label: 'No hostPath volumes',
      status: hostPath.length === 0 ? 'pass' : 'fail',
      cluster: clusterName, severity: 'high',
      details: hostPath.length === 0 ? 'No hostPath volumes detected' : `${hostPath.length} pod(s) using hostPath volumes`,
    })

    const latestTag = userPods.filter(p =>
      (p.spec?.containers || []).some(c => {
        const img = c.image || ''
        return img.endsWith(':latest') || !img.includes(':')
      })
    )
    findings.push({
      checkId: 'img-4', category: 'Image Security',
      label: 'No latest tag in production',
      status: latestTag.length === 0 ? 'pass' : latestTag.length <= 2 ? 'warning' : 'fail',
      cluster: clusterName, severity: 'medium',
      details: latestTag.length === 0 ? 'All images use specific tags' : `${latestTag.length} pod(s) using :latest or untagged images`,
    })

    const hostNet = userPods.filter(p => p.spec?.hostNetwork === true)
    findings.push({
      checkId: 'node-2', category: 'Node Security',
      label: 'No hostNetwork pods outside system namespaces',
      status: hostNet.length === 0 ? 'pass' : 'warning',
      cluster: clusterName, severity: 'high',
      details: hostNet.length === 0 ? 'No hostNetwork pods in user namespaces' : `${hostNet.length} pod(s) using hostNetwork`,
    })
  }

  // ── Secrets in ConfigMaps ──
  const configmaps = await execJson(['get', 'configmaps', '-A', '-o', 'json'])
  if (configmaps) {
    const suspicious = (configmaps.items || []).filter(
      (cm: { data?: Record<string, string> }) => {
        const data = cm.data || {}
        return Object.values(data).some((v: string) =>
          /password|secret|token|key|credential/i.test(v) && v.length > 20
        )
      }
    )
    findings.push({
      checkId: 'sec-2', category: 'Secrets Management',
      label: 'No secrets in ConfigMaps or env vars',
      status: suspicious.length === 0 ? 'pass' : 'warning',
      cluster: clusterName, severity: 'high',
      details: suspicious.length === 0 ? 'No suspicious secrets found in ConfigMaps' : `${suspicious.length} ConfigMap(s) may contain sensitive data`,
    })
  }

  return findings
}

/** Fetch ISO 27001 audit findings from all connected clusters */
async function fetchISO27001AuditViaKubectl(
  cluster?: string,
  onProgress?: (partial: ISO27001Finding[]) => void,
): Promise<ISO27001Finding[]> {
  if (isAgentUnavailable()) return []
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  // (#6857) Each callback returns its own findings; aggregation happens
  // after all tasks settle to avoid mutating a shared accumulator.
  const tasks = clusters
    .filter(c => !cluster || c.name === cluster)
    .map(({ name, context }) => async () => {
      try {
        return await runISO27001ChecksForCluster(name, context || name)
      } catch (err) {
        console.error(`[ISO27001] Audit failed for cluster ${name}:`, err)
        return []
      }
    })

  // Report progress as each cluster settles instead of waiting for all
  const allFindings: ISO27001Finding[] = []
  function handleSettled(result: PromiseSettledResult<ISO27001Finding[]>) {
    if (result.status === 'fulfilled') {
      allFindings.push(...result.value)
      onProgress?.([...allFindings])
    }
  }
  await settledWithConcurrency(tasks, undefined, handleSettled)
  return allFindings
}

/**
 * Hook for fetching ISO 27001 audit findings with caching
 */
export function useCachedISO27001Audit(
  cluster?: string,
): CachedHookResult<ISO27001Finding[]> & { findings: ISO27001Finding[] } {
  const key = `iso27001Audit:${cluster || 'all'}`

  const result = useCache({
    key,
    category: 'pods' as RefreshCategory,
    initialData: [] as ISO27001Finding[],
    demoData: [] as ISO27001Finding[],
    fetcher: async () => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const findings = await fetchISO27001AuditViaKubectl(cluster)
        if (findings.length > 0) return findings
      }
      throw new Error('No data source available')
    },
    progressiveFetcher: !cluster ? async (onProgress) => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const findings = await fetchISO27001AuditViaKubectl(cluster, onProgress)
        if (findings.length > 0) return findings
      }
      throw new Error('No data source available')
    } : undefined,
  })

  return {
    findings: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

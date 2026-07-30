import type { Dispatch, SetStateAction, MutableRefObject } from 'react'
import { commonComparators } from '../../lib/cards/cardHooks'
import { kubectlProxy } from '../../lib/kubectlProxy'
import type { Policy, GatekeeperStatus, OPAClusterItem } from './opa'
import { KUBECTL_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'

export const OPA_LIST_TIMEOUT_MS = 25_000
export const MIN_POLICY_PATH_PARTS = 4

const PHASE1_CONCURRENCY = 3
const PHASE2_CONCURRENCY = 3

/**
 * Module-level mutable state to prevent StrictMode double-checks.
 * Persists across component mounts within the same page load.
 */
export const checkState = {
  inProgress: false,
  checkedClusters: new Set<string>(),
}

/** Generate demo OPA statuses for instant display (no waiting for effects/API) */
export function generateDemoStatuses(): Record<string, GatekeeperStatus> {
  const demoClusterNames = ['kind-hub', 'kind-worker1', 'kind-worker2']
  const result: Record<string, GatekeeperStatus> = {}
  for (const name of demoClusterNames) {
    result[name] = {
      cluster: name, installed: true, loading: false, policyCount: 3,
      violationCount: Math.floor(Math.random() * 5), mode: 'warn',
      modes: ['warn', 'enforce'],
      policies: [
        { name: 'require-labels', kind: 'K8sRequiredLabels', violations: 1, mode: 'warn' },
        { name: 'allowed-repos', kind: 'K8sAllowedRepos', violations: 0, mode: 'enforce' },
        { name: 'require-limits', kind: 'K8sRequireResourceLimits', violations: 2, mode: 'warn' },
      ],
      violations: [],
    }
  }
  return result
}

/**
 * Phase 1 — Fast check: single kubectl call to determine if Gatekeeper is installed.
 * Returns immediately with installed/not-installed status so the card can render.
 */
export async function checkGatekeeperInstalled(clusterName: string): Promise<GatekeeperStatus> {
  try {
    const nsResult = await kubectlProxy.exec(
      ['get', 'namespace', 'gatekeeper-system', '--ignore-not-found', '-o', 'name'],
      { context: clusterName, timeout: OPA_LIST_TIMEOUT_MS, priority: true }
    )
    const installed = !!(nsResult.output && nsResult.output.includes('gatekeeper-system'))
    return { cluster: clusterName, installed, loading: installed }
  } catch {
    return { cluster: clusterName, installed: false, loading: false, error: 'Connection failed' }
  }
}

/**
 * Phase 2 — Detail fetch: get constraints, policies, and violations.
 * Only called for clusters where Phase 1 returned installed=true.
 */
export async function checkGatekeeperDetails(clusterName: string): Promise<GatekeeperStatus> {
  try {
    const constraintsResult = await kubectlProxy.exec(
      ['get', 'constraints', '-A',
       '-o', 'custom-columns=NAME:.metadata.name,KIND:.kind,ENFORCEMENT:.spec.enforcementAction,VIOLATIONS:.status.totalViolations',
       '--no-headers'],
      { context: clusterName, timeout: KUBECTL_DEFAULT_TIMEOUT_MS }
    ).catch(() => ({ output: '', error: '' }))

    const policies: Policy[] = []
    let totalViolations = 0
    const modes = new Set<string>()

    if (constraintsResult.output) {
      const lines = constraintsResult.output.trim().split('\n').filter((l: string) => l.trim())
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= MIN_POLICY_PATH_PARTS) {
          const name = parts[0]
          const kind = parts[1]
          const enforcement = (parts[2] || 'warn').toLowerCase() as Policy['mode']
          const violations = parseInt(parts[3], 10) || 0
          // Normalize deny to enforce for display
          const normalizedMode = enforcement === 'deny' ? 'enforce' : enforcement as Policy['mode']
          policies.push({ name, kind, violations, mode: normalizedMode })
          totalViolations += violations
          modes.add(normalizedMode)
        }
      }
    }

    // Collect all modes; pick most restrictive as primary for backward compatibility
    const activeModes = Array.from(modes) as ('warn' | 'enforce' | 'dryrun')[]
    let primaryMode: 'warn' | 'enforce' | 'dryrun' | 'deny' = 'warn'
    if (modes.has('enforce')) primaryMode = 'enforce'
    else if (modes.has('dryrun')) primaryMode = 'dryrun'

    // Fetch sample violations (only if there are violations to show)
    const violations: GatekeeperStatus['violations'] = []
    if (totalViolations > 0 && policies.length > 0) {
      const policyWithViolations = policies.find(p => p.violations > 0)
      if (policyWithViolations) {
        const violationsResult = await kubectlProxy.exec(
          ['get', policyWithViolations.kind.toLowerCase(), policyWithViolations.name,
           '-o', 'jsonpath={.status.violations[*]}'],
          { context: clusterName, timeout: KUBECTL_DEFAULT_TIMEOUT_MS }
        )
        if (violationsResult.output) {
          try {
            const raw = violationsResult.output.replace(/}\s*{/g, '},{')
            const violationData = JSON.parse(`[${raw}]`)
            for (const v of violationData.slice(0, 20)) {
              violations.push({
                name: v.name || 'Unknown',
                namespace: v.namespace || 'default',
                kind: v.kind || 'Resource',
                policy: policyWithViolations.name,
                message: v.message || 'Policy violation',
                severity: policyWithViolations.mode === 'enforce' || policyWithViolations.mode === 'deny'
                  ? 'critical' : 'warning',
              })
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }

    return {
      cluster: clusterName, installed: true, loading: false,
      policyCount: policies.length, violationCount: totalViolations,
      mode: primaryMode, modes: activeModes, policies, violations,
    }
  } catch {
    return { cluster: clusterName, installed: true, loading: false, policyCount: 0, violationCount: 0 }
  }
}

/** Sort comparators that use statuses lookup via closure */
export function createSortComparators(statuses: Record<string, GatekeeperStatus>) {
  return {
    name: commonComparators.string<OPAClusterItem>('name'),
    violations: (a: OPAClusterItem, b: OPAClusterItem) =>
      (statuses[a.name]?.violationCount || 0) - (statuses[b.name]?.violationCount || 0),
    policies: (a: OPAClusterItem, b: OPAClusterItem) =>
      (statuses[a.name]?.policyCount || 0) - (statuses[b.name]?.policyCount || 0),
  }
}

/**
 * Core two-phase Gatekeeper check logic.
 * Extracted from useCallback for modularity; all React state is passed as parameters.
 */
export async function runClusterChecks(
  clustersInput: { name: string }[],
  forceCheck: boolean,
  shouldUseDemoData: boolean,
  isCheckingRef: MutableRefObject<boolean>,
  setStatuses: Dispatch<SetStateAction<Record<string, GatekeeperStatus>>>,
  setIsRefreshing: (v: boolean) => void,
  setOpaClustersChecked: Dispatch<SetStateAction<number>>,
  setOpaTotalClusters: (v: number) => void,
  setLastRefresh: (v: number) => void,
): Promise<void> {
  if (clustersInput.length === 0) return
  if (shouldUseDemoData) { setIsRefreshing(false); return }
  if (isCheckingRef.current && !forceCheck) return
  if (checkState.inProgress && !forceCheck) return

  const clustersToCheck = forceCheck
    ? clustersInput
    : clustersInput.filter(c => !checkState.checkedClusters.has(c.name))
  if (clustersToCheck.length === 0) return

  isCheckingRef.current = true
  checkState.inProgress = true
  setIsRefreshing(true)
  setOpaClustersChecked(0)
  setOpaTotalClusters(clustersToCheck.length)

  for (const cluster of clustersToCheck) checkState.checkedClusters.add(cluster.name)

  setStatuses(prev => {
    const updated = { ...prev }
    for (const cluster of clustersToCheck) {
      if (!updated[cluster.name] || updated[cluster.name].loading) {
        updated[cluster.name] = { cluster: cluster.name, installed: false, loading: true }
      }
    }
    return updated
  })

  // ── Phase 1: Fast install check (priority bypass) ──
  const phase1Queue = [...clustersToCheck]
  const installedClusters: string[] = []

  const processPhase1 = async (): Promise<void> => {
    const cluster = phase1Queue.shift()
    if (!cluster) return
    try {
      const status = await checkGatekeeperInstalled(cluster.name)
      setStatuses(prev => {
        if (status.error && prev[cluster.name]?.installed) {
          installedClusters.push(cluster.name)
          return prev
        }
        return { ...prev, [cluster.name]: status }
      })
      if (status.installed) installedClusters.push(cluster.name)
    } catch {
      setStatuses(prev => {
        if (prev[cluster.name]?.installed) { installedClusters.push(cluster.name); return prev }
        return {
          ...prev,
          [cluster.name]: { cluster: cluster.name, installed: false, loading: false, error: 'Connection failed' },
        }
      })
    }
    setOpaClustersChecked(prev => prev + 1)
    if (phase1Queue.length > 0) await processPhase1()
  }

  try {
    const batch1 = Math.min(PHASE1_CONCURRENCY, phase1Queue.length)
    await Promise.all(Array.from({ length: batch1 }, () => processPhase1()))

    // ── Phase 2: Detail fetch (only installed clusters) ──
    if (installedClusters.length > 0) {
      const phase2Queue = [...installedClusters]

      const processPhase2 = async (): Promise<void> => {
        const name = phase2Queue.shift()
        if (!name) return
        try {
          const status = await checkGatekeeperDetails(name)
          setStatuses(prev => ({ ...prev, [name]: status }))
        } catch {
          setStatuses(prev => ({ ...prev, [name]: { ...prev[name], loading: false } }))
        }
        if (phase2Queue.length > 0) await processPhase2()
      }

      const batch2 = Math.min(PHASE2_CONCURRENCY, phase2Queue.length)
      await Promise.all(Array.from({ length: batch2 }, () => processPhase2()))
    }
  } finally {
    for (const cluster of clustersToCheck) checkState.checkedClusters.delete(cluster.name)
    setIsRefreshing(false)
    setLastRefresh(Date.now())
    isCheckingRef.current = false
    checkState.inProgress = false
  }
}

/**
 * Private kubectl-based security scanner used by `useCachedSecurityIssues`.
 *
 * Extracted from useCachedCoreWorkloads.ts for maintainability.
 */

import { kubectlProxy } from '../../lib/kubectlProxy'
import { isAgentUnavailable } from '../useLocalAgent'
import { KUBECTL_EXTENDED_TIMEOUT_MS } from '../../lib/constants/network'
import { VULN_SEVERITY_ORDER } from '../../types/alerts'
import { settledWithConcurrency } from '../../lib/utils/concurrency'
import { getAgentClusters } from './agentFetchers'
import type { SecurityIssue } from '../useMCP'

// ============================================================================
// Shared types
// ============================================================================

// ============================================================================
// Private: Security kubectl scanner
// ============================================================================

/**
 * Fetch security issues via kubectlProxy — scans pods for security misconfigurations
 */
export async function fetchSecurityIssuesViaKubectl(cluster?: string, namespace?: string, onProgress?: (partial: SecurityIssue[]) => void): Promise<SecurityIssue[]> {
  if (isAgentUnavailable()) return []
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  const severityOrder = VULN_SEVERITY_ORDER

  const tasks = clusters
    .filter(c => !cluster || c.name === cluster)
    .map(({ name, context }) => async () => {
      const ctx = context || name
      // Get all pods and check for security issues
      const nsFlag = namespace ? ['-n', namespace] : ['-A']
      const response = await kubectlProxy.exec(
        ['get', 'pods', ...nsFlag, '-o', 'json'],
        { context: ctx, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }
      )

      if (response.exitCode !== 0) return []

      interface RawPodSecCtx {
        privileged?: boolean
        runAsUser?: number
        runAsNonRoot?: boolean
        readOnlyRootFilesystem?: boolean
        allowPrivilegeEscalation?: boolean
        capabilities?: { drop?: string[]; add?: string[] }
      }
      interface RawPodItem {
        metadata?: { name?: string; namespace?: string }
        spec?: {
          containers?: Array<{ securityContext?: RawPodSecCtx }>
          securityContext?: RawPodSecCtx
          hostNetwork?: boolean
          hostPID?: boolean
          hostIPC?: boolean
        }
      }
      let data: { items?: RawPodItem[] }
      try {
        data = JSON.parse(response.output)
      } catch {
        return []
      }
      const issues: SecurityIssue[] = []

      for (const pod of data.items || []) {
        const podName = pod.metadata?.name || 'unknown'
        const podNs = pod.metadata?.namespace || 'default'
        const spec = pod.spec || {}

        // Check for security misconfigurations
        for (const container of spec.containers || []) {
          const sc = container.securityContext || {}
          const podSc = spec.securityContext || {}

          // Privileged container
          if (sc.privileged === true) {
            issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Privileged container', severity: 'high', details: 'Container running in privileged mode' })
          }

          // Running as root
          if (sc.runAsUser === 0 || (sc.runAsNonRoot !== true && podSc.runAsNonRoot !== true && !sc.runAsUser)) {
            const isRoot = sc.runAsUser === 0 || podSc.runAsUser === 0
            if (isRoot) {
              issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Running as root', severity: 'high', details: 'Container running as root user' })
            }
          }

          // Missing security context
          if (!sc.runAsNonRoot && !sc.readOnlyRootFilesystem && !sc.allowPrivilegeEscalation && !sc.capabilities) {
            issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Missing security context', severity: 'low', details: 'No security context defined' })
          }

          // Capabilities not dropped
          if (sc.capabilities?.drop?.length === 0 || !sc.capabilities?.drop) {
            const addCapabilities = sc.capabilities?.add
            if (Array.isArray(addCapabilities) && addCapabilities.length > 0) {
              issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Capabilities not dropped', severity: 'medium', details: 'Container not dropping all capabilities' })
            }
          }
        }

        // Host network
        if (spec.hostNetwork === true) {
          issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Host network enabled', severity: 'medium', details: 'Pod using host network namespace' })
        }

        // Host PID
        if (spec.hostPID === true) {
          issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Host PID enabled', severity: 'high', details: 'Pod using host PID namespace' })
        }

        // Host IPC
        if (spec.hostIPC === true) {
          issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Host IPC enabled', severity: 'medium', details: 'Pod using host IPC namespace' })
        }
      }

      return issues
    })

  const accumulated: SecurityIssue[] = []
  function handleSettled(result: PromiseSettledResult<SecurityIssue[]>) {
    if (result.status === 'fulfilled') {
      accumulated.push(...result.value)
      accumulated.sort((a, b) => (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5))
      onProgress?.([...accumulated])
    }
  }
  await settledWithConcurrency(tasks, undefined, handleSettled)
  // Final sort
  return accumulated.sort((a, b) => (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5))
}

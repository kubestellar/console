import { kubectlProxy } from '../../lib/kubectlProxy'
import { KUBECTL_EXTENDED_TIMEOUT_MS } from '../../lib/constants/network'
import { VULN_SEVERITY_ORDER } from '../../types/alerts'
import { settledWithConcurrency } from '../../lib/utils/concurrency'
import { isAgentUnavailable } from '../useLocalAgent'
import { getAgentClusters } from '../useCachedData/agentFetchers'
import type { SecurityIssue } from '../useMCP'

export async function fetchSecurityIssuesViaKubectl(cluster?: string, namespace?: string, onProgress?: (partial: SecurityIssue[]) => void): Promise<SecurityIssue[]> {
  if (isAgentUnavailable()) return []
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  const tasks = clusters.filter(item => !cluster || item.name === cluster).map(({ name, context }) => async () => {
    const response = await kubectlProxy.exec(['get', 'pods', ...(namespace ? ['-n', namespace] : ['-A']), '-o', 'json'], {
      context: context || name,
      timeout: KUBECTL_EXTENDED_TIMEOUT_MS,
    })
    if (response.exitCode !== 0) return []

    let data: { items?: Array<Record<string, any>> }
    try {
      data = JSON.parse(response.output)
    } catch {
      return []
    }

    const issues: SecurityIssue[] = []
    for (const pod of data.items || []) {
      const podName = pod.metadata?.name || 'unknown'
      const podNamespace = pod.metadata?.namespace || 'default'
      const spec = pod.spec || {}

      for (const container of spec.containers || []) {
        const sc = container.securityContext || {}
        const podSc = spec.securityContext || {}
        if (sc.privileged === true) {
          issues.push({ name: podName, namespace: podNamespace, cluster: name, issue: 'Privileged container', severity: 'high', details: 'Container running in privileged mode' })
        }
        if (sc.runAsUser === 0 || (sc.runAsNonRoot !== true && podSc.runAsNonRoot !== true && !sc.runAsUser)) {
          const isRoot = sc.runAsUser === 0 || podSc.runAsUser === 0
          if (isRoot) {
            issues.push({ name: podName, namespace: podNamespace, cluster: name, issue: 'Running as root', severity: 'high', details: 'Container running as root user' })
          }
        }
        if (!sc.runAsNonRoot && !sc.readOnlyRootFilesystem && !sc.allowPrivilegeEscalation && !sc.capabilities) {
          issues.push({ name: podName, namespace: podNamespace, cluster: name, issue: 'Missing security context', severity: 'low', details: 'No security context defined' })
        }
        if ((sc.capabilities?.drop?.length === 0 || !sc.capabilities?.drop) && sc.capabilities?.add?.length > 0) {
          issues.push({ name: podName, namespace: podNamespace, cluster: name, issue: 'Capabilities not dropped', severity: 'medium', details: 'Container not dropping all capabilities' })
        }
      }
      if (spec.hostNetwork === true) {
        issues.push({ name: podName, namespace: podNamespace, cluster: name, issue: 'Host network enabled', severity: 'medium', details: 'Pod using host network namespace' })
      }
      if (spec.hostPID === true) {
        issues.push({ name: podName, namespace: podNamespace, cluster: name, issue: 'Host PID enabled', severity: 'high', details: 'Pod using host PID namespace' })
      }
      if (spec.hostIPC === true) {
        issues.push({ name: podName, namespace: podNamespace, cluster: name, issue: 'Host IPC enabled', severity: 'medium', details: 'Pod using host IPC namespace' })
      }
    }
    return issues
  })

  const accumulated: SecurityIssue[] = []
  const handleSettled = (result: PromiseSettledResult<SecurityIssue[]>) => {
    if (result.status !== 'fulfilled') return
    accumulated.push(...result.value)
    accumulated.sort((a, b) => (VULN_SEVERITY_ORDER[a.severity] || 5) - (VULN_SEVERITY_ORDER[b.severity] || 5))
    onProgress?.([...accumulated])
  }

  await settledWithConcurrency(tasks, undefined, handleSettled)
  return accumulated.sort((a, b) => (VULN_SEVERITY_ORDER[a.severity] || 5) - (VULN_SEVERITY_ORDER[b.severity] || 5))
}

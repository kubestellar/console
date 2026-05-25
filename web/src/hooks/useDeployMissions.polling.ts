import { clusterCacheRef, agentFetch } from './mcp/shared'
import { kubectlProxy } from '../lib/kubectlProxy'
import { isInClusterMode } from './useBackendHealth'
import { api } from '../lib/api'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, DEPLOY_ABORT_TIMEOUT_MS, KUBECTL_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import type { DeployClusterStatus, DeployMission } from './useDeployMissions.types'
import {
  safeReplicaCount,
  safeJsonParse,
  authHeaders,
  HTTP_UNAUTHORIZED,
  HTTP_FORBIDDEN,
  MAX_STATUS_FAILURES,
  MAX_NETWORK_FAILURES,
} from './useDeployMissions.types'

/** Fetch K8s events for a deployment via kubectlProxy. */
export async function fetchDeployEventsViaProxy(
  context: string,
  namespace: string,
  workload: string,
  tail = 8,
): Promise<string[]> {
  const response = await kubectlProxy.exec(
    ['get', 'events', '-n', namespace,
     '--sort-by=.lastTimestamp', '-o', 'json'],
    { context, timeout: KUBECTL_DEFAULT_TIMEOUT_MS },
  )
  if (response.exitCode !== 0) return []
  interface KubeEvent {
    lastTimestamp?: string
    reason?: string
    message?: string
    involvedObject?: { name?: string }
  }
  const data = safeJsonParse<{ items?: KubeEvent[] }>(response.output, { items: [] }, `${context}/${namespace}/${workload} deploy events`)
  const escapedWorkload = workload.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const k8sChildPattern = new RegExp(
    `^${escapedWorkload}-(?=[a-z0-9]*[0-9])[a-z0-9]{1,10}(-[a-z0-9]{1,5})?$`
  )
  const relevant = (data.items || []).filter((e: KubeEvent) => {
    const name = e.involvedObject?.name || ''
    return name === workload || k8sChildPattern.test(name)
  })
  return relevant
    .slice(-tail)
    .reverse()
    .map((e: KubeEvent) => {
      const ts = e.lastTimestamp
        ? new Date(e.lastTimestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : ''
      return `${ts} ${e.reason}: ${e.message}`
    })
}

/**
 * Fetch the deployment status for a single cluster within a deploy mission.
 * Tries: in-cluster API → local agent → REST fallback.
 */
export async function pollClusterStatus(
  cluster: string,
  mission: DeployMission,
  prevStatus: DeployClusterStatus | undefined,
): Promise<DeployClusterStatus> {
  const prevFailures = prevStatus?.consecutiveFailures ?? 0
  const prevNetworkFailures = prevStatus?.networkFailureCount ?? 0

  const pendingOrFailed = (): DeployClusterStatus => {
    const failures = prevFailures + 1
    if (failures >= MAX_STATUS_FAILURES) {
      return { cluster, status: 'failed', replicas: 0, readyReplicas: 0,
        consecutiveFailures: failures,
        networkFailureCount: prevNetworkFailures,
        logs: [`Status unreachable after ${failures} consecutive HTTP errors`] }
    }
    return { cluster, status: 'pending', replicas: 0, readyReplicas: 0,
      consecutiveFailures: failures,
      networkFailureCount: prevNetworkFailures }
  }

  const networkPending = (): DeployClusterStatus => {
    const networkFailures = prevNetworkFailures + 1
    if (networkFailures >= MAX_NETWORK_FAILURES) {
      return { cluster, status: 'failed', replicas: 0, readyReplicas: 0,
        consecutiveFailures: prevFailures,
        networkFailureCount: networkFailures,
        logs: [`Network unreachable after ${networkFailures} consecutive attempts`] }
    }
    return { cluster, status: 'pending', replicas: 0, readyReplicas: 0,
      consecutiveFailures: prevFailures,
      networkFailureCount: networkFailures }
  }

  // In-cluster mode: use backend API instead of local agent (#11686)
  if (isInClusterMode()) {
    try {
      const params = new URLSearchParams()
      params.append('cluster', cluster)
      params.append('namespace', mission.namespace)
      const { data } = await api.get<{ deployments: Array<Record<string, unknown>> }>(
        `/api/mcp/deployments?${params}`
      )
      const deployments = (data?.deployments || []) as Array<Record<string, unknown>>
      const match = deployments.find(
        (d) => String(d.name) === mission.workload
      )
      if (match) {
        const replicas = safeReplicaCount(match.replicas)
        const readyReplicas = safeReplicaCount(match.readyReplicas)
        const updatedRaw = match.updatedReplicas
        const updated = updatedRaw === undefined ? replicas : safeReplicaCount(updatedRaw)
        let status: DeployClusterStatus['status'] = 'applying'
        if (String(match.status) === 'running'
            && readyReplicas >= replicas
            && updated >= replicas) {
          status = 'running'
        } else if (String(match.status) === 'failed' || String(match.status) === 'Failed') {
          status = 'failed'
        }
        return { cluster, status, replicas, readyReplicas }
      }
      return pendingOrFailed()
    } catch {
      return networkPending()
    }
  }

  // Try agent first (works when backend is down)
  try {
    const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
    if (clusterInfo) {
      const params = new URLSearchParams()
      params.append('cluster', clusterInfo.context || cluster)
      params.append('namespace', mission.namespace)
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), DEPLOY_ABORT_TIMEOUT_MS)
      try {
        const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
          signal: ctrl.signal,
          headers: { Accept: 'application/json' } })
        if (!res.ok) {
          return pendingOrFailed()
        }
        let data: Record<string, unknown>
        try {
          data = await res.json()
        } catch {
          return pendingOrFailed()
        }
        const deployments = (data.deployments || []) as Array<Record<string, unknown>>
        const match = deployments.find(
          (d) => String(d.name) === mission.workload
        )
        if (match) {
          const replicas = safeReplicaCount(match.replicas)
          const readyReplicas = safeReplicaCount(match.readyReplicas)
          const agentUpdatedRaw = match.updatedReplicas
          const agentUpdated = agentUpdatedRaw === undefined
            ? replicas
            : safeReplicaCount(agentUpdatedRaw)
          let status: DeployClusterStatus['status'] = 'applying'
          if (String(match.status) === 'running'
              && readyReplicas >= replicas
              && agentUpdated >= replicas) {
            status = 'running'
          } else if (String(match.status) === 'failed' || String(match.status) === 'Failed') {
            status = 'failed'
          }
          // Fetch K8s events via kubectlProxy
          let logs: string[] | undefined
          try {
            logs = await fetchDeployEventsViaProxy(
              clusterInfo.context || cluster, mission.namespace, mission.workload,
            )
            if (logs.length === 0) logs = undefined
          } catch { /* non-critical */ }
          return { cluster, status, replicas, readyReplicas, logs }
        }
        return pendingOrFailed()
      } finally {
        clearTimeout(tid)
      }
    }
  } catch {
    // Agent failed, try REST below
  }

  // Fall back to REST API
  try {
    const res = await fetch(
      `/api/workloads/deploy-status/${encodeURIComponent(cluster)}/${encodeURIComponent(mission.namespace)}/${encodeURIComponent(mission.workload)}`,
      { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) }
    )
    if (!res.ok) {
      if (res.status === HTTP_UNAUTHORIZED || res.status === HTTP_FORBIDDEN) {
        let bodyText = ''
        try {
          if (typeof (res as Response).clone === 'function') {
            bodyText = await (res as Response).clone().text()
          } else if (typeof (res as Response).text === 'function') {
            bodyText = await (res as Response).text()
          }
        } catch { /* body already consumed or unreadable */ }
        interface K8sStatusBody {
          reason?: string
          message?: string
          kind?: string
        }
        let parsed: K8sStatusBody | null = null
        if (bodyText) {
          try {
            parsed = JSON.parse(bodyText) as K8sStatusBody
          } catch { /* non-JSON body */ }
        }
        const reason = parsed?.reason ?? ''
        const message = parsed?.message ?? bodyText.slice(0, 200)
        const looksLikeRBACDeny =
          res.status === HTTP_FORBIDDEN &&
          parsed !== null &&
          (reason === 'Forbidden' ||
            /cannot (?:list|get|watch|create|update|delete) /i.test(message))
        const logLine = looksLikeRBACDeny
          ? `Permission denied (HTTP ${res.status}): ${message || reason || 'forbidden'}`
          : `Authentication failed (HTTP ${res.status}) — token may be expired or revoked`
        return {
          cluster, status: 'failed' as const, replicas: 0, readyReplicas: 0,
          consecutiveFailures: prevFailures + 1,
          networkFailureCount: prevNetworkFailures,
          logs: [logLine],
        }
      }
      let errBody = ''
      try {
        if (typeof (res as Response).clone === 'function') {
          errBody = (await (res as Response).clone().text()).slice(0, 200)
        } else if (typeof (res as Response).text === 'function') {
          errBody = (await (res as Response).text()).slice(0, 200)
        }
      } catch { /* body already consumed or unreadable */ }
      const pf = pendingOrFailed()
      const logLine = `Backend error HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}${errBody ? `: ${errBody}` : ''} (#6666)`
      return {
        ...pf,
        logs: pf.logs ? [...pf.logs, logLine] : [logLine],
      }
    }
    const data = await res.json()
    if (data.notFound === true || data.status === 'NotFound' || data.status === 'not_found') {
      return {
        cluster, status: 'failed' as const, replicas: 0, readyReplicas: 0,
        logs: [String(data.message || 'Workload deleted during deployment — marking mission as failed')],
      }
    }
    let status: DeployClusterStatus['status'] = 'applying'
    const restReplicas = safeReplicaCount(data.replicas)
    const restReady = safeReplicaCount(data.readyReplicas)
    const restUpdatedRaw = data.updatedReplicas
    const restUpdated = restUpdatedRaw === undefined
      ? restReplicas
      : safeReplicaCount(restUpdatedRaw)
    if (String(data.status).toLowerCase() === 'running' && restReady >= restReplicas && restUpdated >= restReplicas) {
      status = 'running'
    } else if (String(data.status).toLowerCase() === 'failed') {
      status = 'failed'
    } else if (restReady > 0) {
      status = 'applying'
    }
    // Fetch deploy events/logs
    let logs: string[] | undefined
    try {
      const logRes = await fetch(
        `/api/workloads/deploy-logs/${encodeURIComponent(cluster)}/${encodeURIComponent(mission.namespace)}/${encodeURIComponent(mission.workload)}?tail=8`,
        { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) }
      )
      if (logRes.ok) {
        const logData = await logRes.json()
        if (Array.isArray(logData.logs) && logData.logs.length > 0) {
          logs = logData.logs
        }
      }
    } catch {
      // Non-critical: skip logs on error
    }
    if (status === 'failed' && (data.reason || data.message)) {
      const header = `Rollout failed: ${data.reason || 'Unknown'}${data.message ? ` — ${data.message}` : ''}`
      logs = logs && logs.length > 0 ? [header, ...logs] : [header]
    }
    return {
      cluster,
      status,
      replicas: data.replicas ?? 0,
      readyReplicas: data.readyReplicas ?? 0,
      logs }
  } catch {
    return networkPending()
  }
}

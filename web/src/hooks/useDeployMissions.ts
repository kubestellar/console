import { useState, useEffect, useRef } from 'react'
import { useCardSubscribe } from '../lib/cardEvents'
import { clusterCacheRef } from './mcp/shared'
import { kubectlProxy } from '../lib/kubectlProxy'
import type { DeployStartedPayload, DeployResultPayload, DeployedDep } from '../lib/cardEvents'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN, STORAGE_KEY_MISSIONS_ACTIVE, STORAGE_KEY_MISSIONS_HISTORY } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, DEPLOY_ABORT_TIMEOUT_MS } from '../lib/constants/network'

/** HTTP status codes that indicate authentication/authorization failure */
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403

/** Check whether a mission status is terminal (no longer needs active polling) */
function isTerminalStatus(s: DeployMissionStatus): boolean {
  return s === 'orbit' || s === 'abort' || s === 'partial'
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Fetch K8s events for a deployment via kubectlProxy.
 *  Fetches all events in the namespace and filters client-side to include
 *  events for the Deployment itself AND its ReplicaSets / Pods (whose names
 *  start with the deployment name). */
async function fetchDeployEventsViaProxy(
  context: string,
  namespace: string,
  workload: string,
  tail = 8,
): Promise<string[]> {
  const response = await kubectlProxy.exec(
    ['get', 'events', '-n', namespace,
     '--sort-by=.lastTimestamp', '-o', 'json'],
    { context, timeout: 10000 },
  )
  if (response.exitCode !== 0) return []
  interface KubeEvent {
    lastTimestamp?: string
    reason?: string
    message?: string
    involvedObject?: { name?: string }
  }
  let data: { items?: KubeEvent[] }
  try {
    data = JSON.parse(response.output)
  } catch {
    return []
  }
  // Match the deployment itself and its Kubernetes-generated children.
  // ReplicaSet names follow the pattern <deployment>-<hash> where the hash
  // is a 7-10 char alphanumeric string containing at least one digit.
  // Pod names follow <deployment>-<rs-hash>-<5-char-pod-hash>.
  // Requiring a digit in the first hash segment distinguishes K8s-generated
  // suffixes from human-readable names (e.g. "api-gateway" won't match "api").
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

export type DeployMissionStatus = 'launching' | 'deploying' | 'orbit' | 'abort' | 'partial'

export interface DeployClusterStatus {
  cluster: string
  status: 'pending' | 'applying' | 'running' | 'failed'
  replicas: number
  readyReplicas: number
  logs?: string[]
  /**
   * Consecutive HTTP 4xx/5xx responses from the status endpoint — after
   * MAX_STATUS_FAILURES we mark the cluster failed. #6412.
   */
  consecutiveFailures?: number
  /**
   * Consecutive pure network failures (fetch threw, no HTTP response).
   * Tracked separately so a transient VPN blip can't flip the mission into
   * a terminal 'failed' state. #6412.
   */
  networkFailureCount?: number
}

export interface DeployMission {
  id: string
  workload: string
  namespace: string
  sourceCluster: string
  targetClusters: string[]
  groupName?: string
  deployedBy?: string
  status: DeployMissionStatus
  clusterStatuses: DeployClusterStatus[]
  startedAt: number
  completedAt?: number
  /** Number of poll cycles completed (used to fetch logs on early cycles) */
  pollCount?: number
  /** Dependencies resolved and applied during deployment */
  dependencies?: DeployedDep[]
  /** Warnings from dependency resolution */
  warnings?: string[]
}

/** Storage key for deploy mission data */
const MISSIONS_STORAGE_KEY = 'kubestellar-missions'
const POLL_INTERVAL_MS = 5000
const MAX_MISSIONS = 50
/** Cache TTL: 5 minutes — stop polling completed missions after this duration */
const CACHE_TTL_MS = 5 * 60 * 1000
/** After this many consecutive HTTP error responses (4xx/5xx) a cluster is marked failed (#6412) */
const MAX_STATUS_FAILURES = 6
/**
 * Separate threshold for pure network failures (no response, DNS failure,
 * connection reset, TCP abort). #6412 — a 30s VPN blip must not mark a
 * cluster failed; only a sustained outage should. We use a much higher
 * threshold because network hiccups are legitimately transient.
 */
const MAX_NETWORK_FAILURES = 60
/**
 * Minimum time a mission stays in the "deploying" state before we're
 * allowed to transition it to a terminal status. This gives the underlying
 * K8s rollout a chance to actually appear in the API (#6409).
 */
const MIN_ACTIVE_MS = 10_000

function loadMissions(): DeployMission[] {
  try {
    const stored = localStorage.getItem(MISSIONS_STORAGE_KEY)
    if (stored) return JSON.parse(stored)
    // Migrate from old split keys
    const oldActive = localStorage.getItem(STORAGE_KEY_MISSIONS_ACTIVE)
    const oldHistory = localStorage.getItem(STORAGE_KEY_MISSIONS_HISTORY)
    if (oldActive || oldHistory) {
      const active: DeployMission[] = oldActive ? JSON.parse(oldActive) : []
      const history: DeployMission[] = oldHistory ? JSON.parse(oldHistory) : []
      const merged = [...active, ...history].slice(0, MAX_MISSIONS)
      localStorage.removeItem(STORAGE_KEY_MISSIONS_ACTIVE)
      localStorage.removeItem(STORAGE_KEY_MISSIONS_HISTORY)
      if (merged.length > 0) {
        localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(merged))
        return merged
      }
    }
  } catch {
    // ignore
  }
  return []
}

function saveMissions(missions: DeployMission[]) {
  // Keep logs for completed missions (they won't be re-fetched after the poll cutoff).
  // Strip logs for active missions (transient data, re-fetched on each poll cycle).
  const clean = missions.slice(0, MAX_MISSIONS).map(m => ({
    ...m,
    clusterStatuses: m.clusterStatuses.map(cs => ({
      ...cs,
      logs: isTerminalStatus(m.status) ? cs.logs : undefined })) }))
  localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(clean))
}

/**
 * Hook for tracking deployment missions.
 * Subscribes to deploy:started events from the card event bus
 * and polls deploy status. Completed missions stay in the list
 * (sorted below active ones) and continue to be monitored.
 */
export function useDeployMissions() {
  const [missions, setMissions] = useState<DeployMission[]>(() => loadMissions())
  const subscribe = useCardSubscribe()
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const missionsRef = useRef(missions)
  missionsRef.current = missions

  // Persist missions to localStorage
  useEffect(() => {
    saveMissions(missions)
  }, [missions])

  // Subscribe to deploy:started events
  useEffect(() => {
    const unsub = subscribe('deploy:started', (event) => {
      const p: DeployStartedPayload = event.payload
      const mission: DeployMission = {
        id: p.id,
        workload: p.workload,
        namespace: p.namespace,
        sourceCluster: p.sourceCluster,
        targetClusters: p.targetClusters,
        groupName: p.groupName,
        deployedBy: p.deployedBy,
        status: 'launching',
        clusterStatuses: p.targetClusters.map(c => ({
          cluster: c,
          status: 'pending',
          replicas: 0,
          readyReplicas: 0 })),
        startedAt: Date.now(),
        pollCount: 0 }
      setMissions(prev => [mission, ...prev].slice(0, MAX_MISSIONS))
    })
    return unsub
  }, [subscribe])

  // Subscribe to deploy:result events (carries dependency info from API response)
  useEffect(() => {
    const unsub = subscribe('deploy:result', (event) => {
      const p: DeployResultPayload = event.payload
      setMissions(prev => prev.map(m => {
        if (m.id !== p.id) return m
        return {
          ...m,
          dependencies: p.dependencies,
          warnings: p.warnings }
      }))
    })
    return unsub
  }, [subscribe])

  // Poll deploy status for missions using ref to avoid re-render loop
  useEffect(() => {
    const poll = async () => {
      const current = missionsRef.current
      if (current.length === 0) return

      const updated = await Promise.all(
        current.map(async (mission) => {
          const isCompleted = isTerminalStatus(mission.status)
          // Stop polling completed missions after cutoff — unless logs were
          // never loaded (e.g. restored from localStorage after page reload).
          if (isCompleted && mission.completedAt &&
              (Date.now() - mission.completedAt) > CACHE_TTL_MS) {
            const hasAnyLogs = mission.clusterStatuses.some(cs => cs.logs && cs.logs.length > 0)
            if (hasAnyLogs) return mission
            // Fall through: do one more poll to recover logs
          }

          const pollCount = (mission.pollCount ?? 0) + 1

          const statuses = await Promise.all(
            mission.targetClusters.map(async (cluster): Promise<DeployClusterStatus> => {
              // Track consecutive failures from previous poll cycle
              const prevStatus = mission.clusterStatuses.find(cs => cs.cluster === cluster)
              const prevFailures = prevStatus?.consecutiveFailures ?? 0
              const prevNetworkFailures = prevStatus?.networkFailureCount ?? 0

              // Helper: build a "pending-or-failed" response based on HTTP-error failure count.
              // #6412 — used only for genuine HTTP 4xx/5xx responses, not for
              // network-level failures. Preserves networkFailureCount so a
              // concurrent network blip doesn't reset its tally.
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

              // Helper: pure-network-failure response. #6412 — these should
              // NOT count toward MAX_STATUS_FAILURES. We keep the mission
              // pending through the blip; only a sustained outage
              // (MAX_NETWORK_FAILURES polls) escalates to 'failed'. Preserves
              // prevFailures so an HTTP-error streak in progress isn't reset.
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
                    const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
                      signal: ctrl.signal,
                      headers: { Accept: 'application/json' } })
                    if (res.ok) {
                      const data = await res.json()
                      const deployments = (data.deployments || []) as Array<Record<string, unknown>>
                      const match = deployments.find(
                        (d) => String(d.name) === mission.workload
                      )
                      if (match) {
                        const replicas = Number(match.replicas ?? 0)
                        const readyReplicas = Number(match.readyReplicas ?? 0)
                        let status: DeployClusterStatus['status'] = 'applying'
                        // Zero-replica workloads are valid (e.g. scale-to-zero) — treat
                        // readyReplicas >= replicas as success even when both are zero.
                        if (readyReplicas >= replicas) {
                          status = 'running'
                        } else if (String(match.status) === 'failed') {
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
                      // Workload not found on this cluster yet — still pending (or failed after threshold)
                      return pendingOrFailed()
                    }
                  } finally {
                    // Always clear the abort timer to prevent leak on fetch failure (#5498)
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
                  // Surface auth failures explicitly instead of masking as "unreachable" (#5499).
                  // #6414 — Distinguish true auth failures (401, or 403 with
                  // body indicating expired/invalid token) from RBAC denials
                  // (403 with body describing a user/verb/resource combination).
                  if (res.status === HTTP_UNAUTHORIZED || res.status === HTTP_FORBIDDEN) {
                    let bodyText = ''
                    try {
                      // Use .clone() when available so the body can also be
                      // re-read elsewhere; fall back to .text() directly.
                      if (typeof (res as Response).clone === 'function') {
                        bodyText = await (res as Response).clone().text()
                      } else if (typeof (res as Response).text === 'function') {
                        bodyText = await (res as Response).text()
                      }
                    } catch { /* body already consumed or unreadable */ }
                    // Parse a K8s Status object if the body is JSON.
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
                    // Only flag as "RBAC denial" when the body is clearly a
                    // K8s Forbidden Status object. Without a parseable body
                    // we fall through to the legacy "token may be expired"
                    // wording (#5499) so bare-401/403 cases stay untouched.
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
                  return pendingOrFailed()
                }
                const data = await res.json()
                // #5958 — If the workload no longer exists on the target cluster,
                // treat it as a terminal failure immediately instead of letting
                // the mission remain "pending" for multiple poll cycles.
                if (data.notFound === true || data.status === 'NotFound' || data.status === 'not_found') {
                  return {
                    cluster, status: 'failed' as const, replicas: 0, readyReplicas: 0,
                    logs: [String(data.message || 'Workload deleted during deployment — marking mission as failed')],
                  }
                }
                let status: DeployClusterStatus['status'] = 'applying'
                const restReplicas = Number(data.replicas ?? 0)
                const restReady = Number(data.readyReplicas ?? 0)
                // #5955 — Require updatedReplicas >= replicas so a partial rollout
                // is not marked "running" just because availableReplicas reached desired.
                // When the backend doesn't include updatedReplicas (older servers
                // or tests), fall back to restReplicas so existing callers keep
                // working. `undefined` means "don't enforce the check".
                const restUpdatedRaw = data.updatedReplicas
                const restUpdated = restUpdatedRaw === undefined ? restReplicas : Number(restUpdatedRaw)
                // Zero-replica workloads are valid — treat readyReplicas >= replicas
                // as success even when both are zero.
                if (data.status === 'Running' && restReady >= restReplicas && restUpdated >= restReplicas) {
                  status = 'running'
                } else if (data.status === 'Failed') {
                  // #5956 — Surface the failure reason in the mission logs
                  // instead of leaving the mission in a generic degraded state.
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
                // #5956 — If the deployment has a failure reason/message,
                // prepend it to the logs so the UI surfaces it prominently.
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
                // #6412 — fetch threw: network failure (no HTTP response).
                // Track separately from HTTP errors so a transient VPN blip
                // can't trip the 6-poll catastrophe threshold.
                return networkPending()
              }
            })
          )

          // Determine overall mission status
          const allRunning = statuses.every(s => s.status === 'running')
          const anyFailed = statuses.some(s => s.status === 'failed')
          const anyRunning = statuses.some(s => s.status === 'running')

          let missionStatus: DeployMissionStatus = 'deploying'
          if (allRunning) {
            missionStatus = 'orbit'
          } else if (anyFailed && !anyRunning) {
            missionStatus = 'abort'
          } else if (anyFailed && anyRunning) {
            missionStatus = 'partial'
          }

          // Grace period: keep mission in deploying state for at least
          // MIN_ACTIVE_MS so the backend has a chance to actually register
          // the rollout. #6409 — if the computed status would be terminal
          // but we're still inside the grace window, schedule a targeted
          // re-poll at the exact moment the grace window expires, rather
          // than waiting up to POLL_INTERVAL_MS for the next regular poll.
          // This eliminates the observed 0–5s lag between the grace window
          // closing and the UI flipping to the real status.
          const elapsed = Date.now() - mission.startedAt
          if (isTerminalStatus(missionStatus) && elapsed < MIN_ACTIVE_MS) {
            missionStatus = 'deploying'
            const remaining = MIN_ACTIVE_MS - elapsed
            // Small fudge (50ms) so `elapsed` is definitely past MIN_ACTIVE_MS on re-entry
            const GRACE_REPOLL_FUDGE_MS = 50
            setTimeout(() => {
              // Only re-poll if this mission still exists and is still non-terminal.
              // The regular interval may have already run by now, which is fine
              // — calling poll() again is idempotent.
              const latest = missionsRef.current.find(m => m.id === mission.id)
              if (latest && !isTerminalStatus(latest.status)) {
                poll()
              }
            }, remaining + GRACE_REPOLL_FUDGE_MS)
          }

          return {
            ...mission,
            clusterStatuses: statuses,
            status: missionStatus,
            pollCount,
            completedAt: isTerminalStatus(missionStatus)
              ? (mission.completedAt ?? Date.now())
              : undefined }
        })
      )

      // Sort: active missions first (newest first), completed missions below (newest first).
      // #6411 — Add a deterministic tiebreaker on mission id. Without it,
      // two missions with the same `startedAt` epoch ms reshuffle randomly
      // on every poll because `Array.sort` is not guaranteed stable across
      // all engines for `0` comparisons.
      const active = updated.filter(m => !isTerminalStatus(m.status))
      const completed = updated.filter(m => isTerminalStatus(m.status))
      active.sort((a, b) => (b.startedAt - a.startedAt) || a.id.localeCompare(b.id))
      completed.sort((a, b) => {
        const aKey = a.completedAt ?? a.startedAt
        const bKey = b.completedAt ?? b.startedAt
        return (bKey - aKey) || a.id.localeCompare(b.id)
      })

      setMissions([...active, ...completed])
    }

    // Poll on interval (first poll after 1s delay, then every POLL_INTERVAL_MS)
    const initialTimeout = setTimeout(() => {
      poll()
      pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    }, 1000)

    return () => {
      clearTimeout(initialTimeout)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, []) // No dependencies - uses ref for current missions

  const activeMissions = missions.filter(m => !isTerminalStatus(m.status))
  const completedMissions = missions.filter(m => isTerminalStatus(m.status))

  const clearCompleted = () => {
    setMissions(prev => prev.filter(m => !isTerminalStatus(m.status)))
  }

  return {
    missions,
    activeMissions,
    completedMissions,
    hasActive: activeMissions.length > 0,
    clearCompleted }
}

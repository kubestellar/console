import { useState, useEffect, useRef } from 'react'
import { useCardSubscribe } from '../lib/cardEvents'
import { clusterCacheRef } from './mcp/shared'
import { kubectlProxy } from '../lib/kubectlProxy'
import type { DeployStartedPayload, DeployResultPayload, DeployedDep } from '../lib/cardEvents'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN, STORAGE_KEY_MISSIONS_ACTIVE, STORAGE_KEY_MISSIONS_HISTORY } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, DEPLOY_ABORT_TIMEOUT_MS, KUBECTL_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

/** HTTP status codes that indicate authentication/authorization failure */
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403

/**
 * #6729 — Safe numeric parse for replica counts coming off a JSON payload.
 * Raw `Number(x)` returns NaN for strings that don't parse, for objects,
 * and for `null`, which then silently propagates through comparisons
 * (`readyReplicas >= replicas` is `false` when either side is NaN) and
 * leaves deploy missions stuck in "applying". Non-finite and negative
 * inputs collapse to the fallback (default 0) — a negative replica count
 * is not a physical state K8s can report.
 */
function safeReplicaCount(raw: unknown, fallback = 0): number {
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

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
    { context, timeout: KUBECTL_DEFAULT_TIMEOUT_MS },
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
  /**
   * #6415 — Once any logs have been captured for a completed mission, this
   * counter tracks how many additional poll cycles we've run so that late
   * error lines (CrashLoopBackOff reasons etc.) can be recovered before the
   * loop finally stops. Capped at LOG_RECOVERY_EXTRA_POLLS.
   */
  logRecoveryPolls?: number
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
/**
 * #6415 — After a completed mission first sees any logs, continue polling for
 * this many additional cycles so that late-emitted error lines (e.g. a
 * CrashLoopBackOff reason that arrives several seconds after the initial event
 * stream) are captured. Without this grace period the poll loop would
 * permanently stop the instant hasAnyLogs flips true, locking the UI out of
 * the very error message the user needs.
 */
const LOG_RECOVERY_EXTRA_POLLS = 3
/**
 * #6640 — Max number of concurrent cluster-status HTTP requests across ALL
 * active missions. Before this cap, a user with N missions × M target
 * clusters would fire N*M fetches every POLL_INTERVAL_MS, which can DoS
 * their own backend (especially when agent+REST fallbacks double up). We
 * keep a generous ceiling — most users will never hit it — but it bounds
 * the worst case.
 */
const DEPLOY_POLL_MAX_CONCURRENCY = 6

/**
 * Run async tasks with bounded concurrency. Returns results in the same
 * order as `tasks`. Used by the deploy poller to cap in-flight HTTP
 * requests across all missions × clusters. Kept inline to avoid adding a
 * p-limit dependency for one caller.
 */
async function runWithConcurrency<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(limit, tasks.length))
  const workers: Promise<void>[] = []
  for (let w = 0; w < workerCount; w++) {
    workers.push((async () => {
      while (true) {
        const i = nextIndex++
        if (i >= tasks.length) return
        results[i] = await tasks[i]()
      }
    })())
  }
  await Promise.all(workers)
  return results
}

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
  // issue 6427 — track grace-window re-poll timeouts keyed by mission id
  // so we can clear them on unmount and on the next regular poll cycle.
  // Without this, a hook unmount inside the grace window would still fire
  // `poll()` and call `setMissions` on a dead component.
  const graceRepollsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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
    // #7307 — Guard against concurrent poll() calls. The grace-period repoll
    // timeout can fire while a regular setInterval poll is already running,
    // causing two concurrent bursts that exceed DEPLOY_POLL_MAX_CONCURRENCY.
    let pollInProgress = false

    const poll = async () => {
      if (pollInProgress) return
      pollInProgress = true
      try {
        await pollInner()
      } finally {
        pollInProgress = false
      }
    }
    const pollInner = async () => {
      const current = missionsRef.current
      if (current.length === 0) return
      // #7142 — If every mission is already terminal, skip the poll and
      // Stop the interval when all missions are terminal AND none need
      // log recovery. Previously this exited before the per-mission recovery
      // logic could run, breaking log recovery for completed missions (#7343).
      const allTerminal = current.every(m => isTerminalStatus(m.status))
      const anyNeedsRecovery = allTerminal && current.some(m => {
        if (!m.completedAt || (Date.now() - m.completedAt) <= CACHE_TTL_MS) return false
        const hasAnyLogs = m.clusterStatuses.some(cs => cs.logs && cs.logs.length > 0)
        const recoveryPolls = m.logRecoveryPolls ?? 0
        // Still needs recovery if: has logs but under budget, OR has no logs at all
        return !hasAnyLogs || recoveryPolls < LOG_RECOVERY_EXTRA_POLLS
      })
      if (allTerminal && !anyNeedsRecovery) {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = undefined
        }
        return
      }

      // #6640 — Serialize missions and cap per-mission cluster concurrency
      // via `runWithConcurrency`. Previously this was
      // `Promise.all(current.map(... Promise.all(clusters.map(...))))`, which
      // fires N_missions × N_clusters fetches simultaneously every poll
      // cycle and can DoS the user's own backend under load. Missions are
      // processed sequentially; clusters within a mission are capped at
      // DEPLOY_POLL_MAX_CONCURRENCY in-flight at a time.
      const updated: DeployMission[] = []
      for (const mission of current) {
        updated.push(await (async () => {
          const isCompleted = isTerminalStatus(mission.status)
          // #6415 — Track whether this poll cycle is "within the log-recovery
          // grace window". When true, we allow the normal poll body to run
          // below (which refetches logs for each cluster) and bump the
          // recovery counter at the bottom. We only hard-stop polling when
          // the budget is exhausted.
          let inRecoveryWindow = false
          if (isCompleted && mission.completedAt &&
              (Date.now() - mission.completedAt) > CACHE_TTL_MS) {
            const hasAnyLogs = mission.clusterStatuses.some(cs => cs.logs && cs.logs.length > 0)
            const recoveryPolls = mission.logRecoveryPolls ?? 0
            if (hasAnyLogs) {
              if (recoveryPolls >= LOG_RECOVERY_EXTRA_POLLS) {
                // Grace window exhausted — stop polling for good.
                return mission
              }
              inRecoveryWindow = true
            }
            // Else: no logs at all yet (e.g. page-reload case); fall through
            // to poll once more. Do NOT count this toward the recovery
            // budget — that budget is only for catching late lines AFTER at
            // least one log line has arrived.
          }

          const pollCount = (mission.pollCount ?? 0) + 1

          // #6640 — Bounded concurrency over clusters. Each cluster task is
          // wrapped in a thunk so runWithConcurrency can schedule them.
          const clusterTasks: Array<() => Promise<DeployClusterStatus>> =
            mission.targetClusters.map((cluster) => async (): Promise<DeployClusterStatus> => {
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
                    // #6816 — If the agent returns a non-OK response (4xx/5xx
                    // or a proxy HTML error page), count it as a failure
                    // instead of silently falling through to the REST path.
                    // Without this guard, res.json() on an HTML body throws
                    // SyntaxError and the agent failure is invisible to the
                    // consecutive-failure counter.
                    if (!res.ok) {
                      return pendingOrFailed()
                    }
                    // #7141 — Guard against non-JSON responses (e.g. HTML error
                    // pages from reverse proxies returning 200). Without this,
                    // res.json() throws SyntaxError and the failure is invisible.
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
                      // #6729 — Safe numeric cast. `Number('foo')` returns
                      // NaN, which then flows into comparisons like
                      // `readyReplicas >= replicas` and silently evaluates
                      // to `false`, leaving missions stuck in "applying".
                      // Fall back to 0 for non-finite values.
                      const replicas = safeReplicaCount(match.replicas)
                      const readyReplicas = safeReplicaCount(match.readyReplicas)
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
                  // #6666 — Previously a sustained non-auth error (HTTP 500,
                  // 502, 503, 504, etc.) would silently downgrade the mission
                  // to `failed` after MAX_STATUS_FAILURES poll cycles with no
                  // indication of why. Surface the HTTP status AND a short
                  // response body excerpt in the cluster logs so operators
                  // can see that the backend itself is returning errors and
                  // distinguish "backend down" from "workload missing".
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
                // #6729 — Safe numeric casts. See safeReplicaCount for the
                // rationale. The REST path is the more common one in
                // production and was the original symptom on #6729.
                const restReplicas = safeReplicaCount(data.replicas)
                const restReady = safeReplicaCount(data.readyReplicas)
                // #5955 — Require updatedReplicas >= replicas so a partial rollout
                // is not marked "running" just because availableReplicas reached desired.
                // When the backend doesn't include updatedReplicas (older servers
                // or tests), fall back to restReplicas so existing callers keep
                // working. `undefined` means "don't enforce the check".
                const restUpdatedRaw = data.updatedReplicas
                const restUpdated = restUpdatedRaw === undefined
                  ? restReplicas
                  : safeReplicaCount(restUpdatedRaw)
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
          const statuses = await runWithConcurrency(clusterTasks, DEPLOY_POLL_MAX_CONCURRENCY)

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
            // issue 6427 — clear any previously scheduled grace repoll for this
            // mission (the regular poll may have already run once in between)
            // and track the new handle so unmount cleanup can cancel it.
            const existing = graceRepollsRef.current.get(mission.id)
            if (existing) clearTimeout(existing)
            const handle = setTimeout(() => {
              graceRepollsRef.current.delete(mission.id)
              // Only re-poll if this mission still exists and is still non-terminal.
              // The regular interval may have already run by now, which is fine
              // — calling poll() again is idempotent.
              const latest = missionsRef.current.find(m => m.id === mission.id)
              if (latest && !isTerminalStatus(latest.status)) {
                poll()
              }
            }, remaining + GRACE_REPOLL_FUDGE_MS)
            graceRepollsRef.current.set(mission.id, handle)
          }

          return {
            ...mission,
            clusterStatuses: statuses,
            status: missionStatus,
            pollCount,
            completedAt: isTerminalStatus(missionStatus)
              ? (mission.completedAt ?? Date.now())
              : undefined,
            // #6415 — Bump the log-recovery counter whenever we ran this
            // poll cycle specifically because we were inside the grace
            // window. Leave it untouched otherwise so a reopened active
            // mission doesn't inherit a stale counter.
            logRecoveryPolls: inRecoveryWindow
              ? (mission.logRecoveryPolls ?? 0) + 1
              : mission.logRecoveryPolls }
        })())
      }

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

      const allMissions = [...active, ...completed]
      setMissions(allMissions)

      // #6840 — If every mission is in a terminal state, stop polling to
      // avoid wasting network and compute on completed deployments.
      if (allMissions.length > 0 && allMissions.every(m => isTerminalStatus(m.status))) {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = undefined
        }
      }
    } // end pollInner

    // Delay before the first poll fires after mount. Kept small so the UI
    // updates quickly, but non-zero so the subscribe effect above has a
    // chance to populate `missionsRef` before the first fetch.
    const INITIAL_POLL_DELAY_MS = 1000
    // Poll on interval (first poll after INITIAL_POLL_DELAY_MS, then every
    // POLL_INTERVAL_MS) — but only while the tab is visible (#6641).
    // #7159 — Always clear any existing interval before starting a new one.
    // The old code checked `if (pollRef.current) return` which prevented
    // double-start, but the visibility-change handler could call startPolling
    // after stopPolling in rapid succession, and if a race between the
    // clearInterval and setInterval occurred, the old handle would be
    // abandoned (leaked), compounding polling frequency exponentially.
    const startPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
      pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    }
    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = undefined
      }
    }
    const initialTimeout = setTimeout(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        // Tab started hidden — wait for visibilitychange to start polling.
        return
      }
      poll()
      startPolling()
    }, INITIAL_POLL_DELAY_MS)

    // #6641 — Page Visibility integration. When the tab is hidden, tear
    // down the interval so background timers don't queue up (some browsers
    // throttle but still accumulate ticks, and resuming the tab then
    // dumps a burst of deferred poll() calls on the backend). On resume,
    // fire one immediate poll to catch up, then restart the interval.
    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'hidden') {
        stopPolling()
      } else {
        poll()
        startPolling()
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    // issue 6427 — Snapshot the grace-repoll map reference inside the
    // effect body so the cleanup closure uses a captured handle rather
    // than reading `.current` at cleanup time (react-hooks/exhaustive-deps).
    const graceRepolls = graceRepollsRef.current
    return () => {
      clearTimeout(initialTimeout)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      if (pollRef.current) clearInterval(pollRef.current)
      // Cancel any outstanding grace-window re-polls so they don't fire
      // on an unmounted hook and call setMissions on a dead tree.
      for (const handle of graceRepolls.values()) {
        clearTimeout(handle)
      }
      graceRepolls.clear()
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

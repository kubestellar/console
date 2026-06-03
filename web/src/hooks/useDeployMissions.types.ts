import { getStoredAuthToken } from '../lib/constants'
import { MS_PER_MINUTE } from '../lib/constants/time'

/** HTTP status codes that indicate authentication/authorization failure */
export const HTTP_UNAUTHORIZED = 401
export const HTTP_FORBIDDEN = 403

export type DeployMissionStatus = 'launching' | 'deploying' | 'orbit' | 'abort' | 'partial'

export interface DeployClusterStatus {
  cluster: string
  status: 'pending' | 'applying' | 'running' | 'failed'
  replicas: number
  readyReplicas: number
  logs?: string[]
  consecutiveFailures?: number
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
  pollCount?: number
  dependencies?: import('../lib/cardEvents').DeployedDep[]
  warnings?: string[]
  logRecoveryPolls?: number
}

/** Storage key for deploy mission data */
export const MISSIONS_STORAGE_KEY = 'kubestellar-missions'
export const POLL_INTERVAL_MS = 5000
export const MAX_MISSIONS = 50
/** Cache TTL: 5 minutes — stop polling completed missions after this duration */
export const CACHE_TTL_MS = 5 * MS_PER_MINUTE
/** After this many consecutive HTTP error responses (4xx/5xx) a cluster is marked failed (#6412) */
export const MAX_STATUS_FAILURES = 6
/**
 * Separate threshold for pure network failures (no response, DNS failure,
 * connection reset, TCP abort). #6412 — a 30s VPN blip must not mark a
 * cluster failed; only a sustained outage should.
 */
export const MAX_NETWORK_FAILURES = 60
/**
 * Minimum time a mission stays in the "deploying" state before we're
 * allowed to transition it to a terminal status (#6409).
 */
export const MIN_ACTIVE_MS = 10_000
/**
 * #6415 — After a completed mission first sees any logs, continue polling for
 * this many additional cycles to catch late-emitted error lines.
 */
export const LOG_RECOVERY_EXTRA_POLLS = 3
/**
 * #6640 — Max number of concurrent cluster-status HTTP requests across ALL
 * active missions.
 */
export const DEPLOY_POLL_MAX_CONCURRENCY = 6

/**
 * #6729 — Safe numeric parse for replica counts coming off a JSON payload.
 */
export function safeReplicaCount(raw: unknown, fallback = 0): number {
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

export function safeJsonParse<T>(raw: string, fallback: T, context: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn(`[useDeployMissions] Failed to parse ${context}, using default`, err)
    return fallback
  }
}

/** Check whether a mission status is terminal (no longer needs active polling) */
export function isTerminalStatus(s: DeployMissionStatus): boolean {
  return s === 'orbit' || s === 'abort' || s === 'partial'
}

export function authHeaders(): Record<string, string> {
  const token = getStoredAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Run async tasks with bounded concurrency. Returns results in the same
 * order as `tasks`.
 */
export async function runWithConcurrency<T>(
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

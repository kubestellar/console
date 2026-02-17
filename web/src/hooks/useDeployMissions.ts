import { useState, useEffect, useCallback, useRef } from 'react'
import { useCardSubscribe } from '../lib/cardEvents'
import { clusterCacheRef } from './mcp/shared'
import { kubectlProxy } from '../lib/kubectlProxy'
import type { DeployStartedPayload, DeployResultPayload, DeployedDep } from '../lib/cardEvents'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_TOKEN, STORAGE_KEY_MISSIONS_ACTIVE, STORAGE_KEY_MISSIONS_HISTORY } from '../lib/constants'

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
  const data = JSON.parse(response.output)
  interface KubeEvent {
    lastTimestamp?: string
    reason?: string
    message?: string
    involvedObject?: { name?: string }
  }
  const prefix = workload + '-'
  const relevant = (data.items || []).filter((e: KubeEvent) => {
    const name = e.involvedObject?.name || ''
    return name === workload || name.startsWith(prefix)
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

const MISSIONS_KEY = 'kubestellar-missions'
const POLL_INTERVAL_MS = 5000
const MAX_MISSIONS = 50
/** Stop polling completed missions after this duration */
const COMPLETED_POLL_CUTOFF_MS = 5 * 60 * 1000

function loadMissions(): DeployMission[] {
  try {
    const stored = localStorage.getItem(MISSIONS_KEY)
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
        localStorage.setItem(MISSIONS_KEY, JSON.stringify(merged))
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
  const isTerminal = (s: DeployMissionStatus) => s === 'orbit' || s === 'abort'
  const clean = missions.slice(0, MAX_MISSIONS).map(m => ({
    ...m,
    clusterStatuses: m.clusterStatuses.map(cs => ({
      ...cs,
      logs: isTerminal(m.status) ? cs.logs : undefined,
    })),
  }))
  localStorage.setItem(MISSIONS_KEY, JSON.stringify(clean))
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
  const pollRef = useRef<ReturnType<typeof setInterval>>()
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
          readyReplicas: 0,
        })),
        startedAt: Date.now(),
        pollCount: 0,
      }
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
          warnings: p.warnings,
        }
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
          const isCompleted = mission.status === 'orbit' || mission.status === 'abort'
          // Stop polling completed missions after cutoff — unless logs were
          // never loaded (e.g. restored from localStorage after page reload).
          if (isCompleted && mission.completedAt &&
              (Date.now() - mission.completedAt) > COMPLETED_POLL_CUTOFF_MS) {
            const hasAnyLogs = mission.clusterStatuses.some(cs => cs.logs && cs.logs.length > 0)
            if (hasAnyLogs) return mission
            // Fall through: do one more poll to recover logs
          }

          const pollCount = (mission.pollCount ?? 0) + 1

          const statuses = await Promise.all(
            mission.targetClusters.map(async (cluster): Promise<DeployClusterStatus> => {
              // Try agent first (works when backend is down)
              try {
                const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
                if (clusterInfo) {
                  const params = new URLSearchParams()
                  params.append('cluster', clusterInfo.context || cluster)
                  params.append('namespace', mission.namespace)
                  const ctrl = new AbortController()
                  const tid = setTimeout(() => ctrl.abort(), 10000)
                  const res = await fetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
                    signal: ctrl.signal,
                    headers: { Accept: 'application/json' },
                  })
                  clearTimeout(tid)
                  if (res.ok) {
                    const data = await res.json()
                    const deployments = (data.deployments || []) as Array<Record<string, unknown>>
                    const match = deployments.find(
                      (d) => String(d.name) === mission.workload
                    )
                    if (match) {
                      const replicas = Number(match.replicas || 0)
                      const readyReplicas = Number(match.readyReplicas || 0)
                      let status: DeployClusterStatus['status'] = 'applying'
                      if (readyReplicas > 0 && readyReplicas >= replicas) {
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
                    // Workload not found on this cluster yet — still pending
                    return { cluster, status: 'pending', replicas: 0, readyReplicas: 0 }
                  }
                }
              } catch {
                // Agent failed, try REST below
              }

              // Fall back to REST API
              try {
                const res = await fetch(
                  `/api/workloads/deploy-status/${encodeURIComponent(cluster)}/${encodeURIComponent(mission.namespace)}/${encodeURIComponent(mission.workload)}`,
                  { headers: authHeaders() }
                )
                if (!res.ok) {
                  return { cluster, status: 'pending', replicas: 0, readyReplicas: 0 }
                }
                const data = await res.json()
                let status: DeployClusterStatus['status'] = 'applying'
                if (data.status === 'Running' && data.readyReplicas > 0 && data.readyReplicas >= data.replicas) {
                  status = 'running'
                } else if (data.status === 'Failed') {
                  status = 'failed'
                } else if (data.readyReplicas > 0) {
                  status = 'applying'
                }
                // Fetch deploy events/logs
                let logs: string[] | undefined
                try {
                  const logRes = await fetch(
                    `/api/workloads/deploy-logs/${encodeURIComponent(cluster)}/${encodeURIComponent(mission.namespace)}/${encodeURIComponent(mission.workload)}?tail=8`,
                    { headers: authHeaders() }
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
                return {
                  cluster,
                  status,
                  replicas: data.replicas ?? 0,
                  readyReplicas: data.readyReplicas ?? 0,
                  logs,
                }
              } catch {
                return { cluster, status: 'pending', replicas: 0, readyReplicas: 0 }
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

          // Grace period: keep mission in deploying state for at least 10s
          const elapsed = Date.now() - mission.startedAt
          const MIN_ACTIVE_MS = 10000
          if ((missionStatus === 'orbit' || missionStatus === 'abort') && elapsed < MIN_ACTIVE_MS) {
            missionStatus = 'deploying'
          }

          return {
            ...mission,
            clusterStatuses: statuses,
            status: missionStatus,
            pollCount,
            completedAt: (missionStatus === 'orbit' || missionStatus === 'abort')
              ? (mission.completedAt ?? Date.now())
              : undefined,
          }
        })
      )

      // Sort: active missions first (newest first), completed missions below (newest first)
      const active = updated.filter(m => m.status !== 'orbit' && m.status !== 'abort')
      const completed = updated.filter(m => m.status === 'orbit' || m.status === 'abort')
      active.sort((a, b) => b.startedAt - a.startedAt)
      completed.sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt))

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

  const activeMissions = missions.filter(m => m.status !== 'orbit' && m.status !== 'abort')
  const completedMissions = missions.filter(m => m.status === 'orbit' || m.status === 'abort')

  const clearCompleted = useCallback(() => {
    setMissions(prev => prev.filter(m => m.status !== 'orbit' && m.status !== 'abort'))
  }, [])

  return {
    missions,
    activeMissions,
    completedMissions,
    hasActive: activeMissions.length > 0,
    clearCompleted,
  }
}

import { useState, useEffect, useRef } from 'react'
import { useCardSubscribe } from '../lib/cardEvents'
import type { DeployStartedPayload, DeployResultPayload } from '../lib/cardEvents'
import type { DeployMission, DeployMissionStatus, DeployClusterStatus } from './useDeployMissions.types'
import {
  isTerminalStatus,
  runWithConcurrency,
  POLL_INTERVAL_MS,
  MAX_MISSIONS,
  CACHE_TTL_MS,
  MIN_ACTIVE_MS,
  LOG_RECOVERY_EXTRA_POLLS,
  DEPLOY_POLL_MAX_CONCURRENCY,
  safeReplicaCount,
  authHeaders,
  MISSIONS_STORAGE_KEY,
  MAX_STATUS_FAILURES,
  MAX_NETWORK_FAILURES,
} from './useDeployMissions.types'
import { loadMissions, saveMissions } from './useDeployMissions.persistence'
import { pollClusterStatus } from './useDeployMissions.polling'

// Re-export types for consumers
export type { DeployMissionStatus, DeployClusterStatus, DeployMission } from './useDeployMissions.types'

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
        clusterStatuses: (p.targetClusters || []).map(c => ({
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

      const allTerminal = current.every(m => isTerminalStatus(m.status))
      const anyNeedsRecovery = allTerminal && current.some(m => {
        if (!m.completedAt || (Date.now() - m.completedAt) <= CACHE_TTL_MS) return false
        const hasAnyLogs = (m.clusterStatuses || []).some(cs => cs.logs && cs.logs.length > 0)
        const recoveryPolls = m.logRecoveryPolls ?? 0
        return !hasAnyLogs || recoveryPolls < LOG_RECOVERY_EXTRA_POLLS
      })
      if (allTerminal && !anyNeedsRecovery) {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = undefined
        }
        return
      }

      const updated: DeployMission[] = []
      for (const mission of (current || [])) {
        updated.push(await (async () => {
          const isCompleted = isTerminalStatus(mission.status)
          let inRecoveryWindow = false
          if (isCompleted && mission.completedAt &&
              (Date.now() - mission.completedAt) > CACHE_TTL_MS) {
            const hasAnyLogs = (mission.clusterStatuses || []).some(cs => cs.logs && cs.logs.length > 0)
            const recoveryPolls = mission.logRecoveryPolls ?? 0
            if (hasAnyLogs) {
              if (recoveryPolls >= LOG_RECOVERY_EXTRA_POLLS) {
                return mission
              }
              inRecoveryWindow = true
            }
          }

          const pollCount = (mission.pollCount ?? 0) + 1

          const clusterTasks: Array<() => Promise<DeployClusterStatus>> =
            (mission.targetClusters || []).map((cluster) => async (): Promise<DeployClusterStatus> => {
              const prevStatus = (mission.clusterStatuses || []).find(cs => cs.cluster === cluster)
              return pollClusterStatus(cluster, mission, prevStatus)
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

          // Grace period (#6409)
          const elapsed = Date.now() - mission.startedAt
          if (isTerminalStatus(missionStatus) && elapsed < MIN_ACTIVE_MS) {
            missionStatus = 'deploying'
            const remaining = MIN_ACTIVE_MS - elapsed
            const GRACE_REPOLL_FUDGE_MS = 50
            const existing = graceRepollsRef.current.get(mission.id)
            if (existing) clearTimeout(existing)
            const handle = setTimeout(() => {
              graceRepollsRef.current.delete(mission.id)
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
            logRecoveryPolls: inRecoveryWindow
              ? (mission.logRecoveryPolls ?? 0) + 1
              : mission.logRecoveryPolls }
        })())
      }

      // Sort: active missions first, completed below
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

      if (allMissions.length > 0 && allMissions.every(m => isTerminalStatus(m.status))) {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = undefined
        }
      }
    } // end pollInner

    const INITIAL_POLL_DELAY_MS = 1000
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
        return
      }
      poll()
      startPolling()
    }, INITIAL_POLL_DELAY_MS)

    // #6641 — Page Visibility integration
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

    const graceRepolls = graceRepollsRef.current
    return () => {
      clearTimeout(initialTimeout)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      if (pollRef.current) clearInterval(pollRef.current)
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

export const __testables = {
  safeReplicaCount,
  isTerminalStatus,
  authHeaders,
  loadMissions,
  saveMissions,
  runWithConcurrency,
  MISSIONS_STORAGE_KEY,
  MAX_MISSIONS,
  MAX_STATUS_FAILURES,
  MAX_NETWORK_FAILURES,
  MIN_ACTIVE_MS,
  LOG_RECOVERY_EXTRA_POLLS,
  DEPLOY_POLL_MAX_CONCURRENCY,
}

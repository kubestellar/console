import { useState, useEffect, useCallback, useRef } from 'react'
import { useCardSubscribe } from '../lib/cardEvents'
import type { DeployStartedPayload } from '../lib/cardEvents'

export type DeployMissionStatus = 'launching' | 'deploying' | 'orbit' | 'abort' | 'partial'

export interface DeployClusterStatus {
  cluster: string
  status: 'pending' | 'applying' | 'running' | 'failed'
  replicas: number
  readyReplicas: number
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
}

const HISTORY_KEY = 'kubestellar-missions-history'
const POLL_INTERVAL_MS = 5000
const MAX_HISTORY = 50

function loadHistory(): DeployMission[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    // ignore
  }
  return []
}

function saveHistory(missions: DeployMission[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(missions.slice(0, MAX_HISTORY)))
}

/**
 * Hook for tracking deployment missions.
 * Subscribes to deploy:started events from the card event bus
 * and polls deploy status until all clusters report ready or failed.
 */
export function useDeployMissions() {
  const [activeMissions, setActiveMissions] = useState<DeployMission[]>([])
  const [history, setHistory] = useState<DeployMission[]>(loadHistory)
  const subscribe = useCardSubscribe()
  const pollRef = useRef<ReturnType<typeof setInterval>>()

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
        startedAt: p.timestamp,
      }
      setActiveMissions(prev => [mission, ...prev])
    })
    return unsub
  }, [subscribe])

  // Poll deploy status for active missions
  useEffect(() => {
    if (activeMissions.length === 0) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = undefined
      }
      return
    }

    const poll = async () => {
      const updated = await Promise.all(
        activeMissions.map(async (mission) => {
          if (mission.status === 'orbit' || mission.status === 'abort') return mission

          const statuses = await Promise.all(
            mission.targetClusters.map(async (cluster) => {
              try {
                const res = await fetch(
                  `/api/workloads/deploy-status/${encodeURIComponent(cluster)}/${encodeURIComponent(mission.namespace)}/${encodeURIComponent(mission.workload)}`
                )
                if (!res.ok) {
                  return { cluster, status: 'pending' as const, replicas: 0, readyReplicas: 0 }
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
                return {
                  cluster,
                  status,
                  replicas: data.replicas ?? 0,
                  readyReplicas: data.readyReplicas ?? 0,
                }
              } catch {
                return { cluster, status: 'pending' as const, replicas: 0, readyReplicas: 0 }
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

          return {
            ...mission,
            clusterStatuses: statuses,
            status: missionStatus,
            completedAt: missionStatus === 'orbit' || missionStatus === 'abort' ? Date.now() : undefined,
          }
        })
      )

      // Move completed missions to history
      const stillActive: DeployMission[] = []
      const newlyCompleted: DeployMission[] = []

      for (const m of updated) {
        if (m.status === 'orbit' || m.status === 'abort') {
          newlyCompleted.push(m)
        } else {
          stillActive.push(m)
        }
      }

      setActiveMissions(stillActive)
      if (newlyCompleted.length > 0) {
        setHistory(prev => {
          const next = [...newlyCompleted, ...prev].slice(0, MAX_HISTORY)
          saveHistory(next)
          return next
        })
      }
    }

    // Initial poll immediately
    poll()

    // Then poll on interval
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [activeMissions])

  const clearHistory = useCallback(() => {
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
  }, [])

  return {
    activeMissions,
    history,
    allMissions: [...activeMissions, ...history],
    hasActive: activeMissions.length > 0,
    clearHistory,
  }
}

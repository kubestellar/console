import { STORAGE_KEY_MISSIONS_ACTIVE, STORAGE_KEY_MISSIONS_HISTORY } from '../lib/constants'
import type { DeployMission } from './useDeployMissions.types'
import {
  MISSIONS_STORAGE_KEY,
  MAX_MISSIONS,
  isTerminalStatus,
  safeJsonParse,
} from './useDeployMissions.types'

export function loadMissions(): DeployMission[] {
  try {
    const stored = localStorage.getItem(MISSIONS_STORAGE_KEY)
    if (stored) {
      const parsed = safeJsonParse<DeployMission[]>(stored, [], 'missions storage')
      return (parsed || []).map(m => ({
        ...m,
        targetClusters: m.targetClusters || [],
        clusterStatuses: m.clusterStatuses || [],
      }))
    }
    // Migrate from old split keys
    const oldActive = localStorage.getItem(STORAGE_KEY_MISSIONS_ACTIVE)
    const oldHistory = localStorage.getItem(STORAGE_KEY_MISSIONS_HISTORY)
    if (oldActive || oldHistory) {
      const active = oldActive ? safeJsonParse<DeployMission[]>(oldActive, [], 'legacy active missions storage') : []
      const history = oldHistory ? safeJsonParse<DeployMission[]>(oldHistory, [], 'legacy mission history storage') : []
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

export function saveMissions(missions: DeployMission[]) {
  try {
    const clean = missions.slice(0, MAX_MISSIONS).map(m => ({
      ...m,
      clusterStatuses: (m.clusterStatuses || []).map(cs => ({
        ...cs,
        logs: isTerminalStatus(m.status) ? cs.logs : undefined,
      })),
    }))
    localStorage.setItem(MISSIONS_STORAGE_KEY, JSON.stringify(clean))
  } catch {
    // ignore quota / private-mode storage failures
  }
}

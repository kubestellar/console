/**
 * LaunchSequence.utils — Pure helper functions extracted from
 * LaunchSequence.tsx so the main component file stays under 400 lines.
 */

import type { Mission } from '../../hooks/useMissions'
import type { DeployPhase, MissionControlState, PhaseProgress, PhaseStatus } from './types'
import { isSafeProjectName } from './useMissionControl'

/** Terminal statuses that indicate a project is no longer in-flight */
export const TERMINAL_STATUSES: readonly string[] = ['completed', 'failed', 'skipped', 'cancelled']
/** Mission statuses that mean a failed deployment has been retried and is active again. */
export const RETRIED_MISSION_STATUSES = new Set(['pending', 'running', 'waiting_input', 'cancelling'])

export const LIVE_ACTIVITY_LOG_LIMIT = 8
export const LIVE_ACTIVITY_PROGRESS_MIN = 0
export const LIVE_ACTIVITY_PROGRESS_MAX = 100

/**
 * #6408 — Fallback phase builder used when `state.phases` is empty but
 * assignments still exist. Packs every assigned project into a single
 * "Phase 1: Deploy" so `LaunchSequence` actually runs something instead of
 * calling `onComplete()` on an empty list and telling the user the mission
 * succeeded with zero deployments.
 */
export function buildFallbackPhasesFromAssignments(
  state: MissionControlState,
): DeployPhase[] {
  const projectNames: string[] = []
  const seen = new Set<string>()
  for (const a of state.assignments) {
    for (const n of a.projectNames || []) {
      if (!seen.has(n)) {
        seen.add(n)
        projectNames.push(n)
      }
    }
  }
  if (projectNames.length === 0) return []
  return [{ phase: 1, name: 'Deploy', projectNames }]
}

export function getMissionStepLabel(mission: Mission): string {
  if (mission.currentStep === 'Reconnecting...' && mission.lastKnownStep) {
    return `${mission.lastKnownStep} (reconnecting...)`
  }
  return mission.currentStep || mission.description
}

export function getRecentActivityMessages(mission: Mission): Mission['messages'] {
  return (mission.messages || [])
    .filter((message) => message.role !== 'user')
    .slice(-LIVE_ACTIVITY_LOG_LIMIT)
}

/**
 * Build a content-based signature for phases so reinitialization triggers
 * when phase membership changes, not just when the phase count changes (#5508).
 */
export function computePhaseSignature(phases: MissionControlState['phases']): string {
  return phases
    .map((p) => `${p.phase}:${p.name}:${(p.projectNames || []).join(',')}`)
    .join('|')
}

/**
 * Recompute phase-level status from its project statuses.
 * Used by both the mission-monitor effect and the error catch path (#5507).
 */
export function derivePhaseStatus(phase: PhaseProgress): PhaseStatus {
  if (phase.projects.some((project) => project.status === 'running')) {
    return 'running'
  }
  const allDone = phase.projects.length > 0 && phase.projects.every(
    (project) => TERMINAL_STATUSES.includes(project.status)
  )
  if (allDone) {
    const anyFailed = phase.projects.some((project) => project.status === 'failed')
    return anyFailed ? 'failed' : 'completed'
  }
  if (phase.projects.some((project) => project.status === 'pending')) {
    return 'pending'
  }
  return phase.status
}

export function getUiSafeDisplayName(project: MissionControlState['projects'][number]): string {
  const displayNameRaw = typeof project.displayName === 'string'
    ? project.displayName.trim()
    : ''
  return isSafeProjectName(displayNameRaw) ? displayNameRaw : project.name
}

/**
 * LaunchSequence.types — Shared type definitions for the LaunchSequence
 * component and its extracted hook/sub-components.
 */

import type { MissionControlState, PhaseProgress } from './types'

export interface LaunchSequenceProps {
  state: MissionControlState
  onUpdateProgress: (progress: PhaseProgress[]) => void
  onComplete: (dashboardId?: string) => void
  /** Close the Mission Control dialog entirely */
  onClose?: () => void
  /** Initiate rollback of changes made by failed projects */
  onRollback?: () => void
}

export interface UnifiedMissionWorkload {
  projectName: string
  uiSafeDisplayName: string
  phase: number
  phaseName: string
  targetClusters: string[]
  prompt: string
}

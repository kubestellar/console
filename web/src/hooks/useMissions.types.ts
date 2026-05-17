import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { AgentInfo } from '../types/agent'

export type {
  MissionStatus,
  Mission,
  MissionMessage,
  MissionFeedback,
  MatchedResolution,
  StartMissionParams,
  PendingReviewEntry,
  SaveMissionParams,
  SavedMissionUpdates,
} from './useMissionTypes'
export { INACTIVE_MISSION_STATUSES, isActiveMission } from './useMissionTypes'
import type {
  Mission,
  MissionFeedback,
  PendingReviewEntry,
  SaveMissionParams,
  SavedMissionUpdates,
  StartMissionParams,
} from './useMissionTypes'

export interface QueuedMissionExecution {
  missionId: string
  enhancedPrompt: string
  params: { context?: Record<string, unknown>; type?: string; dryRun?: boolean }
  requiredTools: string[]
}

export interface MissionContextValue {
  missions: Mission[]
  activeMission: Mission | null
  isSidebarOpen: boolean
  isSidebarMinimized: boolean
  isFullScreen: boolean
  unreadMissionCount: number
  unreadMissionIds: Set<string>
  agents: AgentInfo[]
  selectedAgent: string | null
  defaultAgent: string | null
  agentsLoading: boolean
  isAIDisabled: boolean
  pendingReview: PendingReviewEntry | null
  pendingReviewQueue: PendingReviewEntry[]
  confirmPendingReview: (editedPrompt: string) => void
  cancelPendingReview: () => void
  startMission: (params: StartMissionParams) => string
  saveMission: (params: SaveMissionParams) => string
  runSavedMission: (missionId: string, cluster?: string) => void
  updateSavedMission: (missionId: string, updates: SavedMissionUpdates) => void
  sendMessage: (missionId: string, content: string) => void
  editAndResend: (missionId: string, messageId: string) => string | null
  retryPreflight: (missionId: string) => void
  cancelMission: (missionId: string) => void
  dismissMission: (missionId: string) => void
  renameMission: (missionId: string, newTitle: string) => void
  rateMission: (missionId: string, feedback: MissionFeedback) => void
  setActiveMission: (missionId: string | null) => void
  markMissionAsRead: (missionId: string) => void
  selectAgent: (agentName: string) => void
  connectToAgent: () => void
  toggleSidebar: () => void
  openSidebar: () => void
  closeSidebar: () => void
  minimizeSidebar: () => void
  expandSidebar: () => void
  setFullScreen: (isFullScreen: boolean) => void
}

export interface MissionActionBundle {
  startMission: (params: StartMissionParams) => string
  saveMission: (params: SaveMissionParams) => string
  runSavedMission: (missionId: string, cluster?: string) => void
  updateSavedMission: (missionId: string, updates: SavedMissionUpdates) => void
  sendMessage: (missionId: string, content: string) => void
  editAndResend: (missionId: string, messageId: string) => string | null
  retryPreflight: (missionId: string) => void
  cancelMission: (missionId: string) => void
  dismissMission: (missionId: string) => void
  renameMission: (missionId: string, newTitle: string) => void
  rateMission: (missionId: string, feedback: MissionFeedback) => void
  setActiveMission: (missionId: string | null) => void
  markMissionAsRead: (missionId: string) => void
  selectAgent: (agentName: string) => void
  connectToAgent: () => void
  toggleSidebar: () => void
  openSidebar: () => void
  closeSidebar: () => void
  minimizeSidebar: () => void
  expandSidebar: () => void
  handleSetFullScreen: (fullScreen: boolean) => void
  confirmPendingReview: (editedPrompt: string) => void
  cancelPendingReview: () => void
}

export type MissionStateSetter<T> = Dispatch<SetStateAction<T>>
export type MissionRef<T> = MutableRefObject<T>

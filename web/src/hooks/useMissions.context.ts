import { createContext, useContext } from 'react'
import type { Mission, MissionFeedback, PendingReviewEntry, StartMissionParams, SaveMissionParams, SavedMissionUpdates } from './useMissionTypes'
import type { AgentInfo } from '../types/agent'

// Re-exports from useMissionTypes (maintain public API)
export type {
  MissionStatus, Mission, MissionMessage, MissionFeedback, MatchedResolution,
  StartMissionParams, PendingReviewEntry, SaveMissionParams, SavedMissionUpdates,
} from './useMissionTypes'
export { INACTIVE_MISSION_STATUSES, isActiveMission } from './useMissionTypes'

/**
 * #7089 — Monotonic counter for generating unique request IDs. The previous
 * `claude-${Date.now()}` pattern could collide when two requests were sent
 * in the same millisecond (rapid sends, concurrent tabs). A monotonic counter
 * combined with a random suffix guarantees uniqueness within the same tab,
 * and the random suffix provides uniqueness across tabs.
 */
let requestIdCounter = 0
export function generateRequestId(prefix = 'claude'): string {
  requestIdCounter += 1
  return `${prefix}-${Date.now()}-${requestIdCounter}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`
}

export interface MissionContextValue {
  missions: Mission[]
  activeMission: Mission | null
  isSidebarOpen: boolean
  isSidebarMinimized: boolean
  isFullScreen: boolean
  /** Number of missions with unread updates */
  unreadMissionCount: number
  /** IDs of missions with unread updates */
  unreadMissionIds: Set<string>
  /** Available AI agents */
  agents: AgentInfo[]
  /** Currently selected agent */
  selectedAgent: string | null
  /** Default agent */
  defaultAgent: string | null
  /** Whether agents are loading */
  agentsLoading: boolean
  /** Whether AI is disabled (user selected 'none' or no agent) */
  isAIDisabled: boolean

  /**
   * Pending review state (#6455, #7087/#7101): when a mission is started
   * without skipReview, it is stashed here so the UI can show the
   * ConfirmMissionPromptDialog. Changed from a single slot to a queue so
   * concurrent mission requests don't overwrite each other. Call
   * `confirmPendingReview` with the (possibly edited) prompt to proceed,
   * or `cancelPendingReview` to discard the front of the queue.
   *
   * #7086/#7094/#7100 — Each queued entry includes a pre-generated
   * `missionId` so callers receive a valid ID synchronously, even before
   * the user confirms the review dialog.
   */
  pendingReview: PendingReviewEntry | null
  pendingReviewQueue: PendingReviewEntry[]
  confirmPendingReview: (editedPrompt: string) => void
  cancelPendingReview: () => void

  // Actions
  startMission: (params: StartMissionParams) => string
  saveMission: (params: SaveMissionParams) => string
  runSavedMission: (missionId: string, cluster?: string) => void
  updateSavedMission: (missionId: string, updates: SavedMissionUpdates) => void
  sendMessage: (missionId: string, content: string) => void
  /** Remove a user message and all subsequent messages, returning the content
   *  so the caller can populate the chat input for editing. (#10450) */
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

export const MissionContext = createContext<MissionContextValue | null>(null)

/**
 * Safe fallback for when useMissions is called outside MissionProvider.
 *
 * This can happen transiently during error-boundary recovery, stale chunk
 * re-evaluation, or portal rendering in BaseModal (createPortal to
 * document.body). Rather than throwing (which triggers cascading GA4
 * runtime errors on /insights), return a no-op stub so the UI degrades
 * gracefully until the provider tree re-mounts.
 */
const MISSIONS_FALLBACK: MissionContextValue = {
  missions: [],
  activeMission: null,
  isSidebarOpen: false,
  isSidebarMinimized: false,
  isFullScreen: false,
  unreadMissionCount: 0,
  unreadMissionIds: new Set<string>(),
  agents: [],
  selectedAgent: null,
  defaultAgent: null,
  agentsLoading: false,
  isAIDisabled: true,
  pendingReview: null,
  pendingReviewQueue: [],
  confirmPendingReview: () => {},
  cancelPendingReview: () => {},
  startMission: () => '',
  saveMission: () => '',
  runSavedMission: () => {},
  updateSavedMission: () => {},
  sendMessage: () => {},
  editAndResend: () => null,
  retryPreflight: () => {},
  cancelMission: () => {},
  dismissMission: () => {},
  renameMission: () => {},
  rateMission: () => {},
  setActiveMission: () => {},
  markMissionAsRead: () => {},
  selectAgent: () => {},
  connectToAgent: () => {},
  toggleSidebar: () => {},
  openSidebar: () => {},
  closeSidebar: () => {},
  minimizeSidebar: () => {},
  expandSidebar: () => {},
  setFullScreen: () => {}
}

export function useMissions() {
  const context = useContext(MissionContext)
  if (!context) {
    if (import.meta.env.DEV) {
      console.warn('useMissions was called outside MissionProvider — returning safe fallback')
    }
    return MISSIONS_FALLBACK
  }
  return context
}

import { emitMissionRated } from '../lib/analytics'
import type {
  MissionFeedback,
  SavedMissionUpdates,
  StartMissionParams,
} from './useMissionTypes'
import type { MissionProviderState, MissionStateUtils } from './useMissions.state'
import { NONE_AGENT, SELECTED_AGENT_KEY } from './useMissions.state'
import type { MissionConnectionApi } from './useMissions.connection'
import type { MissionExecutionApi } from './useMissions.execution'
import { logger } from '@/lib/logger'
import type { MissionActionBundle } from './useMissions.types'
import { createMissionStartActions } from './useMissions.start'
import { createMissionMessagingActions } from './useMissions.messaging'
import { areOptionalPollersSuppressed, isLocalAgentSuppressed } from '../lib/constants/network'

function isExpectedAgentUnavailable(error: unknown): boolean {
  if (!(isLocalAgentSuppressed() || areOptionalPollersSuppressed())) return false
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Agent unavailable')
}

export function createMissionActions(
  state: MissionProviderState,
  stateUtils: MissionStateUtils,
  connectionApi: Pick<MissionConnectionApi, 'ensureConnection' | 'wsSend'>,
  executionApi: Pick<MissionExecutionApi, 'executeMission' | 'preflightAndExecute'>,
): MissionActionBundle {
  const startActions = createMissionStartActions(state, stateUtils, executionApi)
  const messagingActions = createMissionMessagingActions(state, stateUtils, connectionApi)

  const { startMission, saveMission, runSavedMission, retryPreflight } = startActions
  const { sendMessage, editAndResend, cancelMission } = messagingActions

  const dismissMission = (missionId: string) => {
    cancelMission(missionId)
    for (const [requestId, mappedMissionId] of state.pendingRequests.current.entries()) {
      if (mappedMissionId === missionId) {
        state.pendingRequests.current.delete(requestId)
      }
    }
    state.lastStreamTimestamp.current.delete(missionId)
    state.streamSplitCounter.current.delete(missionId)
    state.toolsInFlight.current.delete(missionId)
    state.observedToolExecutions.current.delete(missionId)
    stateUtils.clearMissionStatusTimers(missionId)
    state.setMissions(prev => prev.filter(candidate => candidate.id !== missionId))
    if (state.activeMissionId === missionId) {
      state.setActiveMissionId(null)
    }
  }

  const renameMission = (missionId: string, newTitle: string) => {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    state.setMissions(prev => prev.map(candidate =>
      candidate.id === missionId
        ? { ...candidate, title: trimmed, updatedAt: new Date() }
        : candidate,
    ))
  }

  const updateSavedMission = (missionId: string, updates: SavedMissionUpdates) => {
    state.setMissions(prev => prev.map(candidate => {
      if (candidate.id !== missionId || candidate.status !== 'saved') return candidate
      const next = { ...candidate, updatedAt: new Date() }
      if (updates.description !== undefined) {
        next.description = updates.description
        if (next.importedFrom) {
          next.importedFrom = { ...next.importedFrom, description: updates.description }
        }
      }
      if (updates.steps !== undefined && next.importedFrom) {
        next.importedFrom = { ...next.importedFrom, steps: updates.steps }
      }
      if ('cluster' in updates) {
        next.cluster = updates.cluster || undefined
      }
      return next
    }))
  }

  const rateMission = (missionId: string, feedback: MissionFeedback) => {
    state.setMissions(prev => prev.map(candidate => {
      if (candidate.id === missionId) {
        emitMissionRated(candidate.type, feedback || 'neutral')
        return { ...candidate, feedback, updatedAt: new Date() }
      }
      return candidate
    }))
  }

  const setActiveMission = (missionId: string | null) => {
    state.setActiveMissionId(missionId)
    if (missionId) {
      state.setIsSidebarOpen(true)
      state.setUnreadMissionIds(prev => {
        if (!prev.has(missionId)) return prev
        const next = new Set(prev)
        next.delete(missionId)
        return next
      })
    }
  }

  const markMissionAsRead = (missionId: string) => {
    state.setUnreadMissionIds(prev => {
      if (!prev.has(missionId)) return prev
      const next = new Set(prev)
      next.delete(missionId)
      return next
    })
  }

  const selectAgent = (agentName: string) => {
    localStorage.setItem(SELECTED_AGENT_KEY, agentName)
    state.setSelectedAgent(agentName)
    if (agentName === NONE_AGENT) return
    if (state.selectAgentPending.current !== null) {
      state.selectAgentPending.current = agentName
      return
    }
    state.selectAgentPending.current = agentName
    connectionApi.ensureConnection().then(() => {
      const agentToSend = state.selectAgentPending.current ?? agentName
      state.selectAgentPending.current = null
      connectionApi.wsSend(JSON.stringify({
        id: `select-agent-${Date.now()}`,
        type: 'select_agent',
        payload: { agent: agentToSend },
      }), () => {
        logger.error('[Missions] Failed to send agent selection after retries')
      })
    }).catch((error: unknown) => {
      state.selectAgentPending.current = null
      if (isExpectedAgentUnavailable(error)) {
        logger.debug('[Missions] Agent selection skipped because the agent is unavailable in this deployment')
        return
      }
      logger.error('[Missions] Failed to select agent:', error)
    })
  }

  const connectToAgent = () => {
    state.wsReconnectAttempts.current = 0
    connectionApi.ensureConnection().catch((error: unknown) => {
      if (isExpectedAgentUnavailable(error)) {
        logger.debug('[Missions] Agent connection skipped because the agent is unavailable in this deployment')
        return
      }
      logger.error('[Missions] Failed to connect to agent:', error)
    })
  }

  const toggleSidebar = () => state.setIsSidebarOpen(prev => !prev)
  const openSidebar = () => {
    state.setIsSidebarOpen(true)
    state.setIsSidebarMinimized(false)
  }
  const closeSidebar = () => {
    state.setIsSidebarOpen(false)
    state.setIsFullScreen(false)
  }
  const minimizeSidebar = () => state.setIsSidebarMinimized(true)
  const expandSidebar = () => state.setIsSidebarMinimized(false)
  const handleSetFullScreen = (fullScreen: boolean) => {
    state.setIsFullScreen(fullScreen)
  }

  const confirmPendingReview = (editedPrompt: string) => {
    const front = state.pendingReviewQueue[0]
    if (!front) return
    state.setPendingReviewQueue(prev => prev.slice(1))
    const params: StartMissionParams = {
      ...front.params,
      initialPrompt: editedPrompt,
      skipReview: true,
      context: { ...front.params.context, __preGeneratedMissionId: front.missionId },
    }
    startMission(params)
  }

  const cancelPendingReview = () => {
    state.setPendingReviewQueue(prev => prev.slice(1))
  }

  return {
    startMission,
    saveMission,
    runSavedMission,
    updateSavedMission,
    sendMessage,
    editAndResend,
    retryPreflight,
    cancelMission,
    dismissMission,
    renameMission,
    rateMission,
    setActiveMission,
    markMissionAsRead,
    selectAgent,
    connectToAgent,
    toggleSidebar,
    openSidebar,
    closeSidebar,
    minimizeSidebar,
    expandSidebar,
    handleSetFullScreen,
    confirmPendingReview,
    cancelPendingReview,
  }
}

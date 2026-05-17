import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { ConfirmMissionPromptDialog } from '../components/missions/ConfirmMissionPromptDialog'
import { emitMissionError } from '../lib/analytics'
import {
  MISSION_TIMEOUT_MS,
  MISSION_TIMEOUT_CHECK_INTERVAL_MS,
  MISSION_INACTIVITY_TIMEOUT_MS,
} from './useMissions.constants'
import {
  createMissionStateUtils,
  useMissionProviderState,
  CROSS_TAB_ECHO_IGNORE_MS,
  MISSIONS_STORAGE_KEY,
} from './useMissions.state'
import { createMissionConnectionApi } from './useMissions.connection'
import { createMissionExecutionApi } from './useMissions.execution'
import { createMissionMessageHandler } from './useMissions.messages'
import { createMissionActions } from './useMissions.actions'
import {
  loadMissions,
  mergeMissions,
  saveMissions,
  saveUnreadMissionIds,
} from './useMissionStorage'
import { getMissionMessages, isStaleAgentErrorMessage } from './useMissions.helpers'
import type { MissionActionBundle, MissionContextValue } from './useMissions.types'
import type { MissionStatus } from './useMissionTypes'
import { logger } from '@/lib/logger'

const MissionContext = createContext<MissionContextValue | null>(null)

export function MissionProvider({ children }: { children: ReactNode }) {
  const state = useMissionProviderState()
  const stateUtils = createMissionStateUtils(state)
  const connectionApi = createMissionConnectionApi(state, stateUtils)
  const executionApi = createMissionExecutionApi(state, stateUtils, connectionApi)
  const actions = createMissionActions(state, stateUtils, connectionApi, executionApi)
  const handleAgentMessage = createMissionMessageHandler(state, stateUtils)

  useEffect(() => {
    state.handleAgentMessageRef.current = handleAgentMessage
  }, [handleAgentMessage, state.handleAgentMessageRef])

  useEffect(() => {
    let releasedLock = false

    for (const [missionId] of state.missionToolLocks.current.entries()) {
      const mission = state.missions.find(candidate => candidate.id === missionId)
      if (!mission || mission.status === 'completed' || mission.status === 'failed' || mission.status === 'cancelled') {
        state.missionToolLocks.current.delete(missionId)
        releasedLock = true
      }
    }

    if (releasedLock || state.queuedMissionExecutions.current.length > 0) {
      executionApi.drainQueuedMissionExecutions()
    }
  }, [state.missions])

  useEffect(() => {
    if (state.suppressNextSaveRef.current) {
      state.suppressNextSaveRef.current = false
      return
    }
    const timer = setTimeout(() => {
      state.lastWrittenAtRef.current = Date.now()
      saveMissions(state.missions)
    }, 500)
    return () => clearTimeout(timer)
  }, [state.lastWrittenAtRef, state.missions, state.suppressNextSaveRef])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MISSIONS_STORAGE_KEY) return
      const sinceWrite = Date.now() - (state.lastWrittenAtRef.current ?? 0)
      if (sinceWrite < CROSS_TAB_ECHO_IGNORE_MS) return
      if (state.unmountedRef.current) return
      if (e.newValue === null) {
        try {
          state.suppressNextSaveRef.current = true
          state.setMissions([])
          state.setUnreadMissionIds(new Set<string>())
          state.setActiveMissionId(null)
          for (const timeout of state.cancelTimeouts.current.values()) {
            clearTimeout(timeout)
          }
          state.cancelTimeouts.current.clear()
          for (const timeout of state.waitingInputTimeouts.current.values()) {
            clearTimeout(timeout)
          }
          state.waitingInputTimeouts.current.clear()
          state.cancelIntents.current.clear()
          state.pendingRequests.current.clear()
          state.lastStreamTimestamp.current.clear()
          state.toolsInFlight.current.clear()
          state.streamSplitCounter.current.clear()
          for (const timers of state.missionStatusTimers.current.values()) {
            for (const handle of timers || []) {
              clearTimeout(handle)
            }
          }
          state.missionStatusTimers.current.clear()
        } catch (error: unknown) {
          logger.warn('[Missions] Cross-tab remote reset detected — failed to clear local mission state to match:', error)
        }
        return
      }
      try {
        const reloaded = loadMissions()
        state.suppressNextSaveRef.current = true
        state.setMissions(prev => mergeMissions(prev, reloaded))
        const reloadedIds = new Set(reloaded.map(mission => mission.id))
        state.setActiveMissionId(prev => (prev && !reloadedIds.has(prev) ? null : prev))
        state.setUnreadMissionIds(prev => {
          const next = new Set([...prev].filter(id => reloadedIds.has(id)))
          return next.size === prev.size ? prev : next
        })
      } catch (error: unknown) {
        logger.warn('[Missions] issue 6668 — failed to reload from cross-tab write:', error)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    saveUnreadMissionIds(state.unreadMissionIds)
  }, [state.unreadMissionIds])

  const prevAgentConnected = useRef(state.isAgentConnected)
  useEffect(() => {
    const wasConnected = prevAgentConnected.current
    prevAgentConnected.current = state.isAgentConnected
    if (!wasConnected && state.isAgentConnected) {
      state.setMissions(prev => {
        const hasStale = prev.some(mission => mission.status === 'failed' && (mission.messages || []).some(isStaleAgentErrorMessage))
        if (!hasStale) return prev
        return prev.map(mission => {
          if (mission.status !== 'failed') return mission
          if (!(mission.messages || []).some(isStaleAgentErrorMessage)) return mission
          const cleanedMessages = (mission.messages || []).filter(message => !isStaleAgentErrorMessage(message))
          return {
            ...mission,
            status: 'saved' as MissionStatus,
            currentStep: undefined,
            messages: cleanedMessages,
          }
        })
      })
    }
  }, [state.isAgentConnected, state.setMissions])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()

      state.setMissions(prev => {
        const hasIssue = prev.some(mission => {
          if (mission.status !== 'running') return false
          const openTools = state.toolsInFlight.current.get(mission.id) ?? 0
          if (openTools > 0) {
            if ((now - new Date(mission.updatedAt).getTime()) > MISSION_TIMEOUT_MS) return true
            return false
          }
          if ((now - new Date(mission.updatedAt).getTime()) > MISSION_TIMEOUT_MS) return true
          const lastStreamTs = state.lastStreamTimestamp.current.get(mission.id)
          if (lastStreamTs && (now - lastStreamTs) > MISSION_INACTIVITY_TIMEOUT_MS) return true
          return false
        })
        if (!hasIssue) return prev

        return prev.map(mission => {
          if (mission.status !== 'running') return mission

          const elapsed = now - new Date(mission.updatedAt).getTime()
          const lastStreamTs = state.lastStreamTimestamp.current.get(mission.id)
          const openTools = state.toolsInFlight.current.get(mission.id) ?? 0
          const isInactive = openTools === 0 && !!lastStreamTs && (now - lastStreamTs) > MISSION_INACTIVITY_TIMEOUT_MS
          const isTimedOut = elapsed > MISSION_TIMEOUT_MS

          if (!isTimedOut && !isInactive) return mission

          for (const [requestId, mappedMissionId] of state.pendingRequests.current.entries()) {
            if (mappedMissionId === mission.id) state.pendingRequests.current.delete(requestId)
          }
          state.lastStreamTimestamp.current.delete(mission.id)

          emitMissionError(
            mission.type,
            isInactive ? 'mission_inactivity' : 'mission_timeout',
            isInactive
              ? `stalled_after_${Math.round((now - (lastStreamTs ?? now)) / 1000)}s`
              : `elapsed_${Math.round(elapsed / 1000)}s`,
          )

          const errorContent = isInactive
            ? `**Agent Not Responding**\n\nThe AI agent started responding but stopped for over ${Math.round(MISSION_INACTIVITY_TIMEOUT_MS / 60_000)} minutes. This usually means the agent is stuck waiting for a tool call to return (e.g., a Kubernetes API call or APISIX gateway request that is not responding).\n\nYou can:\n- **Retry** the mission — the issue may be transient\n- **Check cluster connectivity** — ensure the target cluster API server is reachable\n- **Cancel** and try a simpler or more specific request`
            : `**Mission Timed Out**\n\nThis mission has been running for over ${Math.round(MISSION_TIMEOUT_MS / 60_000)} minutes without completing. It has been automatically stopped.\n\nYou can:\n- **Retry** the mission with the same or a different prompt\n- **Try a simpler request** that requires less processing\n- **Check your AI provider** configuration in [Settings](/settings)`

          return {
            ...mission,
            status: 'failed' as MissionStatus,
            currentStep: undefined,
            updatedAt: new Date(),
            messages: [
              ...getMissionMessages(mission.messages),
              {
                id: `msg-timeout-${Date.now()}-${mission.id}`,
                role: 'system' as const,
                content: errorContent,
                timestamp: new Date(),
              },
            ],
          }
        })
      })
    }, MISSION_TIMEOUT_CHECK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [])

  const activeMission = state.missions.find(mission => mission.id === state.activeMissionId) || null

  useEffect(() => {
    const cancelTimeoutsRef = state.cancelTimeouts.current
    const cancelIntentsRef = state.cancelIntents.current
    const pendingRequestsRef = state.pendingRequests.current
    const toolsInFlightRef = state.toolsInFlight.current
    const lastStreamTimestampRef = state.lastStreamTimestamp.current
    const streamSplitCounterRef = state.streamSplitCounter.current
    const waitingInputTimeoutsRef = state.waitingInputTimeouts.current
    const wsSendRetryTimersRef = state.wsSendRetryTimers.current
    const missionStatusTimersRef = state.missionStatusTimers.current
    return () => {
      state.unmountedRef.current = true
      if (state.wsReconnectTimer.current) {
        clearTimeout(state.wsReconnectTimer.current)
        state.wsReconnectTimer.current = null
      }
      for (const handle of wsSendRetryTimersRef || []) {
        clearTimeout(handle)
      }
      wsSendRetryTimersRef.clear()
      for (const timeout of cancelTimeoutsRef.values()) {
        clearTimeout(timeout)
      }
      cancelTimeoutsRef.clear()
      cancelIntentsRef.clear()
      pendingRequestsRef.clear()
      toolsInFlightRef.clear()
      lastStreamTimestampRef.clear()
      streamSplitCounterRef.clear()
      for (const timeout of waitingInputTimeoutsRef.values()) {
        clearTimeout(timeout)
      }
      waitingInputTimeoutsRef.clear()
      for (const timers of missionStatusTimersRef.values()) {
        for (const handle of timers || []) {
          clearTimeout(handle)
        }
      }
      missionStatusTimersRef.clear()
      const dyingWs = state.wsRef.current
      if (dyingWs) {
        dyingWs.onopen = null
        dyingWs.onmessage = null
        dyingWs.onerror = null
        dyingWs.onclose = null
        dyingWs.close()
      }
    }
  }, [])

  const handlersRef = useRef<MissionActionBundle>(actions)
  handlersRef.current = actions

  const stableHandlers = useMemo(() => ({
    startMission: (...args: Parameters<MissionActionBundle['startMission']>) => handlersRef.current.startMission(...args),
    saveMission: (...args: Parameters<MissionActionBundle['saveMission']>) => handlersRef.current.saveMission(...args),
    runSavedMission: (...args: Parameters<MissionActionBundle['runSavedMission']>) => handlersRef.current.runSavedMission(...args),
    updateSavedMission: (...args: Parameters<MissionActionBundle['updateSavedMission']>) => handlersRef.current.updateSavedMission(...args),
    sendMessage: (...args: Parameters<MissionActionBundle['sendMessage']>) => handlersRef.current.sendMessage(...args),
    editAndResend: (...args: Parameters<MissionActionBundle['editAndResend']>) => handlersRef.current.editAndResend(...args),
    retryPreflight: (...args: Parameters<MissionActionBundle['retryPreflight']>) => handlersRef.current.retryPreflight(...args),
    cancelMission: (...args: Parameters<MissionActionBundle['cancelMission']>) => handlersRef.current.cancelMission(...args),
    dismissMission: (...args: Parameters<MissionActionBundle['dismissMission']>) => handlersRef.current.dismissMission(...args),
    renameMission: (...args: Parameters<MissionActionBundle['renameMission']>) => handlersRef.current.renameMission(...args),
    rateMission: (...args: Parameters<MissionActionBundle['rateMission']>) => handlersRef.current.rateMission(...args),
    setActiveMission: (...args: Parameters<MissionActionBundle['setActiveMission']>) => handlersRef.current.setActiveMission(...args),
    markMissionAsRead: (...args: Parameters<MissionActionBundle['markMissionAsRead']>) => handlersRef.current.markMissionAsRead(...args),
    selectAgent: (...args: Parameters<MissionActionBundle['selectAgent']>) => handlersRef.current.selectAgent(...args),
    connectToAgent: (...args: Parameters<MissionActionBundle['connectToAgent']>) => handlersRef.current.connectToAgent(...args),
    toggleSidebar: () => handlersRef.current.toggleSidebar(),
    openSidebar: () => handlersRef.current.openSidebar(),
    closeSidebar: () => handlersRef.current.closeSidebar(),
    minimizeSidebar: () => handlersRef.current.minimizeSidebar(),
    expandSidebar: () => handlersRef.current.expandSidebar(),
    setFullScreen: (fullScreen: boolean) => handlersRef.current.handleSetFullScreen(fullScreen),
    confirmPendingReview: (editedPrompt: string) => handlersRef.current.confirmPendingReview(editedPrompt),
    cancelPendingReview: () => handlersRef.current.cancelPendingReview(),
  }), [])

  const contextValue = useMemo(() => ({
    missions: state.missions,
    activeMission,
    isSidebarOpen: state.isSidebarOpen,
    isSidebarMinimized: state.isSidebarMinimized,
    isFullScreen: state.isFullScreen,
    unreadMissionCount: state.unreadMissionIds.size,
    unreadMissionIds: state.unreadMissionIds,
    agents: state.agents,
    selectedAgent: state.selectedAgent,
    defaultAgent: state.defaultAgent,
    agentsLoading: state.agentsLoading,
    isAIDisabled: state.selectedAgent === 'none' || !state.selectedAgent,
    pendingReview: state.pendingReviewQueue[0] ?? null,
    pendingReviewQueue: state.pendingReviewQueue,
    ...stableHandlers,
  }), [
    activeMission,
    stableHandlers,
    state.agents,
    state.agentsLoading,
    state.defaultAgent,
    state.isFullScreen,
    state.isSidebarMinimized,
    state.isSidebarOpen,
    state.missions,
    state.pendingReviewQueue,
    state.selectedAgent,
    state.unreadMissionIds,
  ])

  return (
    <MissionContext.Provider value={contextValue}>
      {children}
      {state.pendingReviewQueue.length > 0 && (
        <ConfirmMissionPromptDialog
          key={state.pendingReviewQueue[0].missionId}
          open={state.pendingReviewQueue.length > 0}
          missionTitle={state.pendingReviewQueue[0].params.title}
          missionDescription={state.pendingReviewQueue[0].params.description}
          initialPrompt={state.pendingReviewQueue[0].params.initialPrompt}
          onCancel={actions.cancelPendingReview}
          onConfirm={actions.confirmPendingReview}
        />
      )}
    </MissionContext.Provider>
  )
}

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
  setFullScreen: () => {},
}

export function useMissions() {
  const context = useContext(MissionContext)
  if (!context) {
    if (import.meta.env.DEV) {
      logger.warn('useMissions was called outside MissionProvider — returning safe fallback')
    }
    return MISSIONS_FALLBACK
  }
  return context
}

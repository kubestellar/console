import { useEffect, useRef, useState } from 'react'
import type { AgentInfo } from '../types/agent'
import { useLocalAgent } from './useLocalAgent'
import type {
  Mission,
  MissionStatus,
  PendingReviewEntry,
} from './useMissionTypes'
import {
  MISSIONS_STORAGE_KEY,
  CROSS_TAB_ECHO_IGNORE_MS,
  SELECTED_AGENT_KEY,
  loadMissions,
  loadUnreadMissionIds,
} from './useMissionStorage'
import {
  WAITING_INPUT_TIMEOUT_MS,
} from './useMissions.constants'
import { emitMissionError } from '../lib/analytics'
import { getMissionMessages, generateMessageId } from './useMissions.helpers'

export const ACTIVE_MISSION_STORAGE_KEY = 'kc_active_mission_id'
export const SIDEBAR_OPEN_STORAGE_KEY = 'kc_mission_sidebar_open'
export const NONE_AGENT = 'none'

export function useMissionProviderState() {
  const [missions, setMissions] = useState<Mission[]>(() => loadMissions())
  const { isConnected: isAgentConnected } = useLocalAgent()
  const [activeMissionId, setActiveMissionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_MISSION_STORAGE_KEY) || null
    } catch {
      return null
    }
  })
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      const persisted = localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY)
      if (persisted !== null) {
        return persisted === 'true'
      }
      localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, 'false')
      return false
    } catch {
      return false
    }
  })
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [pendingReviewQueue, setPendingReviewQueue] = useState<PendingReviewEntry[]>([])
  const [unreadMissionIds, setUnreadMissionIds] = useState<Set<string>>(() => loadUnreadMissionIds())
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [defaultAgent, setDefaultAgent] = useState<string | null>(null)
  const [agentsLoading, setAgentsLoading] = useState(false)

  const unmountedRef = useRef(false)
  const lastWrittenAtRef = useRef<number>(0)
  const suppressNextSaveRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingRequests = useRef<Map<string, string>>(new Map())
  const lastStreamTimestamp = useRef<Map<string, number>>(new Map())
  const cancelTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const cancelIntents = useRef<Set<string>>(new Set())
  const waitingInputTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const missionsRef = useRef<Mission[]>(missions)
  const activeMissionIdRef = useRef(activeMissionId)
  const isSidebarOpenRef = useRef(isSidebarOpen)
  const selectedAgentRef = useRef(selectedAgent)
  const defaultAgentRef = useRef(defaultAgent)
  const handleAgentMessageRef = useRef<(message: { id: string; type: string; payload?: unknown }) => void>(() => {})
  const wsReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wsReconnectAttempts = useRef(0)
  const connectionEstablished = useRef(false)
  const toolsInFlight = useRef<Map<string, number>>(new Map())
  const streamSplitCounter = useRef<Map<string, number>>(new Map())
  const wsOpenEpoch = useRef(0)
  const wsSendRetryTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const missionStatusTimers = useRef<Map<string, Set<ReturnType<typeof setTimeout>>>>(new Map())
  const queuedMissionExecutions = useRef<Array<import('./useMissions.types').QueuedMissionExecution>>([])
  const missionToolLocks = useRef<Map<string, string[]>>(new Map())
  const executingMissions = useRef<Set<string>>(new Set())
  const selectAgentPending = useRef<string | null>(null)

  useEffect(() => {
    missionsRef.current = missions
  }, [missions])

  useEffect(() => {
    activeMissionIdRef.current = activeMissionId
    try {
      if (activeMissionId) {
        localStorage.setItem(ACTIVE_MISSION_STORAGE_KEY, activeMissionId)
      } else {
        localStorage.removeItem(ACTIVE_MISSION_STORAGE_KEY)
      }
    } catch {
      // localStorage unavailable
    }
  }, [activeMissionId])

  useEffect(() => {
    isSidebarOpenRef.current = isSidebarOpen
    try {
      localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(isSidebarOpen))
    } catch {
      // localStorage unavailable
    }
  }, [isSidebarOpen])

  useEffect(() => {
    selectedAgentRef.current = selectedAgent
  }, [selectedAgent])

  useEffect(() => {
    defaultAgentRef.current = defaultAgent
  }, [defaultAgent])

  return {
    missions,
    setMissions,
    isAgentConnected,
    activeMissionId,
    setActiveMissionId,
    isSidebarOpen,
    setIsSidebarOpen,
    isSidebarMinimized,
    setIsSidebarMinimized,
    isFullScreen,
    setIsFullScreen,
    pendingReviewQueue,
    setPendingReviewQueue,
    unreadMissionIds,
    setUnreadMissionIds,
    agents,
    setAgents,
    selectedAgent,
    setSelectedAgent,
    defaultAgent,
    setDefaultAgent,
    agentsLoading,
    setAgentsLoading,
    unmountedRef,
    lastWrittenAtRef,
    suppressNextSaveRef,
    wsRef,
    pendingRequests,
    lastStreamTimestamp,
    cancelTimeouts,
    cancelIntents,
    waitingInputTimeouts,
    missionsRef,
    activeMissionIdRef,
    isSidebarOpenRef,
    selectedAgentRef,
    defaultAgentRef,
    handleAgentMessageRef,
    wsReconnectTimer,
    wsReconnectAttempts,
    connectionEstablished,
    toolsInFlight,
    streamSplitCounter,
    wsOpenEpoch,
    wsSendRetryTimers,
    missionStatusTimers,
    queuedMissionExecutions,
    missionToolLocks,
    executingMissions,
    selectAgentPending,
  }
}

export type MissionProviderState = ReturnType<typeof useMissionProviderState>

export function createMissionStateUtils(state: MissionProviderState) {
  const markMissionAsUnread = (missionId: string) => {
    if (missionId !== state.activeMissionIdRef.current || !state.isSidebarOpenRef.current) {
      state.setUnreadMissionIds(prev => {
        const next = new Set(prev)
        next.add(missionId)
        return next
      })
    }
  }

  const clearMissionStatusTimers = (missionId: string) => {
    const timers = state.missionStatusTimers.current.get(missionId)
    if (timers) {
      for (const handle of timers) {
        clearTimeout(handle)
      }
      state.missionStatusTimers.current.delete(missionId)
    }
  }

  const clearWaitingInputTimeout = (missionId: string) => {
    const timeoutHandle = state.waitingInputTimeouts.current.get(missionId)
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      state.waitingInputTimeouts.current.delete(missionId)
    }
  }

  const startWaitingInputTimeout = (missionId: string) => {
    clearWaitingInputTimeout(missionId)
    const handle = setTimeout(() => {
      state.waitingInputTimeouts.current.delete(missionId)
      for (const [requestId, mappedMissionId] of state.pendingRequests.current.entries()) {
        if (mappedMissionId === missionId) {
          state.pendingRequests.current.delete(requestId)
        }
      }
      state.lastStreamTimestamp.current.delete(missionId)
      state.setMissions(prev => prev.map(mission => {
        if (mission.id !== missionId || mission.status !== 'waiting_input') {
          return mission
        }
        emitMissionError(
          mission.type,
          'waiting_input_timeout',
          `timeout_after_${Math.round(WAITING_INPUT_TIMEOUT_MS / 1000)}s`,
        )
        return {
          ...mission,
          status: 'failed' as MissionStatus,
          currentStep: undefined,
          updatedAt: new Date(),
          messages: [
            ...getMissionMessages(mission.messages),
            {
              id: `msg-waiting-timeout-${Date.now()}-${mission.id}`,
              role: 'system' as const,
              content: `**No response from agent — mission timed out waiting for input.**\n\nThe agent finished streaming but never delivered a final result within ${Math.round(WAITING_INPUT_TIMEOUT_MS / 60_000)} minutes. This usually means the final result message was lost or the agent disconnected silently.\n\nYou can:\n- **Retry** the mission — the issue may be transient\n- **Check your agent** — make sure it is still running and reachable\n- **Send a new message** to continue the conversation`,
              timestamp: new Date(),
            },
          ],
        }
      }))
    }, WAITING_INPUT_TIMEOUT_MS)
    state.waitingInputTimeouts.current.set(missionId, handle)
  }

  const finalizeCancellation = (missionId: string, message: string) => {
    const timeoutHandle = state.cancelTimeouts.current.get(missionId)
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      state.cancelTimeouts.current.delete(missionId)
    }
    state.cancelIntents.current.delete(missionId)
    for (const [requestId, mappedMissionId] of state.pendingRequests.current.entries()) {
      if (mappedMissionId === missionId) {
        state.pendingRequests.current.delete(requestId)
      }
    }
    state.lastStreamTimestamp.current.delete(missionId)
    state.streamSplitCounter.current.delete(missionId)
    state.toolsInFlight.current.delete(missionId)
    clearWaitingInputTimeout(missionId)
    clearMissionStatusTimers(missionId)

    state.setMissions(prev => prev.map(mission => {
      if (mission.id !== missionId) return mission
      if (mission.status === 'completed' || mission.status === 'failed' || mission.status === 'cancelled') {
        return mission
      }
      return {
        ...mission,
        status: 'cancelled' as MissionStatus,
        currentStep: undefined,
        updatedAt: new Date(),
        messages: [
          ...getMissionMessages(mission.messages),
          {
            id: generateMessageId(),
            role: 'system',
            content: message,
            timestamp: new Date(),
          },
        ],
      }
    }))
  }

  return {
    markMissionAsUnread,
    clearMissionStatusTimers,
    clearWaitingInputTimeout,
    startWaitingInputTimeout,
    finalizeCancellation,
  }
}

export type MissionStateUtils = ReturnType<typeof createMissionStateUtils>

export {
  CROSS_TAB_ECHO_IGNORE_MS,
  MISSIONS_STORAGE_KEY,
  SELECTED_AGENT_KEY,
}

import { getDemoMode } from './useDemoMode'
import { LOCAL_AGENT_WS_URL } from '../lib/constants'
import { appendWsAuthToken } from '../lib/utils/wsAuth'
import {
  MISSION_RECONNECT_DELAY_MS,
  MISSION_RECONNECT_MAX_AGE_MS,
  MAX_RESENT_MESSAGES,
  WS_RECONNECT_INITIAL_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
  WS_RECONNECT_MAX_RETRIES,
  WS_CONNECTION_TIMEOUT_MS,
} from './useMissions.constants'
import type { MissionStatus } from './useMissionTypes'
import {
  generateMessageId,
  generateRequestId,
  getMissionMessages,
} from './useMissions.helpers'
import type { MissionProviderState, MissionStateUtils } from './useMissions.state'
import { logger } from '@/lib/logger'

export function createMissionConnectionApi(
  state: MissionProviderState,
  stateUtils: MissionStateUtils,
) {
  const fetchAgents = () => {
    if (state.wsRef.current?.readyState === WebSocket.OPEN) {
      state.wsRef.current.send(JSON.stringify({
        id: `list-agents-${Date.now()}`,
        type: 'list_agents',
      }))
    }
  }

  const wsSend = (data: string, onFailure?: () => void): void => {
    let retries = 0
    const WS_SEND_CONNECTING_RETRY_DELAY_MS = 250
    const WS_SEND_CONNECTING_MAX_RETRIES = 12

    const trySend = () => {
      if (state.unmountedRef.current) return
      if (state.wsRef.current?.readyState === WebSocket.OPEN) {
        state.wsRef.current.send(data)
        return
      }
      const isConnecting = state.wsRef.current?.readyState === WebSocket.CONNECTING
      const maxRetries = isConnecting ? WS_SEND_CONNECTING_MAX_RETRIES : 3
      const delay = isConnecting ? WS_SEND_CONNECTING_RETRY_DELAY_MS : 300

      if (retries < maxRetries) {
        retries += 1
        const handle = setTimeout(() => {
          state.wsSendRetryTimers.current.delete(handle)
          trySend()
        }, delay)
        state.wsSendRetryTimers.current.add(handle)
      } else {
        logger.error('[Missions] WebSocket send failed after retries — socket not open')
        if (!state.unmountedRef.current) {
          onFailure?.()
        }
      }
    }

    trySend()
  }

  const ensureConnection = () => {
    if (getDemoMode()) {
      return Promise.reject(new Error('Agent unavailable in demo mode'))
    }
    if (state.unmountedRef.current) {
      return Promise.reject(new Error('MissionProvider unmounted'))
    }
    if (state.wsRef.current?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    return new Promise<void>(async (resolve, reject) => {
      state.setAgentsLoading(true)

      const timeout = setTimeout(() => {
        const ws = state.wsRef.current
        if (ws) {
          ws.onclose = null
          ws.onerror = null
          ws.onopen = null
          ws.onmessage = null
          ws.close()
          state.wsRef.current = null
        }
        state.setAgentsLoading(false)
        reject(new Error('CONNECTION_TIMEOUT'))
      }, WS_CONNECTION_TIMEOUT_MS)

      try {
        state.connectionEstablished.current = false
        state.wsRef.current = new WebSocket(await appendWsAuthToken(LOCAL_AGENT_WS_URL))

        state.wsRef.current.onopen = () => {
          clearTimeout(timeout)
          const epoch = ++state.wsOpenEpoch.current
          fetchAgents()

          const missionsToReconnect: import('./useMissionTypes').Mission[] = []
          const missionsToFailDuplicate = new Set<string>()
          const missionsToMarkStale = new Set<string>()
          const reconnectCandidates = (state.missionsRef.current || []).filter(mission =>
            (mission.status === 'running' || mission.status === 'waiting_input') && mission.context?.needsReconnect,
          )
          const now = Date.now()

          for (const mission of reconnectCandidates) {
            const ageMs = now - new Date(mission.updatedAt).getTime()
            if (ageMs > MISSION_RECONNECT_MAX_AGE_MS) {
              missionsToMarkStale.add(mission.id)
            } else if (mission.context?.reconnectAttempted) {
              missionsToFailDuplicate.add(mission.id)
            } else {
              missionsToReconnect.push(mission)
            }
          }

          const waitingInputMissionIds = new Set(
            (state.missionsRef.current || [])
              .filter(mission => mission.status === 'waiting_input' && mission.context?.needsReconnect)
              .map(mission => mission.id),
          )

          state.setMissions(prev => {
            if (reconnectCandidates.length === 0) {
              return prev
            }
            return prev.map(mission => {
              if (!mission.context?.needsReconnect) return mission
              if (missionsToMarkStale.has(mission.id)) {
                const missionMessages = getMissionMessages(mission.messages)
                const lastMessage = missionMessages[missionMessages.length - 1]
                const lastWasSuccessfulAssistant =
                  lastMessage !== undefined &&
                  lastMessage.role === 'assistant' &&
                  lastMessage.content.trim().length > 0

                if (lastWasSuccessfulAssistant) {
                  return {
                    ...mission,
                    status: 'completed' as MissionStatus,
                    currentStep: undefined,
                    updatedAt: new Date(),
                    context: { ...mission.context, needsReconnect: false },
                    messages: [
                      ...missionMessages,
                      {
                        id: `msg-reconnect-stale-success-${mission.id}-${Date.now()}`,
                        role: 'system' as const,
                        content: `_Session expired before we could confirm completion. The agent's last response is preserved above — marking this mission complete._`,
                        timestamp: new Date(),
                      },
                    ],
                  }
                }

                return {
                  ...mission,
                  status: 'failed' as MissionStatus,
                  currentStep: undefined,
                  updatedAt: new Date(),
                  context: { ...mission.context, needsReconnect: false },
                  messages: [
                    ...missionMessages,
                    {
                      id: `msg-reconnect-stale-${mission.id}-${Date.now()}`,
                      role: 'system' as const,
                      content: `**Mission session expired**\n\nThe connection to the agent was lost more than ${Math.round(MISSION_RECONNECT_MAX_AGE_MS / 60_000)} minutes ago. The agent has likely purged this session, so auto-resume is unsafe — it could crash the agent or land your prompt in a disjointed thread.\n\n**Click Retry Mission** to start a fresh session with the same prompt.`,
                      timestamp: new Date(),
                    },
                  ],
                }
              }

              if (missionsToFailDuplicate.has(mission.id)) {
                return {
                  ...mission,
                  status: 'failed' as MissionStatus,
                  currentStep: undefined,
                  updatedAt: new Date(),
                  context: { ...mission.context, needsReconnect: false },
                  messages: [
                    ...getMissionMessages(mission.messages),
                    {
                      id: `msg-reconnect-abort-${mission.id}-${Date.now()}`,
                      role: 'system' as const,
                      content: 'Connection was lost twice during this mission. To avoid duplicating an in-flight action, the mission was stopped. Please retry it manually.',
                      timestamp: new Date(),
                    },
                  ],
                }
              }

              return {
                ...mission,
                currentStep: 'Resuming...',
                context: { ...mission.context, needsReconnect: false, reconnectAttempted: true },
              }
            })
          })

          const seenIds = new Set<string>()
          const dedupedMissions = missionsToReconnect.filter(mission => {
            if (seenIds.has(mission.id)) return false
            seenIds.add(mission.id)
            return true
          })

          if (dedupedMissions.length > 0) {
            const OPTIMISTIC_TOOLS_IN_FLIGHT = 1
            for (const mission of dedupedMissions) {
              state.toolsInFlight.current.set(mission.id, OPTIMISTIC_TOOLS_IN_FLIGHT)
            }

            setTimeout(() => {
              if (state.wsOpenEpoch.current !== epoch) return
              dedupedMissions.forEach(mission => {
                if (state.cancelIntents.current.has(mission.id)) {
                  stateUtils.finalizeCancellation(mission.id, 'Mission cancelled by user during reconnect.')
                  return
                }
                const currentState = state.missionsRef.current.find(candidate => candidate.id === mission.id)
                if (currentState && (currentState.status === 'cancelled' || currentState.status === 'failed' || currentState.status === 'cancelling')) {
                  return
                }

                const userMessages = getMissionMessages(mission.messages).filter(message => message.role === 'user')
                const lastUserMessage = userMessages[userMessages.length - 1]
                if (!lastUserMessage || state.wsRef.current?.readyState !== WebSocket.OPEN) {
                  return
                }

                const agentToUse = mission.agent || 'claude-code'
                const resumeKey = `resume-${mission.id}`
                const requestId = generateRequestId('claude-reconnect')
                state.pendingRequests.current.set(requestId, mission.id)

                const fullHistory = getMissionMessages(mission.messages)
                  .filter(message => message.role === 'user' || message.role === 'assistant')
                  .map(message => ({ role: message.role, content: message.content }))
                const historyWithoutLastUser = (() => {
                  for (let index = fullHistory.length - 1; index >= 0; index -= 1) {
                    if (fullHistory[index].role === 'user') {
                      return [...fullHistory.slice(0, index), ...fullHistory.slice(index + 1)]
                    }
                  }
                  return fullHistory
                })()
                const history = historyWithoutLastUser.slice(-MAX_RESENT_MESSAGES)
                if (historyWithoutLastUser.length > MAX_RESENT_MESSAGES) {
                  logger.warn(
                    `[Missions] issue 6429 — truncated reconnect history from ${historyWithoutLastUser.length} to ${MAX_RESENT_MESSAGES} messages to avoid oversized payload`,
                  )
                }

                const reconnectMissionId = mission.id
                wsSend(JSON.stringify({
                  id: requestId,
                  type: 'chat',
                  payload: {
                    prompt: lastUserMessage.content,
                    sessionId: reconnectMissionId,
                    agent: agentToUse,
                    history,
                    resumeKey,
                    isResume: true,
                  },
                }), () => {
                  state.toolsInFlight.current.delete(reconnectMissionId)
                  if (state.unmountedRef.current) return
                  state.setMissions(prev => prev.map(candidate =>
                    candidate.id === reconnectMissionId
                      ? { ...candidate, status: 'failed', currentStep: 'WebSocket reconnect failed' }
                      : candidate,
                  ))
                })

                if (waitingInputMissionIds.has(reconnectMissionId)) {
                  stateUtils.startWaitingInputTimeout(reconnectMissionId)
                }
              })
            }, MISSION_RECONNECT_DELAY_MS)
          }

          resolve()
        }

        state.wsRef.current.onmessage = event => {
          try {
            const message = JSON.parse(event.data)
            state.handleAgentMessageRef.current(message)
          } catch (error: unknown) {
            logger.error('[Missions] Failed to parse message:', error)
          }
        }

        state.wsRef.current.onclose = () => {
          clearTimeout(timeout)
          state.wsRef.current = null
          if (state.unmountedRef.current) return

          state.setAgentsLoading(false)

          if (!getDemoMode() && state.wsReconnectAttempts.current < WS_RECONNECT_MAX_RETRIES) {
            const attempt = state.wsReconnectAttempts.current
            const delay = Math.min(
              WS_RECONNECT_INITIAL_DELAY_MS * Math.pow(2, attempt),
              WS_RECONNECT_MAX_DELAY_MS,
            )
            state.wsReconnectAttempts.current = attempt + 1
            logger.warn(
              `[Missions] WebSocket closed. Reconnecting in ${delay}ms (attempt ${attempt + 1}/${WS_RECONNECT_MAX_RETRIES})`,
            )
            state.wsReconnectTimer.current = setTimeout(() => {
              state.wsReconnectTimer.current = null
              if (state.unmountedRef.current) return
              ensureConnection().catch((error: unknown) => {
                logger.error('[Missions] WebSocket reconnection failed:', error)
              })
            }, delay)
          } else if (!getDemoMode()) {
            logger.warn(
              `[Missions] WebSocket reconnection abandoned after ${WS_RECONNECT_MAX_RETRIES} attempts. Will retry on next user interaction.`,
            )
          }

          for (const handle of state.cancelTimeouts.current.values()) {
            clearTimeout(handle)
          }
          state.cancelTimeouts.current.clear()

          for (const handle of state.wsSendRetryTimers.current) {
            clearTimeout(handle)
          }
          state.wsSendRetryTimers.current.clear()

          const isGivingUp = getDemoMode() || state.wsReconnectAttempts.current >= WS_RECONNECT_MAX_RETRIES
          if (state.pendingRequests.current.size > 0) {
            const pendingMissionIds = new Set(state.pendingRequests.current.values())
            if (isGivingUp) {
              const errorContent = `**Agent Disconnected**\n\nThe WebSocket connection to the agent at \`${LOCAL_AGENT_WS_URL}\` was lost and reconnection attempts were exhausted. Please verify the agent is running and reachable, then retry the mission.`
              state.setMissions(prev => prev.map(mission => {
                if (pendingMissionIds.has(mission.id) && (mission.status === 'running' || mission.status === 'waiting_input')) {
                  return {
                    ...mission,
                    status: 'failed',
                    currentStep: undefined,
                    messages: [
                      ...getMissionMessages(mission.messages),
                      {
                        id: generateMessageId(mission.id),
                        role: 'system',
                        content: errorContent,
                        timestamp: new Date(),
                      },
                    ],
                  }
                }
                return mission
              }))
            } else {
              state.setMissions(prev => prev.map(mission => {
                if (pendingMissionIds.has(mission.id) && (mission.status === 'running' || mission.status === 'waiting_input')) {
                  return {
                    ...mission,
                    currentStep: 'Reconnecting...',
                    context: { ...mission.context, needsReconnect: true },
                  }
                }
                return mission
              }))
            }
            state.pendingRequests.current.clear()
          }
        }

        state.wsRef.current.onerror = () => {
          clearTimeout(timeout)
          const ws = state.wsRef.current
          if (ws) {
            ws.onclose = null
            ws.close()
            state.wsRef.current = null
          }
          const isGivingUp = getDemoMode() || state.wsReconnectAttempts.current >= WS_RECONNECT_MAX_RETRIES
          if (state.pendingRequests.current.size > 0) {
            const affectedMissionIds = new Set(state.pendingRequests.current.values())
            if (isGivingUp) {
              const errorContent = '**Agent Disconnected**\n\nThe WebSocket connection failed and reconnection attempts were exhausted. Please verify the agent is running and try again.'
              state.setMissions(prev => prev.map(mission => {
                if (!affectedMissionIds.has(mission.id)) return mission
                if (mission.status !== 'running' && mission.status !== 'waiting_input') return mission
                return {
                  ...mission,
                  status: 'failed' as MissionStatus,
                  currentStep: 'Connection failed',
                  messages: [
                    ...getMissionMessages(mission.messages),
                    {
                      id: generateMessageId('ws-error'),
                      role: 'system' as const,
                      content: errorContent,
                      timestamp: new Date(),
                    },
                  ],
                }
              }))
            } else {
              state.setMissions(prev => prev.map(mission => {
                if (!affectedMissionIds.has(mission.id)) return mission
                if (mission.status !== 'running' && mission.status !== 'waiting_input') return mission
                return {
                  ...mission,
                  currentStep: 'Reconnecting...',
                  context: { ...mission.context, needsReconnect: true },
                }
              }))
            }
            state.pendingRequests.current.clear()
          }
          state.pendingRequests.current.clear()
          for (const handle of state.wsSendRetryTimers.current) {
            clearTimeout(handle)
          }
          state.wsSendRetryTimers.current.clear()
          state.toolsInFlight.current.clear()
          for (const timeoutHandle of state.waitingInputTimeouts.current.values()) {
            clearTimeout(timeoutHandle)
          }
          state.waitingInputTimeouts.current.clear()
          state.lastStreamTimestamp.current.clear()
          state.streamSplitCounter.current.clear()
          for (const timers of state.missionStatusTimers.current.values()) {
            for (const handle of timers) {
              clearTimeout(handle)
            }
          }
          state.missionStatusTimers.current.clear()
          state.setAgentsLoading(false)
          reject(new Error('CONNECTION_FAILED'))
        }
      } catch (error: unknown) {
        clearTimeout(timeout)
        reject(error)
      }
    })
  }

  return {
    fetchAgents,
    wsSend,
    ensureConnection,
  }
}

export type MissionConnectionApi = ReturnType<typeof createMissionConnectionApi>

import { reportAgentActivity } from './useLocalAgent'
import { emitMissionError, emitMissionCompleted } from '../lib/analytics'
import {
  getMissionMessages,
  generateMessageId,
  generateRequestId,
  isStaleAgentErrorMessage,
  getSelectedKagentiAgentFromStorage,
  persistSelectedKagentiAgentToStorage,
  buildKagentiDiscoveryErrorMessage,
  KAGENTI_PROVIDER_UNAVAILABLE_EVENT,
  KAGENTI_NO_AGENTS_DISCOVERED_EVENT,
} from './useMissions.helpers'
import type { MissionStatus } from './useMissionTypes'
import type { MissionProviderState, MissionStateUtils } from './useMissions.state'
import type { MissionConnectionApi } from './useMissions.connection'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { agentFetch } from './mcp/agentFetch'
import { CANCEL_ACK_TIMEOUT_MS } from './useMissions.constants'
import { getTokenCategoryForMissionType } from '../lib/tokenUsageMissionCategory'
import { setActiveTokenCategory } from './useTokenUsage'
import {
  kagentiProviderChat,
  discoverKagentiProviderAgent,
} from '../lib/kagentiProviderBackend'

export interface MissionMessagingActions {
  sendMessage: (missionId: string, content: string) => void
  editAndResend: (missionId: string, messageId: string) => string | null
  cancelMission: (missionId: string) => void
}

export function createMissionMessagingActions(
  state: MissionProviderState,
  stateUtils: MissionStateUtils,
  connectionApi: Pick<MissionConnectionApi, 'ensureConnection' | 'wsSend'>,
): MissionMessagingActions {
  const cancelMission = (missionId: string) => {
    if (state.cancelTimeouts.current.has(missionId) || state.cancelIntents.current.has(missionId)) return
    state.cancelIntents.current.add(missionId)

    const currentMission = state.missionsRef.current.find(candidate => candidate.id === missionId)
    if (currentMission && (currentMission.status === 'pending' || currentMission.status === 'blocked')) {
      for (const [requestId, mappedMissionId] of state.pendingRequests.current.entries()) {
        if (mappedMissionId === missionId) {
          state.pendingRequests.current.delete(requestId)
        }
      }
      state.lastStreamTimestamp.current.delete(missionId)
      stateUtils.clearMissionStatusTimers(missionId)
      state.cancelIntents.current.delete(missionId)
      state.setMissions(prev => prev.map(candidate =>
        candidate.id === missionId
          ? {
              ...candidate,
              status: 'cancelled' as MissionStatus,
              currentStep: undefined,
              preflightError: undefined,
              updatedAt: new Date(),
              messages: [
                ...getMissionMessages(candidate.messages),
                {
                  id: `msg-cancel-pending-${Date.now()}`,
                  role: 'system' as const,
                  content: 'Mission cancelled by user before it started.',
                  timestamp: new Date(),
                },
              ],
            }
          : candidate,
      ))
      return
    }

    state.lastStreamTimestamp.current.delete(missionId)
    if (state.wsRef.current?.readyState === WebSocket.OPEN) {
      state.wsRef.current.send(JSON.stringify({
        id: `cancel-${Date.now()}`,
        type: 'cancel_chat',
        payload: { sessionId: missionId },
      }))
    } else {
      agentFetch(`${LOCAL_AGENT_HTTP_URL}/cancel-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ sessionId: missionId }),
      }).then(async response => {
        if (state.unmountedRef.current) return
        if (response.ok) {
          try {
            const body = await response.json() as { cancelled?: boolean; message?: string }
            if (body.cancelled === false) {
              stateUtils.finalizeCancellation(
                missionId,
                body.message || 'Mission cancellation failed — backend indicated the session was not cancelled.',
              )
              return
            }
          } catch {
            // best effort body parse
          }
          stateUtils.finalizeCancellation(missionId, 'Mission cancelled by user.')
        } else {
          stateUtils.finalizeCancellation(missionId, 'Mission cancellation failed — backend returned an error. The mission may still be running.')
        }
      }).catch(() => {
        if (state.unmountedRef.current) return
        stateUtils.finalizeCancellation(missionId, 'Mission cancelled by user (backend unreachable — cancellation may not have taken effect).')
      })
    }

    state.setMissions(prev => prev.map(candidate =>
      candidate.id === missionId
        ? {
            ...candidate,
            status: 'cancelling',
            currentStep: 'Cancelling mission...',
            updatedAt: new Date(),
            messages: [
              ...getMissionMessages(candidate.messages),
              {
                id: generateMessageId(),
                role: 'system',
                content: 'Cancellation requested — waiting for backend confirmation...',
                timestamp: new Date(),
              },
            ],
          }
        : candidate,
    ))

    const existingTimeout = state.cancelTimeouts.current.get(missionId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }
    const timeoutHandle = setTimeout(() => {
      state.cancelTimeouts.current.delete(missionId)
      stateUtils.finalizeCancellation(missionId, 'Mission cancelled by user (backend did not confirm cancellation in time).')
    }, CANCEL_ACK_TIMEOUT_MS)
    state.cancelTimeouts.current.set(missionId, timeoutHandle)
  }

  const sendMessage = (missionId: string, content: string) => {
    reportAgentActivity('active')
    const stopKeywords = ['stop', 'cancel', 'abort', 'halt', 'quit']
    const isStopCommand = stopKeywords.some(keyword => content.trim().toLowerCase() === keyword)
    if (isStopCommand) {
      cancelMission(missionId)
      return
    }

    const currentMission = state.missionsRef.current.find(candidate => candidate.id === missionId)
    if (currentMission && (currentMission.status === 'running' || currentMission.status === 'cancelling')) {
      return
    }
    if (currentMission && currentMission.status === 'blocked') {
      return
    }

    setActiveTokenCategory(missionId, getTokenCategoryForMissionType(currentMission?.type))
    state.observedToolExecutions.current.delete(missionId)

    state.setMissions(prev => prev.map(candidate => {
      if (candidate.id !== missionId) return candidate
      const baseMessages = candidate.status === 'failed'
        ? (candidate.messages || []).filter(message => !isStaleAgentErrorMessage(message))
        : (candidate.messages || [])
      return {
        ...candidate,
        status: 'running',
        currentStep: 'Processing...',
        updatedAt: new Date(),
        messages: [
          ...baseMessages,
          {
            id: generateMessageId(),
            role: 'user',
            content,
            timestamp: new Date(),
          },
        ],
      }
    }))

    if (state.selectedAgentRef.current === 'kagenti') {
      const startedAt = Date.now()
      const assistantMessageId = generateMessageId('kagenti-stream')
      const mission = state.missionsRef.current.find(candidate => candidate.id === missionId)
      const missionType = mission?.type || 'unknown'

      void (async () => {
        let target = getSelectedKagentiAgentFromStorage()
        if (!target) {
          const discovery = await discoverKagentiProviderAgent()
          if (discovery.ok) {
            target = {
              namespace: discovery.agent.namespace,
              name: discovery.agent.name,
            }
            persistSelectedKagentiAgentToStorage(target)
          } else {
            state.executingMissions.current.delete(missionId)
            const errorContent = buildKagentiDiscoveryErrorMessage(discovery)
            state.setMissions(prev => prev.map(candidate =>
              candidate.id === missionId
                ? {
                    ...candidate,
                    status: 'failed',
                    currentStep: undefined,
                    messages: [
                      ...getMissionMessages(candidate.messages),
                      {
                        id: generateMessageId('kagenti-missing-agent'),
                        role: 'system',
                        content: errorContent,
                        timestamp: new Date(),
                      },
                    ],
                  }
                : candidate,
            ))
            emitMissionError(
              missionType,
              discovery.reason === 'provider_unreachable'
                ? KAGENTI_PROVIDER_UNAVAILABLE_EVENT
                : KAGENTI_NO_AGENTS_DISCOVERED_EVENT,
              discovery.reason,
            )
            return
          }
        }

        await kagentiProviderChat(target.name, target.namespace, content, {
          contextId: missionId,
          onChunk: (text: string) => {
            state.setMissions(prev => prev.map(candidate => {
              if (candidate.id !== missionId) return candidate
              const missionMessages = getMissionMessages(candidate.messages)
              const index = missionMessages.findIndex(message => message.id === assistantMessageId)
              if (index === -1) {
                return {
                  ...candidate,
                  currentStep: `Processing with ${state.selectedAgentRef.current || 'kagenti'}...`,
                  messages: [
                    ...missionMessages,
                    {
                      id: assistantMessageId,
                      role: 'assistant',
                      content: text,
                      timestamp: new Date(),
                      agent: state.selectedAgentRef.current || 'kagenti',
                    },
                  ],
                }
              }
              const nextMessages = [...missionMessages]
              nextMessages[index] = {
                ...nextMessages[index],
                content: `${nextMessages[index].content}${text}`,
                timestamp: new Date(),
              }
              return {
                ...candidate,
                currentStep: `Processing with ${state.selectedAgentRef.current || 'kagenti'}...`,
                messages: nextMessages,
              }
            }))
          },
          onDone: () => {
            state.executingMissions.current.delete(missionId)
            const durationMs = Math.max(0, Date.now() - startedAt)
            emitMissionCompleted(missionType, durationMs)
            state.setMissions(prev => prev.map(candidate => {
              if (candidate.id !== missionId) return candidate
              const missionMessages = getMissionMessages(candidate.messages)
              const hasAssistant = missionMessages.some(message => message.id === assistantMessageId && message.content.trim().length > 0)
              return {
                ...candidate,
                status: 'completed',
                currentStep: undefined,
                updatedAt: new Date(),
                messages: hasAssistant
                  ? missionMessages
                  : [
                      ...missionMessages,
                      {
                        id: assistantMessageId,
                        role: 'assistant',
                        content: 'Task completed.',
                        timestamp: new Date(),
                        agent: state.selectedAgentRef.current || 'kagenti',
                      },
                    ],
              }
            }))
          },
          onError: (error: string) => {
            state.executingMissions.current.delete(missionId)
            emitMissionError(missionType, 'kagenti_chat_error', error)
            state.setMissions(prev => prev.map(candidate =>
              candidate.id === missionId
                ? {
                    ...candidate,
                    status: 'failed',
                    currentStep: undefined,
                    updatedAt: new Date(),
                    messages: [
                      ...getMissionMessages(candidate.messages),
                      {
                        id: generateMessageId('kagenti-error'),
                        role: 'system',
                        content: `**Kagenti Request Failed**\n\n${error}`,
                        timestamp: new Date(),
                      },
                    ],
                  }
                : candidate,
            ))
          },
        })
      })()

      return
    }

    connectionApi.ensureConnection().then(() => {
      const requestId = generateRequestId()
      state.pendingRequests.current.set(requestId, missionId)
      const mission = state.missionsRef.current.find(candidate => candidate.id === missionId)
      const history = mission?.messages
        .filter(message => message.role === 'user' || message.role === 'assistant')
        .map(message => ({ role: message.role, content: message.content })) || []
      const lastHistoryContent = history.length > 0 ? history[history.length - 1].content : null
      if (lastHistoryContent !== content) {
        history.push({ role: 'user', content })
      }
      connectionApi.wsSend(JSON.stringify({
        id: requestId,
        type: 'chat',
        payload: {
          prompt: content,
          sessionId: missionId,
          agent: state.selectedAgentRef.current || undefined,
          history,
        },
      }), () => {
        state.setMissions(prev => prev.map(candidate =>
          candidate.id === missionId
            ? { ...candidate, status: 'failed', currentStep: 'WebSocket connection lost' }
            : candidate,
        ))
      })
    }).catch(() => {
      state.setMissions(prev => prev.map(candidate =>
        candidate.id === missionId
          ? {
              ...candidate,
              status: 'failed',
              currentStep: undefined,
              messages: [
                ...getMissionMessages(candidate.messages),
                {
                  id: generateMessageId(),
                  role: 'system',
                  content: 'Lost connection to local agent. Please ensure the agent is running and try again.',
                  timestamp: new Date(),
                },
              ],
            }
          : candidate,
      ))
    })
  }

  const editAndResend = (missionId: string, messageId: string): string | null => {
    let removedContent: string | null = null
    state.setMissions(prev => prev.map(candidate => {
      if (candidate.id !== missionId) return candidate
      const missionMessages = getMissionMessages(candidate.messages)
      const messageIndex = missionMessages.findIndex(message => message.id === messageId)
      if (messageIndex < 0) return candidate
      const targetMessage = missionMessages[messageIndex]
      if (targetMessage.role !== 'user') return candidate
      removedContent = targetMessage.content
      return {
        ...candidate,
        messages: missionMessages.slice(0, messageIndex),
        status: candidate.status === 'running' || candidate.status === 'cancelling'
          ? candidate.status
          : 'waiting_input' as MissionStatus,
        updatedAt: new Date(),
      }
    }))
    return removedContent
  }

  return {
    sendMessage,
    editAndResend,
    cancelMission,
  }
}

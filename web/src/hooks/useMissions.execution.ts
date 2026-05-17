import { reportAgentActivity } from './useLocalAgent'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { agentFetch } from './mcp/agentFetch'
import {
  runPreflightCheck,
  runToolPreflightCheck,
  type PreflightResult,
} from '../lib/missions/preflightCheck'
import { kubectlProxy } from '../lib/kubectlProxy'
import {
  resolveMissionToolRequirements,
  getMissingTools,
  shouldAllowMissingToolWarning,
  shouldSkipClusterPreflight,
  buildMissingToolWarning,
  buildMissionToolUnavailableError,
  generateMessageId,
  getMissionMessages,
  generateRequestId,
  getSelectedKagentiAgentFromStorage,
  persistSelectedKagentiAgentToStorage,
  KAGENTI_PROVIDER_UNAVAILABLE_EVENT,
  KAGENTI_NO_AGENTS_DISCOVERED_EVENT,
  buildKagentiDiscoveryErrorMessage,
} from './useMissions.helpers'
import { getTokenCategoryForMissionType } from '../lib/tokenUsageMissionCategory'
import { setActiveTokenCategory } from './useTokenUsage'
import {
  STATUS_WAITING_DELAY_MS,
  STATUS_PROCESSING_DELAY_MS,
} from './useMissions.constants'
import {
  kagentiProviderChat,
  discoverKagentiProviderAgent,
} from '../lib/kagentiProviderBackend'
import { emitMissionCompleted, emitMissionError } from '../lib/analytics'
import type { Mission, MissionStatus } from './useMissionTypes'
import type { MissionProviderState, MissionStateUtils } from './useMissions.state'
import type { MissionConnectionApi } from './useMissions.connection'
import { logger } from '@/lib/logger'

export function createMissionExecutionApi(
  state: MissionProviderState,
  stateUtils: MissionStateUtils,
  connectionApi: Pick<MissionConnectionApi, 'ensureConnection' | 'wsSend'>,
) {
  const normalizeMissionTools = (tools: string[]): string[] => [...new Set(
    tools
      .map(tool => tool.trim().toLowerCase())
      .filter(Boolean),
  )]

  const getMissionToolConflicts = (requiredTools: string[]): string[] => {
    const normalizedRequiredTools = normalizeMissionTools(requiredTools)
    if (normalizedRequiredTools.length === 0) return []

    const conflicts = new Set<string>()
    for (const lockedTools of state.missionToolLocks.current.values()) {
      for (const tool of normalizedRequiredTools) {
        if (lockedTools.includes(tool)) {
          conflicts.add(tool)
        }
      }
    }

    return [...conflicts]
  }

  const releaseMissionToolLock = (missionId: string) => {
    state.missionToolLocks.current.delete(missionId)
  }

  const executeMission = (
    missionId: string,
    enhancedPrompt: string,
    params: { context?: Record<string, unknown>; type?: string; dryRun?: boolean },
  ) => {
    const missionType = params.type || 'custom'
    reportAgentActivity('active')

    if (state.cancelIntents.current.has(missionId)) {
      releaseMissionToolLock(missionId)
      stateUtils.finalizeCancellation(missionId, 'Mission cancelled by user before execution started.')
      return
    }

    if (state.executingMissions.current.has(missionId)) {
      releaseMissionToolLock(missionId)
      logger.debug(`[Missions] executeMission already in-flight for ${missionId}, skipping duplicate`)
      return
    }
    state.executingMissions.current.add(missionId)
    state.cancelIntents.current.delete(missionId)

    if (state.selectedAgentRef.current === 'kagenti') {
      const startedAt = Date.now()
      const assistantMessageId = generateMessageId('kagenti-stream')
      state.setMissions(prev => prev.map(mission =>
        mission.id === missionId
          ? { ...mission, status: 'running', currentStep: 'Connecting to kagenti...' }
          : mission,
      ))

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
            state.setMissions(prev => prev.map(mission =>
              mission.id === missionId
                ? {
                    ...mission,
                    status: 'failed',
                    currentStep: undefined,
                    messages: [
                      ...getMissionMessages(mission.messages),
                      {
                        id: generateMessageId('kagenti-missing-agent'),
                        role: 'system',
                        content: errorContent,
                        timestamp: new Date(),
                      },
                    ],
                  }
                : mission,
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

        await kagentiProviderChat(target.name, target.namespace, enhancedPrompt, {
          contextId: missionId,
          onChunk: (text: string) => {
            state.setMissions(prev => prev.map(mission => {
              if (mission.id !== missionId) return mission
              const missionMessages = getMissionMessages(mission.messages)
              const index = missionMessages.findIndex(message => message.id === assistantMessageId)
              if (index === -1) {
                return {
                  ...mission,
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
                ...mission,
                currentStep: `Processing with ${state.selectedAgentRef.current || 'kagenti'}...`,
                messages: nextMessages,
              }
            }))
          },
          onDone: () => {
            state.executingMissions.current.delete(missionId)
            const durationMs = Math.max(0, Date.now() - startedAt)
            emitMissionCompleted(missionType, durationMs)
            state.setMissions(prev => prev.map(mission => {
              if (mission.id !== missionId) return mission
              const missionMessages = getMissionMessages(mission.messages)
              const hasAssistant = missionMessages.some(message => message.id === assistantMessageId && message.content.trim().length > 0)
              return {
                ...mission,
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
            state.setMissions(prev => prev.map(mission =>
              mission.id === missionId
                ? {
                    ...mission,
                    status: 'failed',
                    currentStep: undefined,
                    updatedAt: new Date(),
                    messages: [
                      ...getMissionMessages(mission.messages),
                      {
                        id: generateMessageId('kagenti-error'),
                        role: 'system',
                        content: `**Kagenti Request Failed**\n\n${error}`,
                        timestamp: new Date(),
                      },
                    ],
                  }
                : mission,
            ))
          },
        })
      })()

      return
    }

    connectionApi.ensureConnection().then(() => {
      state.executingMissions.current.delete(missionId)
      const requestId = generateRequestId()
      state.pendingRequests.current.set(requestId, missionId)

      state.setMissions(prev => prev.map(mission =>
        mission.id === missionId
          ? { ...mission, status: 'running', currentStep: 'Connecting to agent...' }
          : mission,
      ))

      setActiveTokenCategory(missionId, getTokenCategoryForMissionType(params.type as Mission['type'] | undefined))

      connectionApi.wsSend(JSON.stringify({
        id: requestId,
        type: 'chat',
        payload: {
          prompt: enhancedPrompt,
          sessionId: missionId,
          agent: state.selectedAgentRef.current || undefined,
          context: params.context,
          dryRun: params.dryRun || false,
        },
      }), () => {
        state.setMissions(prev => prev.map(mission =>
          mission.id === missionId
            ? { ...mission, status: 'failed', currentStep: 'WebSocket connection lost' }
            : mission,
        ))
      })

      if (!state.missionStatusTimers.current.has(missionId)) {
        state.missionStatusTimers.current.set(missionId, new Set())
      }
      const timers = state.missionStatusTimers.current.get(missionId)!

      const waitingHandle = setTimeout(() => {
        timers.delete(waitingHandle)
        if (state.unmountedRef.current) return
        state.setMissions(prev => prev.map(mission =>
          mission.id === missionId && mission.currentStep === 'Connecting to agent...'
            ? { ...mission, currentStep: 'Waiting for response...' }
            : mission,
        ))
      }, STATUS_WAITING_DELAY_MS)
      timers.add(waitingHandle)

      const processingHandle = setTimeout(() => {
        timers.delete(processingHandle)
        if (state.unmountedRef.current) return
        state.setMissions(prev => prev.map(mission =>
          mission.id === missionId && mission.currentStep === 'Waiting for response...'
            ? { ...mission, currentStep: `Processing with ${state.selectedAgentRef.current || 'AI'}...` }
            : mission,
        ))
      }, STATUS_PROCESSING_DELAY_MS)
      timers.add(processingHandle)
    }).catch(() => {
      state.executingMissions.current.delete(missionId)
      const errorContent = `**Local Agent Not Connected**\n\nInstall the console locally with the KubeStellar Console agent to use AI missions.`
      state.setMissions(prev => prev.map(mission =>
        mission.id === missionId
          ? {
              ...mission,
              status: 'failed',
              currentStep: undefined,
              messages: [
                ...getMissionMessages(mission.messages),
                {
                  id: generateMessageId(),
                  role: 'system',
                  content: errorContent,
                  timestamp: new Date(),
                },
              ],
            }
          : mission,
      ))
    })
  }

  const drainQueuedMissionExecutions = () => {
    if (state.queuedMissionExecutions.current.length === 0) return

    const remainingQueue: typeof state.queuedMissionExecutions.current = []
    for (const entry of state.queuedMissionExecutions.current) {
      const mission = state.missionsRef.current.find(candidate => candidate.id === entry.missionId)
      if (!mission) continue
      if (mission.status === 'completed' || mission.status === 'failed' || mission.status === 'cancelled') continue
      if (state.cancelIntents.current.has(entry.missionId)) continue

      const conflicts = getMissionToolConflicts(entry.requiredTools)
      if (conflicts.length > 0) {
        remainingQueue.push(entry)
        continue
      }

      if (entry.requiredTools.length > 0) {
        state.missionToolLocks.current.set(entry.missionId, entry.requiredTools)
      }
      executeMission(entry.missionId, entry.enhancedPrompt, entry.params)
    }

    state.queuedMissionExecutions.current = remainingQueue
  }

  const enqueueMissionExecution = (
    missionId: string,
    enhancedPrompt: string,
    params: { context?: Record<string, unknown>; type?: string; dryRun?: boolean },
    requiredTools: string[],
  ) => {
    const normalizedRequiredTools = normalizeMissionTools(requiredTools)
    const conflicts = getMissionToolConflicts(normalizedRequiredTools)

    if (conflicts.length === 0) {
      if (normalizedRequiredTools.length > 0) {
        state.missionToolLocks.current.set(missionId, normalizedRequiredTools)
      }
      executeMission(missionId, enhancedPrompt, params)
      return
    }

    state.queuedMissionExecutions.current = [
      ...state.queuedMissionExecutions.current.filter(entry => entry.missionId !== missionId),
      { missionId, enhancedPrompt, params, requiredTools: normalizedRequiredTools },
    ]

    state.setMissions(prev => prev.map(mission =>
      mission.id === missionId
        ? {
            ...mission,
            currentStep: `Waiting for tools: ${conflicts.join(', ')}`,
          }
        : mission,
    ))
  }

  const preflightAndExecute = (
    missionId: string,
    enhancedPrompt: string,
    params: { title?: string; description?: string; initialPrompt?: string; cluster?: string; context?: Record<string, unknown>; type?: string; dryRun?: boolean },
  ) => {
    const { requiredTools, missionSpecificOptionalTools } = resolveMissionToolRequirements({
      title: params.title,
      description: params.description,
      prompt: params.initialPrompt || enhancedPrompt,
      type: params.type,
      context: params.context,
    })
    const toolCheckPromise = runToolPreflightCheck(LOCAL_AGENT_HTTP_URL, requiredTools, agentFetch)

    toolCheckPromise.then(toolResult => {
      const missingTools = toolResult.error
        ? getMissingTools(toolResult.error, requiredTools)
        : []
      const missingMissionSpecificOptionalTools = missingTools.filter(tool => missionSpecificOptionalTools.includes(tool))
      const preflightToolError = missingMissionSpecificOptionalTools.length > 0 && toolResult.error
        ? buildMissionToolUnavailableError(toolResult.error, missingMissionSpecificOptionalTools)
        : toolResult.error
      const allowMissingToolWarning =
        !toolResult.ok &&
        preflightToolError?.code === 'MISSING_TOOLS' &&
        shouldAllowMissingToolWarning(params.context) &&
        missingMissionSpecificOptionalTools.length === 0

      if (!toolResult.ok && preflightToolError && !allowMissingToolWarning) {
        state.setMissions(prev => prev.map(mission =>
          mission.id === missionId
            ? {
                ...mission,
                status: 'blocked' as MissionStatus,
                currentStep: 'Missing required tools',
                preflightError: preflightToolError,
              }
            : mission,
        ))
        return
      }

      if (allowMissingToolWarning && preflightToolError) {
        state.setMissions(prev => prev.map(mission =>
          mission.id === missionId
            ? {
                ...mission,
                currentStep: 'Continuing with AI-assisted flow',
                messages: [
                  ...getMissionMessages(mission.messages),
                  {
                    id: generateMessageId('tool-preflight-warning'),
                    role: 'system' as const,
                    content: buildMissingToolWarning(preflightToolError),
                    timestamp: new Date(),
                  },
                ],
              }
            : mission,
        ))
      }

      const missionNeedsCluster =
        !shouldSkipClusterPreflight(params.context) &&
        (!!params.cluster || ['deploy', 'repair', 'upgrade'].includes(params.type || ''))
      const clusterContexts = params.cluster?.split(',').map(cluster => cluster.trim()).filter(Boolean) || []
      const preflightPromise = missionNeedsCluster && clusterContexts.length > 0
        ? Promise.all(
            clusterContexts.map(context =>
              runPreflightCheck((args, options) => kubectlProxy.exec(args, options), context),
            ),
          ).then(results => results.find(result => !result.ok) || { ok: true as const })
        : missionNeedsCluster
          ? runPreflightCheck((args, options) => kubectlProxy.exec(args, options))
          : Promise.resolve({ ok: true } as PreflightResult)

      preflightPromise.then(preflight => {
        if (!preflight.ok && 'error' in preflight && preflight.error) {
          state.setMissions(prev => prev.map(mission =>
            mission.id === missionId
              ? {
                  ...mission,
                  status: 'blocked' as MissionStatus,
                  currentStep: 'Preflight check failed',
                  preflightError: preflight.error,
                }
              : mission,
          ))
          emitMissionError(
            params.type || 'custom',
            preflight.error?.code || 'preflight_unknown',
            preflight.error?.message,
          )
          return
        }

        if (state.cancelIntents.current.has(missionId)) {
          stateUtils.finalizeCancellation(missionId, 'Mission cancelled by user before execution started.')
          return
        }
        enqueueMissionExecution(missionId, enhancedPrompt, params, requiredTools)
      }).catch(error => {
        state.setMissions(prev => prev.map(mission =>
          mission.id === missionId
            ? {
                ...mission,
                status: 'blocked' as MissionStatus,
                currentStep: 'Preflight check error',
                preflightError: {
                  code: 'UNKNOWN_EXECUTION_FAILURE',
                  message: error instanceof Error ? error.message : 'Unknown error',
                  details: { hint: 'The preflight check threw an unexpected error. Retry or check cluster connectivity.' },
                },
              }
            : mission,
        ))
      })
    }).catch(error => {
      state.setMissions(prev => prev.map(mission =>
        mission.id === missionId
          ? {
              ...mission,
              status: 'blocked' as MissionStatus,
              currentStep: 'Tool check error',
              preflightError: {
                code: 'UNKNOWN_EXECUTION_FAILURE',
                message: error instanceof Error ? error.message : 'Unknown error',
                details: { hint: 'The tool pre-flight check threw an unexpected error. Verify the local agent is running.' },
              },
            }
          : mission,
      ))
    })
  }

  return {
    drainQueuedMissionExecutions,
    enqueueMissionExecution,
    preflightAndExecute,
    executeMission,
    releaseMissionToolLock,
  }
}

export type MissionExecutionApi = ReturnType<typeof createMissionExecutionApi>

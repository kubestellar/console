import { reportAgentActivity } from './useLocalAgent'
import { scanForMaliciousContent } from '../lib/missions/scanner/malicious'
import { emitError, emitMissionError, emitMissionRated, emitMissionStarted, emitMissionCompleted } from '../lib/analytics'
import {
  buildEnhancedPrompt,
  buildSavedMissionPrompt,
  buildSystemMessages,
} from './useMissionPromptBuilder'
import {
  getMissionMessages,
  generateMessageId,
  generateRequestId,
  isStaleAgentErrorMessage,
  resolveMissionToolRequirements,
  getMissingTools,
  shouldAllowMissingToolWarning,
  shouldSkipClusterPreflight,
  buildMissingToolWarning,
  buildMissionToolUnavailableError,
  buildKagentiDiscoveryErrorMessage,
  KAGENTI_PROVIDER_UNAVAILABLE_EVENT,
  KAGENTI_NO_AGENTS_DISCOVERED_EVENT,
  getSelectedKagentiAgentFromStorage,
  persistSelectedKagentiAgentToStorage,
} from './useMissions.helpers'
import type {
  Mission,
  MissionFeedback,
  MissionMessage,
  MissionStatus,
  SaveMissionParams,
  SavedMissionUpdates,
  StartMissionParams,
} from './useMissionTypes'
import type { MissionProviderState, MissionStateUtils } from './useMissions.state'
import { NONE_AGENT, SELECTED_AGENT_KEY } from './useMissions.state'
import type { MissionConnectionApi } from './useMissions.connection'
import type { MissionExecutionApi } from './useMissions.execution'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { agentFetch } from './mcp/agentFetch'
import {
  runPreflightCheck,
  runToolPreflightCheck,
} from '../lib/missions/preflightCheck'
import { kubectlProxy } from '../lib/kubectlProxy'
import { CANCEL_ACK_TIMEOUT_MS } from './useMissions.constants'
import { getTokenCategoryForMissionType } from '../lib/tokenUsageMissionCategory'
import { setActiveTokenCategory } from './useTokenUsage'
import {
  kagentiProviderChat,
  discoverKagentiProviderAgent,
} from '../lib/kagentiProviderBackend'
import { logger } from '@/lib/logger'
import type { MissionActionBundle } from './useMissions.types'

export function createMissionActions(
  state: MissionProviderState,
  stateUtils: MissionStateUtils,
  connectionApi: Pick<MissionConnectionApi, 'ensureConnection' | 'wsSend'>,
  executionApi: Pick<MissionExecutionApi, 'executeMission' | 'preflightAndExecute'>,
): MissionActionBundle {
  const startMission = (params: StartMissionParams): string => {
    const preGeneratedId = params.context?.__preGeneratedMissionId as string | undefined
    const missionId = preGeneratedId || `mission-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`
    if (preGeneratedId && params.context) {
      const { __preGeneratedMissionId: _, ...cleanContext } = params.context
      params = {
        ...params,
        context: Object.keys(cleanContext).length > 0 ? cleanContext : undefined,
      }
    }

    if (!params.skipReview) {
      state.setPendingReviewQueue(prev => [...prev, { params, missionId }])
      return missionId
    }

    const { enhancedPrompt, matchedResolutions, isInstallMission } = buildEnhancedPrompt(params)
    const initialMessages: MissionMessage[] = [
      {
        id: generateMessageId(),
        role: 'user',
        content: params.initialPrompt,
        timestamp: new Date(),
      },
      ...buildSystemMessages(isInstallMission, matchedResolutions),
    ]

    const mission: Mission = {
      id: missionId,
      title: params.title,
      description: params.description,
      type: params.type,
      status: 'pending',
      cluster: params.cluster,
      messages: initialMessages,
      createdAt: new Date(),
      updatedAt: new Date(),
      context: params.context,
      agent: state.selectedAgentRef.current || state.defaultAgentRef.current || undefined,
      matchedResolutions: matchedResolutions.length > 0 ? matchedResolutions : undefined,
    }

    state.setMissions(prev => [mission, ...prev])
    state.setActiveMissionId(missionId)
    state.setIsSidebarOpen(true)
    state.setIsSidebarMinimized(false)
    emitMissionStarted(params.type, state.selectedAgentRef.current || state.defaultAgentRef.current || 'unknown')
    executionApi.preflightAndExecute(missionId, enhancedPrompt, params)
    return missionId
  }

  const retryPreflight = (missionId: string) => {
    const mission = state.missionsRef.current.find(candidate => candidate.id === missionId)
    if (!mission || mission.status !== 'blocked') return

    state.setMissions(prev => prev.map(candidate =>
      candidate.id === missionId
        ? {
            ...candidate,
            status: 'pending' as MissionStatus,
            currentStep: 'Re-running preflight check...',
            preflightError: undefined,
          }
        : candidate,
    ))

    void (async () => {
      try {
        const lastUserMessage = getMissionMessages(mission.messages).find(message => message.role === 'user')
        const { requiredTools, missionSpecificOptionalTools } = resolveMissionToolRequirements({
          title: mission.title,
          description: mission.description,
          prompt: lastUserMessage?.content || mission.description,
          type: mission.type,
          context: mission.context,
        })
        const toolResult = await runToolPreflightCheck(LOCAL_AGENT_HTTP_URL, requiredTools, agentFetch)
        const missingTools = toolResult.error ? getMissingTools(toolResult.error, requiredTools) : []
        const missingMissionSpecificOptionalTools = missingTools.filter(tool => missionSpecificOptionalTools.includes(tool))
        const preflightToolError = missingMissionSpecificOptionalTools.length > 0 && toolResult.error
          ? buildMissionToolUnavailableError(toolResult.error, missingMissionSpecificOptionalTools)
          : toolResult.error
        const allowMissingToolWarning =
          !toolResult.ok &&
          preflightToolError?.code === 'MISSING_TOOLS' &&
          shouldAllowMissingToolWarning(mission.context) &&
          missingMissionSpecificOptionalTools.length === 0

        if (!toolResult.ok && preflightToolError && !allowMissingToolWarning) {
          state.setMissions(prev => prev.map(candidate =>
            candidate.id === missionId
              ? {
                  ...candidate,
                  status: 'blocked' as MissionStatus,
                  currentStep: 'Missing required tools',
                  preflightError: preflightToolError,
                }
              : candidate,
          ))
          return
        }

        if (allowMissingToolWarning && preflightToolError) {
          state.setMissions(prev => prev.map(candidate =>
            candidate.id === missionId
              ? {
                  ...candidate,
                  currentStep: 'Continuing with AI-assisted flow',
                  messages: [
                    ...getMissionMessages(candidate.messages),
                    {
                      id: generateMessageId('tool-preflight-warning-retry'),
                      role: 'system' as const,
                      content: buildMissingToolWarning(preflightToolError),
                      timestamp: new Date(),
                    },
                  ],
                }
              : candidate,
          ))
        }

        const missingToolError = toolResult.error
        if (allowMissingToolWarning && missingToolError) {
          state.setMissions(prev => prev.map(candidate =>
            candidate.id === missionId
              ? {
                  ...candidate,
                  currentStep: 'Continuing with AI-assisted flow',
                  messages: [
                    ...getMissionMessages(candidate.messages),
                    {
                      id: generateMessageId('tool-preflight-warning-retry'),
                      role: 'system' as const,
                      content: buildMissingToolWarning(missingToolError),
                      timestamp: new Date(),
                    },
                  ],
                }
              : candidate,
          ))
        }

        const clusterContexts = (mission.cluster || '')
          .split(',')
          .map(cluster => cluster.trim())
          .filter(Boolean)
        const preflightForCluster = shouldSkipClusterPreflight(mission.context)
          ? []
          : clusterContexts.length > 0
            ? clusterContexts
            : [undefined]
        const results = await Promise.all(
          preflightForCluster.map(context =>
            runPreflightCheck(
              (args, options) => kubectlProxy.exec(args, options),
              context,
            ).then(result => ({ context, result })),
          ),
        )
        const failing = results.find(result => !result.result.ok && 'error' in result.result && result.result.error)
        const preflight = failing ? failing.result : (results[0]?.result || { ok: true })
        if (!preflight.ok && 'error' in preflight && preflight.error) {
          state.setMissions(prev => prev.map(candidate =>
            candidate.id === missionId
              ? {
                  ...candidate,
                  status: 'blocked' as MissionStatus,
                  currentStep: 'Preflight check failed',
                  preflightError: preflight.error,
                }
              : candidate,
          ))
          if (preflight.error?.message) {
            emitError('cluster_access', preflight.error.message)
          }
          return
        }

        const retryParams: StartMissionParams = {
          title: mission.title,
          description: mission.description,
          type: mission.type,
          cluster: mission.cluster,
          initialPrompt: lastUserMessage?.content || mission.description,
          context: mission.context,
          dryRun: !!mission.context?.dryRun,
        }
        const { enhancedPrompt } = buildEnhancedPrompt(retryParams)
        state.setMissions(prev => prev.map(candidate =>
          candidate.id === missionId
            ? {
                ...candidate,
                preflightError: undefined,
                messages: [
                  ...getMissionMessages(candidate.messages),
                  {
                    id: generateMessageId('preflight-ok'),
                    role: 'system' as const,
                    content: '**Preflight check passed** — proceeding with mission execution.',
                    timestamp: new Date(),
                  },
                ],
              }
            : candidate,
        ))
        executionApi.executeMission(missionId, enhancedPrompt, { context: mission.context, type: mission.type })
      } catch (error) {
        state.setMissions(prev => prev.map(candidate =>
          candidate.id === missionId
            ? {
                ...candidate,
                status: 'blocked' as MissionStatus,
                currentStep: 'Preflight check error',
                preflightError: {
                  code: 'UNKNOWN_EXECUTION_FAILURE',
                  message: error instanceof Error ? error.message : 'Unknown error',
                  details: { hint: 'The preflight check threw an unexpected error. Retry or check cluster connectivity.' },
                },
              }
            : candidate,
        ))
      }
    })()
  }

  const saveMission = (params: SaveMissionParams): string => {
    const missionId = `mission-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`
    const mission: Mission = {
      id: missionId,
      title: params.title,
      description: params.description,
      type: params.type,
      status: 'saved',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      context: params.context,
      importedFrom: {
        title: params.title,
        description: params.description,
        missionClass: params.missionClass,
        cncfProject: params.cncfProject,
        steps: params.steps,
        tags: params.tags,
      },
    }

    state.setMissions(prev => [mission, ...prev])
    return missionId
  }

  const runSavedMission = (missionId: string, cluster?: string) => {
    const mission = state.missions.find(candidate => candidate.id === missionId)
    if (!mission || mission.status !== 'saved') return

    if (mission.importedFrom?.steps) {
      const syntheticExport = {
        version: 'kc-mission-v1',
        title: mission.importedFrom.title || mission.title,
        description: mission.importedFrom.description || mission.description,
        type: mission.type,
        tags: mission.importedFrom.tags || [],
        steps: mission.importedFrom.steps.map(step => ({
          title: step.title,
          description: step.description,
        })),
      }
      const findings = scanForMaliciousContent(syntheticExport)
      if (findings.length > 0) {
        state.setMissions(prev => prev.map(candidate =>
          candidate.id === missionId
            ? {
                ...candidate,
                status: 'failed' as const,
                messages: [
                  ...getMissionMessages(candidate.messages),
                  {
                    id: generateMessageId(),
                    role: 'system' as const,
                    content: `**Mission blocked:** Imported mission contains potentially unsafe content:\n\n${findings.map(finding => `- ${finding.message}: \`${finding.match}\` (in ${finding.location})`).join('\n')}\n\nPlease review and edit the mission before running.`,
                    timestamp: new Date(),
                  },
                ],
              }
            : candidate,
        ))
        return
      }
    }

    const basePrompt = buildSavedMissionPrompt(mission)
    const params: StartMissionParams = {
      title: mission.title,
      description: mission.description,
      type: mission.type,
      cluster: cluster || undefined,
      initialPrompt: basePrompt,
      context: mission.context,
    }
    const { enhancedPrompt, matchedResolutions, isInstallMission } = buildEnhancedPrompt(params)
    const systemMessages = buildSystemMessages(isInstallMission, matchedResolutions)

    state.setMissions(prev => prev.map(candidate =>
      candidate.id === missionId
        ? {
            ...candidate,
            status: 'pending' as MissionStatus,
            cluster: cluster || undefined,
            agent: state.selectedAgentRef.current || state.defaultAgentRef.current || undefined,
            matchedResolutions: matchedResolutions.length > 0 ? matchedResolutions : undefined,
            messages: [
              {
                id: generateMessageId(),
                role: 'user' as const,
                content: basePrompt,
                timestamp: new Date(),
              },
              ...systemMessages,
            ],
            updatedAt: new Date(),
          }
        : candidate,
    ))
    state.setActiveMissionId(missionId)
    state.setIsSidebarOpen(true)
    state.setIsSidebarMinimized(false)
    emitMissionStarted(params.type, state.selectedAgentRef.current || state.defaultAgentRef.current || 'unknown')
    executionApi.preflightAndExecute(missionId, enhancedPrompt, params)
  }

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
      logger.error('[Missions] Failed to select agent:', error)
    })
  }

  const connectToAgent = () => {
    state.wsReconnectAttempts.current = 0
    connectionApi.ensureConnection().catch((error: unknown) => {
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

import type {
  AgentSelectedPayload,
  AgentsListPayload,
  ChatStreamPayload,
} from '../types/agent'
import { AgentCapabilityToolExec } from '../types/agent'
import { addCategoryTokens, clearActiveTokenCategory } from './useTokenUsage'
import { emitMissionCompleted, emitMissionError, emitMissionToolMissing } from '../lib/analytics'
import { getTokenCategoryForMissionType } from '../lib/tokenUsageMissionCategory'
import { SECONDS_PER_DAY } from '../lib/constants/time'
import {
  CANCEL_ACK_MESSAGE_TYPE,
  CANCEL_CONFIRMED_MESSAGE_TYPE,
  AGENT_DISCONNECT_ERROR_PATTERNS,
  MISSION_RECONNECT_MAX_AGE_MS,
  STREAM_GAP_THRESHOLD_MS,
  isInteractiveContent,
} from './useMissions.constants'
import {
  getMissionMessages,
  generateMessageId,
} from './useMissions.helpers'
import { SELECTED_AGENT_KEY } from './useMissions.state'
import type { MissionProviderState, MissionStateUtils } from './useMissions.state'
import { stripInteractiveArtifacts } from './useMissionPromptBuilder'
import type { MissionStatus } from './useMissionTypes'

export function createMissionMessageHandler(
  state: MissionProviderState,
  stateUtils: MissionStateUtils,
) {
  return (message: { id: string; type: string; payload?: unknown }) => {
    if (!state.connectionEstablished.current) {
      state.connectionEstablished.current = true
      state.wsReconnectAttempts.current = 0
    }

    if (message.type === 'agents_list') {
      const payload = message.payload as AgentsListPayload
      const sanitizedAgents = (payload.agents ?? []).map(agent => ({
        ...agent,
        description: stripInteractiveArtifacts(agent.description),
        displayName: stripInteractiveArtifacts(agent.displayName),
      }))
      state.setAgents(sanitizedAgents)
      state.setDefaultAgent(payload.defaultAgent)

      const persisted = localStorage.getItem(SELECTED_AGENT_KEY)
      const agents = payload.agents ?? []
      const hasAvailableAgent = agents.some(agent => agent.available)
      const persistedAvailable = !!persisted && persisted !== 'none' && agents.some(agent => agent.name === persisted && agent.available)
      const interactiveAgents = new Set(['copilot-cli'])
      const bestAvailable = hasAvailableAgent
        ? (
            agents.find(agent => agent.available && ((agent.capabilities ?? 0) & AgentCapabilityToolExec) !== 0 && !interactiveAgents.has(agent.name))?.name
            || agents.find(agent => agent.available && !interactiveAgents.has(agent.name))?.name
            || agents.find(agent => agent.available)?.name
            || null
          )
        : null
      const safeDefaultAgent = payload.defaultAgent && !interactiveAgents.has(payload.defaultAgent)
        ? payload.defaultAgent
        : null
      const resolved = persistedAvailable ? persisted : (payload.selected || safeDefaultAgent || bestAvailable)

      state.setSelectedAgent(resolved)
      if (resolved) {
        localStorage.setItem(SELECTED_AGENT_KEY, resolved)
      }
      if (persistedAvailable && persisted !== payload.selected && state.wsRef.current?.readyState === WebSocket.OPEN) {
        localStorage.setItem(SELECTED_AGENT_KEY, persisted)
        state.wsRef.current.send(JSON.stringify({
          id: `select-agent-${Date.now()}`,
          type: 'select_agent',
          payload: { agent: persisted },
        }))
      }
      state.setAgentsLoading(false)
      return
    }

    if (message.type === 'agent_selected') {
      const payload = message.payload as AgentSelectedPayload
      state.setSelectedAgent(payload.agent)
      localStorage.setItem(SELECTED_AGENT_KEY, payload.agent)
      return
    }

    const isDedicatedCancelAck =
      message.type === CANCEL_ACK_MESSAGE_TYPE ||
      message.type === CANCEL_CONFIRMED_MESSAGE_TYPE
    const isCancelResultMessage =
      message.type === 'result' &&
      !!message.payload &&
      typeof message.payload === 'object' &&
      'cancelled' in (message.payload as Record<string, unknown>)

    if (isDedicatedCancelAck || isCancelResultMessage) {
      const payload = message.payload as {
        sessionId?: string
        id?: string
        success?: boolean
        cancelled?: boolean
        message?: string
      }
      let cancelledMissionId = payload.sessionId || payload.id
      if (!cancelledMissionId) {
        const intentIds = Array.from(state.cancelIntents.current)
        if (intentIds.length === 1) {
          cancelledMissionId = intentIds[0]
        } else {
          const cancellingMission = state.missionsRef.current.find(mission => mission.status === 'cancelling')
          if (cancellingMission) {
            cancelledMissionId = cancellingMission.id
          }
        }
      }
      if (cancelledMissionId) {
        const cancelFailed = payload.success === false || payload.cancelled === false
        if (cancelFailed) {
          stateUtils.finalizeCancellation(
            cancelledMissionId,
            payload.message || 'Mission cancellation failed — the backend reported an error.',
          )
        } else {
          stateUtils.finalizeCancellation(cancelledMissionId, 'Mission cancelled by user.')
        }
        state.pendingRequests.current.delete(message.id)
      }
      return
    }

    const missionId = state.pendingRequests.current.get(message.id)
    if (!missionId) return

    if (message.type === 'progress') {
      const progressPayload = (message.payload ?? {}) as { tool?: string; output?: string }
      if (progressPayload.tool) {
        if (progressPayload.output) {
          const previousCount = state.toolsInFlight.current.get(missionId) ?? 0
          if (previousCount > 0) {
            const nextCount = previousCount - 1
            if (nextCount === 0) {
              state.toolsInFlight.current.delete(missionId)
            } else {
              state.toolsInFlight.current.set(missionId, nextCount)
            }
          }
        } else {
          const previousCount = state.toolsInFlight.current.get(missionId) ?? 0
          state.toolsInFlight.current.set(missionId, previousCount + 1)
        }
        state.lastStreamTimestamp.current.set(missionId, Date.now())
      }
    }

    state.setMissions(prev => prev.map(mission => {
      if (mission.id !== missionId) return mission

      if (mission.status === 'failed' || mission.status === 'completed' || mission.status === 'cancelled') {
        state.pendingRequests.current.delete(message.id)
        return mission
      }

      if (state.cancelIntents.current.has(missionId)) {
        const isTerminalMessage =
          message.type === 'result' ||
          message.type === 'error' ||
          (message.type === 'stream' && (message.payload as { done?: boolean })?.done)
        if (isTerminalMessage) {
          state.pendingRequests.current.delete(message.id)
          stateUtils.finalizeCancellation(missionId, 'Mission cancelled by user.')
          return mission
        }
        return mission
      }

      if (mission.status === 'cancelling') {
        const isTerminalMessage =
          message.type === 'result' ||
          message.type === 'error' ||
          (message.type === 'stream' && (message.payload as { done?: boolean })?.done)
        if (isTerminalMessage) {
          state.pendingRequests.current.delete(message.id)
          stateUtils.finalizeCancellation(missionId, 'Mission cancelled by user.')
          return mission
        }
        return mission
      }

      if (message.type === 'progress') {
        const payload = message.payload as {
          step?: string
          progress?: number
          tokens?: { input?: number; output?: number; total?: number }
        }
        state.lastStreamTimestamp.current.set(missionId, Date.now())
        const safeTotal = Number(payload.tokens?.total)
        if (!Number.isNaN(safeTotal) && safeTotal > 0) {
          const previousTotal = mission.tokenUsage?.total ?? 0
          const delta = safeTotal - previousTotal
          if (delta > 0) {
            addCategoryTokens(delta, getTokenCategoryForMissionType(mission.type))
          }
        }
        const safeInput = Number(payload.tokens?.input)
        const safeOutput = Number(payload.tokens?.output)
        return {
          ...mission,
          currentStep: payload.step || mission.currentStep,
          progress: payload.progress ?? mission.progress,
          tokenUsage: payload.tokens
            ? {
                input: !Number.isNaN(safeInput) && safeInput > 0 ? safeInput : (mission.tokenUsage?.input ?? 0),
                output: !Number.isNaN(safeOutput) && safeOutput > 0 ? safeOutput : (mission.tokenUsage?.output ?? 0),
                total: !Number.isNaN(safeTotal) && safeTotal > 0 ? safeTotal : (mission.tokenUsage?.total ?? 0),
              }
            : mission.tokenUsage,
          updatedAt: new Date(),
        }
      }

      if (message.type === 'stream') {
        const payload = message.payload as ChatStreamPayload
        const missionMessages = getMissionMessages(mission.messages)
        const lastMessage = missionMessages[missionMessages.length - 1]
        const now = Date.now()
        const lastTimestamp = state.lastStreamTimestamp.current.get(missionId)
        const hasGap = !!lastTimestamp && (now - lastTimestamp > STREAM_GAP_THRESHOLD_MS)

        if (!payload.done) {
          state.lastStreamTimestamp.current.set(missionId, now)
        } else {
          state.lastStreamTimestamp.current.delete(missionId)
        }

        const isActiveRequest = state.pendingRequests.current.has(message.id)
        if (lastMessage?.role === 'assistant' && !payload.done && (mission.status === 'running' || mission.status === 'waiting_input' || isActiveRequest) && !hasGap) {
          return {
            ...mission,
            status: 'running' as MissionStatus,
            currentStep: 'Generating response...',
            updatedAt: new Date(),
            agent: payload.agent || mission.agent,
            messages: [
              ...missionMessages.slice(0, -1),
              {
                ...lastMessage,
                content: lastMessage.content + (payload.content || ''),
                agent: payload.agent || lastMessage.agent,
              },
            ],
          }
        }

        if (!payload.done && payload.content) {
          const splitIndex = (state.streamSplitCounter.current.get(missionId) ?? 0) + 1
          state.streamSplitCounter.current.set(missionId, splitIndex)
          return {
            ...mission,
            status: 'running' as MissionStatus,
            currentStep: 'Generating response...',
            updatedAt: new Date(),
            agent: payload.agent || mission.agent,
            messages: [
              ...missionMessages,
              {
                id: generateMessageId(`s${splitIndex}`),
                role: 'assistant' as const,
                content: payload.content,
                timestamp: new Date(),
                agent: payload.agent || mission.agent,
              },
            ],
          }
        }

        if (payload.done) {
          stateUtils.markMissionAsUnread(missionId)
          if (payload.usage?.totalTokens) {
            const previousTotal = mission.tokenUsage?.total ?? 0
            const delta = payload.usage.totalTokens - previousTotal
            if (delta > 0) {
              addCategoryTokens(delta, getTokenCategoryForMissionType(mission.type))
            }
          }
          clearActiveTokenCategory(missionId)
          const lastAssistantContent = payload.content || mission.messages.filter(messageItem => messageItem.role === 'assistant').pop()?.content || ''
          if (!isInteractiveContent(lastAssistantContent)) {
            stateUtils.startWaitingInputTimeout(missionId)
          }
          return {
            ...mission,
            status: 'waiting_input' as MissionStatus,
            currentStep: undefined,
            updatedAt: new Date(),
          }
        }
      }

      if (message.type === 'result') {
        const payload = message.payload as ChatStreamPayload | { content?: string; output?: string }
        state.pendingRequests.current.delete(message.id)
        stateUtils.clearWaitingInputTimeout(missionId)
        state.streamSplitCounter.current.delete(missionId)
        state.toolsInFlight.current.delete(missionId)
        state.lastStreamTimestamp.current.delete(missionId)
        stateUtils.markMissionAsUnread(missionId)

        const chatPayload = payload as ChatStreamPayload
        const tokenUsage = chatPayload.usage
          ? {
              input: chatPayload.usage.inputTokens,
              output: chatPayload.usage.outputTokens,
              total: chatPayload.usage.totalTokens,
            }
          : mission.tokenUsage

        if (chatPayload.usage?.totalTokens) {
          const previousTotal = mission.tokenUsage?.total ?? 0
          const delta = chatPayload.usage.totalTokens - previousTotal
          if (delta > 0) {
            addCategoryTokens(delta, getTokenCategoryForMissionType(mission.type))
          }
        }

        clearActiveTokenCategory(missionId)
        const resultIsError = !!chatPayload.isError
        const toolsWereExecuted = !!chatPayload.toolsExecuted
        const missionRequiresTools = ['deploy', 'maintain', 'repair', 'upgrade'].includes(mission.type)
        const falsePositiveCompletion = !resultIsError && missionRequiresTools && !toolsWereExecuted
        const resultContent = chatPayload.content || (payload as { output?: string }).output || 'Task completed.'
        const resultIsInteractive = isInteractiveContent(resultContent)

        if (!resultIsInteractive && mission.status === 'running' && !resultIsError && !falsePositiveCompletion) {
          const rawDuration = Math.round((Date.now() - mission.createdAt.getTime()) / 1000)
          const clampedDuration = Math.min(Math.max(rawDuration, 0), SECONDS_PER_DAY)
          emitMissionCompleted(mission.type, clampedDuration)
          window.dispatchEvent(new CustomEvent('kc-mission-completed', {
            detail: { missionId, missionType: mission.type },
          }))
        } else if (!resultIsInteractive && mission.status === 'running' && (resultIsError || falsePositiveCompletion)) {
          const errorMessage = falsePositiveCompletion
            ? 'Agent claimed completion without executing tools'
            : (chatPayload.content || 'Mission failed')
          emitMissionError(mission.type, errorMessage)
        }

        const missionMessages = getMissionMessages(mission.messages)
        const lastUserIndex = missionMessages.map(messageItem => messageItem.role).lastIndexOf('user')
        const MAX_DEDUP_LOOKBACK = 50
        const sliceStart = lastUserIndex >= 0 ? lastUserIndex + 1 : Math.max(0, missionMessages.length - MAX_DEDUP_LOOKBACK)
        const streamedSinceUser = missionMessages
          .slice(sliceStart)
          .filter(messageItem => messageItem.role === 'assistant')
          .map(messageItem => messageItem.content)
          .join('')
        const normalize = (content: string): string => content.replace(/\s+/g, ' ').trim()
        const normalizedStreamed = normalize(streamedSinceUser)
        const normalizedResult = normalize(resultContent)
        const DEDUPE_MIN_CONTENT_LEN = 1
        const alreadyStreamed =
          normalizedStreamed.length >= DEDUPE_MIN_CONTENT_LEN &&
          normalizedResult.length >= DEDUPE_MIN_CONTENT_LEN &&
          (
            normalizedStreamed === normalizedResult ||
            normalizedStreamed.includes(normalizedResult) ||
            normalizedResult.includes(normalizedStreamed)
          )

        let finalStatus: MissionStatus
        let falsePositiveWarning = ''
        if (falsePositiveCompletion) {
          finalStatus = 'failed'
          falsePositiveWarning = '\n\n**⚠️ Mission Validation Failed**\n\nThe AI agent reported completion, but no tools were executed. This typically means the agent did not actually perform the requested actions (e.g., install, deploy, upgrade). Please verify the agent has the required tools available and retry the mission.'
        } else if (resultIsInteractive) {
          finalStatus = 'waiting_input'
        } else if (resultIsError) {
          finalStatus = 'failed'
        } else {
          finalStatus = 'completed'
        }

        return {
          ...mission,
          status: finalStatus,
          currentStep: undefined,
          updatedAt: new Date(),
          agent: chatPayload.agent || mission.agent,
          tokenUsage,
          messages: alreadyStreamed
            ? getMissionMessages(mission.messages)
            : [
                ...getMissionMessages(mission.messages),
                {
                  id: generateMessageId(),
                  role: 'assistant' as const,
                  content: resultContent + falsePositiveWarning,
                  timestamp: new Date(),
                  agent: chatPayload.agent || mission.agent,
                },
              ],
        }
      }

      if (message.type === 'error') {
        const payload = message.payload as { code?: string; message?: string }
        state.pendingRequests.current.delete(message.id)
        stateUtils.clearWaitingInputTimeout(missionId)
        state.streamSplitCounter.current.delete(missionId)
        state.toolsInFlight.current.delete(missionId)
        state.lastStreamTimestamp.current.delete(missionId)

        const combinedErrorText = `${payload.code || ''} ${payload.message || ''}`.toLowerCase()
        const isToolMissingError =
          (combinedErrorText.includes('helm') &&
            (
              combinedErrorText.includes('not found') ||
              combinedErrorText.includes('command not found') ||
              combinedErrorText.includes('executable file not found') ||
              combinedErrorText.includes('no such file')
            )) ||
          (combinedErrorText.includes('gh') &&
            (
              combinedErrorText.includes('not found') ||
              combinedErrorText.includes('command not found') ||
              combinedErrorText.includes('executable file not found') ||
              combinedErrorText.includes('no such file')
            ))

        let missingTool = 'unknown'
        if (isToolMissingError) {
          if (combinedErrorText.includes('helm')) {
            missingTool = 'helm'
          } else if (combinedErrorText.includes('gh')) {
            missingTool = 'gh'
          }
        }

        if (isToolMissingError) {
          emitMissionToolMissing(mission.type, missingTool, payload.message)
        } else {
          emitMissionError(mission.type, payload.code || 'unknown', payload.message)
        }

        let errorContent = payload.message || 'Unknown error'
        if (isToolMissingError) {
          const toolName = missingTool === 'helm' ? 'Helm' : missingTool === 'gh' ? 'GitHub CLI (gh)' : missingTool
          const installInstructions = missingTool === 'helm'
            ? 'Visit https://helm.sh/docs/intro/install/ for installation instructions.'
            : missingTool === 'gh'
              ? 'Visit https://cli.github.com/ for installation instructions.'
              : 'Check the tool documentation for installation instructions.'
          errorContent = `**Mission requires ${toolName} which is not installed**\n\nThis mission attempted to use \`${missingTool}\` but it was not found on your system.\n\n**To fix:**\n1. Install ${toolName} on your machine\n2. ${installInstructions}\n3. Verify installation with \`${missingTool} version\`\n4. Retry the mission\n\n**Note:** ${toolName} is an optional tool for missions. Most missions work without it.`
        } else if (payload.code === 'no_agent' || payload.code === 'agent_unavailable') {
          errorContent = `**Mission interrupted — agent not available**\n\nThe AI agent was disconnected or is not reachable. This often happens after a page refresh.\n\n**To fix:**\n1. Make sure your agent (e.g., Claude Code, bob) is running\n2. Select the agent from the top navbar\n3. Click **Retry Mission** below to rerun your request`
        } else if (payload.code === 'authentication_error') {
          errorContent = '**Authentication Error — Agent CLI Needs Attention**\n\nThis is not a console issue. The AI agent\'s API token has expired or is invalid.\n\n**To fix:** Restart kc-agent to refresh authentication, or run `gh auth status` in your terminal to verify your credentials. You can also update your API key in [Settings →](/settings).\n\nOnce re-authenticated, retry your message.'
        } else if (payload.code === 'mission_timeout') {
          errorContent = `**Mission Timed Out**\n\n${payload.message}\n\nYou can:\n- **Retry** the mission with the same or a different prompt\n- **Try a simpler request** that requires less processing\n- **Check your AI provider** configuration in [Settings](/settings)`
        }

        const isAuthError =
          combinedErrorText.includes('401') ||
          combinedErrorText.includes('403') ||
          combinedErrorText.includes('authentication_error') ||
          combinedErrorText.includes('permission_error') ||
          combinedErrorText.includes('oauth token') ||
          combinedErrorText.includes('token has expired') ||
          combinedErrorText.includes('invalid x-api-key') ||
          combinedErrorText.includes('invalid_api_key') ||
          combinedErrorText.includes('unauthorized') ||
          combinedErrorText.includes('failed to authenticate')
        if (isAuthError) {
          errorContent = '**Authentication Error — Agent CLI Needs Attention**\n\nThis is not a console issue. The AI agent\'s API token has expired or is invalid.\n\n**To fix:** Restart kc-agent to refresh authentication, or run `gh auth status` in your terminal to verify your credentials. You can also update your API key in [Settings →](/settings).\n\nOnce re-authenticated, retry your message.'
        }

        const isRateLimit =
          combinedErrorText.includes('429') ||
          combinedErrorText.includes('rate limit') ||
          combinedErrorText.includes('rate_limit') ||
          combinedErrorText.includes('quota') ||
          combinedErrorText.includes('too many requests') ||
          combinedErrorText.includes('resource_exhausted') ||
          combinedErrorText.includes('tokens per min') ||
          combinedErrorText.includes('requests per min')
        if (isRateLimit) {
          errorContent = '**AI Provider Rate Limit Exceeded**\n\nThe AI provider returned a quota/rate limit error (HTTP 429). Please wait a minute before retrying, or switch to a different AI provider.'
        }

        const isDisconnectPattern = AGENT_DISCONNECT_ERROR_PATTERNS.some(pattern => combinedErrorText.includes(pattern))
        if (isDisconnectPattern && mission.status === 'running' && (Date.now() - new Date(mission.updatedAt).getTime()) <= MISSION_RECONNECT_MAX_AGE_MS) {
          return {
            ...mission,
            currentStep: 'Reconnecting...',
            context: { ...mission.context, needsReconnect: true },
          }
        }

        return {
          ...mission,
          status: 'failed' as MissionStatus,
          currentStep: undefined,
          updatedAt: new Date(),
          messages: [
            ...getMissionMessages(mission.messages),
            {
              id: generateMessageId(),
              role: 'system' as const,
              content: errorContent,
              timestamp: new Date(),
            },
          ],
        }
      }

      return mission
    }))
  }
}

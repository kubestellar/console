import { scanForMaliciousContent } from '../lib/missions/scanner/malicious'
import { emitError, emitMissionStarted } from '../lib/analytics'
import { fetchMissionContent, missionCache } from '../lib/missions/missionCache'
import { matchInstallIntent } from '../lib/missions/intentMatcher'
import type { MissionExport } from '../lib/missions/types'
import {
  buildEnhancedPrompt,
  buildSavedMissionPrompt,
  buildSystemMessages,
} from './useMissionPromptBuilder'
import {
  getMissionMessages,
  generateMessageId,
  resolveMissionToolRequirements,
  getMissingTools,
  shouldAllowMissingToolWarning,
  shouldSkipClusterPreflight,
  buildMissingToolWarning,
  buildMissionToolUnavailableError,
} from './useMissions.helpers'
import type {
  Mission,
  MissionMessage,
  MissionStatus,
  SaveMissionParams,
  StartMissionParams,
} from './useMissionTypes'
import type { MissionProviderState, MissionStateUtils } from './useMissions.state'
import type { MissionExecutionApi } from './useMissions.execution'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { agentFetch } from './mcp/agentFetch'
import {
  runPreflightCheck,
  runToolPreflightCheck,
} from '../lib/missions/preflightCheck'
import { kubectlProxy } from '../lib/kubectlProxy'

export interface MissionStartActions {
  startMission: (params: StartMissionParams) => string
  saveMission: (params: SaveMissionParams) => string
  runSavedMission: (missionId: string, cluster?: string) => void
  retryPreflight: (missionId: string) => void
}

function buildSavedMissionRecord(missionId: string, params: SaveMissionParams): Mission {
  const now = new Date()

  return {
    id: missionId,
    title: params.title,
    description: params.description,
    type: params.type,
    status: 'saved',
    messages: [],
    createdAt: now,
    updatedAt: now,
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
}

function buildMissionSaveParams(mission: MissionExport, context?: Record<string, unknown>): SaveMissionParams {
  return {
    title: mission.title,
    description: mission.description,
    type: mission.type,
    missionClass: mission.missionClass,
    cncfProject: mission.cncfProject,
    steps: (mission.steps || []).map(step => ({
      title: step.title,
      description: step.description,
      yaml: step.yaml,
      command: step.command,
    })),
    tags: mission.tags,
    initialPrompt: mission.description || mission.title,
    context,
  }
}

function getMissionSourceFileName(mission: MissionExport): string {
  const fileName = mission.metadata?.source?.split('/').pop()?.trim()
  if (fileName) return fileName

  const normalizedName = (mission.name || 'install-mission').replace(/\.json$/i, '')
  return `${normalizedName}.json`
}

function buildAutoLoadedSystemMessage(mission: MissionExport): MissionMessage {
  return {
    id: generateMessageId('auto-import'),
    role: 'system',
    content: `Auto-loaded \`${getMissionSourceFileName(mission)}\` from console-kb — following the community-validated install guide.`,
    timestamp: new Date(),
  }
}

export function createMissionStartActions(
  state: MissionProviderState,
  _stateUtils: MissionStateUtils,
  executionApi: Pick<MissionExecutionApi, 'executeMission' | 'preflightAndExecute'>,
): MissionStartActions {
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

    const matchedInstaller = matchInstallIntent(params.initialPrompt, missionCache.installers)
    if (matchedInstaller) {
      const placeholderMission = buildSavedMissionRecord(
        missionId,
        buildMissionSaveParams(matchedInstaller, params.context),
      )

      state.setMissions(prev => [placeholderMission, ...prev])
      state.setActiveMissionId(missionId)
      state.setIsSidebarOpen(true)
      state.setIsSidebarMinimized(false)

      void (async () => {
        let resolvedInstaller = matchedInstaller

        if (!resolvedInstaller.steps?.length) {
          try {
            const fetched = await fetchMissionContent(resolvedInstaller)
            resolvedInstaller = fetched.mission
          } catch {
            resolvedInstaller = matchedInstaller
          }
        }

        const resolvedMission = buildSavedMissionRecord(
          missionId,
          buildMissionSaveParams(resolvedInstaller, params.context),
        )

        state.setMissions(prev => prev.map(candidate => (
          candidate.id === missionId
            ? {
                ...candidate,
                title: resolvedMission.title,
                description: resolvedMission.description,
                type: resolvedMission.type,
                context: resolvedMission.context,
                importedFrom: resolvedMission.importedFrom,
                updatedAt: new Date(),
              }
            : candidate
        )))
        runSavedMission(
          missionId,
          params.cluster,
          [buildAutoLoadedSystemMessage(resolvedInstaller)],
          resolvedMission,
        )
      })()

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
    const mission = buildSavedMissionRecord(missionId, params)

    state.setMissions(prev => [mission, ...prev])
    return missionId
  }

  const runSavedMission = (
    missionId: string,
    cluster?: string,
    extraSystemMessages: MissionMessage[] = [],
    missionOverride?: Mission,
  ) => {
    const mission = missionOverride
      || state.missionsRef.current.find(candidate => candidate.id === missionId)
      || state.missions.find(candidate => candidate.id === missionId)
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
              ...extraSystemMessages,
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

  return {
    startMission,
    saveMission,
    runSavedMission,
    retryPreflight,
  }
}

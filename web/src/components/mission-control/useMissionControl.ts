/** useMissionControl — State management hook for the Mission Control wizard. */

export type { PersistedStateEntry, MissionConversationMessage, BalancedBlockScanFrame, BalancedBlockScanCursor, AvailableCluster, InstalledProjectsSummary, SuggestionPromptResult, AssignmentResponse, ProjectResponse } from './useMissionControl.types'
export { PROJECT_NAME_ALLOWED_REGEX, PROJECT_NAME_MAX_LENGTH } from './useMissionControl.constants'
export { consumePersistQuotaBanner } from './useMissionControl.state'
export { buildInstallPromptForProject, isSafeProjectName, mergeProjects } from './useMissionControl.helpers'
export { createBalancedBlockScanCursor, extractJSON, getAssistantContentSinceLastUser, getAssistantMessagesSinceLastUser, resetOversizedWarnings } from './useMissionControl.parsing'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../ui/Toast'
import { useMissions } from '../../hooks/useMissions'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useHelmReleases } from '../../hooks/mcp/helm'
import { useClusters } from '../../hooks/mcp/clusters'
import { logger } from '@/lib/logger'
import { AI_SUGGEST_TIMEOUT_MS, PERSIST_KEYSTROKE_DEBOUNCE_MS, STREAM_JSON_DEBOUNCE_MS } from './useMissionControl.constants'
import { clearPersistedState, loadPersistedState, makeInitialState, persistState } from './useMissionControl.state'
import { buildAssignmentsPrompt, buildAutoAssignments, buildInstallPromptForProject, buildSuggestionPrompt, computeInstalledProjectsSummary, isSafeProjectName, mergeProjects } from './useMissionControl.helpers'
import { createBalancedBlockScanCursor, extractJSON, getAssistantContentSinceLastUser, getAssistantMessagesSinceLastUser, resetBalancedBlockScanCursor, resetOversizedWarnings } from './useMissionControl.parsing'
import type { AssignmentResponse, AvailableCluster, BalancedBlockScanCursor, ProjectResponse } from './useMissionControl.types'
import type { MissionControlState, OverlayMode, PayloadProject, PhaseProgress, WizardPhase } from './types'

const TERMINAL_MISSION_STATUSES = new Set<string>(['failed', 'completed', 'cancelled', 'blocked'])

export function useMissionControl() {
  const { showToast } = useToast()
  const { startMission, sendMessage, missions, dismissMission } = useMissions()
  const { releases: helmReleases } = useHelmReleases()
  const { deduplicatedClusters: clusters, isLoading: clustersLoading, lastUpdated: clustersLastUpdated } = useClusters()
  const [state, setState] = useState<MissionControlState>(() => makeInitialState(loadPersistedState()))
  const [staleClusterNames, setStaleClusterNames] = useState<string[]>([])

  const stateRef = useRef(state)
  const stateRefForFlush = useRef(state)
  const helmReleasesRef = useRef(helmReleases)
  const planningMissionIdRef = useRef(state.planningMissionId)
  const prevProjectNamesRef = useRef('')
  const staleReconcileDoneRef = useRef(false)
  const lastParsedContentRef = useRef('')
  const lastBalancedScanMissionIdRef = useRef<string | undefined>(state.planningMissionId)
  const lastAssistantMessageCountRef = useRef(0)
  const balancedBlockScanCursorRef = useRef<BalancedBlockScanCursor>(createBalancedBlockScanCursor())
  const aiRequestInFlightRef = useRef(false)
  const aiTimedOutRef = useRef(false)
  const userInteractedAfterTimeoutRef = useRef(false)
  const userMutationGenerationRef = useRef(0)
  const lastDispatchedGenerationRef = useRef(0)
  const kubaraChartNamesRef = useRef<Set<string>>(new Set())

  const debouncedState = useDebouncedValue(state, PERSIST_KEYSTROKE_DEBOUNCE_MS)
  const planningMission = missions.find((mission) => mission.id === state.planningMissionId)
  const latestAssistantContent = useMemo(() => getAssistantContentSinceLastUser(planningMission?.messages), [planningMission?.id, planningMission?.messages])
  const debouncedAssistantContent = useDebouncedValue(latestAssistantContent, STREAM_JSON_DEBOUNCE_MS)
  const installedSummary = useMemo(() => computeInstalledProjectsSummary({ projects: state.projects, assignments: state.assignments, helmReleases, clusters }), [state.projects, state.assignments, helmReleases, clusters])

  const bumpUserGeneration = useCallback(() => { userMutationGenerationRef.current += 1 }, [])
  const markInteractionAfterTimeout = useCallback(() => { if (aiTimedOutRef.current) userInteractedAfterTimeoutRef.current = true }, [])
  const markManualMutation = useCallback(() => { bumpUserGeneration(); markInteractionAfterTimeout() }, [bumpUserGeneration, markInteractionAfterTimeout])

  useLayoutEffect(() => { stateRef.current = state }, [state])
  useLayoutEffect(() => { stateRefForFlush.current = state }, [state])
  useLayoutEffect(() => { helmReleasesRef.current = helmReleases }, [helmReleases])
  useLayoutEffect(() => { planningMissionIdRef.current = state.planningMissionId }, [state.planningMissionId])

  useEffect(() => { persistState(debouncedState) }, [debouncedState])
  useEffect(() => {
    const onBeforeUnload = () => persistState(stateRefForFlush.current)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    if (staleReconcileDoneRef.current || !clusters || clustersLoading || clustersLastUpdated == null) return
    if (state.assignments.length === 0 && state.targetClusters.length === 0) { staleReconcileDoneRef.current = true; return }
    const liveByName = new Map(clusters.map((cluster) => [cluster.name, cluster]))
    const staleFromAssignments = state.assignments.filter((assignment) => {
      const live = liveByName.get(assignment.clusterName)
      return !live || !!(assignment.clusterServer && live.server && assignment.clusterServer !== live.server)
    }).map((assignment) => assignment.clusterName)
    const staleFromTargets = state.targetClusters.filter((name) => !liveByName.has(name))
    const allStale = Array.from(new Set([...staleFromAssignments, ...staleFromTargets]))
    staleReconcileDoneRef.current = true
    if (allStale.length === 0) return
    const staleAssignmentNames = new Set(staleFromAssignments)
    setStaleClusterNames(allStale)
    setState((prev) => ({ ...prev, assignments: prev.assignments.filter((assignment) => liveByName.has(assignment.clusterName) && !staleAssignmentNames.has(assignment.clusterName)), targetClusters: prev.targetClusters.filter((name) => liveByName.has(name)), phases: [] }))
    logger.warn(`[MissionControl] issue 6403 — dropped ${allStale.length} stale cluster reference(s) from persisted state: ${allStale.join(', ')}`)
  }, [clusters, clustersLoading, clustersLastUpdated, state.assignments, state.targetClusters])

  useEffect(() => {
    if (!planningMission || !state.planningMissionId || planningMission.id !== state.planningMissionId) return
    if (aiTimedOutRef.current || userInteractedAfterTimeoutRef.current || !debouncedAssistantContent) return
    const assistantMessages = getAssistantMessagesSinceLastUser(planningMission.messages)
    if (planningMission.id !== lastBalancedScanMissionIdRef.current || assistantMessages.length !== lastAssistantMessageCountRef.current) {
      lastBalancedScanMissionIdRef.current = planningMission.id
      lastAssistantMessageCountRef.current = assistantMessages.length
      resetBalancedBlockScanCursor(balancedBlockScanCursorRef.current)
    }
    const assistantContent = assistantMessages.map((message) => message.content).join('')
    if (!assistantContent || assistantContent === lastParsedContentRef.current) return

    if (state.phase === 'define') {
      const parsed = extractJSON<ProjectResponse>(assistantContent, 'projects', state.planningMissionId, balancedBlockScanCursorRef.current)
      const projectsRaw = parsed?.projects
      const projects = Array.isArray(projectsRaw) ? projectsRaw : []
      if (projectsRaw !== undefined && !Array.isArray(projectsRaw)) logger.warn('[MissionControl] issue 6725 — AI returned non-array `projects` payload; ignoring.')
      if (projects.length === 0) return
      const validProjects = projects.filter((project) => isSafeProjectName(project?.name) && (project.displayName === undefined || isSafeProjectName(project.displayName)))
      if (validProjects.length === 0) { logger.warn('[MissionControl] AI returned projects payload with no valid entries; skipping update.'); return }
      if (validProjects.length !== projects.length) logger.warn(`[MissionControl] filtered ${projects.length - validProjects.length} invalid project(s) from AI payload`)
      const kubaraNames = kubaraChartNamesRef.current
      lastParsedContentRef.current = assistantContent
      const aiSuggestedProjects = validProjects.map((project) => ({ ...project, dependencies: project.dependencies ?? [], kubaraChartName: kubaraNames.has(project.name) ? project.name : undefined }))
      setState((prev) => ({ ...prev, projects: mergeProjects(prev.projects, aiSuggestedProjects), originalAISuggestions: aiSuggestedProjects }))
      return
    }

    if (state.phase !== 'assign') return
    const parsed = extractJSON<AssignmentResponse>(assistantContent, 'assignments', state.planningMissionId, balancedBlockScanCursorRef.current)
    const assignmentsRaw = parsed?.assignments
    const assignments = Array.isArray(assignmentsRaw) ? assignmentsRaw : []
    if (assignmentsRaw !== undefined && !Array.isArray(assignmentsRaw)) logger.warn('[MissionControl] issue 6726 — AI returned non-array `assignments` payload; ignoring.')
    if (assignments.length === 0) return
    if (lastDispatchedGenerationRef.current !== userMutationGenerationRef.current) {
      logger.warn('[MissionControl] issue 6404 — discarding stale AI assignment stream (user mutated state after dispatch)')
      lastParsedContentRef.current = assistantContent
      return
    }
    lastParsedContentRef.current = assistantContent
    setState((prev) => {
      const aiClusterNames = new Set(assignments.map((assignment) => assignment.clusterName))
      return { ...prev, assignments: [...assignments, ...prev.assignments.filter((assignment) => !aiClusterNames.has(assignment.clusterName))], phases: parsed?.phases ?? prev.phases }
    })
  }, [debouncedAssistantContent, planningMission, state.phase, state.planningMissionId])

  useEffect(() => {
    if (!planningMission) return
    const isStreaming = planningMission.status === 'running'
    const isTerminal = TERMINAL_MISSION_STATUSES.has(planningMission.status)
    if (isStreaming !== state.aiStreaming) {
      setState((prev) => ({ ...prev, aiStreaming: isStreaming }))
      if (!isStreaming) aiRequestInFlightRef.current = false
    } else if (isTerminal && state.aiStreaming) {
      setState((prev) => ({ ...prev, aiStreaming: false }))
      aiRequestInFlightRef.current = false
    }
    if (planningMission.status === 'failed' && state.aiStreaming) {
      const text = (((planningMission.messages || []).slice(-1)[0]?.content) || '').toLowerCase()
      const isAuthError = text.includes('401') || text.includes('unauthorized') || text.includes('authentication') || text.includes('token')
      showToast(isAuthError ? 'Agent returned 401 Unauthorized — check kc-agent credentials or restart the agent' : 'AI suggestion failed — local agent is unavailable or returned an error', 'error')
    }
  }, [planningMission, state.aiStreaming, showToast])

  useEffect(() => {
    if (!state.aiStreaming || planningMission) return
    const timer = setTimeout(() => {
      const missionId = planningMissionIdRef.current
      if (missionId) { try { dismissMission(missionId) } catch { /* ignore */ } }
      setState((prev) => {
        if (!prev.aiStreaming) return prev
        aiRequestInFlightRef.current = false
        aiTimedOutRef.current = true
        return { ...prev, aiStreaming: false }
      })
    }, AI_SUGGEST_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [state.aiStreaming, planningMission, dismissMission])

  useEffect(() => {
    const currentKey = JSON.stringify(state.projects.map((project) => project.name).sort())
    if (currentKey === prevProjectNamesRef.current) return
    prevProjectNamesRef.current = currentKey
    const projectNames = new Set(state.projects.map((project) => project.name))
    setState((prev) => {
      const assignments = prev.assignments.map((assignment) => ({ ...assignment, projectNames: assignment.projectNames.filter((name) => projectNames.has(name)) }))
      const assigned = new Set(assignments.flatMap((assignment) => assignment.projectNames))
      const newProjects = [...projectNames].filter((name) => !assigned.has(name))
      if (newProjects.length > 0 && assignments.length > 0) assignments[0] = { ...assignments[0], projectNames: [...assignments[0].projectNames, ...newProjects] }
      return { ...prev, assignments, phases: [] }
    })
  }, [state.projects])

  const acknowledgeStaleClusters = () => setStaleClusterNames([])
  const setDescription = (description: string) => { markInteractionAfterTimeout(); setState((prev) => ({ ...prev, description })) }
  const setTitle = (title: string) => setState((prev) => ({ ...prev, title }))
  const setTargetClusters = (targetClusters: string[]) => setState((prev) => { const next = { ...prev, targetClusters }; persistState(next); return next })

  const askAIForSuggestions = async (description: string, existingProjects: PayloadProject[] = []) => {
    if (aiRequestInFlightRef.current) { logger.warn('[MissionControl] #6827 — askAIForSuggestions already in flight (ref guard); ignoring'); return }
    aiRequestInFlightRef.current = true
    aiTimedOutRef.current = false
    userInteractedAfterTimeoutRef.current = false
    const currentState = stateRef.current
    if (currentState.aiStreaming) { aiRequestInFlightRef.current = false; logger.warn('[MissionControl] issue 6406 — askAIForSuggestions called while already streaming; ignoring'); return }
    const currentPlanningMissionId = planningMissionIdRef.current ?? currentState.planningMissionId
    const missionExists = !!currentPlanningMissionId && missions.some((mission) => mission.id === currentPlanningMissionId)
    let missionId = missionExists ? currentPlanningMissionId : undefined
    try {
      const { prompt, kubaraChartNames } = await buildSuggestionPrompt({ description, existingProjects, targetClusters: currentState.targetClusters, helmReleases: helmReleasesRef.current })
      kubaraChartNamesRef.current = kubaraChartNames
      if (!missionId) {
        missionId = startMission({ title: 'Mission Control Planning', description: 'AI-assisted fix planning', type: 'custom', initialPrompt: prompt, skipReview: true })
        planningMissionIdRef.current = missionId
        setState((prev) => ({ ...prev, planningMissionId: missionId, aiStreaming: true }))
      } else {
        sendMessage(missionId, prompt)
        setState((prev) => ({ ...prev, aiStreaming: true }))
      }
    } catch (error: unknown) {
      aiRequestInFlightRef.current = false
      logger.error('[MissionControl] #6811 — askAIForSuggestions failed:', error)
      showToast('AI suggestion request failed — please try again', 'error')
    }
  }

  const addProject = (project: PayloadProject) => { markManualMutation(); const tagged = { ...project, userAdded: true }; setState((prev) => prev.projects.some((entry) => entry.name === tagged.name) ? prev : { ...prev, projects: [...prev.projects, tagged] }) }
  const removeProject = (name: string) => { markManualMutation(); setState((prev) => ({ ...prev, projects: prev.projects.filter((project) => project.name !== name) })) }
  const updateProjectPriority = (name: string, priority: PayloadProject['priority']) => { markManualMutation(); setState((prev) => ({ ...prev, projects: prev.projects.map((project) => (project.name === name ? { ...project, priority } : project)) })) }
  const replaceProject = (oldName: string, newProject: PayloadProject) => {
    markManualMutation()
    setState((prev) => {
      const existing = prev.projects.find((project) => project.name === oldName)
      const originalName = existing?.originalName ?? oldName
      const isSwapBackToOriginal = newProject.name === originalName
      return {
        ...prev,
        projects: prev.projects.map((project) => project.name !== oldName ? project : { ...newProject, originalName: isSwapBackToOriginal ? undefined : originalName, userAdded: isSwapBackToOriginal ? existing?.userAdded : true }),
        assignments: prev.assignments.map((assignment) => ({ ...assignment, projectNames: assignment.projectNames.map((name) => (name === oldName ? newProject.name : name)) })),
      }
    })
  }

  const askAIForAssignments = (projects: PayloadProject[], clustersJson: string) => {
    if (aiRequestInFlightRef.current) { logger.warn('[MissionControl] #7111 — askAIForAssignments already in flight (ref guard); ignoring'); return }
    aiRequestInFlightRef.current = true
    aiTimedOutRef.current = false
    userInteractedAfterTimeoutRef.current = false
    if (stateRef.current.aiStreaming) { aiRequestInFlightRef.current = false; logger.warn('[MissionControl] issue 6406 — askAIForAssignments called while already streaming; ignoring'); return }
    const currentPlanningMissionId = stateRef.current.planningMissionId
    const missionExists = !!currentPlanningMissionId && missions.some((mission) => mission.id === currentPlanningMissionId)
    let missionId = missionExists ? currentPlanningMissionId : undefined
    lastDispatchedGenerationRef.current = userMutationGenerationRef.current
    const prompt = buildAssignmentsPrompt(projects, clustersJson)
    try {
      if (!missionId) {
        missionId = startMission({ title: 'Mission Control Planning', description: 'AI-assisted cluster assignment', type: 'custom', initialPrompt: prompt, skipReview: true })
        planningMissionIdRef.current = missionId
        setState((prev) => ({ ...prev, planningMissionId: missionId, aiStreaming: true }))
      } else {
        sendMessage(missionId, prompt)
        setState((prev) => ({ ...prev, aiStreaming: true }))
      }
    } catch (error: unknown) {
      aiRequestInFlightRef.current = false
      logger.error('[MissionControl] #7117 — askAIForAssignments failed:', error)
      showToast('AI assignment request failed — please try again', 'error')
    }
  }

  const moveProjectToCluster = (projectName: string, fromCluster: string, toCluster: string) => {
    if (fromCluster === toCluster) return
    bumpUserGeneration()
    setState((prev) => ({ ...prev, assignments: prev.assignments.map((assignment) => assignment.clusterName === fromCluster ? { ...assignment, projectNames: assignment.projectNames.filter((name) => name !== projectName) } : assignment.clusterName === toCluster ? { ...assignment, projectNames: assignment.projectNames.includes(projectName) ? assignment.projectNames : [...assignment.projectNames, projectName] } : assignment) }))
  }
  const setAssignment = (clusterName: string, projectName: string, assigned: boolean) => setState((prev) => {
    bumpUserGeneration()
    const assignments = [...prev.assignments]
    const index = assignments.findIndex((assignment) => assignment.clusterName === clusterName)
    if (index >= 0) {
      const existing = assignments[index]
      assignments[index] = { ...existing, projectNames: assigned ? (existing.projectNames.includes(projectName) ? existing.projectNames : [...existing.projectNames, projectName]) : existing.projectNames.filter((name) => name !== projectName) }
    } else if (assigned) {
      const liveCluster = clusters?.find((cluster) => cluster.name === clusterName)
      assignments.push({ clusterName, clusterContext: liveCluster?.context ?? clusterName, clusterServer: liveCluster?.server, provider: 'kubernetes', projectNames: [projectName], warnings: [], readiness: { cpuHeadroomPercent: 50, memHeadroomPercent: 50, storageHeadroomPercent: 50, overallScore: 50 } })
    }
    const next = { ...prev, assignments }
    persistState(next)
    return next
  })

  const setPhase = (phase: WizardPhase) => setState((prev) => { bumpUserGeneration(); const next = { ...prev, phase }; persistState(next); return next })
  const setOverlay = (overlay: OverlayMode) => setState((prev) => ({ ...prev, overlay }))
  const setDeployMode = (deployMode: 'phased' | 'yolo') => setState((prev) => ({ ...prev, deployMode }))
  const setDryRun = (isDryRun: boolean) => setState((prev) => ({ ...prev, isDryRun }))
  const updateLaunchProgress = useCallback((launchProgress: PhaseProgress[]) => setState((prev) => ({ ...prev, launchProgress })), [])
  const setGroundControlDashboardId = (groundControlDashboardId: string) => setState((prev) => ({ ...prev, groundControlDashboardId }))

  const reset = () => {
    const missionId = state.planningMissionId
    if (missionId) { try { dismissMission(missionId) } catch { /* ignore */ } }
    resetOversizedWarnings()
    staleReconcileDoneRef.current = false
    prevProjectNamesRef.current = ''
    userMutationGenerationRef.current = 0
    lastDispatchedGenerationRef.current = 0
    aiRequestInFlightRef.current = false
    aiTimedOutRef.current = false
    userInteractedAfterTimeoutRef.current = false
    planningMissionIdRef.current = undefined
    kubaraChartNamesRef.current = new Set()
    clearPersistedState()
    lastParsedContentRef.current = ''
    lastBalancedScanMissionIdRef.current = undefined
    lastAssistantMessageCountRef.current = 0
    resetBalancedBlockScanCursor(balancedBlockScanCursorRef.current)
    setState(makeInitialState())
  }

  const hydrateFromPlan = (partial: Partial<MissionControlState>) => setState(() => ({ ...makeInitialState(), ...partial, phase: 'blueprint', aiStreaming: false, launchProgress: [] }))
  const autoAssignProjects = async (availableClusters: AvailableCluster[]) => {
    const assignments = await buildAutoAssignments({ projects: stateRef.current.projects, availableClusters, existingAssignments: stateRef.current.assignments, installedOnCluster: installedSummary.installedOnCluster })
    if (assignments.length === 0) return
    setState((prev) => ({ ...prev, assignments }))
  }

  return { state, installedProjects: installedSummary.installedProjects, installedOnCluster: installedSummary.installedOnCluster, setDescription, setTitle, setTargetClusters, askAIForSuggestions, addProject, removeProject, updateProjectPriority, replaceProject, askAIForAssignments, autoAssignProjects, setAssignment, moveProjectToCluster, setPhase, setOverlay, setDeployMode, setDryRun, updateLaunchProgress, setGroundControlDashboardId, planningMission, staleClusterNames, acknowledgeStaleClusters, reset, hydrateFromPlan }
}

export const __missionControlTestables = { buildInstallPromptForProject, isSafeProjectName, mergeProjects, extractJSON, createBalancedBlockScanCursor, getAssistantContentSinceLastUser, getAssistantMessagesSinceLastUser, resetOversizedWarnings }

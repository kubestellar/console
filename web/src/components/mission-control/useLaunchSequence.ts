/**
 * useLaunchSequence — Encapsulates all hook/state logic for LaunchSequence
 * so the main component file stays under 400 lines.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMissions } from '../../hooks/useMissions'
import { loadMissionPrompt } from '../cards/multi-tenancy/missionLoader'
import type { PhaseProgress, PhaseStatus } from './types'
import { buildInstallPromptForProject } from './useMissionControl'
import type { LaunchSequenceProps, UnifiedMissionWorkload } from './LaunchSequence.types'
import {
  RETRIED_MISSION_STATUSES,
  TERMINAL_STATUSES,
  buildFallbackPhasesFromAssignments,
  computePhaseSignature,
  derivePhaseStatus,
  getUiSafeDisplayName,
} from './LaunchSequence.utils'

export function useLaunchSequence({
  state,
  onUpdateProgress,
  onComplete,
}: Pick<LaunchSequenceProps, 'state' | 'onUpdateProgress' | 'onComplete'>) {
  const { t } = useTranslation('common')
  const { startMission, missions } = useMissions()
  const [isStarted, setIsStarted] = useState(false)
  const progressRef = useRef<PhaseProgress[]>(state.launchProgress)
  // #6632 — Track mount state so effects scheduled before unmount (phase
  // initialization, mission monitor, auto-start) can't call onUpdateProgress
  // or onComplete on a closed dialog. Without this, closing Mission Control
  // mid-launch fired a cascade of stale progress updates on a dead tree.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // #6408 — If `state.phases` is empty but the user has assignments, rebuild
  // a single deploy phase from those assignments instead of calling
  // `onComplete()` on an empty list (which would congratulate the user for
  // deploying zero things). If BOTH phases and assignments are empty, we
  // fall through to the "no projects to deploy" error path below.
  const effectivePhases = useMemo(() => {
    if (state.phases.length > 0) return state.phases
    return buildFallbackPhasesFromAssignments(state)
  }, [state])
  const hasNothingToDeploy = effectivePhases.length === 0

  /** Content-based signature for phase membership (#5508) */
  const phaseSignature = useMemo(
    () => computePhaseSignature(effectivePhases),
    [effectivePhases]
  )

  // Initialize progress from phases — keyed on content signature, not just length (#5508)
  useEffect(() => {
    if (state.launchProgress.length > 0) {
      progressRef.current = state.launchProgress
      return
    }
    if (effectivePhases.length === 0) return

    const initial: PhaseProgress[] = effectivePhases.map((phase) => ({
      phase: phase.phase,
      status: 'pending' as PhaseStatus,
      projects: (phase.projectNames || []).map((name) => ({
        name,
        status: 'pending' as const })) }))
    progressRef.current = initial
    // #6632 — guard against firing onUpdateProgress on a closed dialog
    if (!isMountedRef.current) return
    setIsStarted(false)
    onUpdateProgress(initial)
  }, [phaseSignature])

  const updateProgress = (updater: (prev: PhaseProgress[]) => PhaseProgress[]) => {
    const next = updater(progressRef.current)
    progressRef.current = next
    // #6632 — Never call onUpdateProgress after the dialog has been closed.
    if (!isMountedRef.current) return
    onUpdateProgress(next)
  }

  const buildUnifiedMissionPlan = async (): Promise<{
    prompt: string
    clusters: string[]
    workloadNames: string[]
  }> => {
    const seenProjects = new Set<string>()
    const workloadPlans = await Promise.all(
      effectivePhases
        .flatMap((phase) => (phase.projectNames || []).map((projectName) => ({ phase, projectName })))
        .filter(({ projectName }) => {
          if (seenProjects.has(projectName)) return false
          seenProjects.add(projectName)
          return true
        })
        .map(async ({ phase, projectName }): Promise<UnifiedMissionWorkload | null> => {
          const project = state.projects.find((candidate) => candidate.name === projectName)
          if (!project) return null

          const fallbackPrompt = buildInstallPromptForProject(
            project.name,
            project.displayName,
          )
          const prompt = await loadMissionPrompt(
            project.name,
            fallbackPrompt,
            project.kbPath ? [project.kbPath] : undefined,
            project.kubaraChartName ? { kubaraChartName: project.kubaraChartName } : undefined,
          )

          return {
            projectName,
            uiSafeDisplayName: getUiSafeDisplayName(project),
            phase: phase.phase,
            phaseName: phase.name,
            targetClusters: state.assignments
              .filter((assignment) => (assignment.projectNames || []).includes(projectName))
              .map((assignment) => assignment.clusterName),
            prompt,
          }
        })
    )

    const workloads = workloadPlans.filter((workload): workload is UnifiedMissionWorkload => workload !== null)
    if (workloads.length === 0) {
      throw new Error('Mission Control could not find any workloads to deploy.')
    }

    const clusters = Array.from(new Set(workloads.flatMap((workload) => workload.targetClusters)))
    const assignmentsJson = JSON.stringify(
      (state.assignments || []).map((assignment) => ({
        clusterName: assignment.clusterName,
        clusterContext: assignment.clusterContext,
        provider: assignment.provider,
        projectNames: assignment.projectNames || [],
        warnings: assignment.warnings || [],
      })),
      null,
      2,
    )
    const phasesJson = JSON.stringify(
      effectivePhases.map((phase) => ({
        phase: phase.phase,
        name: phase.name,
        projectNames: phase.projectNames || [],
      })),
      null,
      2,
    )

    const prompt = [
      `${state.isDryRun ? 'Validate' : 'Execute'} this Mission Control deployment as ONE unified AI mission session.`,
      'Do not split this deployment into separate mission sessions and do not ask for workload-by-workload acceptance.',
      state.deployMode === 'phased'
        ? 'Deployment mode: phased. Complete each phase in order and verify the workloads in a phase before moving to the next.'
        : 'Deployment mode: yolo. You may perform independent workload deployments in parallel when safe, but keep everything inside this single mission session.',
      '',
      state.title ? `Mission title: ${state.title}` : '',
      state.description ? `Mission goal: ${state.description}` : '',
      clusters.length > 0 ? `Target clusters: ${clusters.join(', ')}` : '',
      '',
      'Cluster assignments:',
      '```json',
      assignmentsJson,
      '```',
      '',
      'Deployment phases:',
      '```json',
      phasesJson,
      '```',
      '',
      'Use the workload-specific runbooks below. The listed target clusters are authoritative.',
      ...workloads.flatMap((workload, index) => [
        '',
        `## Workload ${index + 1}: ${workload.uiSafeDisplayName}`,
        `Project key: ${workload.projectName}`,
        `Phase: ${workload.phase} — ${workload.phaseName}`,
        `Target clusters: ${workload.targetClusters.length > 0 ? workload.targetClusters.join(', ') : 'Unassigned'}`,
        '',
        workload.prompt,
      ]),
    ].filter(Boolean).join('\n')

    return {
      prompt,
      clusters,
      workloadNames: workloads.map((workload) => workload.projectName),
    }
  }

  const startUnifiedMission = async () => {
    updateProgress((prev) =>
      prev.map((phase) => ({
        ...phase,
        status: 'running',
        projects: phase.projects.map((project) => ({
          ...project,
          status: 'running' as const,
          error: undefined as string | undefined,
        })),
      }))
    )

    try {
      const { prompt, clusters, workloadNames } = await buildUnifiedMissionPlan()
      const dryRunPrefix = state.isDryRun ? t('missionControl.launchSequence.dryRunPrefix') : ''
      const clusterCount = clusters.length
      const missionId = startMission({
        title: `${dryRunPrefix}${state.title || t('missionControl.launchSequence.defaultMissionTitle')}`,
        description: `${state.isDryRun ? t('missionControl.launchSequence.dryRunValidation') : t('missionControl.launchSequence.unifiedDeployment')} for ${workloadNames.length} workload${workloadNames.length === 1 ? '' : 's'}${clusterCount > 0 ? ` across ${clusterCount} cluster${clusterCount === 1 ? '' : 's'}` : ''}`,
        type: 'deploy',
        initialPrompt: prompt,
        dryRun: state.isDryRun,
        context: {
          source: 'mission-control',
          targetClusters: clusters,
          workloads: workloadNames,
        },
      })

      updateProgress((prev) =>
        prev.map((phase) => ({
          ...phase,
          status: 'running',
          projects: phase.projects.map((project) => ({
            ...project,
            missionId,
            status: 'running' as const,
            error: undefined as string | undefined,
          })),
        }))
      )
    } catch (error: unknown) {
      const errorMessage = Array.isArray(error)
        ? error.map((item) => (item instanceof Error ? item.message : String(item))).join('; ')
        : error instanceof Error ? error.message : String(error)
      updateProgress((prev) =>
        prev.map((phase) => ({
          ...phase,
          status: 'failed',
          projects: phase.projects.map((project) => ({
            ...project,
            status: 'failed' as const,
            error: errorMessage,
          })),
        }))
      )
    }
  }

  // Monitor mission statuses and update progress
  // #7157 — Added 'cancelled' status mapping so cancelled missions are
  // reflected in launch progress instead of staying in a stale state.
  useEffect(() => {
    const progress = progressRef.current
    let changed = false
    const updated = progress.map((phase) => {
      const projects = phase.projects.map((proj) => {
        if (!proj.missionId) return proj
        const mission = missions.find((m) => m.id === proj.missionId)
        if (!mission) return proj
        if (proj.status === 'failed' && RETRIED_MISSION_STATUSES.has(mission.status)) {
          changed = true
          return { ...proj, status: 'running' as const, error: undefined as string | undefined }
        }
        if (proj.status === 'completed' || proj.status === 'failed') return proj
        if (mission.status === 'completed') {
          changed = true
          return { ...proj, status: 'completed' as const }
        }
        if (mission.status === 'failed' || mission.status === 'cancelled') {
          changed = true
          return { ...proj, status: 'failed' as const, error: mission.status === 'cancelled' ? t('missionControl.launchSequence.missionCancelled') : t('missionControl.launchSequence.missionFailed') }
        }
        return proj
      })
      const nextPhase = { ...phase, projects }
      const nextStatus = derivePhaseStatus(nextPhase)
      if (nextStatus !== phase.status) {
        changed = true
        return { ...nextPhase, status: nextStatus }
      }
      return nextPhase
    })

    if (changed) {
      progressRef.current = updated
      // #6632 — Don't fire onUpdateProgress / onComplete on a closed dialog.
      if (!isMountedRef.current) return
      onUpdateProgress(updated)

      // #6408 — Never call onComplete on an empty progress list. Without
      // this guard, a launch triggered on zero phases (phases === [] and
      // assignments === []) would fire onComplete immediately and show a
      // bogus "Mission Complete!" celebration.
      if (updated.length === 0) return
      // Check if all phases complete
      if (updated.every((p) => TERMINAL_STATUSES.includes(p.status))) {
        onComplete()
      }
    }
  }, [missions, onUpdateProgress, onComplete])

  // Auto-start on mount — keyed on content signature (#5508). Mission Control
  // now launches a single unified mission session for the whole deployment.
  useEffect(() => {
    if (isStarted || effectivePhases.length === 0) return
    setIsStarted(true)
    void startUnifiedMission()
  }, [phaseSignature, isStarted, effectivePhases.length])

  const progress = state.launchProgress.length > 0 ? state.launchProgress : progressRef.current
  const launchMissionId = progress
    .flatMap((phase) => phase.projects)
    .map((project) => project.missionId)
    .find((missionId): missionId is string => typeof missionId === 'string' && missionId.length > 0) || null
  const launchMission = launchMissionId
    ? missions.find((mission) => mission.id === launchMissionId) || null
    : null
  const deploymentProjectCount = useMemo(
    () => new Set(effectivePhases.flatMap((phase) => phase.projectNames || [])).size,
    [effectivePhases],
  )
  const allComplete = progress.length > 0 && progress.every(
    (p) => p.status === 'completed' || p.status === 'failed' || p.status === 'skipped'
  )
  const allSuccess = progress.length > 0 && progress.every((p) => p.status === 'completed')

  return {
    effectivePhases,
    hasNothingToDeploy,
    progress,
    launchMission,
    deploymentProjectCount,
    allComplete,
    allSuccess,
    startUnifiedMission,
  }
}


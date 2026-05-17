/**
 * LaunchSequence — Deploy execution panel.
 *
 * Loads KB mission JSON per workload, merges the deployment plan into
 * one unified mission prompt, and tracks progress for the single session.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Rocket,
  Check,
  X,
  AlertTriangle,
  SkipForward,
  RotateCcw,
  PartyPopper,
  Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { useMissions } from '../../hooks/useMissions'
import { loadMissionPrompt } from '../cards/multi-tenancy/missionLoader'
import type { DeployPhase, MissionControlState, PhaseProgress, PhaseStatus } from './types'
import { buildInstallPromptForProject, isSafeProjectName } from './useMissionControl'

/** Terminal statuses that indicate a project is no longer in-flight */
const TERMINAL_STATUSES: readonly string[] = ['completed', 'failed', 'skipped', 'cancelled']

/**
 * #6408 — Fallback phase builder used when `state.phases` is empty but
 * assignments still exist. Packs every assigned project into a single
 * "Phase 1: Deploy" so `LaunchSequence` actually runs something instead of
 * calling `onComplete()` on an empty list and telling the user the mission
 * succeeded with zero deployments.
 */
function buildFallbackPhasesFromAssignments(
  state: MissionControlState,
): DeployPhase[] {
  const projectNames: string[] = []
  const seen = new Set<string>()
  for (const a of state.assignments) {
    for (const n of a.projectNames || []) {
      if (!seen.has(n)) {
        seen.add(n)
        projectNames.push(n)
      }
    }
  }
  if (projectNames.length === 0) return []
  return [{ phase: 1, name: 'Deploy', projectNames }]
}

interface LaunchSequenceProps {
  state: MissionControlState
  onUpdateProgress: (progress: PhaseProgress[]) => void
  onComplete: (dashboardId?: string) => void
  /** Close the Mission Control dialog entirely */
  onClose?: () => void
  /** Initiate rollback of changes made by failed projects */
  onRollback?: () => void
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />,
  running: <Loader2 className="w-4 h-4 animate-spin text-amber-400" />,
  completed: <Check className="w-4 h-4 text-green-400" />,
  failed: <X className="w-4 h-4 text-red-400" />,
  skipped: <SkipForward className="w-4 h-4 text-muted-foreground" /> }

/**
 * Build a content-based signature for phases so reinitialization triggers
 * when phase membership changes, not just when the phase count changes (#5508).
 */
function computePhaseSignature(phases: MissionControlState['phases']): string {
  return phases
    .map((p) => `${p.phase}:${p.name}:${(p.projectNames || []).join(',')}`)
    .join('|')
}

/**
 * Recompute phase-level status from its project statuses.
 * Used by both the mission-monitor effect and the error catch path (#5507).
 */
function derivePhaseStatus(phase: PhaseProgress): PhaseStatus {
  const allDone = phase.projects.length > 0 && phase.projects.every(
    (p) => TERMINAL_STATUSES.includes(p.status)
  )
  if (!allDone) return phase.status
  const anyFailed = phase.projects.some((p) => p.status === 'failed')
  return anyFailed ? 'failed' : 'completed'
}

interface UnifiedMissionWorkload {
  projectName: string
  uiSafeDisplayName: string
  phase: number
  phaseName: string
  targetClusters: string[]
  prompt: string
}

function getUiSafeDisplayName(project: MissionControlState['projects'][number]): string {
  const displayNameRaw = typeof project.displayName === 'string'
    ? project.displayName.trim()
    : ''
  return isSafeProjectName(displayNameRaw) ? displayNameRaw : project.name
}

export function LaunchSequence({
  state,
  onUpdateProgress,
  onComplete,
  onClose,
  onRollback }: LaunchSequenceProps) {
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
          error: undefined,
        })),
      }))
    )

    try {
      const { prompt, clusters, workloadNames } = await buildUnifiedMissionPlan()
      const dryRunPrefix = state.isDryRun ? '[DRY RUN] ' : ''
      const clusterCount = clusters.length
      const missionId = startMission({
        title: `${dryRunPrefix}${state.title || 'Mission Control deployment'}`,
        description: `${state.isDryRun ? 'Dry-run validation' : 'Unified deployment'} for ${workloadNames.length} workload${workloadNames.length === 1 ? '' : 's'}${clusterCount > 0 ? ` across ${clusterCount} cluster${clusterCount === 1 ? '' : 's'}` : ''}`,
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
            error: undefined,
          })),
        }))
      )
    } catch (err: unknown) {
      const errorMessage = Array.isArray(err)
        ? err.map(String).join('; ')
        : String(err)
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
    const next = progress.map((phase) => ({
      ...phase,
      projects: phase.projects.map((proj) => {
        if (!proj.missionId) return proj
        const s = proj.status as string
        if (s === 'completed' || s === 'failed') return proj
        const mission = missions.find((m) => m.id === proj.missionId)
        if (!mission) return proj
        if (mission.status === 'completed') {
          changed = true
          return { ...proj, status: 'completed' as const }
        }
        if (mission.status === 'failed' || mission.status === 'cancelled') {
          changed = true
          return { ...proj, status: 'failed' as const, error: mission.status === 'cancelled' ? 'Mission cancelled' : 'Mission failed' }
        }
        return proj
      }) }))

    if (changed) {
      // Update phase-level status using shared helper
      const updated = next.map((phase) => ({
        ...phase,
        status: derivePhaseStatus(phase) }))
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
  const allComplete = progress.length > 0 && progress.every(
    (p) => p.status === 'completed' || p.status === 'failed' || p.status === 'skipped'
  )
  const allSuccess = progress.length > 0 && progress.every((p) => p.status === 'completed')

  // #6408 — If the wizard landed on Launch with no phases AND no assignments,
  // show an explicit error instead of auto-firing onComplete().
  if (hasNothingToDeploy) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-amber-500/20 mb-3">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold">No projects to deploy</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your mission has no cluster assignments. Go back to the Chart
            Course phase to assign projects before launching.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Button variant="secondary" size="sm" onClick={() => onClose ? onClose() : onComplete()}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="inline-flex p-3 rounded-2xl bg-linear-to-br from-purple-500/20 to-indigo-500/20 mb-3"
        >
          {allComplete ? (
            allSuccess ? (
              <PartyPopper className="w-8 h-8 text-green-400" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            )
          ) : (
            <Rocket className="w-8 h-8 text-purple-400" />
          )}
        </motion.div>
        <h2 className="text-2xl font-bold">
          {allComplete
            ? allSuccess
              ? state.isDryRun ? 'Dry Run Complete!' : 'Mission Complete!'
              : state.isDryRun ? 'Dry Run Completed with Issues' : 'Mission Completed with Issues'
            : state.isDryRun ? 'Dry Run In Progress' : 'Launch Sequence In Progress'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {allComplete
            ? 'All deployment phases have finished.'
            : `Deploying ${state.projects.length} projects in ${effectivePhases.length} phases`}
        </p>
      </div>

      {/* Phase checklist */}
      <div className="space-y-4">
        {progress.map((phase) => {
          const phaseDef = effectivePhases.find((p) => p.phase === phase.phase)
          return (
            <motion.div
              key={phase.phase}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (phase.phase - 1) * 0.15 }}
              className={cn(
                'rounded-xl border p-4',
                phase.status === 'running' && 'border-amber-500/30 bg-amber-500/5',
                phase.status === 'completed' && 'border-green-500/30 bg-green-500/5',
                phase.status === 'failed' && 'border-red-500/30 bg-red-500/5',
                phase.status === 'pending' && 'border-border bg-card',
                phase.status === 'skipped' && 'border-border bg-card opacity-50'
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                {STATUS_ICONS[phase.status]}
                <div className="flex-1">
                  <h3 className="text-sm font-medium">
                    Phase {phase.phase}: {phaseDef?.name ?? `Phase ${phase.phase}`}
                  </h3>
                </div>
                {phase.status === 'failed' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="mission-control-retry"
                    className="h-6 text-xs"
                    icon={<RotateCcw className="w-3 h-3" />}
                    onClick={() => {
                      void startUnifiedMission()
                    }}
                  >
                    Retry Failed
                  </Button>
                )}
              </div>

              <div className="space-y-1 ml-7">
                <AnimatePresence>
                  {phase.projects.map((proj) => (
                    <motion.div
                      key={proj.name}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="shrink-0">{STATUS_ICONS[proj.status]}</span>
                      <span
                        className={cn(
                          'flex-1',
                          proj.status === 'completed' && 'text-green-400',
                          proj.status === 'failed' && 'text-red-400',
                          proj.status === 'running' && 'text-amber-400',
                          proj.status === 'pending' && 'text-muted-foreground'
                        )}
                      >
                        {state.projects.find((p) => p.name === proj.name)?.displayName ?? proj.name}
                      </span>
                      {proj.error && (
                        <span className="text-[10px] text-red-400 truncate max-w-[200px]" title={proj.error}>
                          {proj.error}
                        </span>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Completion actions */}
      {allComplete && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center gap-3 pt-4"
        >
          {!allSuccess && onRollback && (
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw className="w-3 h-3" />}
              onClick={onRollback}
              data-testid="mission-control-rollback"
            >
              Rollback Changes
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onClose ? onClose() : onComplete()}>
            {!allSuccess ? 'Close Mission' : 'Close'}
          </Button>
        </motion.div>
      )}
    </div>
  )
}

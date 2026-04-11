/**
 * LaunchSequence — Deploy execution panel.
 *
 * Iterates deploy phases, loads KB mission JSON per project,
 * calls startMission() per cluster. Animated checklist with progress.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
const TERMINAL_STATUSES: readonly string[] = ['completed', 'failed', 'skipped']

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

export function LaunchSequence({
  state,
  onUpdateProgress,
  onComplete,
  onClose }: LaunchSequenceProps) {
  const { startMission, missions } = useMissions()
  const [isStarted, setIsStarted] = useState(false)
  const progressRef = useRef<PhaseProgress[]>(state.launchProgress)
  const startedMissions = useRef(new Set<string>())

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
    startedMissions.current = new Set<string>()
    setIsStarted(false)
    onUpdateProgress(initial)
  }, [phaseSignature])

  const updateProgress = (updater: (prev: PhaseProgress[]) => PhaseProgress[]) => {
      const next = updater(progressRef.current)
      progressRef.current = next
      onUpdateProgress(next)
    }

  // Launch a single project's mission
  const launchProject = async (projectName: string, phaseNum: number) => {
      const project = state.projects.find((p) => p.name === projectName)
      if (!project) return

      const assignment = state.assignments.find((a) =>
        (a.projectNames || []).includes(projectName)
      )
      const clusterName = assignment?.clusterName ?? 'default'

      // Update status to running
      updateProgress((prev) =>
        prev.map((p) =>
          p.phase === phaseNum
            ? {
                ...p,
                status: 'running',
                projects: p.projects.map((proj) =>
                  proj.name === projectName ? { ...proj, status: 'running' as const } : proj
                ) }
            : p
        )
      )

      try {
        // #6379 — Build the fallback prompt through a sanitizing helper so
        // AI-supplied names can't inject instructions into the downstream
        // LLM call. `buildInstallPromptForProject` validates the name
        // against an allow-list and wraps it in a triple-quoted opaque
        // literal fence.
        const fallbackPrompt = buildInstallPromptForProject(
          project.name,
          project.displayName,
        )
        const prompt = await loadMissionPrompt(
          project.name,
          fallbackPrompt,
          project.kbPath ? [project.kbPath] : undefined,
        )

        // Derive a safe display name for UI strings too — the title is
        // user-visible and we don't want a prompt-injection payload rendering
        // in our own sidebar either. #6410 — `isSafeProjectName` validates
        // the TRIMMED value (see its impl), so we must trim first and use
        // the trimmed value for BOTH validation and the rendered label.
        // Otherwise `'  foo  '` would validate as the trimmed form but then
        // render with the original leading/trailing whitespace.
        const displayNameRaw = typeof project.displayName === 'string'
          ? project.displayName.trim()
          : ''
        const uiSafeDisplayName = isSafeProjectName(displayNameRaw)
          ? displayNameRaw
          : project.name
        const dryRunPrefix = state.isDryRun ? '[DRY RUN] ' : ''
        const clusterContext = `\n\n**Target cluster:** ${clusterName}`
        const missionId = startMission({
          title: `${dryRunPrefix}Install ${uiSafeDisplayName}`,
          description: `${state.isDryRun ? 'Dry-run validation' : 'Automated install'} of ${uiSafeDisplayName} as part of Mission Control deployment`,
          type: 'deploy',
          cluster: clusterName,
          initialPrompt: prompt + clusterContext,
          dryRun: state.isDryRun })

        // Update with missionId
        updateProgress((prev) =>
          prev.map((p) =>
            p.phase === phaseNum
              ? {
                  ...p,
                  projects: p.projects.map((proj) =>
                    proj.name === projectName ? { ...proj, missionId } : proj
                  ) }
              : p
          )
        )
      } catch (err) {
        // Mark project as failed AND recompute phase-level status (#5507)
        updateProgress((prev) =>
          prev.map((p) => {
            if (p.phase !== phaseNum) return p
            const updatedProjects = p.projects.map((proj) =>
              proj.name === projectName
                ? { ...proj, status: 'failed' as const, error: String(err) }
                : proj
            )
            const updatedPhase = { ...p, projects: updatedProjects }
            return { ...updatedPhase, status: derivePhaseStatus(updatedPhase) }
          })
        )
      }
    }

  // Monitor mission statuses and update progress
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
        if (mission.status === 'failed') {
          changed = true
          return { ...proj, status: 'failed' as const, error: 'Mission failed' }
        }
        return proj
      }) }))

    if (changed) {
      // Update phase-level status using shared helper
      const updated = next.map((phase) => ({
        ...phase,
        status: derivePhaseStatus(phase) }))
      progressRef.current = updated
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

  /**
   * Wait for a specific phase to reach a terminal status.
   * Used by phased mode to gate sequential phase execution (#5506).
   * #6405 — Returns the terminal status so the caller can distinguish
   * "fully succeeded" from "terminally failed" and block dependent phases
   * when a failure occurred.
   */
  const waitForPhaseCompletion = useCallback((phaseNum: number): Promise<PhaseStatus> => {
    return new Promise((resolve) => {
      /** Poll interval in ms — checks progressRef for phase terminal state */
      const PHASE_POLL_INTERVAL_MS = 500
      const check = () => {
        const phase = progressRef.current.find((p) => p.phase === phaseNum)
        if (phase && TERMINAL_STATUSES.includes(phase.status)) {
          resolve(phase.status)
          return
        }
        setTimeout(check, PHASE_POLL_INTERVAL_MS)
      }
      check()
    })
  }, [])

  // Execute the launch sequence
  const startLaunch = async () => {
    if (isStarted) return
    setIsStarted(true)

    const isYolo = state.deployMode === 'yolo'

    if (isYolo) {
      // Launch everything at once
      for (const phase of effectivePhases) {
        for (const projectName of (phase.projectNames || [])) {
          if (!startedMissions.current.has(projectName)) {
            startedMissions.current.add(projectName)
            launchProject(projectName, phase.phase)
          }
        }
      }
    } else {
      // Phased: launch phase N, wait for completion, then phase N+1 (#5506)
      for (const phase of effectivePhases) {
        updateProgress((prev) =>
          prev.map((p) =>
            p.phase === phase.phase ? { ...p, status: 'running' } : p
          )
        )

        // Launch all projects in this phase
        for (const projectName of (phase.projectNames || [])) {
          if (!startedMissions.current.has(projectName)) {
            startedMissions.current.add(projectName)
            await launchProject(projectName, phase.phase)
          }
        }

        // Wait for this phase to reach a terminal state before starting the next (#5506)
        // #6405 — Only advance on a fully-succeeded phase. A `failed` status
        // means at least one project in this phase is terminally failed and
        // the user is looking at a "Retry Failed" button — we must NOT
        // auto-advance to dependent phases from that state.
        const result = await waitForPhaseCompletion(phase.phase)
        if (result !== 'completed') {
          // Block dependent phases. The Retry Failed button will re-invoke
          // launchProject for the failed entries; if the retry succeeds, the
          // user can manually proceed via the normal completion path.
          break
        }
      }
    }
  }

  // Auto-start on mount — keyed on content signature (#5508)
  useEffect(() => {
    if (!isStarted && effectivePhases.length > 0) {
      startLaunch()
    }
  }, [phaseSignature])

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
          className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 mb-3"
        >
          {allComplete ? (
            allSuccess ? (
              <PartyPopper className="w-8 h-8 text-green-400" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            )
          ) : (
            <Rocket className="w-8 h-8 text-violet-400" />
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
                      phase.projects.forEach((p) => {
                        if (p.status === 'failed') {
                          launchProject(p.name, phase.phase)
                        }
                      })
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
                      <span className="flex-shrink-0">{STATUS_ICONS[proj.status]}</span>
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
          <Button variant="secondary" size="sm" onClick={() => onClose ? onClose() : onComplete()}>
            Close
          </Button>
        </motion.div>
      )}
    </div>
  )
}

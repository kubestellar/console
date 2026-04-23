/**
 * MissionControlDialog — Modal overlay with 3-phase stepper.
 *
 * Renders as a proper modal dialog with a backdrop, rounded corners,
 * and clear "Back to Dashboard" navigation so users know they can
 * return to the page they came from.
 *
 * Phase 1: Define Your Mission (fix description + AI payload suggestions)
 * Phase 2: Chart Your Course (cluster assignment + readiness)
 * Phase 3: Flight Plan (SVG blueprint + deploy)
 */

import { useEffect, useCallback, useRef, useState, lazy, Suspense } from 'react'
import { useModalFocusTrap } from '../../lib/modals/useModalNavigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Rocket,
  Target,
  Map,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  FlaskConical,
  Monitor,
  ArrowLeft,
  GitPullRequestArrow,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'
import { ChunkErrorBoundary } from '../ChunkErrorBoundary'
import { useMissionControl, consumePersistQuotaBanner } from './useMissionControl'
import { FixerDefinitionPanel } from './FixerDefinitionPanel'
import { ClusterAssignmentPanel } from './ClusterAssignmentPanel'
const FlightPlanBlueprint = lazy(() =>
  import('./FlightPlanBlueprint').then(m => ({ default: m.FlightPlanBlueprint }))
)
import { LaunchSequence } from './LaunchSequence'
import { RequestApprovalModal } from './RequestApprovalModal'
import { decodePlan, planToState } from './missionPlanCodec'
import type { WizardPhase } from './types'

interface MissionControlDialogProps {
  open: boolean
  onClose: () => void
  /** Pre-populate Phase 1 with this Kubara chart project (#8483) */
  initialKubaraChart?: string
  /** Base64-encoded plan from a deep link — opens in read-only review mode */
  reviewPlanEncoded?: string
}

const PHASE_STEPS: {
  key: WizardPhase
  label: string
  icon: React.ReactNode
  description: string
}[] = [
  {
    key: 'define',
    label: 'Define Mission',
    icon: <Target className="w-4 h-4" />,
    description: 'Describe your fix and select projects',
  },
  {
    key: 'assign',
    label: 'Chart Course',
    icon: <Map className="w-4 h-4" />,
    description: 'Assign projects to clusters',
  },
  {
    key: 'blueprint',
    label: 'Flight Plan',
    icon: <Rocket className="w-4 h-4" />,
    description: 'Review blueprint and deploy',
  },
]

/** Fallback a11y label when the user hasn't entered a mission title yet (issue 6745) */
const DEFAULT_DIALOG_ARIA_LABEL = 'Mission control dialog'

export function MissionControlDialog({ open, onClose, initialKubaraChart, reviewPlanEncoded }: MissionControlDialogProps) {
  const mc = useMissionControl()
  const { showToast } = useToast()
  const { state } = mc
  const [isReviewMode, setIsReviewMode] = useState(false)
  const [reviewNotes, setReviewNotes] = useState<string | undefined>()

  useEffect(() => {
    if (!open || !reviewPlanEncoded) return
    const plan = decodePlan(reviewPlanEncoded)
    if (!plan) {
      showToast('Invalid plan link — could not decode the deployment plan', 'error')
      return
    }
    mc.hydrateFromPlan(planToState(plan))
    setIsReviewMode(true)
    setReviewNotes(plan.notes)
  }, [open, reviewPlanEncoded]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (isReviewMode) {
      setIsReviewMode(false)
      setReviewNotes(undefined)
      mc.reset()
    }
    onClose()
  }, [isReviewMode, onClose, mc])

  // #8483 — Pre-populate Phase 1 with a Kubara chart when opened from Mission Browser
  const initialChartAdded = useRef<string | null>(null)
  useEffect(() => {
    if (open && initialKubaraChart && initialChartAdded.current !== initialKubaraChart) {
      initialChartAdded.current = initialKubaraChart
      const alreadyAdded = state.projects.some(p => p.name === initialKubaraChart)
      if (!alreadyAdded) {
        mc.addProject({
          name: initialKubaraChart,
          displayName: initialKubaraChart.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          reason: 'Imported from Kubara Platform Catalog',
          category: 'Helm Chart',
          priority: 'required',
          dependencies: [],
          kubaraChart: { repoPath: `helm/${initialKubaraChart}` },
          userAdded: true,
        })
      }
      // Ensure we're on Phase 1
      mc.setPhase('define')
    }
  }, [open, initialKubaraChart]) // eslint-disable-line react-hooks/exhaustive-deps
  // issue 6738 — Ref used by useModalFocusTrap to keep Tab/Shift+Tab inside the dialog
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocusTrap(dialogRef, open)
  // issue 6738 — Restore focus to the element that opened the dialog on close
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null
      return
    }
    const prev = previouslyFocusedRef.current
    if (prev && typeof prev.focus === 'function') {
      prev.focus()
    }
  }, [open])

  // #7150 — Escape to close. Uses capture phase (registered below) so
  // child stopPropagation cannot swallow the Escape key. stopImmediatePropagation
  // prevents other capture-phase handlers from interfering.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        e.preventDefault()
        handleClose()
      }
    },
    [handleClose]
  )

  // Track the highest phase the user has reached so they can click back to any visited phase
  const currentStepIndex = PHASE_STEPS.findIndex((s) => s.key === state.phase)
  const [highestReached, setHighestReached] = useState(currentStepIndex)
  const [approvalModalOpen, setApprovalModalOpen] = useState(false)
  useEffect(() => {
    setHighestReached(prev => Math.max(prev, currentStepIndex))
  }, [currentStepIndex])

  // #6787 — Use capture phase so child stopPropagation cannot swallow Escape
  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [open, handleKeyDown])

  // #6758 (Copilot on PR #6755) — Surface a toast when a previous
  // Mission Control session hit a QuotaExceededError while trying to
  // persist its state. `consumePersistQuotaBanner()` reads and clears
  // the session-storage flag set by the persistState writer in
  // #6665, returning the mission title (or the literal `'(untitled)'`)
  // that was being saved. Without this wiring the helper was dead
  // code — the flag got written but nobody ever displayed it.
  useEffect(() => {
    if (!open) return
    const pendingTitle = consumePersistQuotaBanner()
    if (pendingTitle === null) return
    showToast(
      `Mission '${pendingTitle}' could not be persisted (browser storage quota exceeded). Your work is preserved in memory but will be lost on reload.`,
      'warning',
    )
  }, [open, showToast])

  // #6403 — Surface a toast when stale cluster references are dropped from
  // persisted state. The hook already reconciles the state; we just notify
  // the user so they don't stare at a mysteriously-shrunk assignment list.
  useEffect(() => {
    if (!open) return
    if (mc.staleClusterNames.length === 0) return
    const names = (mc.staleClusterNames || []).join(', ')
    showToast(
      `Unassigned ${mc.staleClusterNames.length} cluster(s) from your previous session that no longer exist: ${names}`,
      'warning',
    )
    mc.acknowledgeStaleClusters()
  }, [open, mc.staleClusterNames, showToast, mc])

  // Lock body scroll while modal is open so users cannot scroll the page behind it
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // #6828 — Ref-based guard prevents double-click from skipping a phase.
  // The guard resets after one React render cycle via useEffect.
  // MUST be before the early return — React Rules of Hooks require
  // hooks to run in the same order on every render.
  const phaseAdvancingRef = useRef(false)
  useEffect(() => { phaseAdvancingRef.current = false }, [state.phase])

  if (!open) return null

  const isLaunching = state.phase === 'launching'
  const isComplete = state.phase === 'complete'

  const canAdvance =
    (state.phase === 'define' && state.projects.length > 0 && !state.aiStreaming) ||
    (state.phase === 'assign' && (
      state.assignments.some((a) => (a.projectNames ?? []).length > 0) ||
      state.targetClusters.length > 0
    )) ||
    state.phase === 'blueprint'

  const canGoBack =
    state.phase === 'assign' || state.phase === 'blueprint'

  const handleNext = () => {
    if (phaseAdvancingRef.current) return
    phaseAdvancingRef.current = true
    if (state.phase === 'define') mc.setPhase('assign')
    else if (state.phase === 'assign') mc.setPhase('blueprint')
  }

  const handleBack = () => {
    if (state.phase === 'assign') mc.setPhase('define')
    else if (state.phase === 'blueprint') mc.setPhase('assign')
  }

  const handleNewMission = () => {
    mc.reset()
    // Reset the stepper's "highest reached" state so only Phase 1 is
    // reachable in the new mission (#5504)
    setHighestReached(0)
  }

  /** Inset from left/right/bottom so the backdrop peeks through. */
  const MODAL_SIDE_INSET_PX = 16
  /** Top inset must clear the fixed navbar (64px) + a small gap so the
   *  modal header doesn't hide behind it. Previous value was 16px which
   *  left the top ~48px of the modal obscured. */
  const MODAL_TOP_INSET_PX = 80 // NAVBAR_HEIGHT_PX (64) + 16px breathing room

  return (
    <>
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ──────────────────────────────────────────── */}
          <motion.div
            className="fixed inset-0 z-modal bg-black/60 backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* ── Modal panel ───────────────────────────────────────── */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={state.title || DEFAULT_DIALOG_ARIA_LABEL}
            data-testid="mission-control-dialog"
            className="fixed z-modal flex flex-col bg-background rounded-xl border border-border shadow-2xl shadow-black/30 overflow-hidden"
            style={{
              top: `${MODAL_TOP_INSET_PX}px`,
              left: `${MODAL_SIDE_INSET_PX}px`,
              right: `${MODAL_SIDE_INSET_PX}px`,
              bottom: `${MODAL_SIDE_INSET_PX}px`,
            }}
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* ── Header ─────────────────────────────────────────────── */}
            <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card rounded-t-xl">
              <div className="flex items-center gap-3">
                {/* Back to Dashboard link */}
                <button
                  onClick={handleClose}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mr-2 shrink-0"
                  title="Close Mission Control and return to the dashboard"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Back to Dashboard</span>
                </button>
                <span className="w-px h-5 bg-border hidden sm:block" />
                <div className="p-1.5 rounded-lg bg-linear-to-br from-violet-500 to-indigo-600 text-white">
                  <Rocket className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold">{state.title || 'Mission Control'}</h1>
                    {state.isDryRun && (
                      <span className="px-2 py-0.5 text-2xs font-bold uppercase tracking-wider rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                        DRY RUN
                      </span>
                    )}
                    {isReviewMode && (
                      <span className="px-2 py-0.5 text-2xs font-bold uppercase tracking-wider rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                        REVIEW
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Multi-Cluster Solutions Orchestrator
                  </p>
                </div>
              </div>

              {/* ── Stepper ─────────────────────────────────────────── */}
              {/* issue 6739 — role=tablist + Arrow key handling so the stepper is keyboard navigable,
                  especially on mobile where there's no persistent Next/Back focus path. */}
              <nav
                className="hidden md:flex items-center gap-1"
                role="tablist"
                aria-label="Mission control phases"
                onKeyDown={(e) => {
                  if (isLaunching || isComplete) return
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                  e.preventDefault()
                  const delta = e.key === 'ArrowRight' ? 1 : -1
                  // #9501 — Allow keyboard ArrowRight to advance beyond highestReached
                  // when the current step's validation passes (same condition as the
                  // Next button being enabled). Without this, highestReached clamps
                  // the index to 0 on first pass, blocking a11y keyboard navigation.
                  const upperBound = (delta > 0 && canAdvance)
                    ? Math.min(highestReached + 1, PHASE_STEPS.length - 1)
                    : highestReached
                  const nextIdx = Math.max(0, Math.min(upperBound, currentStepIndex + delta))
                  if (nextIdx !== currentStepIndex) {
                    if (nextIdx > highestReached) {
                      setHighestReached(nextIdx)
                    }
                    mc.setPhase(PHASE_STEPS[nextIdx].key)
                  }
                }}
              >
                {PHASE_STEPS.map((step, i) => {
                  const isCurrent = step.key === state.phase
                  const isPast = currentStepIndex > i
                  const isLaunchOrComplete = isLaunching || isComplete
                  return (
                    <div key={step.key} className="flex items-center gap-1">
                      {i > 0 && (
                        <ChevronRight
                          className="w-3 h-3 text-muted-foreground/40 mx-1"
                          aria-hidden="true"
                        />
                      )}
                      <button
                        data-testid={`mission-control-phase-${i + 1}`}
                        role="tab"
                        aria-selected={isCurrent}
                        aria-controls={`mission-control-phase-panel-${step.key}`}
                        tabIndex={isCurrent ? 0 : -1}
                        onClick={() => {
                          if (i <= highestReached && !isLaunchOrComplete) mc.setPhase(step.key)
                        }}
                        disabled={i > highestReached || isLaunchOrComplete}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all',
                          isCurrent && 'bg-primary/10 text-primary font-medium',
                          isPast &&
                            !isLaunchOrComplete &&
                            'text-muted-foreground hover:text-foreground cursor-pointer',
                          !isCurrent && !isPast && i <= highestReached &&
                            !isLaunchOrComplete &&
                            'text-muted-foreground hover:text-foreground cursor-pointer',
                          !isCurrent &&
                            !isPast && i > highestReached &&
                            'text-muted-foreground/50 cursor-default'
                        )}
                      >
                        <span
                          className={cn(
                            'flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors',
                            isCurrent &&
                              'bg-primary text-primary-foreground',
                            isPast &&
                              'bg-green-500/20 text-green-400',
                            !isCurrent &&
                              !isPast &&
                              'bg-muted text-muted-foreground/50'
                          )}
                        >
                          {isPast ? '✓' : i + 1}
                        </span>
                        {step.label}
                      </button>
                    </div>
                  )
                })}
              </nav>

              <div className="flex items-center gap-2">
                {(isComplete || isLaunching) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleNewMission}
                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                  >
                    New Mission
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  data-testid="mission-control-cancel"
                  className="p-1.5 hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Close Mission Control"
                  title="Close (Esc)"
                  icon={<X className="w-5 h-5" />}
                />
              </div>
            </header>

            {/* Review mode banner */}
            {isReviewMode && (
              <div className="px-6 py-2 bg-cyan-500/10 border-b border-cyan-500/20 text-sm">
                <p className="text-cyan-400 font-medium">
                  You are reviewing a shared deployment plan. This is read-only — no changes will be deployed.
                </p>
                {reviewNotes && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    <span className="font-medium text-foreground">Notes from requester:</span> {reviewNotes}
                  </p>
                )}
              </div>
            )}

            {/* ── Content ────────────────────────────────────────────── */}
            <div
              className="flex-1 overflow-hidden"
              id={`mission-control-phase-panel-${state.phase}`}
              role="tabpanel"
            >
              <AnimatePresence mode="wait">
                {state.phase === 'define' && (
                  <PhaseWrapper key="define">
                    <FixerDefinitionPanel
                      state={state}
                      onDescriptionChange={mc.setDescription}
                      onTitleChange={mc.setTitle}
                      onTargetClustersChange={mc.setTargetClusters}
                      onAskAI={mc.askAIForSuggestions}
                      onAddProject={mc.addProject}
                      onRemoveProject={mc.removeProject}
                      onUpdatePriority={mc.updateProjectPriority}
                      onReplaceProject={mc.replaceProject}
                      aiStreaming={state.aiStreaming}
                      planningMission={mc.planningMission}
                      installedProjects={mc.installedProjects}
                    />
                  </PhaseWrapper>
                )}
                {state.phase === 'assign' && (
                  <PhaseWrapper key="assign">
                    <ClusterAssignmentPanel
                      state={state}
                      onAskAI={mc.askAIForAssignments}
                      onAutoAssign={mc.autoAssignProjects}
                      onSetAssignment={mc.setAssignment}
                      aiStreaming={state.aiStreaming}
                      planningMission={mc.planningMission}
                      installedOnCluster={mc.installedOnCluster}
                    />
                  </PhaseWrapper>
                )}
                {state.phase === 'blueprint' && (
                  <PhaseWrapper key="blueprint">
                    <ChunkErrorBoundary>
                      <Suspense fallback={null}>
                        <FlightPlanBlueprint
                          state={state}
                          onOverlayChange={mc.setOverlay}
                          onDeployModeChange={mc.setDeployMode}
                          onMoveProject={mc.moveProjectToCluster}
                          installedProjects={mc.installedProjects}
                        />
                      </Suspense>
                    </ChunkErrorBoundary>
                  </PhaseWrapper>
                )}
                {(isLaunching || isComplete) && (
                  <PhaseWrapper key="launch">
                    <ChunkErrorBoundary>
                      <LaunchSequence
                        state={state}
                        onUpdateProgress={mc.updateLaunchProgress}
                        onComplete={(dashboardId) => {
                          if (dashboardId) mc.setGroundControlDashboardId(dashboardId)
                          mc.setPhase('complete')
                        }}
                        onClose={handleClose}
                      />
                    </ChunkErrorBoundary>
                  </PhaseWrapper>
                )}
              </AnimatePresence>
            </div>

            {/* ── Footer nav ─────────────────────────────────────────── */}
            {!isLaunching && !isComplete && !isReviewMode && (
              <footer className="flex items-center justify-between px-6 py-3 border-t border-border bg-card rounded-b-xl">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {state.projects.length > 0 && (
                    <span>
                      {state.projects.length} project
                      {state.projects.length !== 1 ? 's' : ''} selected
                    </span>
                  )}
                  {state.assignments.length > 0 && (
                    <span>
                      → {state.assignments.filter((a) => (a.projectNames ?? []).length > 0).length} cluster
                      {state.assignments.filter((a) => (a.projectNames ?? []).length > 0).length !== 1
                        ? 's'
                        : ''}
                    </span>
                  )}
                  {/* Legend (only on blueprint phase) */}
                  {state.phase === 'blueprint' && (
                    <>
                      <span className="w-px h-4 bg-border" />
                      <span className="flex items-center gap-1.5 text-2xs">
                        <span className="w-4 h-0 border-t border-amber-500 inline-block" />
                        Cross-cluster
                      </span>
                      <span className="flex items-center gap-1.5 text-2xs">
                        <span className="w-4 h-0 border-t border-dashed border-indigo-500 inline-block" />
                        Intra-cluster
                      </span>
                      <span className="flex items-center gap-1.5 text-2xs">
                        <span className="w-3 h-3 rounded-full border-2 border-green-500 inline-block" />
                        Installed
                      </span>
                      <span className="flex items-center gap-1.5 text-2xs">
                        <span className="w-3 h-3 rounded-full border border-dashed border-slate-500 inline-block" />
                        Needs deploy
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canGoBack && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleBack}
                      icon={<ChevronLeft className="w-3.5 h-3.5" />}
                    >
                      Back
                    </Button>
                  )}
                  {state.phase === 'blueprint' ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setApprovalModalOpen(true)}
                        icon={<GitPullRequestArrow className="w-3.5 h-3.5" />}
                        title="Create a GitHub issue with the deployment plan for team approval"
                      >
                        Request Approval
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => showToast('Local cluster simulation is not yet available', 'info')}
                        icon={<Monitor className="w-3.5 h-3.5" />}
                        title="Create local clusters to simulate the deployment"
                      >
                        Deploy Local
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        data-testid="mission-control-launch"
                        onClick={() => {
                          // #7190 — Block launch when no clusters have project assignments.
                          // This can happen when the user excludes all clusters in Phase 2.
                          const hasAssignedClusters = state.assignments.some(
                            (a) => (a.projectNames ?? []).length > 0
                          )
                          if (!hasAssignedClusters) {
                            showToast('No clusters have project assignments. Go back to Chart Course to assign projects before launching.', 'warning')
                            return
                          }
                          mc.setDryRun(false)
                          mc.setPhase('launching')
                        }}
                        className="bg-linear-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-violet-500/25"
                        icon={<Rocket className="w-4 h-4" />}
                      >
                        Deploy to Clusters
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          // #7190 — Same validation as Deploy button above
                          const hasAssignedClusters = state.assignments.some(
                            (a) => (a.projectNames ?? []).length > 0
                          )
                          if (!hasAssignedClusters) {
                            showToast('No clusters have project assignments. Go back to Chart Course to assign projects before launching.', 'warning')
                            return
                          }
                          mc.setDryRun(true)
                          mc.setPhase('launching')
                        }}
                        icon={<FlaskConical className="w-3.5 h-3.5" />}
                        title="Run against live clusters without deploying — report only"
                      >
                        Dry Run
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleNext}
                      disabled={!canAdvance}
                    >
                      Next
                      <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  )}
                </div>
              </footer>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>

    <RequestApprovalModal
      isOpen={approvalModalOpen}
      onClose={() => setApprovalModalOpen(false)}
      state={state}
      installedProjects={mc.installedProjects}
    />
    </>
  )
}

function PhaseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="h-full overflow-auto"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}

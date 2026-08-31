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

import { Suspense } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { useModalState } from '../../lib/modals/useModalNavigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Rocket,
  ArrowLeft,
  RotateCcw,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'
import { ChunkErrorBoundary } from '../ChunkErrorBoundary'
import { FixerDefinitionPanel } from './FixerDefinitionPanel'
import { ClusterAssignmentPanel } from './ClusterAssignmentPanel'
const FlightPlanBlueprint = safeLazy(() => import('./FlightPlanBlueprint'), 'FlightPlanBlueprint')
import { LaunchSequence } from './LaunchSequence'
import { RequestApprovalModal } from './RequestApprovalModal'
import { useMissionControlDialog } from './useMissionControlDialog'
import { MissionControlDialogStepper } from './MissionControlDialogStepper'
import { MissionControlDialogFooter } from './MissionControlDialogFooter'
import {
  DEFAULT_DIALOG_ARIA_LABEL,
  MODAL_SIDE_INSET_PX,
  MODAL_TOP_INSET_PX,
} from './MissionControlDialog.constants'

interface MissionControlDialogProps {
  open: boolean
  onClose: () => void
  /** Pre-populate Phase 1 with this Kubara chart project (#8483) */
  initialKubaraChart?: string
  /** Base64-encoded plan from a deep link — opens in read-only review mode */
  reviewPlanEncoded?: string
  /** Changes when sidebar CTAs should force a brand-new Mission Control session. */
  freshSessionToken?: number
  /** When set, loads a historical MC session in read-only review mode (#15173) */
  historicalMissionId?: string
}

export function MissionControlDialog(props: MissionControlDialogProps) {
  const { open } = props
  const { showToast } = useToast()
  const approvalModal = useModalState()

  const {
    mc,
    state,
    dialogRef,
    isReviewMode,
    reviewNotes,
    isSubmittingLaunch,
    isLaunching,
    isComplete,
    canAdvance,
    canGoBack,
    currentStepIndex,
    highestReached,
    setHighestReached,
    handleClose,
    handleNext,
    handleBack,
    handleNewMission,
    handleLaunch,
    handleRollback,
  } = useMissionControlDialog(props)

  if (!open) return null

  return (
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
                <div className="p-1.5 rounded-lg bg-linear-to-br from-purple-500 to-indigo-600 text-white">
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
              <MissionControlDialogStepper
                currentPhase={state.phase}
                currentStepIndex={currentStepIndex}
                highestReached={highestReached}
                setHighestReached={setHighestReached}
                canAdvance={canAdvance}
                isLaunching={isLaunching}
                isComplete={isComplete}
                onSetPhase={mc.setPhase}
              />

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
              className="flex-1 min-h-0 overflow-hidden"
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
                        onRollback={handleRollback}
                      />
                    </ChunkErrorBoundary>
                  </PhaseWrapper>
                )}
              </AnimatePresence>
            </div>

            {/* ── Footer nav ─────────────────────────────────────────── */}
            {!isLaunching && !isComplete && !isReviewMode && (
              <MissionControlDialogFooter
                state={state}
                canGoBack={canGoBack}
                canAdvance={canAdvance}
                isSubmittingLaunch={isSubmittingLaunch}
                onBack={handleBack}
                onNext={handleNext}
                onLaunch={handleLaunch}
                onRequestApproval={() => approvalModal.open()}
                onDeployLocal={() => showToast('Local cluster simulation is not yet available', 'info')}
              />
            )}
          </motion.div>

          <RequestApprovalModal
            isOpen={approvalModal.isOpen}
            onClose={approvalModal.close}
            state={state}
            installedProjects={mc.installedProjects}
          />
        </>
      )}
    </AnimatePresence>
  )
}

function PhaseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="h-full min-h-0 overflow-auto"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}

/**
 * MissionControlDialog — Full-screen overlay with 3-phase stepper.
 *
 * Phase 1: Define Your Mission (solution description + AI payload suggestions)
 * Phase 2: Chart Your Course (cluster assignment + readiness)
 * Phase 3: Flight Plan (SVG blueprint + deploy)
 */

import { useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Rocket,
  Target,
  Map,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { useMissionControl } from './useMissionControl'
import { SolutionDefinitionPanel } from './SolutionDefinitionPanel'
import { ClusterAssignmentPanel } from './ClusterAssignmentPanel'
import { FlightPlanBlueprint } from './FlightPlanBlueprint'
import { LaunchSequence } from './LaunchSequence'
import type { WizardPhase } from './types'

interface MissionControlDialogProps {
  open: boolean
  onClose: () => void
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
    description: 'Describe your solution and select projects',
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

export function MissionControlDialog({ open, onClose }: MissionControlDialogProps) {
  const mc = useMissionControl()
  const { state } = mc

  // Escape to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  // Track the highest phase the user has reached so they can click back to any visited phase
  const currentStepIndex = PHASE_STEPS.findIndex((s) => s.key === state.phase)
  const highestReachedRef = useRef(currentStepIndex)
  if (currentStepIndex > highestReachedRef.current) {
    highestReachedRef.current = currentStepIndex
  }
  const highestReached = highestReachedRef.current

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const isLaunching = state.phase === 'launching'
  const isComplete = state.phase === 'complete'

  const canAdvance =
    (state.phase === 'define' && state.projects.length > 0) ||
    (state.phase === 'assign' && state.assignments.some((a) => a.projectNames.length > 0)) ||
    state.phase === 'blueprint'

  const canGoBack =
    state.phase === 'assign' || state.phase === 'blueprint'

  const handleNext = () => {
    if (state.phase === 'define') mc.setPhase('assign')
    else if (state.phase === 'assign') mc.setPhase('blueprint')
  }

  const handleBack = () => {
    if (state.phase === 'assign') mc.setPhase('define')
    else if (state.phase === 'blueprint') mc.setPhase('assign')
  }

  const handleNewMission = () => {
    mc.reset()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex flex-col bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                <Rocket className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Mission Control</h1>
                <p className="text-xs text-muted-foreground">
                  Multi-Cluster Solutions Orchestrator
                </p>
              </div>
            </div>

            {/* ── Stepper ─────────────────────────────────────────── */}
            <nav className="hidden md:flex items-center gap-1">
              {PHASE_STEPS.map((step, i) => {
                const isCurrent = step.key === state.phase
                const isPast = currentStepIndex > i
                const isLaunchOrComplete = isLaunching || isComplete
                return (
                  <div key={step.key} className="flex items-center gap-1">
                    {i > 0 && (
                      <ChevronRight className="w-3 h-3 text-muted-foreground/40 mx-1" />
                    )}
                    <button
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
                onClick={onClose}
                className="p-1.5"
                aria-label="Close Mission Control"
                icon={<X className="w-4 h-4" />}
              />
            </div>
          </header>

          {/* ── Content ────────────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {state.phase === 'define' && (
                <PhaseWrapper key="define">
                  <SolutionDefinitionPanel
                    state={state}
                    onDescriptionChange={mc.setDescription}
                    onTitleChange={mc.setTitle}
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
                    onSetAssignment={mc.setAssignment}
                    aiStreaming={state.aiStreaming}
                    planningMission={mc.planningMission}
                    installedOnCluster={mc.installedOnCluster}
                  />
                </PhaseWrapper>
              )}
              {state.phase === 'blueprint' && (
                <PhaseWrapper key="blueprint">
                  <FlightPlanBlueprint
                    state={state}
                    onOverlayChange={mc.setOverlay}
                    onDeployModeChange={mc.setDeployMode}
                    onLaunch={() => mc.setPhase('launching')}
                    onMoveProject={mc.moveProjectToCluster}
                    installedProjects={mc.installedProjects}
                  />
                </PhaseWrapper>
              )}
              {(isLaunching || isComplete) && (
                <PhaseWrapper key="launch">
                  <LaunchSequence
                    state={state}
                    onUpdateProgress={mc.updateLaunchProgress}
                    onComplete={(dashboardId) => {
                      if (dashboardId) mc.setGroundControlDashboardId(dashboardId)
                      mc.setPhase('complete')
                    }}
                  />
                </PhaseWrapper>
              )}
            </AnimatePresence>
          </div>

          {/* ── Footer nav ─────────────────────────────────────────── */}
          {!isLaunching && !isComplete && (
            <footer className="flex items-center justify-between px-6 py-3 border-t border-border bg-card">
              <div className="text-sm text-muted-foreground">
                {state.projects.length > 0 && (
                  <span>
                    {state.projects.length} project
                    {state.projects.length !== 1 ? 's' : ''} selected
                  </span>
                )}
                {state.assignments.length > 0 && (
                  <span className="ml-4">
                    → {state.assignments.filter((a) => a.projectNames.length > 0).length} cluster
                    {state.assignments.filter((a) => a.projectNames.length > 0).length !== 1
                      ? 's'
                      : ''}
                  </span>
                )}
              </div>
              {/* Legend (only on blueprint phase) */}
              {state.phase === 'blueprint' && (
                <div className="flex items-center gap-4 text-2xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0 border-t border-amber-500 inline-block" />
                    Cross-cluster
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0 border-t border-dashed border-indigo-500 inline-block" />
                    Intra-cluster
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border-2 border-green-500 inline-block" />
                    Installed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border border-dashed border-slate-500 inline-block" />
                    Needs deploy
                  </span>
                </div>
              )}
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
                {state.phase !== 'blueprint' && (
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
      )}
    </AnimatePresence>
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

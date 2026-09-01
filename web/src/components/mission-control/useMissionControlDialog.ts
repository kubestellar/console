/**
 * useMissionControlDialog — Encapsulates all hook/state logic for
 * MissionControlDialog so the main component file stays under 400 lines.
 */

import { useEffect, useLayoutEffect, useCallback, useRef, useState } from 'react'
import { useModalFocusTrap } from '../../lib/modals/useModalNavigation'
import { useToast } from '../ui/Toast'
import { useMissions } from '../../hooks/useMissions'
import { consumePersistQuotaBanner, useMissionControl } from './useMissionControl'
import { decodePlan, planToState } from './missionPlanCodec'
import { PHASE_STEPS } from './MissionControlDialog.constants'

interface UseMissionControlDialogOptions {
  open: boolean
  onClose: () => void
  initialKubaraChart?: string
  reviewPlanEncoded?: string
  freshSessionToken?: number
  historicalMissionId?: string
}

export function useMissionControlDialog({
  open,
  onClose,
  initialKubaraChart,
  reviewPlanEncoded,
  freshSessionToken,
  historicalMissionId,
}: UseMissionControlDialogOptions) {
  const mc = useMissionControl()
  const { showToast } = useToast()
  const { startMission, openSidebar } = useMissions()
  const { state } = mc
  const showToastRef = useRef(showToast)
  const [isReviewMode, setIsReviewMode] = useState(false)
  const [reviewNotes, setReviewNotes] = useState<string | undefined>()
  const [isSubmittingLaunch, setIsSubmittingLaunch] = useState(false)
  const launchSubmittingRef = useRef(false)

  const currentStepIndex = PHASE_STEPS.findIndex((s) => s.key === state.phase)
  const [highestReached, setHighestReached] = useState(0)
  useEffect(() => {
    setHighestReached(prev => Math.max(prev, currentStepIndex))
  }, [currentStepIndex])

  useEffect(() => {
    showToastRef.current = showToast
  }, [showToast])

  const prevFreshSessionTokenRef = useRef<number | undefined>(undefined)

  useLayoutEffect(() => {
    if (!open) return

    if (historicalMissionId) {
      const loaded = mc.loadHistoricalSession(historicalMissionId)
      if (loaded) {
        setIsReviewMode(true)
        setReviewNotes(undefined)
      }
      return
    }

    if (reviewPlanEncoded) {
      const plan = decodePlan(reviewPlanEncoded)
      if (!plan) {
        showToastRef.current('Invalid plan link — could not decode the deployment plan', 'error')
        return
      }
      mc.hydrateFromPlan(planToState(plan))
      setIsReviewMode(true)
      setReviewNotes(plan.notes)
      return
    }

    const prevToken = prevFreshSessionTokenRef.current
    const hasTokenIncremented =
      freshSessionToken !== undefined &&
      prevToken !== undefined &&
      freshSessionToken !== prevToken

    if (hasTokenIncremented) {
      setIsReviewMode(false)
      setReviewNotes(undefined)
      mc.reset()
      setHighestReached(0)
    }

    prevFreshSessionTokenRef.current = freshSessionToken
  }, [open, historicalMissionId, reviewPlanEncoded, freshSessionToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (isReviewMode) {
      setIsReviewMode(false)
      setReviewNotes(undefined)
      mc.reset()
    }
    onClose()
  }, [isReviewMode, onClose, mc])

  /** #14190 — Launch a rollback mission for failed projects */
  const handleRollback = useCallback(() => {
    const failedProjects = (state.launchProgress || [])
      .flatMap(phase => (phase.projects || []).filter(p => p.status === 'failed'))
    const projectNames = failedProjects.map(p => p.name).join(', ')
    const clusters = (state.assignments || []).map(a => a.clusterName).filter(Boolean).join(', ')

    const rollbackPrompt = [
      `The following Mission Control deployment failed and may have left clusters in an inconsistent state.`,
      `Failed projects: ${projectNames || 'unknown'}`,
      clusters ? `Target clusters: ${clusters}` : '',
      ``,
      `Please analyze what changes were partially applied and reverse them safely.`,
      `Check the current state of the cluster(s) first, identify any partially-applied resources,`,
      `and roll them back. Ask me before making destructive changes.`,
    ].filter(Boolean).join('\n')

    startMission({
      title: `Rollback: ${state.title || 'Mission Control deployment'}`,
      description: `Reverse changes from failed deployment`,
      type: 'repair',
      initialPrompt: rollbackPrompt,
    })
    openSidebar()
    handleClose()
  }, [state, startMission, openSidebar, handleClose])

  // #8483 — Pre-populate Phase 1 with a Kubara chart
  const initialChartAdded = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!open) {
      initialChartAdded.current = null
      return
    }
    if (!initialKubaraChart || initialChartAdded.current === initialKubaraChart) return
    initialChartAdded.current = initialKubaraChart
    mc.reset()
    setHighestReached(0)
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
    mc.setPhase('define')
  }, [open, initialKubaraChart]) // eslint-disable-line react-hooks/exhaustive-deps

  // issue 6738 — Focus trap and focus restore
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocusTrap(dialogRef, open)

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

  // #7150 — Escape to close via capture phase
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

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [open, handleKeyDown])

  // Reset submitting flag when leaving blueprint phase
  useEffect(() => {
    if (!open || state.phase !== 'blueprint') {
      launchSubmittingRef.current = false
      setIsSubmittingLaunch(false)
    }
  }, [open, state.phase])

  // #6758 — Surface quota exceeded toast
  useEffect(() => {
    if (!open) return
    const pendingTitle = consumePersistQuotaBanner()
    if (pendingTitle === null) return
    showToast(
      `Mission '${pendingTitle}' could not be persisted (browser storage quota exceeded). Your work is preserved in memory but will be lost on reload.`,
      'warning',
    )
  }, [open, showToast])

  // #6403 — Surface stale cluster toast
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

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // #6828 — Ref-based guard prevents double-click from skipping a phase
  const phaseAdvancingRef = useRef(false)
  useEffect(() => { phaseAdvancingRef.current = false }, [state.phase])

  const handleLaunch = useCallback((dryRun: boolean) => {
    if (launchSubmittingRef.current) return

    launchSubmittingRef.current = true
    setIsSubmittingLaunch(true)

    try {
      const hasAssignedClusters = state.assignments.some(
        (assignment) => (assignment.projectNames ?? []).length > 0
      )
      if (!hasAssignedClusters) {
        showToast('No clusters have project assignments. Go back to Chart Course to assign projects before launching.', 'warning')
        launchSubmittingRef.current = false
        setIsSubmittingLaunch(false)
        return
      }

      mc.setDryRun(dryRun)
      mc.setPhase('launching')
    } catch (error) {
      launchSubmittingRef.current = false
      setIsSubmittingLaunch(false)
      throw error
    }
  }, [mc, showToast, state.assignments])

  const isLaunching = state.phase === 'launching'
  const isComplete = state.phase === 'complete'

  const canAdvance =
    (state.phase === 'define' && state.projects.length > 0 && !state.aiStreaming) ||
    (state.phase === 'assign' && (
      state.assignments.some((a) => (a.projectNames ?? []).length > 0) ||
      state.targetClusters.length > 0
    )) ||
    state.phase === 'blueprint'

  const canGoBack = state.phase === 'assign' || state.phase === 'blueprint'

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
    setHighestReached(0)
  }

  return {
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
  }
}

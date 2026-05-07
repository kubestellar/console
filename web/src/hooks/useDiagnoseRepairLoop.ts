import { useState, useRef, useEffect } from 'react'
import { useMissions } from './useMissions'
import type {
  DiagnoseRepairState,
  DiagnoseRepairPhase,
  MonitorIssue,
  MonitoredResource,
  ProposedRepair } from '../types/workloadMonitor'
import { DEFAULT_MAX_LOOPS } from '../types/workloadMonitor'

interface UseDiagnoseRepairLoopOptions {
  /** Type of monitor (used in prompt context) */
  monitorType: string
  /** Whether repair actions are allowed (false = diagnose only) */
  repairable?: boolean
  /** Max loop iterations (default: 3) */
  maxLoops?: number
}

interface UseDiagnoseRepairLoopResult {
  /** Current state of the diagnose/repair loop */
  state: DiagnoseRepairState
  /** Begin scanning and diagnosing */
  startDiagnose: (resources: MonitoredResource[], issues: MonitorIssue[], context: Record<string, unknown>) => void
  /** Approve a specific repair */
  approveRepair: (repairId: string) => void
  /** Approve all proposed repairs */
  approveAllRepairs: () => void
  /** Execute approved repairs */
  executeRepairs: () => void
  /** Reset the loop to idle */
  reset: () => void
  /** Cancel the current loop */
  cancel: () => void
}

const INITIAL_STATE: DiagnoseRepairState = {
  phase: 'idle',
  issuesFound: [],
  proposedRepairs: [],
  completedRepairs: [],
  loopCount: 0,
  maxLoops: DEFAULT_MAX_LOOPS }

/**
 * Hook to orchestrate the AI diagnose/repair loop.
 *
 * Flow: idle → scanning → diagnosing → proposing-repair → awaiting-approval → repairing → verifying → complete/failed
 * For diagnose-only mode (repairable=false), stops after diagnosing.
 */
export function useDiagnoseRepairLoop(options: UseDiagnoseRepairLoopOptions): UseDiagnoseRepairLoopResult {
  const { monitorType, repairable = true, maxLoops = DEFAULT_MAX_LOOPS } = options
  const { startMission, sendMessage, cancelMission, missions } = useMissions()
  const [state, setState] = useState<DiagnoseRepairState>({ ...INITIAL_STATE, maxLoops })
  const missionIdRef = useRef<string | null>(null)
  // #7290/#7291/#7292 — Track all active timers so cancel() can clear them
  const activeTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  // #7292 — Clear all timers on unmount to prevent post-unmount state mutations
  useEffect(() => {
    return () => {
      for (const handle of activeTimers.current) {
        clearTimeout(handle)
      }
      activeTimers.current.clear()
    }
  }, [])

  // #7290 — Listen to mission status changes instead of using a fixed timer.
  // When the associated mission completes, transition from diagnosing to
  // proposing-repair (or complete for diagnose-only mode).
  useEffect(() => {
    if (!missionIdRef.current || state.phase !== 'diagnosing') return
    const mission = missions.find(m => m.id === missionIdRef.current)
    if (!mission) return
    // Only transition when the mission reaches a terminal state
    if (mission.status === 'completed' || mission.status === 'failed' || mission.status === 'cancelled') {
      setState(prev => {
        if (prev.phase !== 'diagnosing') return prev
        // If the mission failed or was cancelled, transition to failed with specific context
        if (mission.status === 'failed' || mission.status === 'cancelled') {
          const stepContext = mission.currentStep ? ` at step: ${mission.currentStep}` : ''
          const errorDetail = mission.status === 'failed'
            ? `Diagnosis failed${stepContext}`
            : `Diagnosis cancelled${stepContext}`
          return { ...prev, phase: 'failed', error: errorDetail }
        }
        // Generate proposed repairs from issues
        const proposedRepairs: ProposedRepair[] = repairable
          ? prev.issuesFound.map((issue, idx) => ({
              id: `repair-${idx}-${Date.now()}`,
              issueId: issue.id,
              action: getDefaultRepairAction(issue),
              description: getDefaultRepairDescription(issue),
              risk: getDefaultRepairRisk(issue),
              approved: false }))
          : []
        return {
          ...prev,
          phase: repairable ? 'proposing-repair' : 'complete',
          proposedRepairs }
      })
    }
  }, [missions, state.phase, repairable])

  // Safety timeout for diagnosing phase to prevent getting stuck
  useEffect(() => {
    if (state.phase !== 'diagnosing') return
    
    const DIAGNOSING_TIMEOUT_MS = 30_000 // 30 seconds safety timeout
    const handle = setTimeout(() => {
      setState(prev => {
        if (prev.phase !== 'diagnosing') return prev
        console.warn('Diagnosing phase timed out, transitioning to complete')
        return {
          ...prev,
          phase: repairable ? 'proposing-repair' : 'complete',
          proposedRepairs: repairable
            ? prev.issuesFound.map((issue, idx) => ({
                id: `repair-${idx}-${Date.now()}`,
                issueId: issue.id,
                action: getDefaultRepairAction(issue),
                description: getDefaultRepairDescription(issue),
                risk: getDefaultRepairRisk(issue),
                approved: false }))
            : []
        }
      })
    }, DIAGNOSING_TIMEOUT_MS)
    
    activeTimers.current.add(handle)
    return () => {
      activeTimers.current.delete(handle)
      clearTimeout(handle)
    }
  }, [state.phase, repairable])

  // Listen for repair mission completion to transition from repairing to verifying.
  // Intentionally omits state.phase from deps: we only want to react to missions
  // updates (e.g. repair mission status change), NOT to the phase transition itself.
  // Including state.phase would cause an immediate false trigger when entering
  // 'repairing' if the diagnosis mission is still in a terminal state. The
  // setState updater guard (prev.phase !== 'repairing') ensures correctness.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!missionIdRef.current || state.phase !== 'repairing') return
    const mission = missions.find(m => m.id === missionIdRef.current)
    if (!mission) return

    // Only transition on successful completion; treat failed/cancelled as errors
    if (mission.status === 'completed') {
      setState(prev => {
        if (prev.phase !== 'repairing') return prev
        const approvedRepairs = prev.proposedRepairs.filter(r => r.approved)
        const completed = approvedRepairs.map(r => r.id)
        const newState = {
          ...prev,
          completedRepairs: [...prev.completedRepairs, ...completed],
          phase: 'verifying' as DiagnoseRepairPhase
        }
        if (prev.loopCount >= prev.maxLoops - 1) {
          newState.phase = 'complete'
        }
        return newState
      })
    } else if (mission.status === 'failed' || mission.status === 'cancelled') {
      setState(prev => {
        if (prev.phase !== 'repairing') return prev
        const stepContext = mission.currentStep ? ` at step: ${mission.currentStep}` : ''
        return {
          ...prev,
          phase: 'failed',
          error: mission.status === 'failed'
            ? `Repair failed${stepContext}`
            : `Repair cancelled${stepContext}`
        }
      })
    }
  }, [missions]) // eslint-disable-line react-hooks/exhaustive-deps

  const setPhase = (phase: DiagnoseRepairPhase) => {
    setState(prev => ({ ...prev, phase }))
  }

  const startDiagnose = (
    resources: MonitoredResource[],
    issues: MonitorIssue[],
    context: Record<string, unknown>,
  ) => {
    setState(prev => ({
      ...prev,
      phase: 'scanning',
      issuesFound: issues,
      proposedRepairs: [],
      completedRepairs: [],
      loopCount: prev.phase === 'verifying' ? prev.loopCount + 1 : 0,
      error: undefined }))

    // Build diagnosis prompt
    const resourceSummary = resources.map(r =>
      `  ${r.kind}/${r.name} — ${r.status}${r.message ? ` (${r.message})` : ''}`
    ).join('\n')

    const issuesSummary = issues.length > 0
      ? issues.map(i => `  [${i.severity}] ${i.title}: ${i.description}`).join('\n')
      : '  No issues detected.'

    const diagnosePrompt = `You are a Kubernetes diagnostician analyzing a ${monitorType} workload.

WORKLOAD CONTEXT:
${JSON.stringify(context, null, 2)}

RESOURCES AND STATUS:
${resourceSummary}

DETECTED ISSUES:
${issuesSummary}

TASK: Analyze these resources and issues. Provide:
1. A brief analysis of the overall workload health
2. For each issue, explain the root cause and impact
${repairable ? '3. For each issue, propose a specific repair action with risk assessment (low/medium/high)' : '3. Recommendations for addressing each issue (no automated repairs)'}

Respond with your analysis in a clear, structured format. ${repairable ? 'For each proposed repair, indicate the risk level and what command or action would be needed.' : 'Focus on diagnosis and recommendations only.'}`

    // Start mission — skip review since the user already clicked "Diagnose"
    // intentionally. Without skipReview the mission would be queued for the
    // ConfirmMissionPromptDialog, but the hook immediately transitions to
    // 'diagnosing' phase expecting the mission to exist in state (#11434).
    const missionId = startMission({
      title: `${monitorType} Diagnosis`,
      description: `Diagnosing workload health issues for ${monitorType}`,
      type: 'troubleshoot',
      skipReview: true,
      initialPrompt: diagnosePrompt,
      context })

    missionIdRef.current = missionId
    setState(prev => ({ ...prev, phase: 'diagnosing', missionId }))

    // #7290 — Phase transition is now driven by the useEffect above
    // watching mission status changes, not a fixed 3s timer.
  }

  const approveRepair = (repairId: string) => {
    setState(prev => ({
      ...prev,
      proposedRepairs: prev.proposedRepairs.map(r =>
        r.id === repairId ? { ...r, approved: true } : r
      ),
      phase: 'awaiting-approval' }))
  }

  const approveAllRepairs = () => {
    setState(prev => ({
      ...prev,
      proposedRepairs: prev.proposedRepairs.map(r => ({ ...r, approved: true })),
      phase: 'awaiting-approval' }))
  }

  const executeRepairs = () => {
    const approvedRepairs = state.proposedRepairs.filter(r => r.approved)
    if (approvedRepairs.length === 0) return

    if (!missionIdRef.current) {
      setState(prev => ({
        ...prev,
        phase: 'failed',
        error: 'Repair could not start because the AI session is unavailable. Reset and try again.',
      }))
      return
    }

    const repairPrompt = `Execute the following approved repairs:\n${approvedRepairs.map(r =>
      `- ${r.action}: ${r.description} (risk: ${r.risk})`
    ).join('\n')}\n\nPlease execute each repair and report the results.`

    try {
      setPhase('repairing')
      sendMessage(missionIdRef.current, repairPrompt)
    } catch (error) {
      setState(prev => ({
        ...prev,
        phase: 'failed',
        error: error instanceof Error ? error.message : 'Repair could not start. Please try again.',
      }))
      return
    }

    // #7291 — Repair completion is now driven by mission status.
    // The repair mission will update via the missions list; we listen
    // for the mission to reach a terminal state before transitioning.
    // Keep a safety-net timer but make it configurable and clearable.
    /** Maximum time (ms) to wait for repair mission completion before auto-transitioning */
    const REPAIR_SAFETY_TIMEOUT_MS = 60_000
    const handle = setTimeout(() => {
      activeTimers.current.delete(handle)
      setState(prev => {
        if (prev.phase !== 'repairing') return prev
        const completed = approvedRepairs.map(r => r.id)
        const newState = {
          ...prev,
          completedRepairs: [...prev.completedRepairs, ...completed],
          phase: 'verifying' as DiagnoseRepairPhase }
        if (prev.loopCount >= prev.maxLoops - 1) {
          newState.phase = 'complete'
        }
        return newState
      })
    }, REPAIR_SAFETY_TIMEOUT_MS)
    activeTimers.current.add(handle)
  }

  const reset = () => {
    // #7292 — Clear all pending timers on reset
    for (const handle of activeTimers.current) {
      clearTimeout(handle)
    }
    activeTimers.current.clear()
    setState({ ...INITIAL_STATE, maxLoops })
    missionIdRef.current = null
  }

  const cancel = () => {
    // #7292 — Clear all pending timers on cancel to prevent
    // post-cancel state mutations (e.g. jumping to completed)
    for (const handle of activeTimers.current) {
      clearTimeout(handle)
    }
    activeTimers.current.clear()

    if (missionIdRef.current) {
      cancelMission(missionIdRef.current)
      missionIdRef.current = null
    }
    setState(prev => ({ ...prev, phase: 'idle', error: 'Cancelled by user' }))
  }

  return {
    state,
    startDiagnose,
    approveRepair,
    approveAllRepairs,
    executeRepairs,
    reset,
    cancel }
}

// Helper functions to generate default repair proposals from issues
function getDefaultRepairAction(issue: MonitorIssue): string {
  const kind = issue.resource.kind
  const status = issue.resource.status

  if (status === 'missing') return `Create ${kind}`
  if (kind === 'Deployment' || kind === 'StatefulSet' || kind === 'DaemonSet') {
    return status === 'unhealthy' ? `Restart ${kind}` : `Scale ${kind}`
  }
  if (kind === 'Service') return 'Check endpoints'
  if (kind === 'PersistentVolumeClaim') return 'Investigate PVC'
  return `Investigate ${kind}`
}

function getDefaultRepairDescription(issue: MonitorIssue): string {
  return `Address: ${issue.title} — ${issue.description}`
}

function getDefaultRepairRisk(issue: MonitorIssue): 'low' | 'medium' | 'high' {
  if (issue.severity === 'critical') return 'medium'
  if (issue.resource.kind === 'Deployment' || issue.resource.kind === 'StatefulSet') return 'medium'
  return 'low'
}

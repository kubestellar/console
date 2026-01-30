import { useState, useCallback, useRef } from 'react'
import { useMissions } from './useMissions'
import type {
  DiagnoseRepairState,
  DiagnoseRepairPhase,
  MonitorIssue,
  MonitoredResource,
  ProposedRepair,
} from '../types/workloadMonitor'
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
  maxLoops: DEFAULT_MAX_LOOPS,
}

/**
 * Hook to orchestrate the AI diagnose/repair loop.
 *
 * Flow: idle → scanning → diagnosing → proposing-repair → awaiting-approval → repairing → verifying → complete/failed
 * For diagnose-only mode (repairable=false), stops after diagnosing.
 */
export function useDiagnoseRepairLoop(options: UseDiagnoseRepairLoopOptions): UseDiagnoseRepairLoopResult {
  const { monitorType, repairable = true, maxLoops = DEFAULT_MAX_LOOPS } = options
  const { startMission, sendMessage } = useMissions()
  const [state, setState] = useState<DiagnoseRepairState>({ ...INITIAL_STATE, maxLoops })
  const missionIdRef = useRef<string | null>(null)

  const setPhase = useCallback((phase: DiagnoseRepairPhase) => {
    setState(prev => ({ ...prev, phase }))
  }, [])

  const startDiagnose = useCallback((
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
      error: undefined,
    }))

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

    // Start mission
    const missionId = startMission({
      title: `${monitorType} Diagnosis`,
      description: `Diagnosing workload health issues for ${monitorType}`,
      type: 'troubleshoot',
      initialPrompt: diagnosePrompt,
      context,
    })

    missionIdRef.current = missionId
    setState(prev => ({ ...prev, phase: 'diagnosing', missionId }))

    // The mission runs asynchronously. We transition to proposing-repair
    // after a delay to allow the AI to respond.
    // In a real implementation, this would listen to mission status changes.
    setTimeout(() => {
      setState(prev => {
        if (prev.phase !== 'diagnosing') return prev

        // Generate proposed repairs from issues
        const proposedRepairs: ProposedRepair[] = repairable
          ? issues.map((issue, idx) => ({
              id: `repair-${idx}-${Date.now()}`,
              issueId: issue.id,
              action: getDefaultRepairAction(issue),
              description: getDefaultRepairDescription(issue),
              risk: getDefaultRepairRisk(issue),
              approved: false,
            }))
          : []

        return {
          ...prev,
          phase: repairable ? 'proposing-repair' : 'complete',
          proposedRepairs,
        }
      })
    }, 3000)
  }, [monitorType, repairable, startMission])

  const approveRepair = useCallback((repairId: string) => {
    setState(prev => ({
      ...prev,
      proposedRepairs: prev.proposedRepairs.map(r =>
        r.id === repairId ? { ...r, approved: true } : r
      ),
      phase: 'awaiting-approval',
    }))
  }, [])

  const approveAllRepairs = useCallback(() => {
    setState(prev => ({
      ...prev,
      proposedRepairs: prev.proposedRepairs.map(r => ({ ...r, approved: true })),
      phase: 'awaiting-approval',
    }))
  }, [])

  const executeRepairs = useCallback(() => {
    const approvedRepairs = state.proposedRepairs.filter(r => r.approved)
    if (approvedRepairs.length === 0) return

    setPhase('repairing')

    if (missionIdRef.current) {
      const repairPrompt = `Execute the following approved repairs:\n${approvedRepairs.map(r =>
        `- ${r.action}: ${r.description} (risk: ${r.risk})`
      ).join('\n')}\n\nPlease execute each repair and report the results.`

      sendMessage(missionIdRef.current, repairPrompt)
    }

    // Simulate repair execution completion
    setTimeout(() => {
      setState(prev => {
        const completed = approvedRepairs.map(r => r.id)
        const newState = {
          ...prev,
          completedRepairs: [...prev.completedRepairs, ...completed],
          phase: 'verifying' as DiagnoseRepairPhase,
        }

        // Check if we should loop or complete
        if (prev.loopCount >= prev.maxLoops - 1) {
          newState.phase = 'complete'
        }

        return newState
      })
    }, 5000)
  }, [state.proposedRepairs, setPhase, sendMessage])

  const reset = useCallback(() => {
    setState({ ...INITIAL_STATE, maxLoops })
    missionIdRef.current = null
  }, [maxLoops])

  const cancel = useCallback(() => {
    if (missionIdRef.current) {
      // The mission will continue but we disconnect from it
      missionIdRef.current = null
    }
    setState(prev => ({ ...prev, phase: 'idle', error: 'Cancelled by user' }))
  }, [])

  return {
    state,
    startDiagnose,
    approveRepair,
    approveAllRepairs,
    executeRepairs,
    reset,
    cancel,
  }
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

import {
  Stethoscope,
  Wrench,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  Shield,
  RotateCcw,
  Ban,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { useDiagnoseRepairLoop } from '../../../hooks/useDiagnoseRepairLoop'
import { useApiKeyCheck, ApiKeyPromptModal } from '../console-missions/shared'
import type { MonitoredResource, MonitorIssue, DiagnoseRepairPhase, RepairRisk } from '../../../types/workloadMonitor'

interface DiagnoseProps {
  resources: MonitoredResource[]
  issues: MonitorIssue[]
  monitorType: string
  diagnosable: boolean
  repairable: boolean
  workloadContext: Record<string, unknown>
}

const PHASE_CONFIG: Record<DiagnoseRepairPhase, { label: string; icon: typeof Stethoscope; color: string }> = {
  idle: { label: 'Ready', icon: Stethoscope, color: 'text-muted-foreground' },
  scanning: { label: 'Scanning...', icon: Loader2, color: 'text-blue-400' },
  diagnosing: { label: 'Diagnosing...', icon: Stethoscope, color: 'text-purple-400' },
  'proposing-repair': { label: 'Repairs Proposed', icon: Wrench, color: 'text-orange-400' },
  'awaiting-approval': { label: 'Awaiting Approval', icon: Shield, color: 'text-yellow-400' },
  repairing: { label: 'Repairing...', icon: Wrench, color: 'text-blue-400' },
  verifying: { label: 'Verifying...', icon: Loader2, color: 'text-purple-400' },
  complete: { label: 'Complete', icon: CheckCircle, color: 'text-green-400' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-400' },
}

const RISK_BADGE: Record<RepairRisk, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-red-500/20 text-red-400',
}

const PHASE_ORDER: DiagnoseRepairPhase[] = [
  'scanning', 'diagnosing', 'proposing-repair', 'awaiting-approval', 'repairing', 'verifying', 'complete',
]

export function WorkloadMonitorDiagnose({
  resources,
  issues,
  monitorType,
  diagnosable,
  repairable,
  workloadContext,
}: DiagnoseProps) {
  const [expanded, setExpanded] = useState(false)
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  const {
    state,
    startDiagnose,
    approveRepair,
    approveAllRepairs,
    executeRepairs,
    reset,
    cancel,
  } = useDiagnoseRepairLoop({
    monitorType,
    repairable,
  })

  if (!diagnosable) return null

  const phaseConfig = PHASE_CONFIG[state.phase]
  const isActive = state.phase !== 'idle' && state.phase !== 'complete' && state.phase !== 'failed'
  const hasApprovedRepairs = state.proposedRepairs.some(r => r.approved)
  const allApproved = state.proposedRepairs.length > 0 && state.proposedRepairs.every(r => r.approved)

  const handleStartDiagnose = () => {
    checkKeyAndRun(() => {
      setExpanded(true)
      startDiagnose(resources, issues, workloadContext)
    })
  }

  // Phase progress indicator
  const currentPhaseIndex = PHASE_ORDER.indexOf(state.phase)

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Stethoscope className="w-3.5 h-3.5 text-purple-400" />
          <span>AI Diagnose{repairable ? ' & Repair' : ''}</span>
          {state.phase !== 'idle' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded bg-secondary ${phaseConfig.color}`}>
              {phaseConfig.label}
            </span>
          )}
          {state.loopCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Loop {state.loopCount}/{state.maxLoops}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1.5">
          {state.phase === 'idle' && (
            <button
              onClick={handleStartDiagnose}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
            >
              <Stethoscope className="w-3 h-3" />
              Diagnose
            </button>
          )}
          {isActive && (
            <button
              onClick={cancel}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              <Ban className="w-3 h-3" />
              Cancel
            </button>
          )}
          {(state.phase === 'complete' || state.phase === 'failed') && (
            <button
              onClick={reset}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Phase progress stepper */}
          {state.phase !== 'idle' && (
            <div className="flex items-center gap-1">
              {PHASE_ORDER.map((phase, idx) => {
                const config = PHASE_CONFIG[phase]
                const isPast = idx < currentPhaseIndex
                const isCurrent = phase === state.phase

                if (!repairable && ['proposing-repair', 'awaiting-approval', 'repairing', 'verifying'].includes(phase)) {
                  return null
                }

                return (
                  <div key={phase} className="flex items-center gap-1">
                    {idx > 0 && (
                      <div className={`w-4 h-px ${isPast ? 'bg-green-400' : isCurrent ? 'bg-purple-400' : 'bg-border'}`} />
                    )}
                    <div
                      className={`w-2 h-2 rounded-full ${isPast ? 'bg-green-400' : isCurrent ? 'bg-purple-400 ring-2 ring-purple-400/30' : 'bg-border'}`}
                      title={config.label}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {/* Scanning / Diagnosing */}
          {(state.phase === 'scanning' || state.phase === 'diagnosing') && (
            <div className="flex items-center gap-2 py-3 justify-center">
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
              <span className="text-sm text-muted-foreground">{phaseConfig.label}</span>
            </div>
          )}

          {/* Proposed repairs */}
          {(state.phase === 'proposing-repair' || state.phase === 'awaiting-approval') && state.proposedRepairs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Proposed Repairs</span>
                {!allApproved && (
                  <button
                    onClick={approveAllRepairs}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                  >
                    Approve All
                  </button>
                )}
              </div>
              {state.proposedRepairs.map(repair => (
                <div
                  key={repair.id}
                  className="rounded-md bg-card/50 border border-border p-2 flex items-start gap-2"
                >
                  <button
                    onClick={() => !repair.approved && approveRepair(repair.id)}
                    className={`mt-0.5 shrink-0 ${repair.approved ? 'text-green-400' : 'text-muted-foreground hover:text-green-400'}`}
                    disabled={repair.approved}
                  >
                    {repair.approved
                      ? <CheckCircle className="w-3.5 h-3.5" />
                      : <div className="w-3.5 h-3.5 rounded-full border border-current" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{repair.action}</span>
                      <span className={`text-[10px] px-1 py-0.5 rounded ${RISK_BADGE[repair.risk]}`}>
                        {repair.risk} risk
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{repair.description}</p>
                  </div>
                </div>
              ))}
              {hasApprovedRepairs && (
                <button
                  onClick={executeRepairs}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors text-xs font-medium"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Execute {state.proposedRepairs.filter(r => r.approved).length} Repair{state.proposedRepairs.filter(r => r.approved).length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {/* Repairing */}
          {state.phase === 'repairing' && (
            <div className="flex items-center gap-2 py-3 justify-center">
              <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
              <span className="text-sm text-muted-foreground">Executing repairs...</span>
            </div>
          )}

          {/* Verifying */}
          {state.phase === 'verifying' && (
            <div className="flex flex-col items-center gap-2 py-3">
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
              <span className="text-sm text-muted-foreground">Verifying repairs...</span>
              <button
                onClick={() => startDiagnose(resources, issues, workloadContext)}
                className="text-xs px-2 py-1 rounded-md bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
              >
                Re-scan Now
              </button>
            </div>
          )}

          {/* Complete */}
          {state.phase === 'complete' && (
            <div className="rounded-md bg-green-500/10 border border-green-500/20 p-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
              <div>
                <p className="text-sm text-green-400 font-medium">
                  {repairable ? 'Diagnosis & repair complete' : 'Diagnosis complete'}
                </p>
                {state.completedRepairs.length > 0 && (
                  <p className="text-xs text-green-400/70 mt-0.5">
                    {state.completedRepairs.length} repair{state.completedRepairs.length !== 1 ? 's' : ''} executed
                    {state.loopCount > 0 && ` over ${state.loopCount + 1} iteration${state.loopCount > 0 ? 's' : ''}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Failed */}
          {state.phase === 'failed' && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <div>
                <p className="text-sm text-red-400 font-medium">Diagnosis failed</p>
                {state.error && (
                  <p className="text-xs text-red-400/70 mt-0.5">{state.error}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* API Key prompt */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />
    </div>
  )
}

import { CheckCircle2, XCircle, Loader2, SkipForward, Clock } from 'lucide-react'
import type { EvidenceStepResult } from '../../lib/runbooks/types'
import { MS_PER_SECOND } from '../../lib/constants/time'

interface RunbookProgressProps {
  title: string
  steps: EvidenceStepResult[]
}

const STATUS_ICONS = {
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  running: <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />,
  success: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  failed: <XCircle className="w-4 h-4 text-red-400" />,
  skipped: <SkipForward className="w-4 h-4 text-yellow-400" />,
}

export function RunbookProgress({ title, steps }: RunbookProgressProps) {
  const completed = steps.filter(s => s.status === 'success' || s.status === 'skipped' || s.status === 'failed').length
  const total = steps.length
  const progress = total > 0 ? (completed / total) * 100 : 0

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <span className="text-xs text-muted-foreground">
          {completed}/{total} steps
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step list */}
      <div className="space-y-1.5">
        {steps.map(step => (
          <div
            key={step.stepId}
            className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
              step.status === 'running' ? 'bg-purple-500/10' : ''
            }`}
          >
            {STATUS_ICONS[step.status]}
            <span className={`flex-1 ${step.status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}>
              {step.label}
            </span>
            {step.durationMs !== undefined && (
              <span className="text-muted-foreground">
                {step.durationMs < MS_PER_SECOND ? `${step.durationMs}ms` : `${(step.durationMs / MS_PER_SECOND).toFixed(1)}s`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

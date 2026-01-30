import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { MonitorIssue } from '../../../types/workloadMonitor'

interface AlertsProps {
  issues: MonitorIssue[]
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400' },
  warning: { icon: AlertTriangle, bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
  info: { icon: Info, bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400' },
}

export function WorkloadMonitorAlerts({ issues }: AlertsProps) {
  const [expanded, setExpanded] = useState(true)

  if (issues.length === 0) return null

  const criticalCount = issues.filter(i => i.severity === 'critical').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.filter(i => i.severity === 'info').length

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
        <span>Issues ({issues.length})</span>
        {criticalCount > 0 && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">{criticalCount} critical</span>
        )}
        {warningCount > 0 && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400">{warningCount} warning</span>
        )}
        {infoCount > 0 && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">{infoCount} info</span>
        )}
      </button>

      {expanded && (
        <div className="space-y-1.5">
          {issues.map(issue => {
            const config = SEVERITY_CONFIG[issue.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.info
            const SeverityIcon = config.icon
            return (
              <div
                key={issue.id}
                className={`rounded-md ${config.bg} border ${config.border} p-2 flex items-start gap-2`}
              >
                <SeverityIcon className={`w-3.5 h-3.5 ${config.text} mt-0.5 shrink-0`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${config.text}`}>{issue.title}</span>
                    <span className={`text-[10px] px-1 py-0.5 rounded ${config.badge}`}>{issue.severity}</span>
                  </div>
                  {issue.description && (
                    <p className={`text-[10px] ${config.text} opacity-70 mt-0.5`}>{issue.description}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

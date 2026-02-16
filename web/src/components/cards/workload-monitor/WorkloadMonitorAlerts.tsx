import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { MonitorIssue } from '../../../types/workloadMonitor'
import { CardAIActions } from '../../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'

interface AlertsProps {
  issues: MonitorIssue[]
  monitorType?: string
  /** When true, shows content expanded without the collapsible header (for tab view) */
  expanded?: boolean
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400' },
  warning: { icon: AlertTriangle, bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
  info: { icon: Info, bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400' },
}

export function WorkloadMonitorAlerts({ issues, monitorType: _monitorType, expanded: forcedExpanded }: AlertsProps) {
  const { t: _t } = useTranslation()
  const [localExpanded, setLocalExpanded] = useState(true)
  const isExpanded = forcedExpanded !== undefined ? forcedExpanded : localExpanded

  const criticalCount = issues.filter(i => i.severity === 'critical').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.filter(i => i.severity === 'info').length

  // Show empty state when in tab mode
  if (issues.length === 0) {
    if (forcedExpanded) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <AlertTriangle className="w-8 h-8 opacity-30 mb-2" />
          <p className="text-sm">No issues detected</p>
          <p className="text-xs opacity-70 mt-1">All components are healthy</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className={forcedExpanded ? '' : 'mt-3'}>
      {/* Only show collapsible header when not in forced expanded mode */}
      {forcedExpanded === undefined && (
        <button
          onClick={() => setLocalExpanded(!localExpanded)}
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
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
      )}

      {/* Summary badges when in tab mode */}
      {forcedExpanded && (
        <div className="flex items-center gap-2 mb-3 px-1">
          {criticalCount > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">{criticalCount} critical</span>
          )}
          {warningCount > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400">{warningCount} warning</span>
          )}
          {infoCount > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400">{infoCount} info</span>
          )}
        </div>
      )}

      {isExpanded && (
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
                <CardAIActions
                  resource={{ kind: issue.resource?.kind || 'Resource', name: issue.resource?.name || issue.title, namespace: issue.resource?.namespace, cluster: issue.resource?.cluster, status: issue.severity }}
                  issues={[{ name: issue.title, message: issue.description || '' }]}
                  showRepair={false}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

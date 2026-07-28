// Issues list for the llm-d stack monitor card.
// Extracted from LLMdStackMonitor.tsx (issue #21614) — markup unchanged.
import { AlertTriangle } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { StatusBadge } from '../../ui/StatusBadge'
import { CardAIActions } from '../../../lib/cards/CardComponents'
import type { MonitorIssue } from '../../../types/workloadMonitor'
import type { ComponentItem } from './LLMdStackMonitor.constants'

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400', icon: 'text-red-400' },
  warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400', icon: 'text-yellow-400' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400', icon: 'text-blue-400' } }

interface LLMdIssuesListProps {
  issues: MonitorIssue[]
  searchQuery: string
  onDiagnoseItem: (item: ComponentItem) => void
}

export function LLMdIssuesList({ issues, searchQuery, onDiagnoseItem }: LLMdIssuesListProps) {
  return (
    <div className="flex-1 overflow-y-auto space-y-2">
      {issues.length > 0 ? (
        issues.map(issue => {
          const config = SEVERITY_CONFIG[issue.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.info

          return (
            <div
              key={issue.id}
              className={cn('rounded-lg p-3 border', config.bg, config.border)}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className={cn('w-4 h-4 mt-0.5 shrink-0', config.icon)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('text-sm font-medium', config.text)}>{issue.title}</span>
                    <span className={cn('text-2xs px-1.5 py-0.5 rounded', config.badge)}>{issue.severity}</span>
                  </div>
                  {issue.description && (
                    <p className="text-xs text-muted-foreground mt-1">{issue.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {issue.resource?.namespace && (
                      <StatusBadge color="purple" size="xs">
                        {issue.resource.namespace}
                      </StatusBadge>
                    )}
                    {issue.resource?.cluster && (
                      <span className="text-2xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        {issue.resource.cluster}
                      </span>
                    )}
                  </div>
                </div>
                <CardAIActions
                  resource={{ kind: issue.resource?.kind || 'Resource', name: issue.resource?.name || issue.title, namespace: issue.resource?.namespace, cluster: issue.resource?.cluster, status: issue.severity }}
                  issues={[{ name: issue.title, message: issue.description || '' }]}
                  showRepair={false}
                  onDiagnose={() => onDiagnoseItem({
                    name: issue.resource?.name || issue.title,
                    status: issue.severity === 'critical' ? 'unhealthy' : 'degraded',
                    namespace: issue.resource?.namespace,
                    cluster: issue.resource?.cluster })}
                />
              </div>
            </div>
          )
        })
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <AlertTriangle className="w-8 h-8 opacity-30 mb-2" />
          <p className="text-sm">{searchQuery ? 'No issues match your search' : 'No issues detected'}</p>
          {!searchQuery && <p className="text-xs opacity-70 mt-1">All components are healthy</p>}
        </div>
      )}
    </div>
  )
}

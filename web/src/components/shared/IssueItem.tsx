import { ChevronRight, ChevronDown, Box, Layers, Eye, Wrench } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTranslation } from 'react-i18next'

export type IssueKind = 'Pod' | 'Deployment'

interface BaseIssue {
  name: string
  namespace: string
}

export interface PodIssue extends BaseIssue {
  kind: 'Pod'
  status: string
  restarts?: number
  issues: string[]
  reason?: string
}

export interface DeploymentIssue extends BaseIssue {
  kind: 'Deployment'
  replicas: number
  readyReplicas: number
  message?: string
}

export type Issue = PodIssue | DeploymentIssue

interface IssueItemProps {
  issue: Issue
  isExpanded: boolean
  onToggle: () => void
  onViewDetails?: () => void
  onTroubleshoot?: () => void
}

/**
 * Expandable issue item for pod or deployment issues.
 * Shows a summary row that expands to show details and action buttons.
 */
export function IssueItem({
  issue,
  isExpanded,
  onToggle,
  onViewDetails,
  onTroubleshoot,
}: IssueItemProps) {
  const { t } = useTranslation()
  const isPod = issue.kind === 'Pod'

  const bgClass = isPod ? 'bg-red-500/10 border-red-500/20' : 'bg-orange-500/10 border-orange-500/20'
  const hoverBgClass = isPod ? 'hover:bg-red-500/5' : 'hover:bg-orange-500/5'
  const borderClass = isPod ? 'border-red-500/20' : 'border-orange-500/20'
  const iconClass = isPod ? 'text-red-400' : 'text-orange-400'
  const badgeBgClass = isPod ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
  const statusBgClass = isPod ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'

  const Icon = isPod ? Box : Layers
  const kindLabel = isPod ? 'Pod' : 'Deploy'

  return (
    <div className={cn('rounded-lg border overflow-hidden', bgClass)}>
      <button
        onClick={onToggle}
        className={cn(
          'w-full p-3 flex items-center justify-between text-left transition-colors',
          hoverBgClass
        )}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className={cn('w-4 h-4', iconClass)} />
          ) : (
            <ChevronRight className={cn('w-4 h-4', iconClass)} />
          )}
          <span className={cn('flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium', badgeBgClass)}>
            <Icon className="w-3 h-3" />{kindLabel}
          </span>
          <span className="font-medium text-foreground">{issue.name}</span>
          <span className="text-xs text-muted-foreground">({issue.namespace})</span>
        </div>
        <span className={cn('text-xs px-2 py-1 rounded', statusBgClass)}>
          {isPod ? (issue as PodIssue).status : `${(issue as DeploymentIssue).readyReplicas}/${(issue as DeploymentIssue).replicas} ready`}
        </span>
      </button>

      {isExpanded && (
        <div className={cn('px-3 pb-3 pt-0 border-t', borderClass)}>
          <div className="pl-6 space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
              <span className="ml-2 font-mono text-foreground">{issue.namespace}</span>
            </div>

            {isPod ? (
              <>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className="ml-2 text-red-400">{(issue as PodIssue).status}</span>
                </div>
                {(issue as PodIssue).restarts !== undefined && (issue as PodIssue).restarts! > 0 && (
                  <div>
                    <span className="text-muted-foreground">{t('drilldown.fields.restarts')}</span>
                    <span className="ml-2 text-orange-400">{(issue as PodIssue).restarts}</span>
                  </div>
                )}
                {(issue as PodIssue).issues.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Issues:</span>
                    <ul className="ml-4 mt-1 list-disc list-inside text-red-400">
                      {(issue as PodIssue).issues.map((msg, j) => (
                        <li key={j}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <span className="text-muted-foreground">Replicas:</span>
                  <span className="ml-2 text-foreground">
                    {(issue as DeploymentIssue).readyReplicas}/{(issue as DeploymentIssue).replicas} ready
                  </span>
                </div>
                {(issue as DeploymentIssue).message && (
                  <div>
                    <span className="text-muted-foreground">{t('drilldown.fields.message')}</span>
                    <span className="ml-2 text-orange-400">{(issue as DeploymentIssue).message}</span>
                  </div>
                )}
              </>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-2">
              {onViewDetails && (
                <button
                  onClick={onViewDetails}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-secondary/50 text-foreground hover:bg-secondary transition-colors text-xs"
                >
                  <Eye className="w-3 h-3" />
                  View Details
                </button>
              )}
              {onTroubleshoot && (
                <button
                  onClick={onTroubleshoot}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded transition-colors text-xs',
                    isPod ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                  )}
                >
                  <Wrench className="w-3 h-3" />
                  Troubleshoot
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

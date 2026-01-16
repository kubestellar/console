import { AlertTriangle, RefreshCw, AlertCircle, Clock, Scale, ChevronRight } from 'lucide-react'
import { useDeploymentIssues, DeploymentIssue } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'

interface DeploymentIssuesProps {
  config?: Record<string, unknown>
}

const getIssueIcon = (status: string) => {
  if (status.includes('Unavailable')) return AlertCircle
  if (status.includes('Progressing')) return Clock
  if (status.includes('ReplicaFailure')) return Scale
  return AlertTriangle
}

export function DeploymentIssues({ config }: DeploymentIssuesProps) {
  const cluster = config?.cluster as string | undefined
  const namespace = config?.namespace as string | undefined
  const { issues, isLoading, error, refetch } = useDeploymentIssues(cluster, namespace)
  const { drillToDeployment } = useDrillDownActions()

  const handleDeploymentClick = (issue: DeploymentIssue) => {
    drillToDeployment(issue.cluster || 'default', issue.namespace, issue.name, {
      replicas: issue.replicas,
      readyReplicas: issue.readyReplicas,
      reason: issue.reason,
      message: issue.message,
    })
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">Deployment Issues</span>
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
            <svg
              className="w-6 h-6 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-white font-medium">All deployments healthy</p>
          <p className="text-sm text-muted-foreground">No issues detected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Deployment Issues</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
            {issues.length}
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Issues list */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {issues.map((issue, idx) => {
          const Icon = getIssueIcon(issue.reason || '')

          return (
            <div
              key={`${issue.name}-${idx}`}
              className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/15 transition-colors"
              onClick={() => handleDeploymentClick(issue)}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-orange-500/20 flex-shrink-0">
                  <Icon className="w-4 h-4 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ClusterBadge cluster={issue.cluster || 'default'} />
                    <span className="text-xs text-muted-foreground">{issue.namespace}</span>
                  </div>
                  <p className="text-sm font-medium text-white truncate">{issue.name}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">
                      {issue.reason || 'Issue'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {issue.readyReplicas}/{issue.replicas} ready
                    </span>
                  </div>
                  {issue.message && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {issue.message}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Using demo data
        </div>
      )}
    </div>
  )
}

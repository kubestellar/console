import { Shield, AlertTriangle, RefreshCw, User, Network, Server, ChevronRight } from 'lucide-react'
import { useSecurityIssues, SecurityIssue } from '../../hooks/useMCP'
import { PaginatedList } from '../ui/PaginatedList'

interface SecurityIssuesProps {
  config?: Record<string, unknown>
}

const getIssueIcon = (issue: string) => {
  if (issue.includes('Privileged')) return Shield
  if (issue.includes('root')) return User
  if (issue.includes('network') || issue.includes('Network')) return Network
  if (issue.includes('PID')) return Server
  return AlertTriangle
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'high':
      return { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', badge: 'bg-red-500/20' }
    case 'medium':
      return { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', badge: 'bg-orange-500/20' }
    case 'low':
      return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', badge: 'bg-yellow-500/20' }
    default:
      return { bg: 'bg-gray-500/10', border: 'border-gray-500/20', text: 'text-gray-400', badge: 'bg-gray-500/20' }
  }
}

export function SecurityIssues({ config }: SecurityIssuesProps) {
  const cluster = config?.cluster as string | undefined
  const namespace = config?.namespace as string | undefined
  const { issues, isLoading, error, refetch } = useSecurityIssues(cluster, namespace)

  const highCount = issues.filter(i => i.severity === 'high').length
  const mediumCount = issues.filter(i => i.severity === 'medium').length

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
          <span className="text-sm font-medium text-muted-foreground">Security Issues</span>
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
            <Shield className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-white font-medium">No security issues</p>
          <p className="text-sm text-muted-foreground">All pods pass security checks</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Security Issues</span>
          {highCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              {highCount} high
            </span>
          )}
          {mediumCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              {mediumCount} med
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Issues list with pagination */}
      <div className="flex-1 overflow-y-auto">
        <PaginatedList
          items={issues}
          pageSize={5}
          pageSizeOptions={[5, 10, 25]}
          emptyMessage="No security issues"
          renderItem={(issue: SecurityIssue, idx: number) => {
            const Icon = getIssueIcon(issue.issue)
            const colors = getSeverityColor(issue.severity)

            return (
              <div
                key={`${issue.name}-${issue.issue}-${idx}`}
                className={`p-3 rounded-lg ${colors.bg} border ${colors.border}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${colors.badge} flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${colors.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{issue.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {issue.namespace} · {issue.cluster || 'default'}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded ${colors.badge} ${colors.text}`}>
                        {issue.issue}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${colors.badge} ${colors.text} capitalize`}>
                        {issue.severity}
                      </span>
                    </div>
                    {issue.details && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {issue.details}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              </div>
            )
          }}
        />
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

import { useState, useMemo } from 'react'
import { Shield, AlertTriangle, RefreshCw, User, Network, Server, ChevronRight } from 'lucide-react'
import { useSecurityIssues, SecurityIssue } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { PaginatedList } from '../ui/PaginatedList'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls } from '../ui/CardControls'
import { RefreshIndicator } from '../ui/RefreshIndicator'

type SortByOption = 'severity' | 'name' | 'cluster'

const SORT_OPTIONS = [
  { value: 'severity' as const, label: 'Severity' },
  { value: 'name' as const, label: 'Name' },
  { value: 'cluster' as const, label: 'Cluster' },
]

interface SecurityIssuesProps {
  config?: Record<string, unknown>
}

const getIssueIcon = (issue: string): { icon: typeof Shield; tooltip: string } => {
  if (issue.includes('Privileged')) return { icon: Shield, tooltip: 'Privileged container - Has elevated permissions that could compromise host security' }
  if (issue.includes('root')) return { icon: User, tooltip: 'Running as root - Container runs with root privileges' }
  if (issue.includes('network') || issue.includes('Network')) return { icon: Network, tooltip: 'Host network access - Container shares host network namespace' }
  if (issue.includes('PID')) return { icon: Server, tooltip: 'Host PID namespace - Container can see host processes' }
  return { icon: AlertTriangle, tooltip: 'Security issue detected - Review container configuration' }
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
  const { issues: rawIssues, isLoading, isRefreshing, lastUpdated, error, refetch } = useSecurityIssues(cluster, namespace)
  const { filterItems } = useGlobalFilters()
  const [sortBy, setSortBy] = useState<SortByOption>('severity')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

  const issues = useMemo(() => {
    // Apply global filters (cluster + severity)
    const filtered = filterItems(rawIssues)
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'severity') return (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5)
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'cluster') return (a.cluster || '').localeCompare(b.cluster || '')
      return 0
    })
    if (limit === 'unlimited') return sorted
    return sorted.slice(0, limit)
  }, [rawIssues, sortBy, limit, filterItems])

  const highCount = rawIssues.filter(i => i.severity === 'high').length
  const mediumCount = rawIssues.filter(i => i.severity === 'medium').length

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
            title="Refresh security scan"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3" title="Security scan passed">
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
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400" title={`${highCount} high severity security issues requiring immediate attention`}>
              {highCount} high
            </span>
          )}
          {mediumCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400" title={`${mediumCount} medium severity security issues`}>
              {mediumCount} med
            </span>
          )}
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastUpdated}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
          />
        </div>
      </div>

      {/* Issues list with pagination */}
      <div className="flex-1 overflow-y-auto">
        <PaginatedList
          items={issues}
          pageSize={limit === 'unlimited' ? 1000 : limit}
          pageSizeOptions={[]}
          emptyMessage="No security issues"
          renderItem={(issue: SecurityIssue, idx: number) => {
            const { icon: Icon, tooltip: iconTooltip } = getIssueIcon(issue.issue)
            const colors = getSeverityColor(issue.severity)

            return (
              <div
                key={`${issue.name}-${issue.issue}-${idx}`}
                className={`p-3 rounded-lg ${colors.bg} border ${colors.border}`}
                title={`Security issue in ${issue.name}: ${issue.issue}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${colors.badge} flex-shrink-0`} title={iconTooltip}>
                    <Icon className={`w-4 h-4 ${colors.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <ClusterBadge cluster={issue.cluster || 'default'} />
                      <span className="text-xs text-muted-foreground" title={`Namespace: ${issue.namespace}`}>{issue.namespace}</span>
                    </div>
                    <p className="text-sm font-medium text-white truncate" title={issue.name}>{issue.name}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded ${colors.badge} ${colors.text}`} title={`Issue type: ${issue.issue}`}>
                        {issue.issue}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${colors.badge} ${colors.text} capitalize`} title={`Severity level: ${issue.severity}`}>
                        {issue.severity}
                      </span>
                    </div>
                    {issue.details && (
                      <p className="text-xs text-muted-foreground mt-1 truncate" title={issue.details}>
                        {issue.details}
                      </p>
                    )}
                  </div>
                  <span title="Click to view details"><ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" /></span>
                </div>
              </div>
            )
          }}
        />
      </div>

      {error && (
        <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1" title="Unable to fetch live security data - displaying sample data">
          <AlertTriangle className="w-3 h-3" />
          Using demo data
        </div>
      )}
    </div>
  )
}

import { Shield, AlertTriangle, User, Network, Server, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import type { SecurityIssue } from '../../hooks/useMCP'
import { useCachedSecurityIssues } from '../../hooks/useCachedData'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { LimitedAccessWarning } from '../ui/LimitedAccessWarning'
import { useCardData, CardClusterFilter, CardSearchInput } from '../../lib/cards'
import { SEVERITY_COLORS, SeverityLevel } from '../../lib/accessibility'
import { useCardLoadingState, useCardDemoState } from './CardDataContext'

// Demo security issues data for demo mode
function getDemoSecurityIssues(): SecurityIssue[] {
  return [
    {
      name: 'api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'eks-prod-us-east-1',
      issue: 'Privileged container',
      severity: 'high',
      details: 'Container running in privileged mode',
    },
    {
      name: 'worker-deployment',
      namespace: 'batch',
      cluster: 'vllm-gpu-cluster',
      issue: 'Running as root',
      severity: 'high',
      details: 'Container running as root user',
    },
    {
      name: 'nginx-ingress',
      namespace: 'ingress',
      cluster: 'eks-prod-us-east-1',
      issue: 'Host network enabled',
      severity: 'medium',
      details: 'Pod using host network namespace',
    },
    {
      name: 'monitoring-agent',
      namespace: 'monitoring',
      cluster: 'gke-staging',
      issue: 'Missing security context',
      severity: 'low',
      details: 'No security context defined',
    },
    {
      name: 'redis-cache',
      namespace: 'data',
      cluster: 'openshift-prod',
      issue: 'Capabilities not dropped',
      severity: 'medium',
      details: 'Container not dropping all capabilities',
    },
    {
      name: 'legacy-app',
      namespace: 'legacy',
      cluster: 'vllm-gpu-cluster',
      issue: 'Running as root',
      severity: 'high',
      details: 'Container running as root user',
    },
  ]
}

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
  const level = (severity.toLowerCase() as SeverityLevel) || 'none'
  const colors = SEVERITY_COLORS[level] || SEVERITY_COLORS.none
  return { bg: colors.bg, border: colors.border, text: colors.text, badge: colors.bg }
}

export function SecurityIssues({ config }: SecurityIssuesProps) {
  const clusterConfig = config?.cluster as string | undefined
  const namespaceConfig = config?.namespace as string | undefined
  const { shouldUseDemoData: isDemoMode } = useCardDemoState({ requires: 'agent' })

  // Fetch data with caching (stale-while-revalidate pattern)
  // Cache persists to IndexedDB so data shows immediately on navigation/reload
  const { issues: cachedIssues, isLoading: cachedLoading, error: cachedError, isFailed: cachedFailed, consecutiveFailures: cachedFailures } = useCachedSecurityIssues(clusterConfig, namespaceConfig)

  // Use demo data when in demo mode, otherwise use cached/agent data
  const rawIssues = useMemo(() => isDemoMode ? getDemoSecurityIssues() : cachedIssues, [isDemoMode, cachedIssues])
  const isLoading = isDemoMode ? false : cachedLoading
  const error = isDemoMode ? null : cachedError
  const isFailed = isDemoMode ? false : cachedFailed
  const consecutiveFailures = isDemoMode ? 0 : cachedFailures

  const { drillToPod } = useDrillDownActions()

  // Report card data state to parent CardWrapper for automatic skeleton/refresh handling
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: rawIssues.length > 0,
    isFailed,
    consecutiveFailures,
  })

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: issues,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters: availableClustersForFilter,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
  } = useCardData<SecurityIssue, SortByOption>(rawIssues, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'issue', 'severity', 'details'],
      clusterField: 'cluster',
      storageKey: 'security-issues',
    },
    sort: {
      defaultField: 'severity',
      defaultDirection: 'desc',
      comparators: {
        severity: (a, b) => (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5),
        name: (a, b) => a.name.localeCompare(b.name),
        cluster: (a, b) => (a.cluster || '').localeCompare(b.cluster || ''),
      },
    },
    defaultLimit: 5,
  })

  const handleIssueClick = (issue: SecurityIssue) => {
    if (!issue.cluster) {
      // Can't drill down without a cluster
      return
    }
    drillToPod(issue.cluster, issue.namespace, issue.name, {
      securityIssue: issue.issue,
      severity: issue.severity,
    })
  }

  const highCount = rawIssues.filter(i => i.severity === 'high').length
  const mediumCount = rawIssues.filter(i => i.severity === 'medium').length

  // Show skeleton only on initial load (no cached data)
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 bg-secondary rounded animate-pulse" />
            <div className="h-4 w-12 bg-secondary rounded animate-pulse" />
          </div>
          <div className="h-6 w-6 bg-secondary rounded animate-pulse" />
        </div>
        <div className="flex-1 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 rounded-lg bg-secondary/30 border border-border">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-secondary rounded-lg animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <div className="h-4 w-16 bg-secondary rounded animate-pulse" />
                    <div className="h-4 w-20 bg-secondary rounded animate-pulse" />
                  </div>
                  <div className="h-4 w-32 bg-secondary rounded animate-pulse" />
                  <div className="flex gap-2">
                    <div className="h-5 w-24 bg-secondary rounded animate-pulse" />
                    <div className="h-5 w-16 bg-secondary rounded animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (showEmptyState || issues.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-end mb-3">
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3" title="Security scan passed">
            <Shield className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-foreground font-medium">No security issues</p>
          <p className="text-sm text-muted-foreground">All pods pass security checks</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
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
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster Filter */}
          <CardClusterFilter
            availableClusters={availableClustersForFilter}
            selectedClusters={localClusterFilter}
            onToggle={toggleClusterFilter}
            onClear={clearClusterFilter}
            isOpen={showClusterFilter}
            setIsOpen={setShowClusterFilter}
            containerRef={clusterFilterRef}
            minClusters={1}
          />
          <CardControls
            limit={itemsPerPage}
            onLimitChange={setItemsPerPage}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
        </div>
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search issues..."
        className="mb-3"
      />

      {/* Issues list */}
      <div className="flex-1 space-y-3 overflow-y-auto min-h-card-content">
        {issues.map((issue: SecurityIssue, idx: number) => {
          const { icon: Icon, tooltip: iconTooltip } = getIssueIcon(issue.issue)
          const colors = getSeverityColor(issue.severity)

          return (
            <div
              key={`${issue.name}-${issue.issue}-${idx}`}
              className={`p-3 rounded-lg ${colors.bg} border ${colors.border} cursor-pointer hover:opacity-80 transition-opacity`}
              onClick={() => handleIssueClick(issue)}
              title={`Click to view pod ${issue.name} with security issue: ${issue.issue}`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${colors.badge} flex-shrink-0`} title={iconTooltip}>
                  <Icon className={`w-4 h-4 ${colors.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ClusterBadge cluster={issue.cluster || 'unknown'} />
                    <span className="text-xs text-muted-foreground" title={`Namespace: ${issue.namespace}`}>{issue.namespace}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate" title={issue.name}>{issue.name}</p>
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
        })}
      </div>

      {/* Pagination */}
      {needsPagination && itemsPerPage !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}

      <LimitedAccessWarning hasError={!!error} className="mt-2" />
    </div>
  )
}

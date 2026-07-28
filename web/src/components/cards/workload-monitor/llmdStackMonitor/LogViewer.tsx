import { AlertTriangle } from 'lucide-react'
import { CardControls } from '../../../ui/CardControls'
import { CardSearchInput, CardAIActions } from '../../../../lib/cards/CardComponents'
import { Pagination } from '../../../ui/Pagination'
import { StatusBadge } from '../../../ui/StatusBadge'
import { cn } from '../../../../lib/cn'

type IssueSortField = 'title' | 'severity' | 'cluster'
type SeverityFilter = 'all' | 'critical' | 'warning' | 'info'

interface MonitorIssue {
  id: string
  severity: string
  title: string
  description?: string
  resource?: {
    kind?: string
    name?: string
    namespace?: string
    cluster?: string
  }
}

interface LogViewerProps {
  t: (key: string, options?: Record<string, unknown>) => string
  severityFilter: SeverityFilter
  setSeverityFilter: (v: SeverityFilter) => void
  severityFilterOptions: Array<{ value: string; label: string }>
  issueItemsPerPage: number | 'unlimited'
  setIssueItemsPerPage: (v: number | 'unlimited') => void
  issueSortBy: IssueSortField
  setIssueSortBy: (v: IssueSortField) => void
  issueSortOptions: Array<{ value: string; label: string }>
  issueSortDirection: 'asc' | 'desc'
  setIssueSortDirection: (v: 'asc' | 'desc') => void
  issueSearch: string
  setIssueSearch: (v: string) => void
  paginatedIssues: MonitorIssue[]
  handleItemDiagnose: (item: {
    name: string
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
    namespace?: string
    cluster?: string
  }) => void
  needsIssuePagination: boolean
  safeIssueCurrentPage: number
  totalIssuePages: number
  totalIssues: number
  issuePageSize: number
  setIssueCurrentPage: (page: number) => void
}

export function LogViewer({
  t,
  severityFilter,
  setSeverityFilter,
  severityFilterOptions,
  issueItemsPerPage,
  setIssueItemsPerPage,
  issueSortBy,
  setIssueSortBy,
  issueSortOptions,
  issueSortDirection,
  setIssueSortDirection,
  issueSearch,
  setIssueSearch,
  paginatedIssues,
  handleItemDiagnose,
  needsIssuePagination,
  safeIssueCurrentPage,
  totalIssuePages,
  totalIssues,
  issuePageSize,
  setIssueCurrentPage,
}: LogViewerProps) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <select
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value as SeverityFilter); setIssueCurrentPage(1) }}
          className="px-2 py-1 text-xs rounded-md bg-secondary border border-border text-foreground"
        >
          {severityFilterOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <CardControls
          limit={issueItemsPerPage}
          onLimitChange={(v) => { setIssueItemsPerPage(v); setIssueCurrentPage(1) }}
          sortBy={issueSortBy}
          sortOptions={issueSortOptions}
          onSortChange={(v) => setIssueSortBy(v as IssueSortField)}
          sortDirection={issueSortDirection}
          onSortDirectionChange={setIssueSortDirection}
        />
      </div>

      <CardSearchInput
        value={issueSearch}
        onChange={(v) => { setIssueSearch(v); setIssueCurrentPage(1) }}
        placeholder={t('common.searchIssues')}
        className="mb-3"
      />

      <div className="flex-1 overflow-y-auto space-y-2">
        {paginatedIssues.length > 0 ? (
          paginatedIssues.map(issue => {
            const severityConfig = {
              critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400', icon: 'text-red-400' },
              warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400', icon: 'text-yellow-400' },
              info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400', icon: 'text-blue-400' },
            }
            const config = severityConfig[issue.severity as keyof typeof severityConfig] || severityConfig.info

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
                    onDiagnose={() => handleItemDiagnose({
                      name: issue.resource?.name || issue.title,
                      status: issue.severity === 'critical' ? 'unhealthy' : 'degraded',
                      namespace: issue.resource?.namespace,
                      cluster: issue.resource?.cluster,
                    })}
                  />
                </div>
              </div>
            )
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <AlertTriangle className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-sm">{issueSearch ? 'No issues match your search' : 'No issues detected'}</p>
            {!issueSearch && <p className="text-xs opacity-70 mt-1">All components are healthy</p>}
          </div>
        )}
      </div>

      {needsIssuePagination && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <Pagination
            currentPage={safeIssueCurrentPage}
            totalPages={totalIssuePages}
            totalItems={totalIssues}
            itemsPerPage={issuePageSize}
            onPageChange={setIssueCurrentPage}
          />
        </div>
      )}
    </>
  )
}

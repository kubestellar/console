import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import type { SecurityIssue } from '../../mocks/securityData'
import { severityColor, typeIcon, getTypeLabel } from './securityHelpers'

interface SecurityIssuesTabProps {
  stats: {
    total: number
    high: number
    medium: number
    low: number
    typeCounts: Record<string, number>
  }
  filteredIssues: SecurityIssue[]
  severityFilter: string
  setSeverityFilter: (f: string) => void
  selectedIssueType: string | null
  setSelectedIssueType: (t: string | null) => void
}

export function SecurityIssuesTab({
  stats,
  filteredIssues,
  severityFilter,
  setSeverityFilter,
  selectedIssueType,
  setSelectedIssueType,
}: SecurityIssuesTabProps) {
  const { t } = useTranslation('cards')
  const { t: tc } = useTranslation()

  return (
    <div className="space-y-6">
      {/* Severity Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { sev: 'all', label: t('security.allIssues'), count: stats.total, color: 'text-foreground', bg: 'bg-card' },
          { sev: 'high', label: t('security.highLabel'), count: stats.high, color: 'text-red-400', bg: 'bg-red-500/20' },
          { sev: 'medium', label: t('security.mediumLabel'), count: stats.medium, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
          { sev: 'low', label: t('security.lowLabel'), count: stats.low, color: 'text-blue-400', bg: 'bg-blue-500/20' },
        ].map(item => (
          <button
            key={item.sev}
            onClick={() => setSeverityFilter(item.sev)}
            className={cn(
              'glass p-4 rounded-lg text-left transition-all',
              severityFilter === item.sev ? 'ring-2 ring-purple-500' : 'hover:bg-secondary/30'
            )}
          >
            <div className="text-2xl font-bold">
              <span className={item.color}>{item.count}</span>
            </div>
            <div className="text-xs text-muted-foreground">{item.label}</div>
          </button>
        ))}
      </div>

      {/* Issue Type Quick Filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground mr-2">{t('security.filterByType')}</span>
        <button
          onClick={() => setSelectedIssueType(null)}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium transition-colors',
            selectedIssueType === null ? 'bg-purple-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground'
          )}
        >
          {tc('common.all')}
        </button>
        {Object.entries(stats.typeCounts).map(([type, count]) => (
          <button
            key={type}
            onClick={() => setSelectedIssueType(selectedIssueType === type ? null : type)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1',
              selectedIssueType === type ? 'bg-purple-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {getTypeLabel(type, t)} <span className="opacity-60">({count})</span>
          </button>
        ))}
      </div>

      {/* Issues List */}
      {filteredIssues.filter(i => selectedIssueType === null || i.type === selectedIssueType).length === 0 ? (
        <div className="text-center py-12">
          <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-green-400 opacity-50" />
          <p className="text-lg text-foreground">{t('security.noIssuesFound')}</p>
          <p className="text-sm text-muted-foreground">{t('security.bestPractices')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIssues
            .filter(i => selectedIssueType === null || i.type === selectedIssueType)
            .map((issue, i) => (
              <div
                key={i}
                className={cn(
                  'glass p-4 rounded-lg border-l-4',
                  issue.severity === 'high' ? 'border-l-red-500' :
                  issue.severity === 'medium' ? 'border-l-yellow-500' :
                  'border-l-blue-500'
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">{typeIcon(issue.type)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <ClusterBadge cluster={issue.cluster} size="sm" />
                      <span className="font-semibold text-foreground">{issue.resource}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${severityColor(issue.severity)}`}>
                        {issue.severity}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">
                        {getTypeLabel(issue.type, t)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{issue.message}</p>
                    <div className="text-xs text-muted-foreground mt-2">
                      {tc('common.namespace')}: {issue.namespace}
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

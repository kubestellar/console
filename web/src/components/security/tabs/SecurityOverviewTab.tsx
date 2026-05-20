import { useTranslation } from 'react-i18next'
import { ShieldAlert, Users, ShieldCheck, AlertTriangle, ChevronRight } from 'lucide-react'
import { DonutChart } from '../../charts/PieChart'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { cn } from '../../../lib/cn'
import type { SecurityStats, SecurityIssue, RBACBinding } from '../../../hooks/security/useSecurityData'

interface SecurityOverviewTabProps {
  stats: SecurityStats
  issues: SecurityIssue[]
  rbacBindings: RBACBinding[]
  onNavigateToIssues: () => void
  onNavigateToRBAC: () => void
  onNavigateToCompliance: () => void
  getTypeLabel: (type: string) => string
}

export function SecurityOverviewTab({
  stats,
  issues,
  rbacBindings,
  onNavigateToIssues,
  onNavigateToRBAC,
  onNavigateToCompliance,
  getTypeLabel,
}: SecurityOverviewTabProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => onNavigateToIssues()}
          className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <ShieldAlert className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.total}</div>
              <div className="text-xs text-muted-foreground">{t('cards:security.totalIssues')}</div>
            </div>
          </div>
        </button>
        <button
          onClick={onNavigateToRBAC}
          className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.rbacTotal}</div>
              <div className="text-xs text-muted-foreground">{t('cards:security.roleBindings')}</div>
            </div>
          </div>
        </button>
        <button
          onClick={onNavigateToCompliance}
          className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              stats.complianceScore >= 80 ? 'bg-green-500/20' :
              stats.complianceScore >= 60 ? 'bg-yellow-500/20' : 'bg-red-500/20'
            )}>
              <ShieldCheck className={cn(
                'w-5 h-5',
                stats.complianceScore >= 80 ? 'text-green-400' :
                stats.complianceScore >= 60 ? 'text-yellow-400' : 'text-red-400'
              )} />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.complianceScore}%</div>
              <div className="text-xs text-muted-foreground">{t('cards:security.complianceScore')}</div>
            </div>
          </div>
        </button>
        <button
          onClick={() => onNavigateToIssues('high')}
          className="glass p-4 rounded-lg text-left hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{stats.high}</div>
              <div className="text-xs text-muted-foreground">{t('cards:security.criticalIssues')}</div>
            </div>
          </div>
        </button>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Severity Distribution */}
        <div className="glass p-4 rounded-lg">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('cards:security.issuesBySeverity')}</h3>
          {stats.severityChartData.length > 0 ? (
            <DonutChart
              data={stats.severityChartData}
              size={150}
              thickness={20}
              showLegend={true}
            />
          ) : (
            <div className="flex items-center justify-center h-[180px] text-muted-foreground">
              <ShieldCheck className="w-12 h-12 text-green-400 opacity-50" />
            </div>
          )}
        </div>

        {/* Issue Types */}
        <div className="glass p-4 rounded-lg">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('cards:security.issuesByCategory')}</h3>
          {stats.typeChartData.length > 0 ? (
            <DonutChart
              data={stats.typeChartData}
              size={150}
              thickness={20}
              showLegend={true}
            />
          ) : (
            <div className="flex items-center justify-center h-[180px] text-muted-foreground">
              <ShieldCheck className="w-12 h-12 text-green-400 opacity-50" />
            </div>
          )}
        </div>

        {/* Compliance Status */}
        <div className="glass p-4 rounded-lg">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('cards:security.complianceStatus')}</h3>
          {stats.complianceChartData.length > 0 ? (
            <DonutChart
              data={stats.complianceChartData}
              size={150}
              thickness={20}
              showLegend={true}
            />
          ) : (
            <div className="flex items-center justify-center h-[180px] text-muted-foreground">
              {t('cards:security.noComplianceData')}
            </div>
          )}
        </div>
      </div>

      {/* Recent Issues & RBAC Alerts */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent Critical Issues */}
        <div className="glass p-4 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">{t('cards:security.criticalIssues')}</h3>
            <button
              onClick={() => onNavigateToIssues('high')}
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              {t('common:common.viewAll')} <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {issues.filter(i => i.severity === 'high').slice(0, 3).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              {t('cards:security.noCriticalIssues')}
            </div>
          ) : (
            <div className="space-y-2">
              {issues.filter(i => i.severity === 'high').slice(0, 3).map((issue, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{issue.resource}</div>
                    <div className="text-xs text-muted-foreground">{getTypeLabel(issue.type)}</div>
                  </div>
                  <ClusterBadge cluster={issue.cluster} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* High Risk RBAC */}
        <div className="glass p-4 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">{t('cards:security.highRiskRBAC')}</h3>
            <button
              onClick={onNavigateToRBAC}
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              {t('common:common.viewAll')} <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {rbacBindings.filter(r => r.riskLevel === 'high').slice(0, 3).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              {t('cards:security.noHighRiskBindings')}
            </div>
          ) : (
            <div className="space-y-2">
              {rbacBindings.filter(r => r.riskLevel === 'high').slice(0, 3).map((binding, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{binding.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {binding.subjects.map(s => s.name).join(', ')}
                    </div>
                  </div>
                  <ClusterBadge cluster={binding.cluster} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Security Recommendations */}
      <div className="glass p-4 rounded-lg">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('cards:security.recommendations')}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <StatusIndicator status="healthy" size="sm" />
              <span className="text-foreground">{t('cards:security.recUsePodSecurity')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <StatusIndicator status="healthy" size="sm" />
              <span className="text-foreground">{t('cards:security.recAvoidPrivileged')}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <StatusIndicator status="healthy" size="sm" />
              <span className="text-foreground">{t('cards:security.recRunNonRoot')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <StatusIndicator status="healthy" size="sm" />
              <span className="text-foreground">{t('cards:security.recEnableNetPolicies')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

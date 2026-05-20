import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertTriangle, XCircle, Shield, Eye, Users, Lock, Clock } from 'lucide-react'
import { ProgressBar } from '../../charts/ProgressBar'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { cn } from '../../../lib/cn'
import type { SecurityStats } from '../../../hooks/security/useSecurityData'
import type { ComplianceCheck } from '../../../mocks/securityData'
import { GREEN_500, AMBER_500, RED_500 } from '../../../lib/theme/chartColors'

interface SecurityComplianceTabProps {
  complianceChecks: ComplianceCheck[]
  stats: SecurityStats
}

export function SecurityComplianceTab({
  complianceChecks,
  stats,
}: SecurityComplianceTabProps) {
  const { t } = useTranslation(['cards', 'common'])

  // Group compliance by category
  const complianceByCategory = complianceChecks.reduce((acc, check) => {
    if (!acc[check.category]) acc[check.category] = []
    acc[check.category].push(check)
    return acc
  }, {} as Record<string, ComplianceCheck[]>)

  return (
    <div className="space-y-6">
      {/* Compliance Score */}
      <div className="glass p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{t('cards:security.overallComplianceScore')}</h3>
            <p className="text-sm text-muted-foreground">Based on {stats.complianceTotal} checks across all clusters</p>
          </div>
          <div className={cn(
            'text-4xl font-bold',
            stats.complianceScore >= 80 ? 'text-green-400' :
            stats.complianceScore >= 60 ? 'text-yellow-400' : 'text-red-400'
          )}>
            {stats.complianceScore}%
          </div>
        </div>
        <ProgressBar
          value={stats.complianceScore}
          max={100}
          color={stats.complianceScore >= 80 ? GREEN_500 : stats.complianceScore >= 60 ? AMBER_500 : RED_500}
          size="lg"
          showValue={false}
        />
        <div className="flex items-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm text-foreground">{stats.compliancePass} {t('cards:security.passed')}</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-foreground">{stats.complianceWarn} {t('cards:security.warnings')}</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-foreground">{stats.complianceFail} {t('cards:security.failedChecks')}</span>
          </div>
        </div>
      </div>

      {/* Compliance by Category */}
      {Object.entries(complianceByCategory).map(([category, checks]) => {
        const passed = checks.filter(c => c.status === 'pass').length
        const total = checks.length
        const percentage = Math.round((passed / total) * 100)

        return (
          <div key={category} className="glass p-4 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {category === 'Pod Security' && <Shield className="w-5 h-5 text-purple-400" />}
                {category === 'Network' && <Eye className="w-5 h-5 text-blue-400" />}
                {category === 'RBAC' && <Users className="w-5 h-5 text-orange-400" />}
                {category === 'Secrets' && <Lock className="w-5 h-5 text-green-400" />}
                {category === 'Images' && <Clock className="w-5 h-5 text-cyan-400" />}
                <h4 className="font-medium text-foreground">{category}</h4>
              </div>
              <span className={cn(
                'text-sm font-medium',
                percentage >= 80 ? 'text-green-400' :
                percentage >= 60 ? 'text-yellow-400' : 'text-red-400'
              )}>
                {passed}/{total} {t('cards:security.passed').toLowerCase()}
              </span>
            </div>
            <div className="space-y-2">
              {checks.map(check => (
                <div
                  key={check.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg',
                    check.status === 'pass' ? 'bg-green-500/10' :
                    check.status === 'warn' ? 'bg-yellow-500/10' : 'bg-red-500/10'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {check.status === 'pass' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                    {check.status === 'warn' && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                    {check.status === 'fail' && <XCircle className="w-4 h-4 text-red-400" />}
                    <div>
                      <div className="text-sm font-medium text-foreground">{check.name}</div>
                      <div className="text-xs text-muted-foreground">{check.description}</div>
                    </div>
                  </div>
                  <ClusterBadge cluster={check.cluster} size="sm" />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

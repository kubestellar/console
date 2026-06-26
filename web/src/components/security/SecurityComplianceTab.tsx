import { useTranslation } from 'react-i18next'
import { ShieldCheck, ShieldX, AlertTriangle, RefreshCw } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import type { ComplianceCheck } from '../../mocks/securityData'

interface ComplianceByCategory {
  [category: string]: ComplianceCheck[]
}

interface SecurityComplianceTabProps {
  stats: {
    complianceScore: number
    compliancePassed: number
    complianceFailed: number
    complianceWarnings: number
  }
  complianceByCategory: ComplianceByCategory
  handleRefresh: () => void
}

export function SecurityComplianceTab({ stats, complianceByCategory, handleRefresh }: SecurityComplianceTabProps) {
  const { t } = useTranslation('cards')
  const { t: tc } = useTranslation()

  return (
    <div className="space-y-6">
      {/* Compliance Score Header */}
      <div className="glass p-6 rounded-lg flex items-center gap-6">
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-secondary" />
            <circle
              cx="50" cy="50" r="40" fill="none"
              stroke="currentColor" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${stats.complianceScore * 2.51} 251`}
              className={
                stats.complianceScore >= 80 ? 'text-green-400' :
                stats.complianceScore >= 60 ? 'text-yellow-400' : 'text-red-400'
              }
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn(
              'text-xl font-bold',
              stats.complianceScore >= 80 ? 'text-green-400' :
              stats.complianceScore >= 60 ? 'text-yellow-400' : 'text-red-400'
            )}>
              {stats.complianceScore}%
            </span>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{t('security.overallCompliance')}</h3>
          <div className="flex gap-6 mt-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-400" />
              <span className="text-sm text-foreground">
                {stats.compliancePassed} {t('security.passed')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldX className="w-4 h-4 text-red-400" />
              <span className="text-sm text-foreground">
                {stats.complianceFailed} {t('security.failing')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-foreground">
                {stats.complianceWarnings} {t('security.warnings')}
              </span>
            </div>
          </div>
        </div>
        <div className="ml-auto">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm text-foreground transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {tc('common.refresh')}
          </button>
        </div>
      </div>

      {/* Compliance Checks by Category */}
      {Object.entries(complianceByCategory).map(([category, checks]) => (
        <div key={category} className="glass p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            {category}
            <span className="text-xs text-muted-foreground font-normal">
              ({checks.filter(c => c.status === 'pass').length}/{checks.length} {t('security.passing')})
            </span>
          </h3>
          <div className="space-y-2">
            {checks.map((check, i) => (
              <div
                key={i}
                className={cn(
                  'p-3 rounded border',
                  check.status === 'pass' ? 'border-green-500/20 bg-green-500/5' :
                  check.status === 'warn' ? 'border-yellow-500/20 bg-yellow-500/5' :
                  'border-red-500/20 bg-red-500/5'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {check.status === 'pass' && <ShieldCheck className="w-4 h-4 text-green-400" />}
                    {check.status === 'warn' && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                    {check.status === 'fail' && <ShieldX className="w-4 h-4 text-red-400" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{check.name}</span>
                      <ClusterBadge cluster={check.cluster} size="sm" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{check.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

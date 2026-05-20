import { useTranslation } from 'react-i18next'
import { ShieldX, ShieldCheck, AlertTriangle, Users, Key, Lock } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import type { RBACBinding } from '../../mocks/securityData'

interface SecurityRBACTabProps {
  stats: {
    rbacTotal: number
    rbacHighRisk: number
    rbacMedRisk: number
    rbacLowRisk: number
  }
  filteredRBAC: RBACBinding[]
}

export function SecurityRBACTab({ stats, filteredRBAC }: SecurityRBACTabProps) {
  const { t } = useTranslation('cards')
  const { t: tc } = useTranslation()

  return (
    <div className="space-y-6">
      {/* RBAC Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.rbacTotal}</div>
              <div className="text-xs text-muted-foreground">{t('security.totalBindings')}</div>
            </div>
          </div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <ShieldX className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{stats.rbacHighRisk}</div>
              <div className="text-xs text-muted-foreground">{t('security.highRisk')}</div>
            </div>
          </div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">{stats.rbacMedRisk}</div>
              <div className="text-xs text-muted-foreground">{t('security.mediumRisk')}</div>
            </div>
          </div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <ShieldCheck className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">{stats.rbacLowRisk}</div>
              <div className="text-xs text-muted-foreground">{t('security.lowRisk')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* RBAC Bindings List */}
      <div className="space-y-3">
        {filteredRBAC.map((binding, i) => (
          <div
            key={i}
            className={cn(
              'glass p-4 rounded-lg border-l-4',
              binding.riskLevel === 'high' ? 'border-l-red-500' :
              binding.riskLevel === 'medium' ? 'border-l-yellow-500' :
              'border-l-green-500'
            )}
          >
            <div className="flex items-start gap-4">
              <div className="mt-1">
                {binding.kind === 'ClusterRole' ? (
                  <Key className={cn(
                    'w-5 h-5',
                    binding.riskLevel === 'high' ? 'text-red-400' :
                    binding.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                  )} />
                ) : (
                  <Lock className={cn(
                    'w-5 h-5',
                    binding.riskLevel === 'high' ? 'text-red-400' :
                    binding.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                  )} />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <ClusterBadge cluster={binding.cluster} size="sm" />
                  <span className="font-semibold text-foreground">{binding.name}</span>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded',
                    binding.riskLevel === 'high' ? 'bg-red-500/20 text-red-400' :
                    binding.riskLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  )}>
                    {binding.riskLevel} {t('security.risk')}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">
                    {binding.kind}
                  </span>
                </div>
                <div className="text-sm text-foreground mb-2">
                  <span className="text-muted-foreground">{t('security.subjects')}: </span>
                  {binding.subjects.map((s, j) => (
                    <span key={j} className="inline-flex items-center gap-1 mr-2">
                      {(s.kind === 'User' || s.kind === 'Group') && <Users className="w-3 h-3" />}
                      {s.kind === 'ServiceAccount' && <Key className="w-3 h-3" />}
                      {s.name}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {binding.permissions.slice(0, 5).map((perm, j) => (
                    <span key={j} className="text-xs px-2 py-0.5 rounded bg-card/50 text-muted-foreground">
                      {perm}
                    </span>
                  ))}
                  {binding.permissions.length > 5 && (
                    <span className="text-xs text-muted-foreground">
                      +{binding.permissions.length - 5} {tc('common.more').toLowerCase()}
                    </span>
                  )}
                </div>
                {binding.namespace && (
                  <div className="text-xs text-muted-foreground mt-2">
                    {tc('common.namespace')}: {binding.namespace}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

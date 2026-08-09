import { AlertTriangle, Trash2, CheckCircle, WifiOff, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../lib/modals'
import { cn } from '../../../lib/cn'

type HealthStatus = 'healthy' | 'degraded' | 'offline'

interface DashboardDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  dashboardName: string
  /** Optional health status of the dashboard being deleted */
  healthStatus?: HealthStatus
}

const HEALTH_CONFIG: Record<HealthStatus, {
  icon: React.ComponentType<{ className?: string }>
  color: string
  label: string
}> = {
  healthy: {
    icon: CheckCircle,
    color: 'text-green-400',
    label: 'dashboard.health.healthy',
  },
  degraded: {
    icon: AlertCircle,
    color: 'text-yellow-400',
    label: 'dashboard.health.degraded',
  },
  offline: {
    icon: WifiOff,
    color: 'text-red-400',
    label: 'dashboard.health.offline',
  },
}

export function DashboardDeleteModal({ isOpen, onClose, onConfirm, dashboardName, healthStatus }: DashboardDeleteModalProps) {
  const { t } = useTranslation()

  const healthConfig = healthStatus ? HEALTH_CONFIG[healthStatus] : null
  const HealthIcon = healthConfig?.icon

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title={t('dashboard.delete.title')}
        description={t('dashboard.delete.confirm', { name: dashboardName })}
        icon={Trash2}
        onClose={onClose}
        showBack={false}
      />
      <BaseModal.Content>
        {healthConfig && HealthIcon && (
          <div
            className={cn(
              'inline-flex items-center gap-1.5 mb-3 text-xs font-medium',
              healthConfig.color,
            )}
            data-testid="dashboard-health-indicator"
          >
            <HealthIcon className="w-3.5 h-3.5" />
            <span>{t(healthConfig.label)}</span>
          </div>
        )}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium">{t('dashboard.delete.warning')}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t('dashboard.delete.details')}
            </p>
          </div>
        </div>
      </BaseModal.Content>
      <BaseModal.Footer>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('actions.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          {t('dashboard.delete.title')}
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}

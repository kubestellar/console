import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, WifiOff, Plus } from 'lucide-react'
import { ROUTES } from '../../../config/routes'

interface SidebarClusterStatusProps {
  healthyClusters: number
  unhealthyClusters: number
  unreachableClusters: number
  onStatusClick: (status: 'healthy' | 'unhealthy' | 'unreachable') => void
}

export function SidebarClusterStatus({
  healthyClusters,
  unhealthyClusters,
  unreachableClusters,
  onStatusClick,
}: SidebarClusterStatusProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const total = healthyClusters + unhealthyClusters + unreachableClusters

  return (
    <div data-testid="sidebar-cluster-status" className="mt-6 p-4 rounded-lg bg-secondary/30">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {t('labels.clusterStatus')}
      </h4>
      {total === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('labels.noClusters')}</p>
          <button
            data-testid="sidebar-no-clusters-cta"
            onClick={() => navigate(ROUTES.CLUSTERS)}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-purple-500/50 hover:bg-purple-500/10 transition-all duration-200"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            {t('labels.noClustersCta')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {healthyClusters > 0 && (
            <button
              onClick={() => onStatusClick('healthy')}
              className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
            >
              <span className="flex items-center gap-1.5 text-sm text-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
                {t('labels.healthy')}
              </span>
              <span
                className="text-sm font-medium text-green-400"
                title={t('sidebar.healthyClusters', { count: healthyClusters })}
              >{healthyClusters}</span>
            </button>
          )}
          {unhealthyClusters > 0 && (
            <button
              onClick={() => onStatusClick('unhealthy')}
              className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
            >
              <span className="flex items-center gap-1.5 text-sm text-foreground">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
                {t('labels.unhealthy')}
              </span>
              <span
                className="text-sm font-medium text-red-400"
                title={t('sidebar.unhealthyClusters', { count: unhealthyClusters })}
              >{unhealthyClusters}</span>
            </button>
          )}
          {unreachableClusters > 0 && (
            <button
              onClick={() => onStatusClick('unreachable')}
              className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
            >
              <span className="flex items-center gap-1.5 text-sm text-foreground">
                <WifiOff className="w-3.5 h-3.5 text-yellow-400" aria-hidden="true" />
                {t('labels.offline')}
              </span>
              <span
                className="text-sm font-medium text-yellow-400"
                title={t('sidebar.unreachableClusters', { count: unreachableClusters })}
              >{unreachableClusters}</span>
            </button>
          )}
          {healthyClusters === 0 && unhealthyClusters === 0 && unreachableClusters === 0 && (
            <span className="text-xs text-muted-foreground italic">{t('labels.noClusters', 'No clusters configured')}</span>
          )}
        </div>
      )}
    </div>
  )
}

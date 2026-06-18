import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Loader2, User, WifiOff } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { SidebarFeatures } from './SidebarShell'

interface SidebarFooterProps {
  channel?: string | null
  features: SidebarFeatures
  footer?: React.ReactNode
  hasUpdate: boolean
  healthyClusters: number
  isCollapsed: boolean
  isUpgrading: boolean
  latestMainSHA?: string | null
  onClusterStatusClick: (status: 'healthy' | 'unhealthy' | 'unreachable') => void
  totalClusters: number
  unreachableClusters: number
  unhealthyClusters: number
  viewerCount: number
  viewersError: boolean
  viewersLoading: boolean
}

export function SidebarFooter({
  channel,
  features,
  footer,
  hasUpdate,
  healthyClusters,
  isCollapsed,
  isUpgrading,
  latestMainSHA,
  onClusterStatusClick,
  totalClusters,
  unreachableClusters,
  unhealthyClusters,
  viewerCount,
  viewersError,
  viewersLoading,
}: SidebarFooterProps) {
  const { t } = useTranslation()

  if (isCollapsed) {
    return <>{footer}</>
  }

  return (
    <>
      {features.clusterStatus && (
        <div data-testid="sidebar-cluster-status" className="mt-6 p-4 rounded-lg bg-secondary/30">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            {t('labels.clusterStatus')}
          </h4>
          {totalClusters === 0 ? (
            <p className="text-xs text-muted-foreground">{t('labels.noClusters')}</p>
          ) : (
            <div className="space-y-2">
              {healthyClusters > 0 && (
                <button
                  onClick={() => onClusterStatusClick('healthy')}
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
                  onClick={() => onClusterStatusClick('unhealthy')}
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
                  onClick={() => onClusterStatusClick('unreachable')}
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
      )}

      {features.activeUsers && (
        <div className="mt-auto pt-4 border-t border-border/30 flex flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-2">
            <div className="flex items-center gap-1 px-2 text-muted-foreground/60">
              <span className="sr-only">{t('sidebar.activeViewers', { count: viewerCount })}</span>
              <User className={cn('w-3 h-3', viewersError && 'text-red-400')} aria-hidden="true" />
              <span className="text-2xs tabular-nums" aria-hidden="true">
                {viewersError ? '!' : viewersLoading ? '…' : viewerCount}
              </span>
            </div>
            <span className="text-2xs text-muted-foreground/40 font-mono" title={`Commit: ${__COMMIT_HASH__}`}>
              <span className="sr-only">{`Commit: ${__COMMIT_HASH__}`}</span>
              <span aria-hidden="true">#{__COMMIT_HASH__.substring(0, 7)}</span>
            </span>
          </div>
          {features.versionCheck && channel === 'developer' && hasUpdate && (
            <div
              className={cn(
                'flex items-center gap-1 text-2xs',
                isUpgrading ? 'text-cyan-400/80' : 'text-yellow-400/80',
              )}
              title={isUpgrading
                ? t('update.upgrading', 'Upgrading...')
                : `Behind main — latest: ${latestMainSHA?.substring(0, 7) ?? 'unknown'}`}
            >
              {isUpgrading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <AlertTriangle className="w-3 h-3" />
              )}
              <span>
                {isUpgrading
                  ? t('update.upgrading', 'Upgrading...')
                  : t('sidebar.behindMain', 'Behind main')}
              </span>
            </div>
          )}
        </div>
      )}

      {footer}
    </>
  )
}

/**
 * SidebarFooter — cluster status summary, active-users indicator, and
 * optional custom footer content for SidebarShell.
 *
 * Extracted from SidebarShell.tsx (issue #19012).
 */
import { CheckCircle2, AlertTriangle, WifiOff, User, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { useClusters } from '../../hooks/mcp/clusters'
import { isClusterUnreachable, isClusterHealthy } from '../clusters/utils'
import { useActiveUsers } from '../../hooks/useActiveUsers'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useUpgradeState } from '../../hooks/useUpgradeState'
import { ROUTES } from '../../config/routes'
import type { SidebarFeatures } from './SidebarShell'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SidebarFooterProps {
  features: SidebarFeatures
  isCollapsed: boolean
  /** Optional custom footer content rendered after the built-in sections. */
  footer?: React.ReactNode
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SidebarFooter({ features, isCollapsed, footer }: SidebarFooterProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { deduplicatedClusters } = useClusters()
  const { viewerCount, hasError: viewersError, isLoading: viewersLoading } = useActiveUsers()
  const { hasUpdate, channel, latestMainSHA } = useVersionCheck()
  const upgradeState = useUpgradeState()
  const isUpgrading = upgradeState.phase === 'triggering' || upgradeState.phase === 'restarting'

  const unreachableClusters = deduplicatedClusters.filter((c) => isClusterUnreachable(c)).length
  const healthyClusters = deduplicatedClusters.filter((c) => !isClusterUnreachable(c) && isClusterHealthy(c)).length
  const unhealthyClusters = deduplicatedClusters.length - healthyClusters - unreachableClusters

  const handleClusterStatusClick = (status: 'healthy' | 'unhealthy' | 'unreachable') => {
    navigate(`${ROUTES.CLUSTERS}?status=${status}`)
  }

  return (
    <>
      {/* Cluster status summary */}
      {features.clusterStatus && !isCollapsed && (
        <div data-testid="sidebar-cluster-status" className="mt-6 p-4 rounded-lg bg-secondary/30">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            {t('labels.clusterStatus')}
          </h4>
          {deduplicatedClusters.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('labels.noClusters')}</p>
          ) : (
          <div className="space-y-2">
            {healthyClusters > 0 && (
            <button
              onClick={() => handleClusterStatusClick('healthy')}
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
              onClick={() => handleClusterStatusClick('unhealthy')}
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
              onClick={() => handleClusterStatusClick('unreachable')}
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

      {/* Viewer count + commit hash — separated from cluster status to prevent
        * the commit SHA from visually merging with cluster counts (#11403). */}
      {features.activeUsers && !isCollapsed && (
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
          {/* Developer mode: warn when running an older commit, or show upgrade progress */}
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

      {/* Custom footer */}
      {footer}
    </>
  )
}

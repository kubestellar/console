import { AlertTriangle, CheckCircle2, Loader2, Plus, User, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { SnoozedCards } from '../SnoozedCards'
import { ROUTES } from '../../../config/routes'
import { cn } from '../../../lib/cn'
import { useActiveUsers } from '../../../hooks/useActiveUsers'
import { useUpgradeState } from '../../../hooks/useUpgradeState'
import { useVersionCheck } from '../../../hooks/useVersionCheck'
import { isClusterHealthy, isClusterUnreachable } from '../../clusters/utils'
import type { SnoozedMission } from '../../../hooks/useSnoozedMissions'
import type { SnoozedRecommendation } from '../../../hooks/useSnoozedRecommendations'
import type { SnoozedSwap } from '../../../hooks/useSnoozedCards'

type SidebarCluster = Parameters<typeof isClusterHealthy>[0]

interface SidebarFeaturesProps {
  isCollapsed: boolean
  showSnoozedCards?: boolean
  showAddCard?: boolean
  showClusterStatus?: boolean
  showActiveUsers?: boolean
  showVersionCheck?: boolean
  deduplicatedClusters: SidebarCluster[]
  children?: React.ReactNode
  footer?: React.ReactNode
  onAddCard?: () => void
  onApplySwap: (swap: SnoozedSwap) => void
  onApplyRecommendation: (recommendation: SnoozedRecommendation) => void
  onApplyMission: (mission: SnoozedMission) => void
}

export function SidebarFeatures({
  isCollapsed,
  showSnoozedCards,
  showAddCard,
  showClusterStatus,
  showActiveUsers,
  showVersionCheck,
  deduplicatedClusters,
  children,
  footer,
  onAddCard,
  onApplySwap,
  onApplyRecommendation,
  onApplyMission,
}: SidebarFeaturesProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { viewerCount, hasError: viewersError, isLoading: viewersLoading } = useActiveUsers()
  const { hasUpdate, channel, latestMainSHA } = useVersionCheck()
  const upgradeState = useUpgradeState()
  const isUpgrading = upgradeState.phase === 'triggering' || upgradeState.phase === 'restarting'

  const unreachableClusters = deduplicatedClusters.filter(cluster => isClusterUnreachable(cluster)).length
  const healthyClusters = deduplicatedClusters.filter(cluster => !isClusterUnreachable(cluster) && isClusterHealthy(cluster)).length
  const unhealthyClusters = deduplicatedClusters.length - healthyClusters - unreachableClusters

  const handleClusterStatusClick = (status: 'healthy' | 'unhealthy' | 'unreachable') => {
    navigate(`${ROUTES.CLUSTERS}?status=${status}`)
  }

  return (
    <>
      {showSnoozedCards && !isCollapsed && (
        <div data-tour="snoozed" className="min-w-0">
          <SnoozedCards
            onApplySwap={onApplySwap}
            onApplyRecommendation={onApplyRecommendation}
            onApplyMission={onApplyMission}
          />
        </div>
      )}

      {children}

      {showAddCard && !isCollapsed && (
        <div className="mt-6">
          <button
            data-testid="sidebar-add-card"
            onClick={onAddCard}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-purple-500/50 hover:bg-purple-500/10 transition-all duration-200"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span className="text-sm">{t('buttons.addCard')}</span>
          </button>
        </div>
      )}

      {showClusterStatus && !isCollapsed && (
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
                  <span className="text-sm font-medium text-green-400" title={t('sidebar.healthyClusters', { count: healthyClusters })}>{healthyClusters}</span>
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
                  <span className="text-sm font-medium text-red-400" title={t('sidebar.unhealthyClusters', { count: unhealthyClusters })}>{unhealthyClusters}</span>
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
                  <span className="text-sm font-medium text-yellow-400" title={t('sidebar.unreachableClusters', { count: unreachableClusters })}>{unreachableClusters}</span>
                </button>
              )}
              {healthyClusters === 0 && unhealthyClusters === 0 && unreachableClusters === 0 && (
                <span className="text-xs text-muted-foreground italic">{t('labels.noClusters', 'No clusters configured')}</span>
              )}
            </div>
          )}
        </div>
      )}

      {showActiveUsers && !isCollapsed && (
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
          {showVersionCheck && channel === 'developer' && hasUpdate && (
            <div
              className={cn(
                'flex items-center gap-1 text-2xs',
                isUpgrading ? 'text-cyan-400/80' : 'text-yellow-400/80',
              )}
              title={isUpgrading ? t('update.upgrading', 'Upgrading...') : `Behind main — latest: ${latestMainSHA?.substring(0, 7) ?? 'unknown'}`}
            >
              {isUpgrading ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
              <span>{isUpgrading ? t('update.upgrading', 'Upgrading...') : t('sidebar.behindMain', 'Behind main')}</span>
            </div>
          )}
        </div>
      )}

      {footer}
    </>
  )
}

import type React from 'react'
import { AlertTriangle, CheckCircle2, Loader2, User, WifiOff, Plus } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SnoozedCards } from './SnoozedCards'
import type { SnoozedMission } from '../../hooks/useSnoozedMissions'
import type { SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import type { SnoozedSwap } from '../../hooks/useSnoozedCards'
import type { SidebarFeatures } from './SidebarShell.types'

interface SidebarShellPanelsProps {
  features: SidebarFeatures
  isCollapsed: boolean
  children?: React.ReactNode
  onAddCard?: () => void
  footer?: React.ReactNode
  deduplicatedClustersCount: number
  healthyClusters: number
  unhealthyClusters: number
  unreachableClusters: number
  handleClusterStatusClick: (status: 'healthy' | 'unhealthy' | 'unreachable') => void
  onApplySwap: (swap: SnoozedSwap) => void
  onApplyRecommendation: (rec: SnoozedRecommendation) => void
  onApplyMission: (mission: SnoozedMission) => void
  t: (...args: any[]) => string
  viewerCount: number
  viewersError: boolean
  viewersLoading: boolean
  hasUpdate: boolean
  channel: string | null
  latestMainSHA: string | null
  isUpgrading: boolean
}

export function SidebarShellPanels({
  features,
  isCollapsed,
  children,
  onAddCard,
  footer,
  deduplicatedClustersCount,
  healthyClusters,
  unhealthyClusters,
  unreachableClusters,
  handleClusterStatusClick,
  onApplySwap,
  onApplyRecommendation,
  onApplyMission,
  t,
  viewerCount,
  viewersError,
  viewersLoading,
  hasUpdate,
  channel,
  latestMainSHA,
  isUpgrading,
}: SidebarShellPanelsProps) {
  return (
    <>
      {features.snoozedCards && !isCollapsed && (
        <div data-tour="snoozed" className="min-w-0">
          <SnoozedCards
            onApplySwap={onApplySwap}
            onApplyRecommendation={onApplyRecommendation}
            onApplyMission={onApplyMission}
          />
        </div>
      )}

      {children}

      {features.addCard && !isCollapsed && (
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

      {features.clusterStatus && !isCollapsed && (
        <div data-testid="sidebar-cluster-status" className="mt-6 p-4 rounded-lg bg-secondary/30">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            {t('labels.clusterStatus')}
          </h4>
          {deduplicatedClustersCount === 0 ? (
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

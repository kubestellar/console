import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { SnoozedCards } from './SnoozedCards'
import { SidebarClusterStatus } from './sidebar/SidebarClusterStatus'
import { SidebarActiveUsersFooter } from './sidebar/SidebarActiveUsersFooter'
import type { SnoozedSwap } from '../../hooks/useSnoozedCards'
import type { SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import type { SnoozedMission } from '../../hooks/useSnoozedMissions'
import type { SidebarFeatures } from './SidebarShell'

interface SidebarFooterProps {
  features: SidebarFeatures
  isCollapsed: boolean
  children?: React.ReactNode
  onAddCard?: () => void
  healthyClusters: number
  unhealthyClusters: number
  unreachableClusters: number
  onStatusClick: (status: 'healthy' | 'unhealthy' | 'unreachable') => void
  viewerCount: number
  viewersError: boolean
  viewersLoading: boolean
  hasUpdate: boolean
  channel: string
  isUpgrading: boolean
  latestMainSHA: string | null
  footer?: React.ReactNode
  handleApplySwap: (swap: SnoozedSwap) => void
  handleApplyRecommendation: (recommendation: SnoozedRecommendation) => void
  handleApplyMission: (mission: SnoozedMission) => void
}

export function SidebarFooter({
  features,
  isCollapsed,
  children,
  onAddCard,
  healthyClusters,
  unhealthyClusters,
  unreachableClusters,
  onStatusClick,
  viewerCount,
  viewersError,
  viewersLoading,
  hasUpdate,
  channel,
  isUpgrading,
  latestMainSHA,
  footer,
  handleApplySwap,
  handleApplyRecommendation,
  handleApplyMission,
}: SidebarFooterProps) {
  const { t } = useTranslation()

  return (
    <>
      {features.snoozedCards && !isCollapsed && (
        <div data-tour="snoozed" className="min-w-0">
          <SnoozedCards
            onApplySwap={handleApplySwap}
            onApplyRecommendation={handleApplyRecommendation}
            onApplyMission={handleApplyMission}
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
        <SidebarClusterStatus
          healthyClusters={healthyClusters}
          unhealthyClusters={unhealthyClusters}
          unreachableClusters={unreachableClusters}
          onStatusClick={onStatusClick}
        />
      )}

      {features.activeUsers && !isCollapsed && (
        <SidebarActiveUsersFooter
          viewerCount={viewerCount}
          viewersError={viewersError}
          viewersLoading={viewersLoading}
          showVersionCheck={features.versionCheck ?? false}
          channel={channel}
          hasUpdate={hasUpdate}
          isUpgrading={isUpgrading}
          latestMainSHA={latestMainSHA}
        />
      )}

      {footer}
    </>
  )
}

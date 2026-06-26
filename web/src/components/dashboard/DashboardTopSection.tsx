import { useTranslation } from 'react-i18next'
import { LayoutDashboard } from 'lucide-react'
import { ROUTES } from '../../config/routes'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { StatsOverview } from '../ui/StatsOverview'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'
import { CardRecommendations } from './CardRecommendations'
import { MissionSuggestions } from './MissionSuggestions'
import { GettingStartedBanner } from './GettingStartedBanner'
import { DemoToLocalCTA } from './DemoToLocalCTA'
import { WelcomeCard } from './WelcomeCard'
import { PostConnectBanner } from './PostConnectBanner'
import { AdopterNudge } from './AdopterNudge'
import { ContextualNudgeBanner } from './ContextualNudgeBanner'
import { getDemoMode } from '../../hooks/useDemoMode'
import type { DashboardState } from './DashboardState'

type DashboardTopSectionProps = Pick<DashboardState,
  'activeNudge' |
  'autoRefresh' |
  'clusters' |
  'clustersError' |
  'currentCardTypes' |
  'dismissNudge' |
  'getStatValue' |
  'handleAddRecommendedCard' |
  'handleNudgeAction' |
  'handleOpenDashboardCatalog' |
  'handleRunHealthCheck' |
  'isClustersLoading' |
  'isFetching' |
  'lastUpdated' |
  'navigate' |
  'openAddCardModal' |
  'openMissionSidebar' |
  'setAutoRefresh' |
  'triggerRefresh'>

export function DashboardTopSection({
  activeNudge,
  autoRefresh,
  clusters,
  clustersError,
  currentCardTypes,
  dismissNudge,
  getStatValue,
  handleAddRecommendedCard,
  handleNudgeAction,
  handleOpenDashboardCatalog,
  handleRunHealthCheck,
  isClustersLoading,
  isFetching,
  lastUpdated,
  navigate,
  openAddCardModal,
  openMissionSidebar,
  setAutoRefresh,
  triggerRefresh,
}: DashboardTopSectionProps) {
  const { t } = useTranslation()

  return (
    <>
      <DashboardHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        icon={<LayoutDashboard className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={() => triggerRefresh()}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="dashboard-auto-refresh"
        lastUpdated={lastUpdated}
        showTimestamp={false}
        error={clustersError}
        afterTitle={<DashboardHealthIndicator />}
        rightExtra={<RotatingTip page="home" />}
      />

      <StatsOverview
        dashboardType="dashboard"
        getStatValue={getStatValue}
        hasData={!isClustersLoading}
        isLoading={isClustersLoading && clusters.length === 0}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-dashboard-stats-collapsed"
      />

      <GettingStartedBanner
        onBrowseCards={openAddCardModal}
        onTryMission={openMissionSidebar}
        onExploreDashboards={handleOpenDashboardCatalog}
      />

      <DemoToLocalCTA />

      {clusters.length === 0 && !isClustersLoading && !getDemoMode() && <WelcomeCard />}

      <PostConnectBanner
        onRunHealthCheck={handleRunHealthCheck}
        onExploreClusters={() => navigate(ROUTES.CLUSTERS)}
        onSetupAlerts={() => navigate(ROUTES.ALERTS)}
      />

      <AdopterNudge />

      {activeNudge && activeNudge !== 'drag-hint' && (
        <ContextualNudgeBanner
          nudgeType={activeNudge}
          onAction={handleNudgeAction}
          onDismiss={dismissNudge}
        />
      )}

      <div data-tour="recommendations">
        <CardRecommendations
          currentCardTypes={currentCardTypes}
          onAddCard={handleAddRecommendedCard}
        />
        <MissionSuggestions />
      </div>
    </>
  )
}

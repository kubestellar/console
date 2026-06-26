import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { PipelineFilterProvider, PipelineDataProvider, PipelineFilterBar } from '../cards/pipelines'
import { usePipelineFilter } from '../cards/pipelines/PipelineFilterContext'
import { useCICDStats } from './useCICDStats'
import { useTranslation } from 'react-i18next'

const CICD_CARDS_KEY = 'kubestellar-cicd-cards'

// Default cards for CI/CD dashboard
const DEFAULT_CICD_CARDS = getDefaultCards('ci-cd')

/**
 * Inner dashboard that lives inside PipelineDataProvider so it can
 * consume the unified pipeline data for stat calculations.
 */
function CICDDashboard() {
  const { t } = useTranslation()
  const {
    getStatValue,
    isLoading,
    isRefreshing,
    isDemoData,
    error,
    lastRefresh,
    refetch,
  } = useCICDStats()

  return (
    <DashboardPage
      title={t('cicd.title')}
      subtitle={t('cicd.subtitle')}
      icon="GitMerge"
      rightExtra={<RotatingTip page="ci-cd" />}
      headerExtra={<PipelineFilterBar />}
      storageKey={CICD_CARDS_KEY}
      defaultCards={DEFAULT_CICD_CARDS}
      statsType="ci-cd"
      getStatValue={getStatValue}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      isDemoData={isDemoData}
      error={error}
      lastUpdated={lastRefresh != null ? new Date(lastRefresh) : null}
      onRefresh={refetch ?? undefined}
      emptyState={{
        title: t('cicd.dashboardTitle'),
        description: t('cicd.emptyDescription') }}
    />
  )
}

/**
 * Bridges PipelineFilterContext → PipelineDataProvider so the unified
 * fetch respects the dashboard-level repo filter.
 */
function CICDDataBridge({ children }: { children: React.ReactNode }) {
  const filterState = usePipelineFilter()
  const repoFilter = filterState?.repoFilter ?? null

  return (
    <PipelineDataProvider repo={repoFilter}>
      {children}
    </PipelineDataProvider>
  )
}

export function CICD() {
  return (
    <PipelineFilterProvider>
      <CICDDataBridge>
        <CICDDashboard />
      </CICDDataBridge>
    </PipelineFilterProvider>
  )
}

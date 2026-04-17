import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { PipelineFilterProvider, PipelineDataProvider, PipelineFilterBar } from '../cards/pipelines'
import { usePipelineFilter } from '../cards/pipelines/PipelineFilterContext'
import { useCICDStats } from './useCICDStats'

const CICD_CARDS_KEY = 'kubestellar-cicd-cards'

// Default cards for CI/CD dashboard
const DEFAULT_CICD_CARDS = getDefaultCards('ci-cd')

/**
 * Inner dashboard that lives inside PipelineDataProvider so it can
 * consume the unified pipeline data for stat calculations.
 */
function CICDDashboard() {
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
      title="CI/CD"
      subtitle="Monitor continuous integration and deployment pipelines"
      icon="GitPullRequest"
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
        title: 'CI/CD Dashboard',
        description: 'Add cards to monitor pipelines, builds, and deployment status across your clusters.' }}
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

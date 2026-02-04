import { useCallback } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

const CICD_CARDS_KEY = 'kubestellar-cicd-cards'

// Default cards for CI/CD dashboard
const DEFAULT_CICD_CARDS = getDefaultCards('ci-cd')

export function CICD() {
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error } = useClusters()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Filter reachable clusters
  const reachableClusters = clusters.filter(c => c.reachable !== false)

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', isClickable: false }
      case 'pipelines':
        return { value: 0, sublabel: 'pipelines', isClickable: false, isDemo: true }
      case 'deployments':
        return { value: 0, sublabel: 'deployments today', isClickable: false, isDemo: true }
      default:
        return { value: '-' }
    }
  }, [reachableClusters])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="CI/CD"
      subtitle="Monitor continuous integration and deployment pipelines"
      icon="GitPullRequest"
      storageKey={CICD_CARDS_KEY}
      defaultCards={DEFAULT_CICD_CARDS}
      statsType="gitops"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={reachableClusters.length > 0}
      isDemoData={true}
      emptyState={{
        title: 'CI/CD Dashboard',
        description: 'Add cards to monitor pipelines, builds, and deployment status across your clusters.',
      }}
    >
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          <div className="font-medium">Error loading cluster data</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      )}
    </DashboardPage>
  )
}

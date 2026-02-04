import { useCallback } from 'react'
import { AlertCircle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

const HELM_CARDS_KEY = 'kubestellar-helm-cards'

// Default cards for the helm releases dashboard
const DEFAULT_HELM_CARDS = getDefaultCards('helm')

export function HelmReleases() {
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error } = useClusters()
  const { drillToAllHelm, drillToAllClusters } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      case 'healthy':
        return { value: reachableClusters.length, sublabel: 'with Helm', onClick: () => drillToAllHelm(), isClickable: reachableClusters.length > 0 }
      default:
        return { value: 0 }
    }
  }, [reachableClusters, drillToAllHelm, drillToAllClusters])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Helm Releases"
      subtitle="Monitor Helm chart releases and versions"
      icon="Ship"
      storageKey={HELM_CARDS_KEY}
      defaultCards={DEFAULT_HELM_CARDS}
      statsType="gitops"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={reachableClusters.length > 0}
      emptyState={{
        title: 'Helm Releases Dashboard',
        description: 'Add cards to monitor Helm releases, chart versions, and release history across your clusters.',
      }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading Helm data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}

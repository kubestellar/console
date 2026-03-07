import { useCallback } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { useMultiClusterInsights } from '../../hooks/useMultiClusterInsights'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'

const INSIGHTS_CARDS_KEY = 'kubestellar-insights-cards'

const DEFAULT_INSIGHTS_CARDS = getDefaultCards('insights')

export function Insights() {
  const { clusters, isLoading: clustersLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error } = useClusters()
  const { insights, isLoading: insightsLoading, isDemoData } = useMultiClusterInsights()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  const reachableClusters = clusters.filter(c => c.reachable !== false)
  const criticalCount = (insights || []).filter(i => i.severity === 'critical').length
  const warningCount = (insights || []).filter(i => i.severity === 'warning').length

  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', isClickable: false }
      case 'insights':
        return { value: insights.length, sublabel: 'insights detected', isClickable: false, isDemo: isDemoData }
      case 'critical':
        return { value: criticalCount, sublabel: 'critical', isClickable: false, isDemo: isDemoData }
      case 'warnings':
        return { value: warningCount, sublabel: 'warnings', isClickable: false, isDemo: isDemoData }
      default:
        return { value: '-' }
    }
  }, [reachableClusters, insights, criticalCount, warningCount, isDemoData])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Insights"
      subtitle="Cross-cluster correlation and pattern detection"
      icon="Lightbulb"
      storageKey={INSIGHTS_CARDS_KEY}
      defaultCards={DEFAULT_INSIGHTS_CARDS}
      statsType="insights"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={clustersLoading || insightsLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={reachableClusters.length > 0 || insights.length > 0}
      isDemoData={isDemoData}
      emptyState={{
        title: 'Insights Dashboard',
        description: 'Add cards to detect cross-cluster correlations, config drift, cascade impacts, and resource imbalances.',
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

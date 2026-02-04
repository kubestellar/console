import { useCallback } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

const AIML_CARDS_KEY = 'kubestellar-aiml-cards'

// Default cards for AI/ML dashboard
const DEFAULT_AIML_CARDS = getDefaultCards('ai-ml')

export function AIML() {
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error } = useClusters()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Filter reachable clusters
  const reachableClusters = clusters.filter(c => c.reachable !== false)

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', isClickable: false }
      case 'gpu_nodes':
        return { value: 0, sublabel: 'GPU nodes', isClickable: false, isDemo: true }
      case 'ml_workloads':
        return { value: 0, sublabel: 'ML workloads', isClickable: false, isDemo: true }
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
      title="AI/ML"
      subtitle="Monitor AI and Machine Learning workloads"
      icon="Brain"
      storageKey={AIML_CARDS_KEY}
      defaultCards={DEFAULT_AIML_CARDS}
      statsType="compute"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={reachableClusters.length > 0}
      isDemoData={true}
      emptyState={{
        title: 'AI/ML Dashboard',
        description: 'Add cards to monitor GPU utilization, ML workloads, and model training across your clusters.',
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

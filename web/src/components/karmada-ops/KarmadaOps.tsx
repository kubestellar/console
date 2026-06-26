/**
 * Karmada Operations Dashboard Page
 *
 * Multi-cluster operations dashboard for Karmada-based environments.
 * Monitors KubeRay fleet, Trino gateways, SLO compliance, and failover events.
 */
import { useClusters } from '../../hooks/useMCP'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'

const KARMADA_OPS_CARDS_KEY = 'kubestellar-karmada-ops-cards'

const DEFAULT_KARMADA_OPS_CARDS = getDefaultCards('karmada-ops')

export function KarmadaOps() {
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error } = useClusters()

  const reachableClusters = clusters.filter(c => c.reachable !== false)
  const hasRealData = reachableClusters.length > 0
  const isDemoData = !hasRealData && !isLoading

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', isClickable: false }
      default:
        return { value: '-' }
    }
  }

  const getStatValue = getDashboardStatValue

  return (
    <DashboardPage
      title="Karmada Ops"
      subtitle="Multi-cluster orchestration, AI inference, and data platform operations"
      icon="Globe"
      storageKey={KARMADA_OPS_CARDS_KEY}
      defaultCards={DEFAULT_KARMADA_OPS_CARDS}
      statsType="karmada-ops"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={hasRealData}
      isDemoData={isDemoData}
      emptyState={{
        title: 'Karmada Operations',
        description: 'Monitor Karmada multi-cluster orchestration, KubeRay inference fleet, Trino data platform, SLO compliance, and cross-region failover events.' }}
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

export default KarmadaOps

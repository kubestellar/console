import { useClusters } from '../../hooks/useMCP'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'

const MULTI_TENANCY_CARDS_KEY = 'kubestellar-multi-tenancy-cards'

const DEFAULT_MULTI_TENANCY_CARDS = getDefaultCards('multi-tenancy')

export function MultiTenancy() {
  const { deduplicatedClusters, isLoading: clustersLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error } = useClusters()

  // Use deduplicated clusters to avoid double-counting in multi-cluster setups
  const reachableClusters = deduplicatedClusters.filter(c => c.reachable !== false)

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    // Multi-tenancy stats are resolved via useUniversalStats for now;
    // real pod-label detection will be added when card components land.
    switch (blockId) {
      default:
        return { value: '-' }
    }
  }

  const getStatValue = getDashboardStatValue

  return (
    <DashboardPage
      title="Multi-Tenancy"
      subtitle="Tenant isolation with OVN, KubeFlex, K3s, KubeVirt"
      icon="Shield"
      rightExtra={<RotatingTip page="multi-tenancy" />}
      storageKey={MULTI_TENANCY_CARDS_KEY}
      defaultCards={DEFAULT_MULTI_TENANCY_CARDS}
      statsType="multi-tenancy"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={clustersLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={reachableClusters.length > 0}
      isDemoData={true}
      emptyState={{
        title: 'Multi-Tenancy Dashboard',
        description: 'Add cards to monitor tenant isolation layers including OVN networking, KubeFlex control planes, K3s clusters, and KubeVirt VMs.' }}
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

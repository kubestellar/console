import { useTranslation } from 'react-i18next'
import { useClusters } from '../../hooks/useMCP'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { getClusterHealthState, isClusterUnreachable } from '../clusters/utils'

const STORAGE_KEY = 'kubestellar-cluster-admin-cards'
const DEFAULT_CARDS = getDefaultCards('cluster-admin')

export function ClusterAdmin() {
  const { t } = useTranslation()
  // Use deduplicatedClusters so the stat blocks count physical clusters, not
  // kubeconfig contexts. Multiple contexts (long path + short alias + per-user
  // SA variants) commonly point to the same server — the raw list double-counts
  // (e.g. the user sees "22 reachable" from 24 contexts when there are only
  // 12 unique cluster servers). My Clusters already uses the deduplicated set;
  // both pages must agree.
  const { deduplicatedClusters, isLoading, isRefreshing, lastUpdated, refetch, error } = useClusters()

  const clusters = deduplicatedClusters || []

  // Use the centralised health state machine so these counts always agree
  // with the main cluster grid, sidebar stats and filter tabs (#5928).
  const reachable = clusters.filter(c => !isClusterUnreachable(c))
  const healthy = reachable.filter(c => getClusterHealthState(c) === 'healthy')
  const degraded = reachable.filter(c => getClusterHealthState(c) === 'unhealthy')
  const offline = clusters.filter(c => isClusterUnreachable(c))
  const hasData = clusters.length > 0
  const isDemoData = !hasData && !isLoading

  // Cluster-specific stats computed from the fast useClusters() cache.
  // nodes, warnings, pod_issues are provided by useUniversalStats (which
  // shares a module-level cache with other dashboards — data is fetched
  // once and reused, avoiding redundant multi-cluster requests).
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      // Show TOTAL cluster count here to match Dashboard and My Clusters.
      // The reachable/offline breakdown is already shown in the 'healthy' and
      // 'offline' stat blocks — repeating it on the main 'clusters' block
      // made the sidebar disagree with itself (ClusterAdmin showed 10 while
      // My Clusters and Dashboard showed 12 for the same 12 physical clusters
      // with 2 offline).
      case 'clusters': return { value: clusters.length, sublabel: t('clusterAdmin.statTotal'), isDemo: isDemoData }
      case 'healthy': return { value: healthy.length, sublabel: t('clusterAdmin.statHealthy'), isDemo: isDemoData }
      case 'degraded': return { value: degraded.length, sublabel: t('clusterAdmin.statDegraded'), isDemo: isDemoData }
      case 'offline': return { value: offline.length, sublabel: t('clusterAdmin.statOffline'), isDemo: isDemoData }
      default: return { value: '-', isDemo: isDemoData }
    }
  }

  const getStatValue = getDashboardStatValue

  return (
    <DashboardPage
      title={t('clusterAdmin.title')}
      subtitle={t('clusterAdmin.subtitle')}
      icon="ShieldAlert"
      rightExtra={<RotatingTip page="cluster-admin" />}
      storageKey={STORAGE_KEY}
      defaultCards={DEFAULT_CARDS}
      statsType="cluster-admin"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      lastUpdated={lastUpdated}
      hasData={hasData}
      isDemoData={isDemoData}
      emptyState={{
        title: t('clusterAdmin.emptyTitle'),
        description: t('clusterAdmin.emptyDescription') }}
    >
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          <div className="font-medium">{t('clusterAdmin.errorLoadingData')}</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      )}
    </DashboardPage>
  )
}

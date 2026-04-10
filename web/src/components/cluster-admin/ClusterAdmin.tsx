import { useClusters } from '../../hooks/useMCP'
import { useCachedPodIssues, useCachedWarningEvents, useCachedNodes } from '../../hooks/useCachedData'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { getClusterHealthState, isClusterUnreachable } from '../clusters/utils'

const STORAGE_KEY = 'kubestellar-cluster-admin-cards'
const DEFAULT_CARDS = getDefaultCards('cluster-admin')

export function ClusterAdmin() {
  const { clusters: rawClusters, isLoading, isRefreshing, lastUpdated, refetch, error } = useClusters()
  const { issues: rawPodIssues } = useCachedPodIssues()
  const { events: rawWarningEvents } = useCachedWarningEvents()
  const { nodes: rawNodes } = useCachedNodes()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Guard all arrays against undefined to prevent crashes when APIs return 404/500/empty
  const clusters = rawClusters || []
  const podIssues = rawPodIssues || []
  const warningEvents = rawWarningEvents || []
  const nodes = rawNodes || []

  // Use the centralised health state machine so these counts always agree
  // with the main cluster grid, sidebar stats and filter tabs (#5928).
  const reachable = clusters.filter(c => !isClusterUnreachable(c))
  const healthy = reachable.filter(c => getClusterHealthState(c) === 'healthy')
  const degraded = reachable.filter(c => getClusterHealthState(c) === 'unhealthy')
  const offline = clusters.filter(c => isClusterUnreachable(c))
  const hasData = clusters.length > 0
  const isDemoData = !hasData && !isLoading

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters': return { value: reachable.length, sublabel: 'reachable', isDemo: isDemoData }
      case 'healthy': return { value: healthy.length, sublabel: 'healthy', isDemo: isDemoData }
      case 'degraded': return { value: degraded.length, sublabel: 'degraded', isDemo: isDemoData }
      case 'offline': return { value: offline.length, sublabel: 'offline', isDemo: isDemoData }
      case 'nodes': return { value: nodes.length, sublabel: 'total nodes', isDemo: isDemoData }
      case 'warnings': return { value: warningEvents.length, sublabel: 'warnings', isDemo: isDemoData }
      case 'pod_issues': return { value: podIssues.length, sublabel: 'pod issues', isDemo: isDemoData }
      default: return { value: '-' }
    }
  }

  const getStatValue = (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId)

  return (
    <DashboardPage
      title="Cluster Admin"
      subtitle="Multi-cluster operations, health, and infrastructure management"
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
        title: 'Cluster Admin Dashboard',
        description: 'Add cards to manage cluster health, node operations, upgrades, and security across your infrastructure.' }}
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
